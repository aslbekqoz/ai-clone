import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobQueue, JobWorker, PermanentJobError, createPool, migrate, type Db, type Job } from "../src/index.js";

const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("JobQueue (Postgres)", () => {
  let db: Db;
  let q: JobQueue;
  const suffix = Date.now().toString(36);
  // Har bir test o'z navbat nomini ishlatadi — parallel test fayllari bir-biriga xalaqit bermaydi.
  const name = (n: string) => `test.${n}.${suffix}`;

  beforeAll(async () => {
    db = createPool(url);
    await migrate(db);
    q = new JobQueue(db);
  });

  afterAll(async () => {
    await db.query("DELETE FROM jobs WHERE queue LIKE $1", [`test.%.${suffix}`]);
    await db.end();
  });

  it("navbatga qo'yish, olish va yakunlash; singleton takrorni yutadi", async () => {
    const queue = name("basic");
    const id = await q.enqueue(queue, { n: 1 }, { singletonKey: `s-${suffix}`, blob: new Uint8Array([1, 2, 3]) });
    expect(id).toMatch(/^\d+$/);
    expect(await q.enqueue(queue, { n: 2 }, { singletonKey: `s-${suffix}` })).toBeNull();

    const job = (await q.claim([queue]))!;
    expect(job).toMatchObject({ id, payload: { n: 1 }, attempts: 1 });
    expect([...job.blob!]).toEqual([1, 2, 3]);
    expect(await q.claim([queue])).toBeNull();
    await q.complete(job.id, { ok: true });
    const row = (await db.query("SELECT status, result, blob FROM jobs WHERE id = $1", [id])).rows[0];
    expect(row).toMatchObject({ status: "done", result: { ok: true }, blob: null });
  });

  it("xatoda kechikish bilan qayta urinadi, urinishlar tugasa yoki doimiy xatoda failed", async () => {
    const queue = name("retry");
    const id = (await q.enqueue(queue, {}, { maxAttempts: 2 }))!;
    const first = (await q.claim([queue]))!;
    expect(await q.fail(first, new Error("tarmoq"))).toBe("retry");
    // Kechikish tugamaguncha olinmaydi
    expect(await q.claim([queue])).toBeNull();
    await db.query("UPDATE jobs SET run_at = now() WHERE id = $1", [id]);
    const second = (await q.claim([queue]))!;
    expect(second.attempts).toBe(2);
    expect(await q.fail(second, new Error("yana tarmoq"))).toBe("failed");
    expect((await db.query("SELECT status, last_error FROM jobs WHERE id = $1", [id])).rows[0]).toEqual({ status: "failed", last_error: "yana tarmoq" });

    await q.enqueue(queue, {}, { maxAttempts: 5 });
    const perm = (await q.claim([queue]))!;
    expect(await q.fail(perm, new PermanentJobError("subtitr yo'q"))).toBe("failed");
  });

  it("bir guruh vazifalari tartib bilan, bittadan; boshqa guruh kutmaydi", async () => {
    const queue = name("group");
    const a1 = await q.enqueue(queue, { m: "a1" }, { groupKey: `chat-a-${suffix}` });
    const a2 = await q.enqueue(queue, { m: "a2" }, { groupKey: `chat-a-${suffix}` });
    const b1 = await q.enqueue(queue, { m: "b1" }, { groupKey: `chat-b-${suffix}` });
    const [x, y] = await Promise.all([q.claim([queue]), q.claim([queue])]);
    expect([x!.id, y!.id].sort()).toEqual([a1, b1].sort());
    expect(await q.claim([queue])).toBeNull(); // a2 a1 tugashini kutadi
    await q.complete(a1!);
    expect((await q.claim([queue]))!.id).toBe(a2);
  });

  it("osilib qolgan vazifa qulf muddati tugagach qayta olinadi", async () => {
    const queue = name("stale");
    const short = new JobQueue(db, { lockMs: 1 });
    const id = await short.enqueue(queue, {});
    expect((await short.claim([queue]))!.id).toBe(id);
    await new Promise((r) => setTimeout(r, 20));
    const again = (await short.claim([queue]))!;
    expect(again).toMatchObject({ id, attempts: 2 });
  });

  it("worker: drain va start/stop; tenant faqat o'z vazifasini ko'radi", async () => {
    const queue = name("worker");
    const seen: string[] = [];
    const errors: string[] = [];
    const worker = new JobWorker(
      q,
      {
        [queue]: async (job: Job) => {
          if (job.payload.boom) throw new PermanentJobError("portladi");
          seen.push(String(job.payload.m));
          return { m: job.payload.m };
        },
      },
      { pollMs: 20, cleanupEveryMs: 0, onError: (_j, err) => errors.push((err as Error).message) },
    );
    await q.enqueue(queue, { m: "bir" });
    await q.enqueue(queue, { boom: true });
    expect(await worker.drain()).toBe(2);
    expect(seen).toEqual(["bir"]);
    expect(errors).toEqual(["portladi"]);

    worker.start();
    const tenant = (await db.query<{ id: string }>("INSERT INTO tenants (name, api_key_hash) VALUES ('jobs', $1) RETURNING id", [`jobs-${suffix}`])).rows[0]!.id;
    const id = (await q.enqueue(queue, { m: "ikki" }, { tenantId: tenant }))!;
    worker.notify();
    for (let i = 0; i < 100 && seen.length < 2; i++) await new Promise((r) => setTimeout(r, 20));
    await worker.stop();
    expect(seen).toEqual(["bir", "ikki"]);
    expect(await q.get(tenant, id)).toMatchObject({ id, status: "done", result: { m: "ikki" }, error: null });
    expect(await q.get("00000000-0000-0000-0000-000000000000", id)).toBeNull();
    expect(await q.get(tenant, "abc")).toBeNull();
    await db.query("DELETE FROM tenants WHERE id = $1", [tenant]);
  });
});
