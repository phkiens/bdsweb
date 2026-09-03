# PROJECT STATUS

## Quy ước
- Gói 0–8 = roadmap triển khai cấp cao.
- TASK = đợt giao việc nhỏ bên trong các gói.
- TASK 10 không phải Gói 10.

## Tiến độ roadmap

### Gói 0 — Baseline native/web/staging
Chưa hoàn thành.
Thiếu:
- staging Supabase
- baseline Git/tag đầy đủ
- chốt native reference

### Gói 1 — Hợp đồng native
Gần hoàn thành phần TypeScript.
Đã có:
- contracts
- codec
- normalize
- filter
- matching

Thiếu:
- chứng minh Kotlin và TypeScript dùng chung fixture và cho cùng kết quả

### Gói 2 — Xây dựng lõi Data & Storage Web
Hoàn thành một phần.
Đã có:
- React/Vite
- IndexedDB cho Property, Customer, CustomerPropertyLink

Thiếu:
- outbox
- watermarks
- syncLogs
- mediaCache
- activation server-side
- Supabase

### Gói 3 — Vertical slice chỉ đọc
Chưa hoàn thành.
Đã có:
- danh sách/filter
- CRUD local

Thiếu:
- pull staging
- catch-up
- Realtime
- kiểm thử Android Chrome
- kiểm thử iPhone Safari/Home Screen

### Gói 4 — Ghi và đồng bộ Property
Chưa làm.

### Gói 5 — Customer, OWNER/VIEWER, matching
Hoàn thành phần local.
Đã có:
- CRUD Customer
- matching
- chuyển OWNER
- VIEWER
- transaction IndexedDB
- UI liên quan

Thiếu:
- đồng bộ link/tombstone với Android
- chứng minh score Android/web bằng fixture chung

### Gói 6 — Nghiệp vụ mở rộng
Chưa làm.

### Gói 7 — Media, Drive, Gemini, backup
Chưa làm.

### Gói 8 — Pilot production
Chưa làm.

## TASK gần nhất
TASK 11:
- status: completed
- completed_at: 2026-08-17T22:25:52+07:00
- roadmap_package: Gói 1
- kết quả: Kotlin và TypeScript đọc cùng fixture canonical `listing-text-codec.v1.json` và cho cùng kết quả encode/decode trên 6 case.
- bằng chứng: Android focused test exit 0 (`BUILD SUCCESSFUL`); web codec tests 31/31 pass; `pnpm check` exit 0; Codex đã đọc và review thực tế cả 3 file.

## TASK đang thực hiện
TASK 12:
- status: completed
- started_at: 2026-08-17T22:35:05+07:00
- completed_at: 2026-08-17T22:40:00+07:00
- roadmap_package: Gói 1, Gói 5
- mục tiêu: tạo fixture matching canonical để Kotlin và TypeScript đọc cùng dữ liệu Customer/Property và cho cùng score, reasons, warnings.
- kết quả: 7 case canonical cho cùng exact score, ordered reasons và warnings trên Kotlin/TypeScript; không sửa production code.
- bằng chứng: Android focused tests exit 0 (`BUILD SUCCESSFUL in 47s`); web matching tests 13/13 pass; `pnpm check` exit 0; Codex đã review thực tế cả 3 file.

TASK 13:
- status: completed
- started_at: 2026-08-17T22:41:05+07:00
- completed_at: 2026-08-17T23:02:39+07:00
- roadmap_package: Gói 1, Gói 3
- mục tiêu: tạo fixture PropertyFilter canonical để Kotlin và TypeScript đọc cùng tập Property/filter/query và cho cùng danh sách ID được lọc.
- kết quả: 9 Property và 10 case cho cùng exact ordered matched IDs trên Kotlin/TypeScript; không sửa production code.
- bằng chứng: Android forced focused tests exit 0 (`40 tasks executed`, `BUILD SUCCESSFUL`); web filter tests 16/16, full suite 181/181, `pnpm check` exit 0; Codex review thực tế cả 3 file; correction vòng 1 bổ sung million shorthand và mixed-case text query.

TASK 14:
- status: completed
- started_at: 2026-08-17T23:03:18+07:00
- completed_at: 2026-09-03T19:48:00+07:00
- roadmap_package: Gói 1, Gói 5
- mục tiêu: tạo fixture normalize tên tiếng Việt và số điện thoại để Kotlin/TypeScript cho cùng exact output.
- kết quả: 8 case chuỗi tiếng Việt và 16 case số điện thoại cho cùng exact output trên cả Kotlin và TypeScript; không sửa production code.
- bằng chứng: Android focused test exit 0 (`BUILD SUCCESSFUL in 1m 35s`); web Vitest tests 25/25 pass (`vietnamese-normalization-fixture.test.ts`), full suite 50/50 pass; cả 2 phía cùng đọc canonical fixture `vietnamese-normalization.v1.json`.

## Kết luận hiện tại
Đã xây sâu phần local của Gói 1, 2 và 5.
Chưa hoàn thành trọn vẹn một gói lớn theo cổng nghiệm thu roadmap gốc.

## Quy tắc chọn TASK tiếp theo
Codex không tự suy ra TASK tiếp theo chỉ bằng số thứ tự.
Phải:
1. đọc ROADMAP.md
2. đọc PROJECT_STATUS.md
3. xác định khoảng trống có giá trị nhất
4. lập một TASK nhỏ để tiến gần tới cổng nghiệm thu của một gói
5. trình kế hoạch trước khi giao Antigravity
