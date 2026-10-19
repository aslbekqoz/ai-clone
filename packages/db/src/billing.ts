import { createHash, timingSafeEqual } from "node:crypto";
import type pg from "pg";
import type { Db } from "./pool.js";

// Tariflar (05-hujjat). Narx so'mda; Payme summani tiyinda (×100) kutadi.
export const PLANS = {
  creator: { priceUzs: 189_000, monthlyMessages: 2_000, dailySpendCapUsd: 2 },
  pro: { priceUzs: 499_000, monthlyMessages: 6_000, dailySpendCapUsd: 5 },
  business: { priceUzs: 1_490_000, monthlyMessages: 25_000, dailySpendCapUsd: 15 },
} as const;
export const FREE_PLAN = { monthlyMessages: 100, dailySpendCapUsd: 1 };
export type PaidPlan = keyof typeof PLANS;
export type PaymentProvider = "payme" | "click";

/** Yillik to'lovda 2 oy bepul (05-hujjat): 12 oy = 10 oy narxi. */
export function orderAmountUzs(plan: PaidPlan, months: number): number {
  const paidMonths = months === 12 ? 10 : months;
  return PLANS[plan].priceUzs * paidMonths;
}

export interface PaymeConfig {
  merchantId: string;
  /** Kassa kaliti (test yoki prod). Basic auth: "Paycom:<key>". */
  key: string;
  test?: boolean;
  /** Fiskal chek uchun (Payme talabi): xizmatning IKPU kodi va qadoq kodi. */
  ikpuCode?: string;
  packageCode?: string;
  vatPercent?: number;
}

export interface ClickConfig {
  serviceId: string;
  merchantId: string;
  secretKey: string;
}

export interface BillingConfig {
  payme?: PaymeConfig;
  click?: ClickConfig;
  returnUrl?: string;
}

export class PaymentNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} to'lov tizimi sozlanmagan`);
    this.name = "PaymentNotConfiguredError";
  }
}

// --- Checkout havolalari ---

export function paymeCheckoutUrl(cfg: PaymeConfig, orderId: string | number, amountTiyin: number, returnUrl?: string): string {
  const params = [`m=${cfg.merchantId}`, `ac.order_id=${orderId}`, `a=${amountTiyin}`, ...(returnUrl ? [`c=${returnUrl}`] : [])].join(";");
  const host = cfg.test ? "https://checkout.test.paycom.uz" : "https://checkout.paycom.uz";
  return `${host}/${Buffer.from(params).toString("base64")}`;
}

export function clickCheckoutUrl(cfg: ClickConfig, orderId: string | number, amountUzs: number, returnUrl?: string): string {
  const q = new URLSearchParams({ service_id: cfg.serviceId, merchant_id: cfg.merchantId, amount: amountUzs.toFixed(2), transaction_param: String(orderId) });
  if (returnUrl) q.set("return_url", returnUrl);
  return `https://my.click.uz/services/pay?${q}`;
}

// --- Payme Merchant API (JSON-RPC 2.0) ---
// https://developer.help.paycom.uz/protokol-merchant-api/ — javoblar har doim HTTP 200 bilan.

const PAYME_TIMEOUT_MS = 43_200_000; // 12 soat: yaratilgan tranzaksiya shundan keyin bekor qilinadi

type Localized = { uz: string; ru: string; en: string };
interface RpcError {
  code: number;
  message: Localized;
  data?: string;
}
export interface RpcResponse {
  jsonrpc?: "2.0";
  id: unknown;
  result?: unknown;
  error?: RpcError;
}

const E = {
  auth: { code: -32504, message: { uz: "Ruxsat yo'q", ru: "Недостаточно привилегий", en: "Insufficient privileges" } },
  method: { code: -32601, message: { uz: "Metod topilmadi", ru: "Метод не найден", en: "Method not found" } },
  amount: { code: -31001, message: { uz: "Noto'g'ri summa", ru: "Неверная сумма", en: "Invalid amount" } },
  txNotFound: { code: -31003, message: { uz: "Tranzaksiya topilmadi", ru: "Транзакция не найдена", en: "Transaction not found" } },
  cannotPerform: { code: -31008, message: { uz: "Amalni bajarib bo'lmaydi", ru: "Невозможно выполнить операцию", en: "Unable to perform operation" } },
  orderNotFound: { code: -31050, message: { uz: "Buyurtma topilmadi", ru: "Заказ не найден", en: "Order not found" }, data: "order_id" },
  orderBusy: { code: -31051, message: { uz: "Buyurtma uchun to'lov jarayonda", ru: "Заказ ожидает оплаты другой транзакцией", en: "Order is awaiting another payment" }, data: "order_id" },
  orderClosed: { code: -31052, message: { uz: "Buyurtma allaqachon to'langan yoki bekor qilingan", ru: "Заказ уже оплачен или отменён", en: "Order already paid or cancelled" }, data: "order_id" },
  system: { code: -32400, message: { uz: "Tizim xatosi", ru: "Системная ошибка", en: "System error" } },
} satisfies Record<string, RpcError>;

class RpcFail extends Error {
  /** true — tranzaksiyadagi o'zgarishlar (masalan, timeout bo'yicha bekor qilish) xatodan oldin saqlanadi. */
  constructor(
    readonly rpc: RpcError,
    readonly commit = false,
  ) {
    super(rpc.message.en);
  }
}

interface OrderRow {
  id: string;
  tenant_id: string;
  kind: "plan" | "fan";
  plan: PaidPlan | null;
  months: number | null;
  product_id: string | null;
  end_user_id: string | null;
  amount_tiyin: string;
  status: "pending" | "paid" | "cancelled" | "refunded";
}

/** Platforma komissiyasi obunachi to'lovlaridan (05-hujjat). */
export const FAN_COMMISSION_RATE = 0.12;

interface PaymeTxRow {
  id: string;
  order_id: string;
  amount_tiyin: string;
  state: number;
  reason: number | null;
  payme_time: string;
  create_time: string;
  perform_time: string;
  cancel_time: string;
}

export class BillingService {
  constructor(
    private readonly db: Db,
    private readonly cfg: BillingConfig,
    private readonly now: () => number = Date.now,
  ) {}

  providers(): PaymentProvider[] {
    return [...(this.cfg.payme ? ["payme" as const] : []), ...(this.cfg.click ? ["click" as const] : [])];
  }

  async createOrder(tenantId: string, plan: PaidPlan, months: number, provider: PaymentProvider): Promise<{ orderId: string; amountUzs: number; checkoutUrl: string }> {
    const providerCfg = provider === "payme" ? this.cfg.payme : this.cfg.click;
    if (!providerCfg) throw new PaymentNotConfiguredError(provider);
    const amountUzs = orderAmountUzs(plan, months);
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO orders (tenant_id, plan, months, amount_tiyin, provider) VALUES ($1, $2, $3, $4, $5) RETURNING id",
      [tenantId, plan, months, amountUzs * 100, provider],
    );
    const orderId = rows[0]!.id;
    const checkoutUrl =
      provider === "payme" ? paymeCheckoutUrl(this.cfg.payme!, orderId, amountUzs * 100, this.cfg.returnUrl) : clickCheckoutUrl(this.cfg.click!, orderId, amountUzs, this.cfg.returnUrl);
    return { orderId, amountUzs, checkoutUrl };
  }

  /** Obunachi buyurtmasi (klon mahsuloti). Narx mahsulotdan olinadi, checkout havolasi qaytadi. */
  async createFanOrder(input: { tenantId: string; productId: string; endUserId: string; provider: PaymentProvider; returnUrl?: string }): Promise<{ orderId: string; amountUzs: number; checkoutUrl: string }> {
    const providerCfg = input.provider === "payme" ? this.cfg.payme : this.cfg.click;
    if (!providerCfg) throw new PaymentNotConfiguredError(input.provider);
    const p = (await this.db.query<{ price_uzs: number; active: boolean }>("SELECT price_uzs, active FROM products WHERE id = $1 AND tenant_id = $2", [input.productId, input.tenantId])).rows[0];
    if (!p?.active) throw new Error("Mahsulot topilmadi");
    const { rows } = await this.db.query<{ id: string }>(
      "INSERT INTO orders (tenant_id, kind, product_id, end_user_id, amount_tiyin, provider) VALUES ($1, 'fan', $2, $3, $4, $5) RETURNING id",
      [input.tenantId, input.productId, input.endUserId, p.price_uzs * 100, input.provider],
    );
    const orderId = rows[0]!.id;
    const ret = input.returnUrl ?? this.cfg.returnUrl;
    const checkoutUrl = input.provider === "payme" ? paymeCheckoutUrl(this.cfg.payme!, orderId, p.price_uzs * 100, ret) : clickCheckoutUrl(this.cfg.click!, orderId, p.price_uzs, ret);
    return { orderId, amountUzs: p.price_uzs, checkoutUrl };
  }

  async summary(tenantId: string) {
    const t = await this.db.query<{ plan: string; plan_expires_at: Date | null; monthly_message_limit: number; used: number }>(
      `SELECT t.plan, t.plan_expires_at, t.monthly_message_limit,
              coalesce((SELECT sum(messages) FROM usage_ledger u WHERE u.tenant_id = t.id AND u.day >= date_trunc('month', current_date)), 0)::int AS used
         FROM tenants t WHERE t.id = $1`,
      [tenantId],
    );
    const orders = await this.db.query(
      "SELECT id, plan, months, amount_tiyin / 100 AS amount_uzs, provider, status, created_at, paid_at FROM orders WHERE tenant_id = $1 AND kind = 'plan' ORDER BY created_at DESC LIMIT 20",
      [tenantId],
    );
    const row = t.rows[0];
    if (!row) throw new Error("Tenant topilmadi");
    const expired = row.plan_expires_at !== null && row.plan_expires_at.getTime() < this.now();
    return {
      plan: expired ? "free" : row.plan,
      planExpiresAt: row.plan_expires_at,
      monthlyMessageLimit: expired ? FREE_PLAN.monthlyMessages : row.monthly_message_limit,
      usedThisMonth: row.used,
      providers: this.providers(),
      plans: Object.entries(PLANS).map(([id, p]) => ({ id, priceUzs: p.priceUzs, monthlyMessages: p.monthlyMessages })),
      orders: orders.rows,
    };
  }

  // --- Payme ---

  async handlePayme(body: unknown, authorization: string | undefined): Promise<RpcResponse> {
    const req = (body ?? {}) as { id?: unknown; method?: string; params?: Record<string, unknown> };
    const id = req.id ?? null;
    if (!this.cfg.payme || !this.paymeAuthorized(authorization)) return { jsonrpc: "2.0", id, error: E.auth };
    try {
      const p = req.params ?? {};
      switch (req.method) {
        case "CheckPerformTransaction":
          return { jsonrpc: "2.0", id, result: await this.paymeCheck(p) };
        case "CreateTransaction":
          return { jsonrpc: "2.0", id, result: await this.paymeCreate(p) };
        case "PerformTransaction":
          return { jsonrpc: "2.0", id, result: await this.paymePerform(String(p.id)) };
        case "CancelTransaction":
          return { jsonrpc: "2.0", id, result: await this.paymeCancel(String(p.id), Number(p.reason)) };
        case "CheckTransaction":
          return { jsonrpc: "2.0", id, result: await this.paymeCheckTx(String(p.id)) };
        case "GetStatement":
          return { jsonrpc: "2.0", id, result: await this.paymeStatement(Number(p.from), Number(p.to)) };
        default:
          return { jsonrpc: "2.0", id, error: E.method };
      }
    } catch (err) {
      if (err instanceof RpcFail) return { jsonrpc: "2.0", id, error: err.rpc };
      console.error("Payme xatosi:", err);
      return { jsonrpc: "2.0", id, error: E.system };
    }
  }

  private paymeAuthorized(header: string | undefined): boolean {
    const expected = Buffer.from(`Basic ${Buffer.from(`Paycom:${this.cfg.payme!.key}`).toString("base64")}`);
    const got = Buffer.from(header ?? "");
    return got.length === expected.length && timingSafeEqual(got, expected);
  }

  private async paymeOrder(client: pg.PoolClient | Db, p: Record<string, unknown>, lock = false): Promise<OrderRow> {
    const orderId = String((p.account as Record<string, unknown> | undefined)?.order_id ?? "");
    if (!/^\d+$/.test(orderId)) throw new RpcFail(E.orderNotFound);
    const { rows } = await client.query<OrderRow>(`SELECT * FROM orders WHERE id = $1 AND provider = 'payme'${lock ? " FOR UPDATE" : ""}`, [orderId]);
    const order = rows[0];
    if (!order) throw new RpcFail(E.orderNotFound);
    if (Number(order.amount_tiyin) !== Number(p.amount)) throw new RpcFail(E.amount);
    if (order.status !== "pending") throw new RpcFail(E.orderClosed);
    return order;
  }

  private async paymeCheck(p: Record<string, unknown>) {
    const order = await this.paymeOrder(this.db, p);
    const active = await this.db.query("SELECT 1 FROM payme_transactions WHERE order_id = $1 AND state = 1", [order.id]);
    if (active.rowCount) throw new RpcFail(E.orderBusy);
    return { allow: true, ...(this.fiscalDetail(order) ? { detail: this.fiscalDetail(order) } : {}) };
  }

  /** Fiskal chek (Payme talab qiladi): IKPU kodi sozlangan bo'lsa yuboriladi. */
  private fiscalDetail(order: OrderRow) {
    const c = this.cfg.payme;
    if (!c?.ikpuCode || !c.packageCode) return null;
    return {
      receipt_type: 0,
      items: [{ title: order.kind === "fan" ? "AI Clone — klonga kirish" : `AI Clone — ${order.plan} tarifi, ${order.months} oy`, price: Number(order.amount_tiyin), count: 1, code: c.ikpuCode, package_code: c.packageCode, vat_percent: c.vatPercent ?? 12 }],
    };
  }

  private async paymeCreate(p: Record<string, unknown>) {
    const txId = String(p.id ?? "");
    if (!txId) throw new RpcFail(E.txNotFound);
    return this.tx(async (client) => {
      const existing = await this.paymeTx(client, txId, true);
      if (existing) {
        if (existing.state !== 1) throw new RpcFail(E.cannotPerform);
        if (this.now() - Number(existing.create_time) > PAYME_TIMEOUT_MS) {
          await this.paymeSetCancelled(client, existing, -1, 4);
          throw new RpcFail(E.cannotPerform, true);
        }
        return { create_time: Number(existing.create_time), transaction: existing.id, state: 1 };
      }
      const order = await this.paymeOrder(client, p, true);
      const active = await client.query("SELECT 1 FROM payme_transactions WHERE order_id = $1 AND state = 1", [order.id]);
      if (active.rowCount) throw new RpcFail(E.orderBusy);
      const createTime = this.now();
      await client.query("INSERT INTO payme_transactions (id, order_id, amount_tiyin, state, payme_time, create_time) VALUES ($1, $2, $3, 1, $4, $5)", [
        txId,
        order.id,
        Number(p.amount),
        Number(p.time ?? createTime),
        createTime,
      ]);
      return { create_time: createTime, transaction: txId, state: 1 };
    });
  }

  private async paymePerform(txId: string) {
    return this.tx(async (client) => {
      const t = await this.paymeTx(client, txId, true);
      if (!t) throw new RpcFail(E.txNotFound);
      if (t.state === 2) return { transaction: t.id, perform_time: Number(t.perform_time), state: 2 };
      if (t.state !== 1) throw new RpcFail(E.cannotPerform);
      if (this.now() - Number(t.create_time) > PAYME_TIMEOUT_MS) {
        await this.paymeSetCancelled(client, t, -1, 4);
        throw new RpcFail(E.cannotPerform, true);
      }
      const performTime = this.now();
      await client.query("UPDATE payme_transactions SET state = 2, perform_time = $2 WHERE id = $1", [t.id, performTime]);
      await activateOrder(client, t.order_id);
      return { transaction: t.id, perform_time: performTime, state: 2 };
    });
  }

  /**
   * Bekor qilish. O'tkazilgan to'lov ham bekor qilinadi (Payme kabinetidan pul qaytarish uchun):
   * bunda buyurtma 'refunded' bo'ladi va tarif darhol tugatiladi.
   */
  private async paymeCancel(txId: string, reason: number) {
    return this.tx(async (client) => {
      const t = await this.paymeTx(client, txId, true);
      if (!t) throw new RpcFail(E.txNotFound);
      if (t.state === 1) await this.paymeSetCancelled(client, t, -1, reason);
      else if (t.state === 2) {
        await this.paymeSetCancelled(client, t, -2, reason);
        await refundOrder(client, t.order_id);
      }
      const after = (await this.paymeTx(client, txId))!;
      return { transaction: after.id, cancel_time: Number(after.cancel_time), state: after.state };
    });
  }

  private async paymeCheckTx(txId: string) {
    const t = await this.paymeTx(this.db, txId);
    if (!t) throw new RpcFail(E.txNotFound);
    return { create_time: Number(t.create_time), perform_time: Number(t.perform_time), cancel_time: Number(t.cancel_time), transaction: t.id, state: t.state, reason: t.reason };
  }

  private async paymeStatement(from: number, to: number) {
    const { rows } = await this.db.query<PaymeTxRow>("SELECT * FROM payme_transactions WHERE payme_time BETWEEN $1 AND $2 ORDER BY payme_time", [from, to]);
    return {
      transactions: rows.map((t) => ({
        id: t.id,
        time: Number(t.payme_time),
        amount: Number(t.amount_tiyin),
        account: { order_id: t.order_id },
        create_time: Number(t.create_time),
        perform_time: Number(t.perform_time),
        cancel_time: Number(t.cancel_time),
        transaction: t.id,
        state: t.state,
        reason: t.reason,
      })),
    };
  }

  private async paymeTx(client: pg.PoolClient | Db, id: string, lock = false): Promise<PaymeTxRow | null> {
    const { rows } = await client.query<PaymeTxRow>(`SELECT * FROM payme_transactions WHERE id = $1${lock ? " FOR UPDATE" : ""}`, [id]);
    return rows[0] ?? null;
  }

  private async paymeSetCancelled(client: pg.PoolClient, t: PaymeTxRow, state: -1 | -2, reason: number): Promise<void> {
    await client.query("UPDATE payme_transactions SET state = $2, reason = $3, cancel_time = $4 WHERE id = $1", [t.id, state, Number.isFinite(reason) ? reason : null, this.now()]);
    if (state === -1) await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1 AND status = 'pending'", [t.order_id]);
  }

  // --- Click SHOP API (Prepare / Complete) ---
  // https://docs.click.uz — so'rov application/x-www-form-urlencoded, imzo md5.

  async handleClick(params: Record<string, string>): Promise<Record<string, unknown>> {
    const c = this.cfg.click;
    const base = { click_trans_id: params.click_trans_id, merchant_trans_id: params.merchant_trans_id };
    const fail = (error: number, error_note: string) => ({ ...base, error, error_note });
    if (!c) return fail(-8, "Click sozlanmagan");

    const action = params.action;
    const required = ["click_trans_id", "service_id", "merchant_trans_id", "amount", "action", "sign_time", "sign_string"];
    if (required.some((k) => params[k] === undefined) || (action === "1" && params.merchant_prepare_id === undefined)) return fail(-8, "Error in request from click");
    if (action !== "0" && action !== "1") return fail(-3, "Action not found");
    if (params.service_id !== c.serviceId) return fail(-1, "SIGN CHECK FAILED");

    const signSource =
      params.click_trans_id + params.service_id + c.secretKey + params.merchant_trans_id + (action === "1" ? params.merchant_prepare_id : "") + params.amount + action + params.sign_time;
    if (!safeEqualHex(createHash("md5").update(signSource).digest("hex"), params.sign_string ?? "")) return fail(-1, "SIGN CHECK FAILED");

    return this.tx(async (client) => {
      const orderId = /^\d+$/.test(params.merchant_trans_id ?? "") ? params.merchant_trans_id : null;
      const { rows } = orderId ? await client.query<OrderRow>("SELECT * FROM orders WHERE id = $1 AND provider = 'click' FOR UPDATE", [orderId]) : { rows: [] as OrderRow[] };
      const order = rows[0];
      if (!order) return fail(-5, "User does not exist");
      if (Math.abs(Number(order.amount_tiyin) / 100 - Number(params.amount)) > 0.009) return fail(-2, "Incorrect parameter amount");
      if (order.status === "paid") return fail(-4, "Already paid");
      if (order.status !== "pending") return fail(-9, "Transaction cancelled");

      if (action === "0") {
        const ins = await client.query<{ prepare_id: string }>(
          `INSERT INTO click_transactions (click_trans_id, order_id, amount_uzs, status) VALUES ($1, $2, $3, 'prepared')
           ON CONFLICT (click_trans_id) DO UPDATE SET click_trans_id = EXCLUDED.click_trans_id RETURNING prepare_id`,
          [params.click_trans_id, order.id, params.amount],
        );
        return { ...base, merchant_prepare_id: Number(ins.rows[0]!.prepare_id), error: 0, error_note: "Success" };
      }

      const tx = await client.query<{ prepare_id: string; status: string; order_id: string }>(
        "SELECT prepare_id, status, order_id FROM click_transactions WHERE prepare_id = $1 AND click_trans_id = $2 FOR UPDATE",
        [params.merchant_prepare_id, params.click_trans_id],
      );
      const t = tx.rows[0];
      if (!t || t.order_id !== order.id) return fail(-6, "Transaction does not exist");
      if (t.status === "cancelled") return fail(-9, "Transaction cancelled");
      // Click o'z tomonida xato bo'lganini bildirsa (error < 0) — tranzaksiya bekor qilinadi.
      if (Number(params.error ?? 0) < 0) {
        await client.query("UPDATE click_transactions SET status = 'cancelled' WHERE prepare_id = $1", [t.prepare_id]);
        await client.query("UPDATE orders SET status = 'cancelled' WHERE id = $1", [order.id]);
        return fail(-9, "Transaction cancelled");
      }
      await client.query("UPDATE click_transactions SET status = 'completed', completed_at = now() WHERE prepare_id = $1", [t.prepare_id]);
      await activateOrder(client, order.id);
      return { ...base, merchant_confirm_id: Number(t.prepare_id), error: 0, error_note: "Success" };
    });
  }

  private async tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query(err instanceof RpcFail && err.commit ? "COMMIT" : "ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

/** To'langan buyurtma: tarif, limitlar va muddat yangilanadi (amaldagi muddat ustiga qo'shiladi). */
/** To'langan buyurtma: tarif (kind = plan) yoki obunachi huquqi + kreator daromadi (kind = fan). */
async function activateOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  const { rows } = await client.query<OrderRow>("UPDATE orders SET status = 'paid', paid_at = now() WHERE id = $1 AND status = 'pending' RETURNING *", [orderId]);
  const order = rows[0];
  if (!order) return;
  if (order.kind === "fan") {
    const p = (await client.query<{ clone_id: string; messages: number | null; days: number | null }>("SELECT clone_id, messages, days FROM products WHERE id = $1", [order.product_id])).rows[0]!;
    await client.query(
      `INSERT INTO entitlements (tenant_id, clone_id, end_user_id, order_id, remaining_messages, expires_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::int IS NULL THEN NULL ELSE now() + make_interval(days => $6::int) END)`,
      [order.tenant_id, p.clone_id, order.end_user_id, order.id, p.messages, p.days],
    );
    const gross = Number(order.amount_tiyin);
    const commission = Math.round(gross * FAN_COMMISSION_RATE);
    await client.query("INSERT INTO creator_earnings (tenant_id, order_id, gross_tiyin, commission_tiyin, net_tiyin) VALUES ($1, $2, $3, $4, $5)", [order.tenant_id, order.id, gross, commission, gross - commission]);
    return;
  }
  const plan = PLANS[order.plan!];
  await client.query(
    `UPDATE tenants SET plan = $2, monthly_message_limit = $3, daily_spend_cap_usd = $4,
            plan_expires_at = greatest(coalesce(plan_expires_at, now()), now()) + make_interval(months => $5)
      WHERE id = $1`,
    [order.tenant_id, order.plan, plan.monthlyMessages, plan.dailySpendCapUsd, order.months],
  );
}

async function refundOrder(client: pg.PoolClient, orderId: string): Promise<void> {
  const { rows } = await client.query<OrderRow>("UPDATE orders SET status = 'refunded' WHERE id = $1 AND status = 'paid' RETURNING *", [orderId]);
  const order = rows[0];
  if (!order) return;
  if (order.kind === "fan") {
    // Qaytarishda huquq bekor qilinadi va kreator daromadidan teskari yozuv qo'shiladi.
    await client.query("UPDATE entitlements SET revoked_at = now() WHERE order_id = $1", [order.id]);
    await client.query(
      "INSERT INTO creator_earnings (tenant_id, order_id, gross_tiyin, commission_tiyin, net_tiyin) SELECT tenant_id, order_id, -gross_tiyin, -commission_tiyin, -net_tiyin FROM creator_earnings WHERE order_id = $1 AND gross_tiyin > 0",
      [order.id],
    );
    return;
  }
  await client.query("UPDATE tenants SET plan_expires_at = now() WHERE id = $1", [order.tenant_id]);
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b.toLowerCase());
  return x.length === y.length && timingSafeEqual(x, y);
}

export function billingConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  return {
    ...(env.PAYME_MERCHANT_ID && env.PAYME_KEY
      ? {
          payme: {
            merchantId: env.PAYME_MERCHANT_ID,
            key: env.PAYME_KEY,
            test: env.PAYME_TEST === "1",
            ...(env.PAYME_IKPU_CODE ? { ikpuCode: env.PAYME_IKPU_CODE } : {}),
            ...(env.PAYME_PACKAGE_CODE ? { packageCode: env.PAYME_PACKAGE_CODE } : {}),
            ...(env.PAYME_VAT_PERCENT ? { vatPercent: Number(env.PAYME_VAT_PERCENT) } : {}),
          },
        }
      : {}),
    ...(env.CLICK_SERVICE_ID && env.CLICK_MERCHANT_ID && env.CLICK_SECRET_KEY ? { click: { serviceId: env.CLICK_SERVICE_ID, merchantId: env.CLICK_MERCHANT_ID, secretKey: env.CLICK_SECRET_KEY } } : {}),
    ...(env.PAYMENT_RETURN_URL ? { returnUrl: env.PAYMENT_RETURN_URL } : {}),
  };
}
