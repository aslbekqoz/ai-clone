import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { dashboardHtml } from "../src/dashboard.js";
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
});
