import { randomBytes } from "node:crypto";
import { resolveTxt } from "node:dns/promises";
import { withTenant, type Db } from "./pool.js";

/** White-label faqat shu tariflarda (05-hujjat: agentliklar va brendlar uchun). */
export const WHITE_LABEL_PLANS = ["business", "enterprise"];

export interface Brand {
  /** Aksent rangi, #rrggbb. */
  accent: string | null;
  /** https:// manzildagi logo (kvadrat, 64px+). */
  logoUrl: string | null;
  /** Klon sahifasidagi "O'z kloningizni yarating" havolasini yashirish. AI oshkoraligi qoladi. */
  hidePoweredBy: boolean;
}

export interface DomainStatus {
  domain: string;
  verified: boolean;
  /** Egalikni tasdiqlash uchun DNS TXT yozuvi. */
  txt: { name: string; value: string };
  /** Trafik uchun CNAME (CUSTOM_DOMAIN_TARGET o'rnatilgan bo'lsa). */
  cname: { name: string; value: string } | null;
  checkedAt: Date | null;
}

export class WhiteLabelError extends Error {
  constructor(
    message: string,
    readonly status: 402 | 404 | 409 | 422 = 422,
  ) {
    super(message);
    this.name = "WhiteLabelError";
  }
}

export type TxtResolver = (name: string) => Promise<string[][]>;

const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMPTY: Brand = { accent: null, logoUrl: null, hidePoweredBy: false };

/** WCAG kontrast nisbati: tugma va xabarlarda aksent ustida och rang (#f6f1e7) matn bor. */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * bl!;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x! + 0.05) / (y! + 0.05);
}

export function normalizeDomain(input: string): string | null {
  const d = input.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  return HOST_RE.test(d) ? d : null;
}

export class WhiteLabelService {
  private readonly platformHosts: string[];

  constructor(
    private readonly db: Db,
    private readonly opts: { platformHosts?: string[]; cnameTarget?: string | null; resolveTxt?: TxtResolver; now?: () => number } = {},
  ) {
    this.platformHosts = (opts.platformHosts ?? ["aiclone.uz"]).map((h) => h.toLowerCase());
  }

  private async plan(tenantId: string): Promise<string> {
    const { rows } = await this.db.query<{ plan: string; plan_expires_at: Date | null }>("SELECT plan, plan_expires_at FROM tenants WHERE id = $1", [tenantId]);
    const r = rows[0];
    if (!r) return "free";
    return r.plan_expires_at && r.plan_expires_at.getTime() < (this.opts.now ?? Date.now)() ? "free" : r.plan;
  }

  private async requirePlan(tenantId: string): Promise<void> {
    if (!WHITE_LABEL_PLANS.includes(await this.plan(tenantId))) throw new WhiteLabelError("White-label Business tarifida mavjud", 402);
  }

  private status(r: { domain: string; verify_token: string; verified_at: Date | null; checked_at: Date | null }): DomainStatus {
    return {
      domain: r.domain,
      verified: r.verified_at !== null,
      txt: { name: `_aiclone-challenge.${r.domain}`, value: `aiclone-verify=${r.verify_token}` },
      cname: this.opts.cnameTarget ? { name: r.domain, value: this.opts.cnameTarget } : null,
      checkedAt: r.checked_at,
    };
  }

  async settings(tenantId: string, cloneId: string): Promise<{ available: boolean; brand: Brand; domain: DomainStatus | null }> {
    const available = WHITE_LABEL_PLANS.includes(await this.plan(tenantId));
    return withTenant(this.db, tenantId, async (tx) => {
      const c = await tx.query<{ brand: Partial<Brand> }>("SELECT brand FROM clones WHERE id = $1", [cloneId]);
      if (!c.rows[0]) throw new WhiteLabelError("Klon topilmadi", 404);
      const d = await tx.query<{ domain: string; verify_token: string; verified_at: Date | null; checked_at: Date | null }>(
        "SELECT domain, verify_token, verified_at, checked_at FROM custom_domains WHERE clone_id = $1",
        [cloneId],
      );
      return { available, brand: { ...EMPTY, ...c.rows[0].brand }, domain: d.rows[0] ? this.status(d.rows[0]) : null };
    });
  }

  async updateBrand(tenantId: string, cloneId: string, patch: Partial<Brand>): Promise<Brand> {
    await this.requirePlan(tenantId);
    if (patch.accent != null) {
      if (!/^#[0-9a-f]{6}$/i.test(patch.accent)) throw new WhiteLabelError("Rang #rrggbb ko'rinishida bo'lsin");
      if (contrastRatio(patch.accent, "#f6f1e7") < 4.5) throw new WhiteLabelError("Rang juda och — tugmadagi oq matn o'qilmaydi. To'qroq rang tanlang");
    }
    if (patch.logoUrl != null) {
      let u: URL;
      try {
        u = new URL(patch.logoUrl);
      } catch {
        throw new WhiteLabelError("Logo havolasi noto'g'ri");
      }
      if (u.protocol !== "https:") throw new WhiteLabelError("Logo https:// manzilda bo'lsin");
    }
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ brand: Partial<Brand> }>("UPDATE clones SET brand = brand || $2::jsonb WHERE id = $1 RETURNING brand", [cloneId, JSON.stringify(patch)]);
      if (!rows[0]) throw new WhiteLabelError("Klon topilmadi", 404);
      return { ...EMPTY, ...rows[0].brand };
    });
  }

  async setDomain(tenantId: string, cloneId: string, input: string): Promise<DomainStatus> {
    await this.requirePlan(tenantId);
    const domain = normalizeDomain(input);
    if (!domain) throw new WhiteLabelError("Domen noto'g'ri (masalan: ai.sizningsayt.uz)");
    if (this.platformHosts.some((h) => domain === h || domain.endsWith(`.${h}`))) throw new WhiteLabelError("Platforma domenini ulab bo'lmaydi");
    const taken = await this.db.query<{ clone_id: string }>("SELECT clone_id FROM custom_domains WHERE domain = $1", [domain]);
    if (taken.rows[0] && taken.rows[0].clone_id !== cloneId) throw new WhiteLabelError("Bu domen boshqa klonga ulangan", 409);
    return withTenant(this.db, tenantId, async (tx) => {
      const own = await tx.query("SELECT 1 FROM clones WHERE id = $1", [cloneId]);
      if (!own.rowCount) throw new WhiteLabelError("Klon topilmadi", 404);
      // Domen o'zgarsa, tasdiq va token yangilanadi.
      const { rows } = await tx.query<{ domain: string; verify_token: string; verified_at: Date | null; checked_at: Date | null }>(
        `INSERT INTO custom_domains (tenant_id, clone_id, domain, verify_token) VALUES ($1, $2, $3, $4)
         ON CONFLICT (clone_id) DO UPDATE SET
           verify_token = CASE WHEN custom_domains.domain = EXCLUDED.domain THEN custom_domains.verify_token ELSE EXCLUDED.verify_token END,
           verified_at = CASE WHEN custom_domains.domain = EXCLUDED.domain THEN custom_domains.verified_at END,
           checked_at = CASE WHEN custom_domains.domain = EXCLUDED.domain THEN custom_domains.checked_at END,
           domain = EXCLUDED.domain
         RETURNING domain, verify_token, verified_at, checked_at`,
        [tenantId, cloneId, domain, randomBytes(16).toString("hex")],
      );
      return this.status(rows[0]!);
    });
  }

  /** DNS'da TXT yozuvini tekshiradi. Topilsa — domen tasdiqlanadi va TLS sertifikati chiqarilishi mumkin. */
  async verifyDomain(tenantId: string, cloneId: string): Promise<DomainStatus> {
    await this.requirePlan(tenantId);
    const current = await withTenant(this.db, tenantId, async (tx) =>
      (await tx.query<{ domain: string; verify_token: string }>("SELECT domain, verify_token FROM custom_domains WHERE clone_id = $1", [cloneId])).rows[0],
    );
    if (!current) throw new WhiteLabelError("Avval domenni kiriting", 404);
    const name = `_aiclone-challenge.${current.domain}`;
    let records: string[][] = [];
    try {
      records = await (this.opts.resolveTxt ?? resolveTxt)(name);
    } catch {
      records = []; // NXDOMAIN / ENODATA — yozuv hali yo'q
    }
    const ok = records.some((parts) => parts.join("").trim() === `aiclone-verify=${current.verify_token}`);
    return withTenant(this.db, tenantId, async (tx) => {
      const { rows } = await tx.query<{ domain: string; verify_token: string; verified_at: Date | null; checked_at: Date | null }>(
        `UPDATE custom_domains SET checked_at = now(), verified_at = CASE WHEN $2 THEN coalesce(verified_at, now()) ELSE verified_at END
          WHERE clone_id = $1 RETURNING domain, verify_token, verified_at, checked_at`,
        [cloneId, ok],
      );
      return this.status(rows[0]!);
    });
  }

  async removeDomain(tenantId: string, cloneId: string): Promise<boolean> {
    return withTenant(this.db, tenantId, async (tx) => ((await tx.query("DELETE FROM custom_domains WHERE clone_id = $1", [cloneId])).rowCount ?? 0) > 0);
  }

  /**
   * So'rov Host'i bo'yicha klon (faqat tasdiqlangan domen). Tarif tugasa domen ishlashdan to'xtaydi,
   * lekin yozuv saqlanadi — to'lovdan keyin qayta ishlaydi.
   */
  async resolveHost(host: string): Promise<{ tenantId: string; cloneId: string; slug: string } | null> {
    const domain = normalizeDomain(host.replace(/:\d+$/, ""));
    if (!domain) return null;
    const { rows } = await this.db.query<{ tenant_id: string; clone_id: string; slug: string; plan: string; plan_expires_at: Date | null }>(
      `SELECT d.tenant_id, d.clone_id, c.slug, t.plan, t.plan_expires_at FROM custom_domains d
         JOIN clones c ON c.id = d.clone_id JOIN tenants t ON t.id = d.tenant_id
        WHERE d.domain = $1 AND d.verified_at IS NOT NULL`,
      [domain],
    );
    const r = rows[0];
    if (!r) return null;
    const expired = r.plan_expires_at && r.plan_expires_at.getTime() < (this.opts.now ?? Date.now)();
    if (expired || !WHITE_LABEL_PLANS.includes(r.plan)) return null;
    return { tenantId: r.tenant_id, cloneId: r.clone_id, slug: r.slug };
  }

  /** Ommaviy sahifa va vidjet uchun (tarif tugasa — standart ko'rinish). */
  async publicBrand(tenantId: string, cloneId: string): Promise<Brand> {
    if (!WHITE_LABEL_PLANS.includes(await this.plan(tenantId))) return EMPTY;
    const { rows } = await this.db.query<{ brand: Partial<Brand> }>("SELECT brand FROM clones WHERE id = $1", [cloneId]);
    return { ...EMPTY, ...rows[0]?.brand };
  }
}
