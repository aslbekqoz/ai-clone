import { createHmac, timingSafeEqual } from "node:crypto";
import { FAN_COMMISSION_RATE, type BillingService, type PaymentProvider } from "./billing.js";
import { withTenant, type Db } from "./pool.js";

export interface Product {
  id: string;
  title: string;
  kind: "pack" | "subscription";
  messages: number | null;
  days: number | null;
  priceUzs: number;
  active: boolean;
}

export interface Offer {
  productId: string;
  title: string;
  priceUzs: number;
  url: string;
}

export type Access = { allowed: true; via: "off" | "free" | "entitlement"; entitlementId?: string; freeLeft?: number } | { allowed: false; freeMessages: number };

export class MonetizationError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 422 = 400,
  ) {
    super(message);
    this.name = "MonetizationError";
  }
}

const LINK_TTL_MS = 7 * 24 * 3600_000;

interface ProductRow {
  id: string;
  title: string;
  kind: "pack" | "subscription";
  messages: number | null;
  days: number | null;
  price_uzs: number;
  active: boolean;
}
const toProduct = (r: ProductRow): Product => ({ id: r.id, title: r.title, kind: r.kind, messages: r.messages, days: r.days, priceUzs: r.price_uzs, active: r.active });

/**
 * Klon monetizatsiyasi: obunachi oyiga N ta bepul savol beradi, keyin mahsulot (savollar paketi
 * yoki obuna) sotib oladi. To'lov havolasi HMAC bilan imzolanadi — boshqa birov uchun yoki
 * boshqa narxga buyurtma yaratib bo'lmaydi.
 */
export class MonetizationService {
  constructor(
    private readonly db: Db,
    private readonly billing: BillingService,
    private readonly linkSecret: string,
    private readonly publicBaseUrl: string,
  ) {}

  async settings(tenantId: string, cloneId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const c = (await tx.query<{ paywall_enabled: boolean; paywall_free_messages: number }>("SELECT paywall_enabled, paywall_free_messages FROM clones WHERE id = $1", [cloneId])).rows[0];
      if (!c) throw new MonetizationError("Klon topilmadi", 404);
      const products = (await tx.query<ProductRow>("SELECT * FROM products WHERE clone_id = $1 ORDER BY price_uzs", [cloneId])).rows.map(toProduct);
      return { enabled: c.paywall_enabled, freeMessages: c.paywall_free_messages, products, providers: this.billing.providers(), commissionRate: FAN_COMMISSION_RATE };
    });
  }

  async updateSettings(tenantId: string, cloneId: string, patch: { enabled?: boolean; freeMessages?: number }): Promise<void> {
    if (patch.enabled) {
      const s = await this.settings(tenantId, cloneId);
      if (!s.products.some((p) => p.active)) throw new MonetizationError("Avval kamida bitta faol mahsulot qo'shing", 422);
      if (!s.providers.length) throw new MonetizationError("To'lov tizimi (Payme yoki Click) sozlanmagan", 422);
    }
    await withTenant(this.db, tenantId, (tx) =>
      tx.query("UPDATE clones SET paywall_enabled = COALESCE($2, paywall_enabled), paywall_free_messages = COALESCE($3, paywall_free_messages) WHERE id = $1", [cloneId, patch.enabled ?? null, patch.freeMessages ?? null]),
    );
  }

  async createProduct(tenantId: string, cloneId: string, p: { title: string; kind: "pack" | "subscription"; messages?: number; days?: number; priceUzs: number }): Promise<Product> {
    if (p.kind === "pack" && !p.messages) throw new MonetizationError("Paket uchun savollar soni kerak", 422);
    if (p.kind === "subscription" && !p.days) throw new MonetizationError("Obuna uchun kunlar soni kerak", 422);
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<ProductRow>(
        "INSERT INTO products (tenant_id, clone_id, title, kind, messages, days, price_uzs) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *",
        [tenantId, cloneId, p.title, p.kind, p.kind === "pack" ? p.messages : null, p.kind === "subscription" ? p.days : null, p.priceUzs],
      );
      return toProduct(rows[0]!);
    });
  }

  async setProductActive(tenantId: string, productId: string, active: boolean): Promise<void> {
    const r = await withTenant(this.db, tenantId, (tx) => tx.query("UPDATE products SET active = $2 WHERE id = $1", [productId, active]));
    if (!r.rowCount) throw new MonetizationError("Mahsulot topilmadi", 404);
  }

  /** Suhbatdan oldin: obunachi javob olishga haqlimi. */
  async checkAccess(tenantId: string, cloneId: string, endUserId: string): Promise<Access> {
    return withTenant(this.db, tenantId, async (tx) => {
      const c = (await tx.query<{ paywall_enabled: boolean; paywall_free_messages: number }>("SELECT paywall_enabled, paywall_free_messages FROM clones WHERE id = $1", [cloneId])).rows[0];
      if (!c?.paywall_enabled) return { allowed: true, via: "off" as const };
      const used = Number(
        (
          await tx.query<{ n: string }>(
            `SELECT count(*) AS n FROM messages m JOIN conversations cv ON cv.id = m.conversation_id
              WHERE cv.end_user_id = $1 AND m.role = 'user' AND m.created_at >= date_trunc('month', now())`,
            [endUserId],
          )
        ).rows[0]!.n,
      );
      if (used < c.paywall_free_messages) return { allowed: true, via: "free" as const, freeLeft: c.paywall_free_messages - used - 1 };
      // Obuna (cheksiz) paketdan ustun; paketlardan eng tez tugaydigani birinchi ishlatiladi.
      const ent = (
        await tx.query<{ id: string }>(
          `SELECT id FROM entitlements WHERE end_user_id = $1 AND clone_id = $2 AND revoked_at IS NULL
              AND (expires_at IS NULL OR expires_at > now()) AND (remaining_messages IS NULL OR remaining_messages > 0)
            ORDER BY (remaining_messages IS NULL) DESC, expires_at NULLS LAST, created_at LIMIT 1`,
          [endUserId, cloneId],
        )
      ).rows[0];
      return ent ? { allowed: true, via: "entitlement" as const, entitlementId: ent.id } : { allowed: false, freeMessages: c.paywall_free_messages };
    });
  }

  /** Javob berilgandan keyin: paketdan bitta savol yechiladi (obunada o'zgarmaydi). */
  async consume(entitlementId: string): Promise<void> {
    await this.db.query("UPDATE entitlements SET remaining_messages = remaining_messages - 1 WHERE id = $1 AND remaining_messages > 0", [entitlementId]);
  }

  async offers(tenantId: string, cloneId: string, endUserId: string): Promise<Offer[]> {
    const products = (await this.settings(tenantId, cloneId)).products.filter((p) => p.active);
    const exp = Date.now() + LINK_TTL_MS;
    return products.map((p) => ({ productId: p.id, title: p.title, priceUzs: p.priceUzs, url: `${this.publicBaseUrl.replace(/\/$/, "")}/pay/${this.sign({ t: tenantId, c: cloneId, u: endUserId, p: p.id, exp })}` }));
  }

  private sign(payload: { t: string; c: string; u: string; p: string; exp: number }): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${createHmac("sha256", this.linkSecret).update(body).digest("base64url")}`;
  }

  resolveLink(token: string): { tenantId: string; cloneId: string; endUserId: string; productId: string } | null {
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = Buffer.from(createHmac("sha256", this.linkSecret).update(body).digest("base64url"));
    const got = Buffer.from(sig);
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, "base64url").toString()) as { t: string; c: string; u: string; p: string; exp: number };
      return p.exp > Date.now() ? { tenantId: p.t, cloneId: p.c, endUserId: p.u, productId: p.p } : null;
    } catch {
      return null;
    }
  }

  async checkout(token: string, provider: PaymentProvider): Promise<{ checkoutUrl: string }> {
    const link = this.resolveLink(token);
    if (!link) throw new MonetizationError("To'lov havolasi noto'g'ri yoki muddati o'tgan", 404);
    const { checkoutUrl } = await this.billing.createFanOrder({ tenantId: link.tenantId, productId: link.productId, endUserId: link.endUserId, provider });
    return { checkoutUrl };
  }

  async productForLink(token: string): Promise<{ title: string; priceUzs: number; cloneName: string; providers: PaymentProvider[] } | null> {
    const link = this.resolveLink(token);
    if (!link) return null;
    const { rows } = await this.db.query<{ title: string; price_uzs: number; display_name: string }>(
      "SELECT p.title, p.price_uzs, c.display_name FROM products p JOIN clones c ON c.id = p.clone_id WHERE p.id = $1 AND p.tenant_id = $2 AND p.active",
      [link.productId, link.tenantId],
    );
    return rows[0] ? { title: rows[0].title, priceUzs: rows[0].price_uzs, cloneName: rows[0].display_name, providers: this.billing.providers() } : null;
  }

  /** Kreator daromadi: yalpi, komissiya, sof, to'lab berilgan va balans (so'mda). */
  async earnings(tenantId: string) {
    return withTenant(this.db, tenantId, async (tx) => {
      const e = (await tx.query<{ gross: string; commission: string; net: string }>("SELECT coalesce(sum(gross_tiyin),0) AS gross, coalesce(sum(commission_tiyin),0) AS commission, coalesce(sum(net_tiyin),0) AS net FROM creator_earnings")).rows[0]!;
      const paid = Number((await tx.query<{ s: string }>("SELECT coalesce(sum(amount_tiyin),0) AS s FROM payouts")).rows[0]!.s);
      const recent = (
        await tx.query(
          `SELECT o.id, o.status, o.amount_tiyin / 100 AS amount_uzs, o.provider, o.created_at, o.paid_at, p.title AS product, u.name AS buyer, u.channel
             FROM orders o JOIN products p ON p.id = o.product_id LEFT JOIN end_users u ON u.id = o.end_user_id
            WHERE o.kind = 'fan' ORDER BY o.created_at DESC LIMIT 50`,
        )
      ).rows;
      const uzs = (t: number) => Math.round(t / 100);
      return { grossUzs: uzs(Number(e.gross)), commissionUzs: uzs(Number(e.commission)), netUzs: uzs(Number(e.net)), paidOutUzs: uzs(paid), balanceUzs: uzs(Number(e.net) - paid), recent };
    });
  }

  /** Admin: kreatorga o'tkazilgan pul (bank o'tkazmasi) qayd etiladi. */
  async recordPayout(tenantId: string, amountUzs: number, reference: string): Promise<void> {
    const { balanceUzs } = await this.earnings(tenantId);
    if (amountUzs > balanceUzs) throw new MonetizationError(`Balansdan ortiq: ${balanceUzs} so'm mavjud`, 422);
    await this.db.query("INSERT INTO payouts (tenant_id, amount_tiyin, reference) VALUES ($1, $2, $3)", [tenantId, amountUzs * 100, reference]);
  }
}

/** To'lov taklifi matni (Telegram, Instagram, WhatsApp uchun — havolalar matn ichida). */
export function paywallReply(lang: string, freeMessages: number, offers: Offer[]): string {
  const price = (n: number) => `${n.toLocaleString("ru-RU").replace(/,/g, " ")} so'm`;
  const list = offers.map((o) => `• ${o.title} — ${price(o.priceUzs)}: ${o.url}`).join("\n");
  if (lang === "ru") return `Бесплатные вопросы в этом месяце закончились (${freeMessages}). Чтобы продолжить:\n${list}`;
  if (lang === "en") return `You've used this month's free questions (${freeMessages}). To continue:\n${list}`;
  return `Bu oy uchun bepul savollar tugadi (${freeMessages} ta). Davom etish uchun:\n${list}`;
}
