// pnpm smoke — haqiqiy kalitlar bilan ishga tushirishdan oldingi tekshiruv. Xato bo'lsa, chiqish kodi 1.
import { DEFAULT_POLICY } from "@ai-clone/core";
import { createPool, readiness } from "@ai-clone/db";
import { configChecks, formatChecks, liveChecks, type CheckResult } from "./preflight.js";

const env = process.env;
const results: CheckResult[] = [...configChecks(env)];

if (env.DATABASE_URL) {
  const db = createPool(env.DATABASE_URL);
  try {
    const r = await readiness(db);
    results.push(r.ok ? { name: "Postgres", status: "ok", detail: `${r.migrations} migratsiya` } : { name: "Postgres", status: "fail", detail: r.db ? `migratsiyalar to'liq emas (${r.migrations}/${r.expected}) — pnpm db:migrate` : "ulanib bo'lmadi" });
    if (r.db) {
      const { rows } = await db.query<{ rolsuper: boolean; rolbypassrls: boolean }>("SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user");
      const bypass = rows[0]?.rolsuper || rows[0]?.rolbypassrls;
      results.push(bypass
        ? { name: "Postgres roli", status: env.NODE_ENV === "production" ? "fail" : "warn", detail: "superuser yoki BYPASSRLS — tenant izolyatsiyasi (RLS) ishlamaydi; deploy/postgres-init.sh dagi kabi oddiy rol ishlating" }
        : { name: "Postgres roli", status: "ok", detail: "superuser emas, RLS amal qiladi" });
    }
  } finally {
    await db.end();
  }
} else results.push({ name: "Postgres", status: "fail", detail: "DATABASE_URL yo'q" });

const models = Object.values(DEFAULT_POLICY).flat().map((c) => c.model).concat(env.OCR_MODEL ?? "claude-opus-5-5");
results.push(...(await liveChecks(env, models)));

console.log(formatChecks(results));
const failed = results.filter((r) => r.status === "fail").length;
console.log(failed ? `\n❌ ${failed} ta muammo — ishga tushirishdan oldin tuzating.` : "\n✅ Hammasi tayyor.");
process.exit(failed ? 1 : 0);
