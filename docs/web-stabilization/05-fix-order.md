# 05. THỨ TỰ SỬA CHỮA BẮT BUỘC (FIX ORDER)

Tài liệu này xác định lộ trình xử lý các blocker theo đúng quy tắc tuần tự nghiêm ngặt của giai đoạn ổn định hóa (stabilization). Mỗi cổng (Gate) chỉ được mở sau khi cổng trước đó được nghiệm thu với bằng chứng thực tế.

---

## 1. THỨ TỰ ƯU TIÊN SỬA CHỮA CHUẨN

```text
1. Package Manager / Node / Dependency (ĐÃ ĐẠT: npm ci exit 0)
2. Env và Service                      (BLOCKER-002: Tạo .env.example)
3. Database Migration và Seed          (BLOCKER-003: Tạo seed script & deterministic fixtures)
4. TypeScript Compile                  (ĐÃ ĐẠT: npx tsc -b exit 0)
5. Production Build                    (ĐÃ ĐẠT: npm run build exit 0)
6. Backend / Frontend Runtime          (ĐÃ ĐẠT: preview server trả HTTP 200 OK)
7. Smoke Test Infrastructure           (BLOCKER-001: Cài đặt Playwright runner)
8. Unit / Integration Test             (ĐÃ ĐẠT: Vitest 20/20 tests passed)
9. E2E Tests (10 luồng Smoke)          (Kế thừa sau khi có Playwright)
10. Native - Web Parity Audit          (Đối chiếu từng behavior ID theo 09-parity-test-plan.md)
11. Visual Polish & Linter Hygiene     (BLOCKER-004: Xóa sạch 32 unused import warnings)
```

---

## 2. KẾ HOẠCH CHI TIẾT TỪNG BƯỚC

### BƯỚC 1: Xử lý BLOCKER-002 (Môi trường - Env & Service)
- **Mục tiêu**: Chuẩn hóa biến môi trường cho thư mục `web/`.
- **Hành động**: Tạo tệp `web/.env.example` với các khóa `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`.
- **Lệnh nghiệm thu**: `Test-Path web/.env.example` (Trả về `True`).

### BƯỚC 2: Xử lý BLOCKER-003 (Cơ sở dữ liệu - Deterministic Seed Data)
- **Mục tiêu**: Tạo module fixture cung cấp dữ liệu cố định (5 BĐS, 3 khách hàng) để các bài test không bị phụ thuộc vào dữ liệu trống hay dữ liệu biến động.
- **Hành động**: Tạo `web/src/data/local/seed.ts` và export hàm `seedInitialData(db)`.
- **Lệnh nghiệm thu**: Viết 1 test trong Vitest nạp seed data và kiểm tra số lượng bản ghi khớp chính xác.

### BƯỚC 3: Xử lý BLOCKER-001 (Hạ tầng Kiểm thử E2E - Smoke Test Infrastructure)
- **Mục tiêu**: Thiết lập Playwright Test Runner phục vụ Quality Gate 8.
- **Hành động**:
  - Cài đặt `@playwright/test`.
  - Tạo `web/playwright.config.ts` cấu hình khởi chạy `npm run preview` tự động khi chạy test.
  - Thêm script `"test:e2e": "playwright test"` vào `web/package.json`.
- **Lệnh nghiệm thu**: `npm run test:e2e` phát hiện và chạy thành công kịch bản smoke test đầu tiên (`SMOKE-001: Mở ứng dụng và kiểm tra title/layout`).

### BƯỚC 4: Triển khai 10 Smoke Tests (Gate 4)
- **Kịch bản**:
  - `SMOKE-001`: Mở ứng dụng và chuyển hướng vào `/properties`.
  - `SMOKE-002`: Hiển thị danh sách BĐS từ dữ liệu seed.
  - `SMOKE-003`: Tìm kiếm BĐS không dấu và lọc theo trạng thái.
  - `SMOKE-004`: Mở chi tiết BĐS và hiển thị đủ thông tin giá, diện tích, chủ nhà.
  - `SMOKE-005`: Thêm BĐS mới và kiểm tra lưu trữ IndexedDB sau khi refresh trang.
  - `SMOKE-006`: Mở danh sách khách hàng CRM.
  - `SMOKE-007`: Tạo khách hàng mới và kiểm tra số điện thoại chuẩn hóa.
  - `SMOKE-008`: Kiểm tra thuật toán gợi ý BĐS khớp nhu cầu (MatchEngine).
  - `SMOKE-009`: Mở màn hình bản đồ khảo sát Leaflet và kiểm tra render markers.
  - `SMOKE-010`: Mở modal kiểm tra trùng tọa độ và xác minh dung sai bán kính ~1m.

### BƯỚC 5: Xử lý BLOCKER-004 (Linter Hygiene)
- **Mục tiêu**: Đưa số lượng cảnh báo linter về 0.
- **Hành động**: Dọn dẹp 31 unused imports và tái cấu trúc hàm gọi `Date.now()`.
- **Lệnh nghiệm thu**: `npm run lint` trả về `0 warnings and 0 errors`.

### BƯỚC 6: Đối chiếu Parity Chi Tiết với App Native
- **Mục tiêu**: Điền bảng đối chiếu trạng thái 4 cấp (`MATCH`, `PARTIAL`, `MISSING`, `UNKNOWN`) cho 34 behavior IDs.
