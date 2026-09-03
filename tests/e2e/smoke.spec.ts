import { test, expect } from "@playwright/test";

test.describe("SMOKE-001: Khởi động ứng dụng và điều hướng", () => {
  test("mở trang web và kiểm tra luồng onboarding / màn hình chính", async ({ page }) => {
    // Thu thập console errors nếu có
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 1. Mở trang gốc
    await page.goto("/");

    // 2. Chờ tải xong trang
    await expect(page).toHaveTitle(/Vite|BĐS/i);

    // 3. Kiểm tra xem đang ở Onboarding hay đã vào thẳng /properties
    const currentUrl = page.url();

    if (currentUrl.includes("/onboarding")) {
      // Xác nhận các thành phần chính của onboarding
      await expect(page.getByText("BĐS Collector Web")).toBeVisible();
      await expect(page.getByText("Hoạt động ngoại tuyến 100%")).toBeVisible();

      // Bấm nút bắt đầu
      const startButton = page.getByRole("button", { name: "Bắt đầu sử dụng ngay" });
      await expect(startButton).toBeVisible();
      await startButton.click();

      // Chờ chuyển hướng về /properties
      await expect(page).toHaveURL(/.*\/properties/);
    } else {
      await expect(page).toHaveURL(/.*\/properties/);
    }

    // 4. Xác nhận giao diện màn hình chính hoạt động
    await expect(page.getByPlaceholder("Tìm kiếm khu vực, chủ nhà, SĐT...")).toBeVisible();
    await expect(page.getByRole("button", { name: "Thêm BĐS mới" }).first()).toBeVisible();

    // 5. Xác nhận không có lỗi console nghiêm trọng
    expect(consoleErrors).toHaveLength(0);
  });
});
