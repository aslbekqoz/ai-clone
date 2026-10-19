import pg from "pg";

export type Db = pg.Pool;
export type Tx = pg.PoolClient;

export function createPool(connectionString = process.env.DATABASE_URL): Db {
  if (!connectionString) throw new Error("DATABASE_URL o'rnatilmagan");
  return new pg.Pool({ connectionString, max: 10 });
}

/**
 * Tenant kontekstida tranzaksiya: rol `aiclone_app` ga tushiriladi va `app.tenant_id`
 * o'rnatiladi, shuning uchun RLS ulanish foydalanuvchisidan qat'i nazar ishlaydi.
 */
export async function withTenant<T>(db: Db, tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE aiclone_app");
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** pgvector literal formati: '[0.1,0.2,...]'. */
export function toVector(v: number[]): string {
  return `[${v.join(",")}]`;
}
