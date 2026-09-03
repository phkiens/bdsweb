# 01. STACK VÀ SỔ TAY VẬN HÀNH (STACK & RUNBOOK)

Tài liệu này xác định chính xác các thành phần công nghệ, công cụ, cấu hình và lệnh vận hành thực tế của dự án Web BDS Collector dựa trên mã nguồn, cấu hình và lockfile hiện có.

---

## 1. THÀNH PHẦN CÔNG NGHỆ (TECH STACK)

| Thành phần | Công nghệ / Thư viện | Bằng chứng từ file |
| :--- | :--- | :--- |
| **Frontend Framework** | React 19 (`react@^19.2.8`, `react-dom@^19.2.8`) + TypeScript (`typescript@~6.0.2`) | [`web/package.json:19-21, 32`](file:///c:/Users/k/Downloads/web/web/package.json#L19-L21) |
| **Build Tool & Dev Server** | Vite 8 (`vite@^8.2.2`, `@vitejs/plugin-react@^6.1.0`) | [`web/package.json:29, 33`](file:///c:/Users/k/Downloads/web/web/package.json#L29) |
| **CSS Framework** | Tailwind CSS v4 (`tailwindcss@^4.3.3`, `@tailwindcss/vite@^4.3.3`) | [`web/package.json:24, 31`](file:///c:/Users/k/Downloads/web/web/package.json#L24) |
| **Icons & UI Library** | Lucide React (`lucide-react@^1.40.0`) | [`web/package.json:18`](file:///c:/Users/k/Downloads/web/web/package.json#L18) |
| **Routing** | React Router v7 (`react-router-dom@^7.18.3`) | [`web/package.json:21`](file:///c:/Users/k/Downloads/web/web/package.json#L21) |
| **Map Engine** | Leaflet (`leaflet@^1.9.4`, `@types/leaflet@^1.9.22`) | [`web/package.json:17, 25`](file:///c:/Users/k/Downloads/web/web/package.json#L17) |
| **Local Database (Offline-First)**| IndexedDB qua Dexie.js (`dexie@^4.4.5`, `dexie-react-hooks@^4.4.0`) | [`web/package.json:15-16`](file:///c:/Users/k/Downloads/web/web/package.json#L15-L16) |
| **Remote Backend** | Supabase Cloud (PostgreSQL + Realtime WebSocket qua `@supabase/supabase-js@^2.114.0`) + Supabase Edge Functions (Deno) | [`web/package.json:14`](file:///c:/Users/k/Downloads/web/web/package.json#L14), [`supabase/functions/`](file:///c:/Users/k/Downloads/web/supabase/functions/) |
| **Package Manager** | `npm` (Xác định theo lockfile `package-lock.json`) | [`web/package-lock.json`](file:///c:/Users/k/Downloads/web/web/package-lock.json) |
| **Node Version** | Node >= 18 (Hệ thống hiện tại: `v24.18.0`) | Output từ `node -v` |
| **Linter** | Oxlint (`oxlint@^1.79.0`) | [`web/package.json:9, 30`](file:///c:/Users/k/Downloads/web/web/package.json#L9) |
| **Unit Test Library** | Vitest (`vitest@^4.1.11`) | [`web/package.json:11, 34`](file:///c:/Users/k/Downloads/web/web/package.json#L11) |
| **Integration Test Library**| `CHƯA CẤU HÌNH RIÊNG` (Chung runner Vitest) | Không có script riêng |
| **E2E Test Library** | `CHƯA CÀI ĐẶT` (Playwright / Cypress chưa có trong devDependencies) | [`web/package.json`](file:///c:/Users/k/Downloads/web/web/package.json) |
| **Database Migrations** | `supabase/migrations/20260903000001_sync_guard.sql` (Supabase); Schema versioning trong `AppDatabase.version(1)` (Dexie) | [`supabase/migrations/`](file:///c:/Users/k/Downloads/web/supabase/migrations/), [`src/data/local/db.ts:31-43`](file:///c:/Users/k/Downloads/web/web/src/data/local/db.ts#L31-L43) |
| **Seed Scripts** | `CHƯA CÓ` (Chưa có script seed database riêng) | [`web/package.json:6-12`](file:///c:/Users/k/Downloads/web/web/package.json#L6-L12) |
| **Dịch vụ ngoài** | Supabase REST & Realtime, Cloudflare R2, Google Gemini API Studio | [`bds-collector-config.env`](file:///c:/Users/k/Downloads/web/bds-collector-config.env) |

---

## 2. BIẾN MÔI TRƯỜNG BẮT BUỘC (ENVIRONMENT VARIABLES)

Các biến môi trường được định nghĩa trong mẫu [`bds-collector-config.env`](file:///c:/Users/k/Downloads/web/bds-collector-config.env) và có thể nhập trực tiếp qua trang Cài đặt Web (`/settings/api-config`):

1. `SUPABASE_URL`: Địa chỉ URL của project Supabase (dạng `https://xxxxx.supabase.co`).
2. `SUPABASE_ANON_KEY`: Khóa công khai anon key để gọi REST API và Realtime WebSocket.
3. `GEMINI_API_KEY`: API key của Google AI Studio phục vụ tính năng trích xuất thông tin BĐS từ tin nhắn mạng xã hội.

---

## 3. SỔ TAY LỆNH VẬN HÀNH (RUNBOOK COMMANDS)

Tất cả các lệnh phải được thực thi từ thư mục `c:\Users\k\Downloads\web\web`:

```powershell
# Chuyển vào thư mục Web
cd C:\Users\k\Downloads\web\web
```

### A. Cài đặt dependencies sạch (Clean Install)
```powershell
npm ci
```

### B. Kiểm tra Typecheck (TypeScript compiler)
```powershell
npx tsc -b
```

### C. Kiểm tra Lint
```powershell
npm run lint
```

### D. Chạy Unit Tests
```powershell
npm run test
```
Hoặc chạy với giao diện theo dõi liên tục (watch mode):
```powershell
npx vitest
```

### E. Chạy Integration Tests
```text
MISSING_SCRIPT: Chưa có script riêng, hiện đang tích hợp chung trong Vitest test runner.
```

### F. Biên dịch Production (Production Build)
```powershell
npm run build
```
Lệnh này thực hiện tuần tự: `tsc -b && vite build`. Output sinh ra trong thư mục `web/dist/`.

### G. Khởi chạy Development Server
```powershell
npm run dev
```
Mặc định lắng nghe tại: `http://localhost:5173/`.

### H. Khởi chạy Production Preview
```powershell
npm run preview
```
Lắng nghe bản build `dist/` tại: `http://localhost:4173/`.

### I. Chạy E2E Tests
```text
MISSING_SCRIPT: Playwright chưa được cài đặt trong devDependencies và chưa có playwright.config.ts.
```
