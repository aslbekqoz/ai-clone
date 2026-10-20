import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { dashboardHtml } from "../src/dashboard.js";
import { exploreHtml } from "../src/explore.js";
import { clonePageHtml, widgetJs } from "../src/widget.js";

// Brauzer skriptlari TS qatorlari ichida yashaydi — typecheck ularni ko'rmaydi. Bu test sintaksis xatosini CI'da ushlaydi.
const inlineScripts = (html: string) => [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]!);

describe("brauzer skriptlari", () => {
  it("dashboard skripti sintaktik jihatdan to'g'ri", () => {
    const scripts = inlineScripts(dashboardHtml());
    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0]!)).not.toThrow();
  });

  it("vidjet skripti sintaktik jihatdan to'g'ri", () => {
    expect(() => new Script(widgetJs("https://api.aiclone.uz"))).not.toThrow();
  });

  it("klon sahifasi foydalanuvchi matnini escape qiladi", () => {
    const html = clonePageHtml("slug", '<img src=x onerror="alert(1)">', "bio</script>", "https://a");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain("bio</script>");
  });

  it("katalogdagi klon sahifasida shikoyat skripti to'g'ri", () => {
    const scripts = inlineScripts(clonePageHtml("dilnoza", "Dilnoza", "IELTS", "https://a", { listed: true }));
    expect(scripts).toHaveLength(1);
    expect(() => new Script(scripts[0]!)).not.toThrow();
    expect(clonePageHtml("dilnoza", "Dilnoza", "IELTS", "https://a")).not.toContain("Shikoyat");
  });

  it("katalog sahifasi qidiruv so'rovi va kartalarni escape qiladi", () => {
    const html = exploreHtml(
      [{ slug: "x", name: "<b>X</b>", tagline: '"><script>alert(1)</script>', category: "tech", languages: ["uz"], rating: { positive: 0.9, votes: 10 }, conversations30d: 3, priceFromUzs: 25000 }],
      { q: '"><img src=x>', category: "tech", page: 2, hasMore: true },
    );
    expect(html).not.toContain("<script>alert");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("👍 90% (10)");
    expect(html).toContain("25 000 so&#39;mdan");
    expect(html).toContain('href="/explore?q=%22%3E%3Cimg+src%3Dx%3E&amp;category=tech&amp;page=3"');
  });
});
