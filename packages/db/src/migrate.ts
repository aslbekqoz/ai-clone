import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, type Db } from "./pool.js";

const MIGRATION_LOCK = 7_031_000_001;
const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

export async function migrationFiles(): Promise<string[]> {
  return (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
}

/** migrations/ dagi .sql fayllarni tartib bilan, har birini bir marta qo'llaydi. */
export async function migrate(db: Db): Promise<string[]> {
  const files = await migrationFiles();
  const client = await db.connect();
  const applied: string[] = [];
  try {
    // API, bot va boshqa instanslar bir vaqtda ishga tushsa ham migratsiya faqat bir marta qo'llanadi.
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK]);
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await client.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      try {
        await client.query("BEGIN");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
        await client.query("COMMIT");
        applied.push(file);
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`${file} migratsiyasi muvaffaqiyatsiz: ${(err as Error).message}`);
      }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK]).catch(() => {});
    client.release();
  }
  return applied;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const db = createPool();
  migrate(db)
    .then((applied) => console.log(applied.length ? `Qo'llandi: ${applied.join(", ")}` : "Sxema yangi"))
    .finally(() => db.end());
}
