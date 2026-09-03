import { test, expect, Page } from "@playwright/test";

// Helper đảm bảo ứng dụng đã mở, đã vượt qua onboarding và nạp dữ liệu seed
async function setupAppWithSeed(page: Page) {
  await page.addInitScript(() => {
    try {
      const existing = localStorage.getItem("bds_collector_settings");
      const current = existing ? JSON.parse(existing) : {};
      localStorage.setItem(
        "bds_collector_settings",
        JSON.stringify({ ...current, hasShownOnboarding: true })
      );
    } catch {
      // ignore
    }
  });

  await page.goto("/properties");
  await page.waitForLoadState("domcontentloaded");

  // Nạp dữ liệu seed vào IndexedDB
  await page.evaluate(async () => {
    if ((window as any).__seed) {
      await (window as any).__seed();
    }
  });

  // Chờ Dexie live query phản ánh ít nhất 1 item lên DOM
  await expect(page.getByText("Phường 25, Quận Bình Thạnh")).toBeVisible({ timeout: 10000 });
}

test.describe("BỘ 10 KỊCH BẢN SMOKE TEST TOÀN DIỆN (BEHAVIORAL PARITY)", () => {
  test.beforeEach(async ({ page }) => {
    await setupAppWithSeed(page);
  });

  test("SMOKE-001: Khởi động ứng dụng và điều hướng cơ bản", async ({ page }) => {
    await expect(page).toHaveTitle(/BĐS Collector Web/i);
    await expect(page.getByPlaceholder("Tìm kiếm khu vực, chủ nhà, SĐT...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm BĐS mới" }).first()).toBeVisible();
  });

  test("SMOKE-002: Hiển thị danh sách BĐS từ dữ liệu seed", async ({ page }) => {
    await expect(page.getByText("Phường 25, Quận Bình Thạnh")).toBeVisible();
    await expect(page.getByText("4.5 tỷ")).toBeVisible();
    await expect(page.getByText("Phường Bến Nghé, Quận 1")).toBeVisible();
    await expect(page.getByText("3.2 tỷ")).toBeVisible();
  });

  test("SMOKE-003: Tìm kiếm BĐS không dấu và lọc trạng thái", async ({ page }) => {
    const searchInput = page.getByPlaceholder("Tìm kiếm khu vực, chủ nhà, SĐT...");

    // Tìm kiếm không dấu "binh thanh"
    await searchInput.fill("binh thanh");
    await expect(page.getByText("Phường 25, Quận Bình Thạnh")).toBeVisible();
    await expect(page.getByText("Phường Bến Nghé, Quận 1")).not.toBeVisible();

    // Xóa tìm kiếm và lọc trạng thái "Đã bán"
    await searchInput.fill("");
    const soldChip = page.getByRole("button", { name: "Đã bán" });
    await soldChip.click();
    await expect(page.getByText("Phường 15, Quận Bình Thạnh")).toBeVisible();
    await expect(page.getByText("5.5 tỷ")).toBeVisible();
  });

  test("SMOKE-004: Mở chi tiết BĐS và hiển thị đủ thông tin", async ({ page }) => {
    await page.goto("/properties/prop-seed-001");
    await expect(page.getByText("Phường 25, Quận Bình Thạnh")).toBeVisible();
    await expect(page.getByText("4.5").first()).toBeVisible();
    await expect(page.getByText("65.5 m²")).toBeVisible();
    await expect(page.getByText("Đông Nam")).toBeVisible();
    await expect(page.getByText("Anh Tuấn")).toBeVisible();
    await expect(page.getByText("0901234567")).toBeVisible();
  });

  test("SMOKE-005: Thêm BĐS mới và kiểm tra lưu trữ IndexedDB", async ({ page }) => {
    await page.goto("/properties/new");

    // Điền form với đúng placeholder
    await page.getByPlaceholder("Ví dụ: Phường 25, Quận Bình Thạnh").fill("Phường Đa Kao, Quận 1");
    await page.getByPlaceholder("Ví dụ: 4.5").fill("6.8");
    await page.getByPlaceholder("Ví dụ: 65.5").fill("80");
    await page.getByPlaceholder("Ví dụ: Anh Tuấn").fill("Chú Bảy");
    await page.getByPlaceholder("0901234567").fill("0908888777");

    // Bấm lưu
    await page.getByRole("button", { name: "Lưu Bất Động Sản" }).click();

    // Kiểm tra trang chi tiết hiển thị BĐS mới
    await expect(page).toHaveURL(/.*\/properties\/.+/);
    await expect(page.getByText("Phường Đa Kao, Quận 1")).toBeVisible();

    // F5 Refresh trang để kiểm chứng tính bền vững của IndexedDB
    await page.reload();
    await expect(page.getByText("Phường Đa Kao, Quận 1")).toBeVisible();
  });

  test("SMOKE-006: Mở danh sách khách hàng CRM", async ({ page }) => {
    await page.goto("/customers");
    await expect(page.getByText("Nguyễn Văn An")).toBeVisible();
    await expect(page.getByText("Trần Thị Bích")).toBeVisible();
    await expect(page.getByText("Lê Hoàng Cường")).toBeVisible();
  });

  test("SMOKE-007: Tạo khách hàng mới và kiểm tra số điện thoại chuẩn hóa", async ({ page }) => {
    await page.goto("/customers");
    await page.getByRole("button", { name: "Thêm khách mới" }).click();

    await page.getByPlaceholder("Ví dụ: Anh Hoàng").fill("Nguyễn Văn Test");
    await page.getByPlaceholder("0901234567").fill("+84 909 888 777");
    await page.getByPlaceholder("Bình Thạnh|||Quận 1").fill("Gò Vấp");

    await page.getByRole("button", { name: "Lưu khách hàng" }).click();

    await expect(page.getByText("Nguyễn Văn Test")).toBeVisible();
    await expect(page.getByText("0909888777")).toBeVisible();
  });

  test("SMOKE-008: Kiểm tra gợi ý BĐS khớp nhu cầu (MatchEngine)", async ({ page }) => {
    await page.goto("/customers/cust-seed-001");
    await expect(page.getByText("Nguyễn Văn An")).toBeVisible();
    await expect(page.getByText("BĐS gợi ý phù hợp")).toBeVisible();
    await expect(page.getByText("Phường 25, Quận Bình Thạnh")).toBeVisible();
  });

  test("SMOKE-009: Mở màn hình bản đồ khảo sát Leaflet", async ({ page }) => {
    await page.goto("/map");
    const mapContainer = page.locator(".leaflet-container");
    await expect(mapContainer).toBeVisible();

    const markers = page.locator(".leaflet-marker-icon");
    await expect(markers.first()).toBeVisible();
  });

  test("SMOKE-010: Modal kiểm tra trùng tọa độ (Dung sai ~1m)", async ({ page }) => {
    // Mở modal qua nút "Kiểm tra trùng" trên Navbar
    await page.getByRole("button", { name: "Kiểm tra trùng" }).click();
    await expect(page.getByText("Kiểm tra trùng BĐS").first()).toBeVisible();

    const coordInput = page.getByPlaceholder("Ví dụ: 10.7769, 106.7009 hoặc https://maps.app.goo.gl/...");
    await coordInput.fill("10.801234, 106.712345");

    await page.getByRole("button", { name: "Kiểm tra tọa độ" }).click();

    await expect(page.getByText("Đã phát hiện 1 BĐS trùng vị trí")).toBeVisible();
    await expect(page.getByText("Phường 25, Quận Bình Thạnh").last()).toBeVisible();
  });
});
