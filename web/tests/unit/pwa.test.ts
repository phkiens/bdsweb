import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("PWA Manifest & Web Share Target (BEH-NAV-006 & Shortcuts)", () => {
  const manifestPath = path.resolve(__dirname, "../../public/manifest.json");

  it("tồn tại tệp manifest.json hợp lệ và có cấu hình PWA chuẩn", () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

    expect(content.name).toBe("BĐS Collector Web");
    expect(content.short_name).toBe("BĐS Collector");
    expect(content.display).toBe("standalone");
    expect(content.start_url).toBe("/properties");
    expect(content.theme_color).toBe("#2563eb");
  });

  it("chứa đầy đủ 4 App Shortcuts (Kiểm tra trùng, Thêm BĐS, Thêm tin chờ, Khách hàng)", () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const shortcuts = content.shortcuts;

    expect(Array.isArray(shortcuts)).toBe(true);
    expect(shortcuts.length).toBeGreaterThanOrEqual(4);

    const urls = shortcuts.map((s: any) => s.url);
    expect(urls).toContain("/properties?action=check_duplicate");
    expect(urls).toContain("/properties/new");
    expect(urls).toContain("/properties/new?isVerified=false");
    expect(urls).toContain("/customers");
  });

  it("khai báo cấu hình share_target tiếp nhận văn bản chia sẻ vào /unverified", () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    const shareTarget = content.share_target;

    expect(shareTarget).toBeDefined();
    expect(shareTarget.action).toBe("/unverified");
    expect(shareTarget.method).toBe("GET");
    expect(shareTarget.params).toEqual({
      title: "title",
      text: "text",
      url: "url"
    });
  });
});
