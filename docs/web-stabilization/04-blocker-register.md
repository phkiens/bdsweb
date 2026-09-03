# 04. SỔ ĐĂNG KÝ VÀ PHÂN LOẠI BLOCKER (BLOCKER REGISTER)

Tài liệu này ghi nhận và phân loại toàn bộ các blocker, thiếu sót hạ tầng kiểm thử và điều kiện môi trường cần xử lý trước khi có thể xác nhận tính ổn định hoàn toàn của Web BDS Collector.

---

## 1. DANH MỤC BLOCKERS THEO ĐỊNH DẠNG CHUẨN

### BLOCKER-001: Thiếu hạ tầng kiểm thử E2E (Playwright Test Runner) [RESOLVED]
- **blocker_id**: `BLOCKER-001`
- **nhóm_phân_loại**: `H. TEST_INFRASTRUCTURE`
- **trạng_thái**: `RESOLVED`
- **command**: `npm run test:e2e`
- **exit_code**: `0 (PASS - 1 passed in 5.4s)`
- **error_summary**: Đã khắc phục hoàn toàn. Cài đặt `@playwright/test`, chromium headless shell, cấu hình `playwright.config.ts`, và tạo smoke test `smoke.spec.ts`.
- **exact_evidence**: Chạy `npm run test:e2e` trả về:
  ```text
  Running 1 test using 1 worker
    ok 1 [chromium] › tests\e2e\smoke.spec.ts:4:3 › SMOKE-001: Khởi động ứng dụng và điều hướng › mở trang web và kiểm tra luồng onboarding / màn hình chính (2.1s)
    1 passed (5.4s)
  ```
- **affected_files**:
  - `web/package.json`
  - `web/playwright.config.ts`
  - `web/index.html`
  - `web/tests/e2e/smoke.spec.ts`
- **verification_command**: `npm run test:e2e` (Exit code: 0)

---

### BLOCKER-002: Thiếu tệp mẫu cấu hình môi trường `.env.example`
- **blocker_id**: `BLOCKER-002`
- **nhóm_phân_loại**: `C. ENVIRONMENT`
- **command**: `Test-Path web/.env.example`
- **exit_code**: `False`
- **error_summary**: Thư mục `web/` chưa có tệp `.env.example` hướng dẫn người dùng và CI/CD khai báo các biến môi trường kết nối Supabase và Gemini API.
- **exact_evidence**: File cấu hình mẫu hiện nằm ở thư mục gốc [`bds-collector-config.env`](file:///c:/Users/k/Downloads/web/bds-collector-config.env) thay vì bên trong thư mục con `web/`.
- **probable_root_cause**: Thư mục `web/` được khởi tạo độc lập nhưng chưa sao chép mẫu biến môi trường vào trong.
- **confidence**: `HIGH`
- **affected_files**: `web/.env.example`
- **dependency_on_other_blocker**: Không.
- **proposed_fix**: Tạo tệp `web/.env.example` định nghĩa `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_GEMINI_API_KEY`.
- **verification_command**: `Test-Path web/.env.example`

---

### BLOCKER-003: Thiếu Script & Dữ liệu Seed Cố Định (Deterministic Fixtures)
- **blocker_id**: `BLOCKER-003`
- **nhóm_phân_loại**: `D. DATABASE`
- **command**: `npm run db:seed`
- **exit_code**: `1 (MISSING_SCRIPT)`
- **error_summary**: Ứng dụng khi chạy trên môi trường trắng (Clean Environment / Incognito) không có dữ liệu mẫu ban đầu để các kịch bản Smoke Test và Integration Test kiểm tra tính toán và hiển thị.
- **exact_evidence**: Không có script `seed` trong `web/package.json`.
- **probable_root_cause**: Chưa xây dựng module fixture nạp dữ liệu mẫu vào IndexedDB.
- **confidence**: `HIGH`
- **affected_files**: `web/package.json`, `web/src/data/local/seed.ts`
- **dependency_on_other_blocker**: `BLOCKER-001` (Smoke test cần seed data để assert).
- **proposed_fix**: Tạo hàm `seedDatabase(db)` nạp 5 BĐS và 3 khách hàng mẫu vào IndexedDB, cung cấp nút "Nạp dữ liệu mẫu" trong trang Cài đặt hoặc script CLI.
- **verification_command**: `npm run test` (chạy qua bộ test có assert fixture seed).

---

### BLOCKER-004: Cảnh báo Lint (Unused Imports & React Purity Warning)
- **blocker_id**: `BLOCKER-004`
- **nhóm_phân_loại**: `A. TOOLCHAIN`
- **command**: `npm run lint`
- **exit_code**: `0 (Nhưng tồn tại 32 warnings)`
- **error_summary**: Oxlint phát hiện 31 biến/import không sử dụng (unused imports) và 1 cảnh báo gọi hàm không thuần khiết `Date.now()` trong render của `CustomerListPage.tsx:115`.
- **exact_evidence**:
  - `CustomerDetailPage.tsx`: `Edit`, `ChevronRight`, `MapPin`, `CheckCircle2` imported but never used.
  - `MapSurveyPage.tsx`: `MapPin`, `Compass`, `Layers`, `ChevronRight` imported but never used.
  - `CustomerListPage.tsx`: `updatedAt: Date.now()` kích hoạt cảnh báo `react(purity)`.
- **probable_root_cause**: Code UI được scaffold nhanh với nhiều icon dự phòng chưa dùng hết.
- **confidence**: `HIGH`
- **affected_files**:
  - `web/src/pages/customers/CustomerDetailPage.tsx`
  - `web/src/pages/customers/CustomerListPage.tsx`
  - `web/src/pages/map/MapSurveyPage.tsx`
  - `web/src/pages/settings/SettingsPage.tsx`
  - `web/src/pages/properties/PropertyListPage.tsx`
  - `web/src/pages/properties/PropertyFormPage.tsx`
  - `web/src/components/common/DuplicateCheckModal.tsx`
- **dependency_on_other_blocker**: Không.
- **proposed_fix**: Xóa sạch các import dư thừa và chuyển `Date.now()` trong handler để đạt chuẩn 0 warnings trên toàn bộ dự án.
- **verification_command**: `npm run lint` (đạt `Found 0 warnings and 0 errors`).
