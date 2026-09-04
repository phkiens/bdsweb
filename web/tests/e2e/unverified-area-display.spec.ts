import { test, expect } from "@playwright/test";

test.describe("UNVERIFIED-AREA-DISPLAY E2E TEST", () => {
  test("hiển thị chính xác khu vực và diện tích cho tin chờ khảo sát", async ({ page }) => {
    // 1. Mở trang /unverified
    await page.goto("/unverified");
    await page.waitForLoadState("networkidle");

    // 2. Chèn 3 fixture theo BƯỚC 4 vào IndexedDB
    await page.evaluate(async () => {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open("bds_collector_web_db");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("properties", "readwrite");
          const store = tx.objectStore("properties");

          const now = Date.now();
          const fixtures = [
            {
              id: "test-unv-my-tranh",
              area: "Mỹ Tranh",
              areaSize: 42,
              price: 1.95,
              ownerPhone: "0904274143",
              isVerified: false,
              isDeleted: false,
              rawText: "Bán nhà Mỹ Tranh 42m2 giá 1.95 tỷ",
              status: "Chờ duyệt",
              propertyType: "Nhà",
              updatedAt: now + 3000,
              createdAt: now + 3000
            },
            {
              id: "test-unv-kieu-trung",
              area: "Kiều Trung",
              areaSize: 52,
              price: 2.5,
              ownerPhone: "0908526368",
              isVerified: false,
              isDeleted: false,
              rawText: "Nhà đẹp 3 tầng Kiều Trung 52m2",
              status: "Chờ duyệt",
              propertyType: "Nhà",
              updatedAt: now + 2000,
              createdAt: now + 2000
            },
            {
              id: "test-unv-hoang-mai-zero",
              area: "Hoàng Mai",
              areaSize: 0,
              price: 2.75,
              ownerPhone: "0904359380",
              isVerified: false,
              isDeleted: false,
              rawText: "Nhà Hoàng Mai giá 2.75 tỷ",
              status: "Chờ duyệt",
              propertyType: "Nhà",
              updatedAt: now + 1000,
              createdAt: now + 1000
            }
          ];

          for (const item of fixtures) {
            store.put(item);
          }

          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    // 3. Tải lại trang để live query cập nhật
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForSelector(".space-y-3 > div");

    // 4. Kiểm tra Fixture 1: Mỹ Tranh
    const myTranhCard = page.locator(".space-y-3 > div", { hasText: "Mỹ Tranh" }).first();
    await expect(myTranhCard).toBeVisible();
    await expect(myTranhCard.locator("h3")).toHaveText("Mỹ Tranh");
    await expect(myTranhCard).toContainText("42 m²");

    // 5. Kiểm tra Fixture 2: Kiều Trung
    const kieuTrungCard = page.locator(".space-y-3 > div", { hasText: "Kiều Trung" }).first();
    await expect(kieuTrungCard).toBeVisible();
    await expect(kieuTrungCard.locator("h3")).toHaveText("Kiều Trung");
    await expect(kieuTrungCard).toContainText("52 m²");

    // 6. Kiểm tra Fixture 3: Hoàng Mai (areaSize = 0 -> không hiển thị 0 m², nhưng title là Hoàng Mai)
    const hoangMaiCard = page.locator(".space-y-3 > div", { hasText: "Hoàng Mai" }).first();
    await expect(hoangMaiCard).toBeVisible();
    await expect(hoangMaiCard.locator("h3")).toHaveText("Hoàng Mai");
    // Đảm bảo không hiển thị "0 m²"
    await expect(hoangMaiCard).not.toContainText("0 m²");

    // 7. Quét toàn bộ các tiêu đề H3 trên trang /unverified: không có tiêu đề nào là số thuần túy (e.g. "42", "52", "63.5")
    const allTitles = await page.$$eval(".space-y-3 > div h3", (elements) =>
      elements.map((el) => el.textContent?.trim() || "")
    );
    expect(allTitles.length).toBeGreaterThan(0);
    const numericTitles = allTitles.filter((t) => /^[0-9]+(\.[0-9]+)?$/.test(t));
    expect(numericTitles).toEqual([]);
  });
});
