# 02. ĐIỀU KIỆN MÔI TRƯỜNG & KHOẢNG TRỐNG (ENVIRONMENT REQUIREMENTS)

Tài liệu này kiểm kê các tệp cấu hình môi trường, xác minh các yêu cầu hệ thống và lập danh sách các điều kiện chưa đáp ứng của dự án Web BDS Collector.

---

## 1. BẢNG KIỂM KÊ CẤU HÌNH MÔI TRƯỜNG

| Hạng mục kiểm tra | Tệp cấu hình | Trạng thái | Bằng chứng & Đánh giá |
| :--- | :--- | :--- | :--- |
| **1. Khai báo gói (package.json)** | `web/package.json` | **ĐẠT** | Khai báo đầy đủ tên, scripts (`dev`, `build`, `lint`, `preview`, `test`), dependencies và devDependencies. |
| **2. Khóa phiên bản (lockfile)** | `web/package-lock.json` | **ĐẠT** | Lockfile v3 hợp lệ với 85KB, 91 gói đã kiểm tra không xung đột. |
| **3. Phiên bản Node.js** | Node runtime | **ĐẠT** | Môi trường máy chủ hiện có `v24.18.0`, npm `11.16.0`. Đáp ứng tốt yêu cầu Node >= 18. |
| **4. Ràng buộc Node (.nvmrc / engines)**| `web/package.json` | **THIẾU** | Chưa có trường `"engines": { "node": ">=18" }` và chưa có file `.nvmrc` để cố định phiên bản cho các máy khác. |
| **5. Biến môi trường mẫu (.env.example)** | `web/.env.example` | **THIẾU** | Thư mục `web/` chưa có file `.env.example` mẫu. Mẫu cấu hình hiện nằm tại `bds-collector-config.env` ở thư mục gốc. |
| **6. Cấu hình TypeScript (tsconfig)** | `web/tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.json` | **ĐẠT** | Cấu hình đúng moduleResolution bundler, jsx react-jsx. Typecheck `npx tsc -b` vượt qua 100% không lỗi. |
| **7. Cấu hình Bundler (vite.config.ts)** | `web/vite.config.ts` | **ĐẠT** | Tích hợp `@vitejs/plugin-react` và `@tailwindcss/vite`. Build thành công `dist/` trong 1.55s. |
| **8. Cấu hình Test Runner (vitest.config.ts)**| `web/` | **MẶC ĐỊNH** | Chưa có file `vitest.config.ts` riêng biệt; Vitest đang chạy dựa trên cấu hình ngầm định của Vite. |
| **9. Cấu hình E2E (playwright.config.ts)** | `web/` | **THIẾU** | Chưa cài đặt `@playwright/test` và chưa có tệp cấu hình Playwright. |
| **10. Cấu hình CSDL Cục bộ (Database config)** | `web/src/data/local/db.ts` | **ĐẠT** | Định nghĩa CSDL `bds_collector_web_db` (Dexie.js v1) mô phỏng chính xác Room SQLite v30 với các index nghiệp vụ. |
| **11. Cấu hình CSDL Đám mây (Supabase)** | `web/src/data/remote/supabase.ts` | **ĐẠT** | Client kết nối linh hoạt theo thông số cấu hình lưu trữ trong Settings / localStorage. |
| **12. Docker Compose** | Root / `web/` | **KHÔNG CÓ** | Không bắt buộc do ứng dụng là SPA Frontend tĩnh kết hợp kiến trúc Serverless Backend (Supabase Cloud). |
| **13. Dữ liệu mẫu (Seed script)** | `web/` | **THIẾU** | Chưa có file script tạo dữ liệu mẫu (mock properties, customers) để phục vụ chạy kiểm thử tự động lặp lại (reproducible). |

---

## 2. DANH SÁCH CÁC ĐIỀU KIỆN CHƯA ĐÁP ỨNG (GAPS)

1. **GAP-ENV-01: Thiếu tệp mẫu `.env.example` trong thư mục `web/`**:
   - *Hiện trạng*: Người dùng mới clone repo vào `web/` không có file mẫu để biết cần tạo `.env` với các khóa nào (mặc dù có file `bds-collector-config.env` ngoài thư mục cha).
   - *Tác động*: Gây khó khăn cho quy trình CI/CD và thiết lập môi trường mới.
2. **GAP-ENV-02: Thiếu trường `"engines"` trong `web/package.json`**:
   - *Hiện trạng*: Chưa giới hạn phiên bản Node tối thiểu trong cấu hình npm.
   - *Tác động*: Nguy cơ chạy trên Node < 18 bị lỗi cú pháp module ECMAScript.
3. **GAP-ENV-03: Thiếu Script và Dữ liệu Seed Cố Định (`seed.ts`)**:
   - *Hiện trạng*: Ứng dụng sau khi cài mới hoàn toàn rỗng. Để chạy kiểm thử hồi quy (regression) hoặc smoke test cần có một bộ dữ liệu cố định (deterministic fixtures).
   - *Tác động*: Không thể tự động hóa smoke test mà không có bước chuẩn bị dữ liệu mẫu.
4. **GAP-ENV-04: Chưa cấu hình Playwright E2E Runner**:
   - *Hiện trạng*: Chưa có thư viện kiểm thử đầu-cuối (E2E) trong `devDependencies`.
   - *Tác động*: Không chạy được Quality Gate 8 (E2E test).
