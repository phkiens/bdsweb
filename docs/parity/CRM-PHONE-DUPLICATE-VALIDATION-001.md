# BÁO CÁO REMEDIATION: CRM-PHONE-DUPLICATE-VALIDATION-001

## 1. Mô tả sai khác
- **Tiêu đề**: Chặn trùng lặp số điện thoại chuẩn hóa khi thêm/sửa Khách hàng CRM.
- **Biểu hiện lỗi**: Web cho phép tạo nhiều khách hàng có cùng số điện thoại (hoặc cùng số điện thoại khi chuẩn hóa canonical, ví dụ `+84 909 112 233` và `0909112233`), dẫn tới việc danh bạ bị trùng lặp, phá vỡ tính toàn vẹn dữ liệu.
- **Hành vi Native**:
  - `CustomerRepositoryImpl.kt` (`prepareCustomerForWrite`):
    - Chuẩn hóa SĐT thành canonical dạng 10 chữ số (0xxxxxxxxx).
    - Tra cứu trong DB xem đã có khách hàng nào chưa bị xóa (`!isDeleted`) mang SĐT canonical này chưa.
    - Nếu đã tồn tại khách hàng khác mang SĐT này -> Chặn lại và ném lỗi:
      `"Số điện thoại [SĐT] đã thuộc khách hàng '[Tên]' (ID: [ID])"`.
    - Cho phép cập nhật nếu đó là chính khách hàng đang chỉnh sửa (`existing.id == customer.id`).
    - Cho phép lưu nếu SĐT trùng thuộc về bản ghi đã bị xóa (`isDeleted == true`).

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/crm-phone-duplicate.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-phone-duplicate.test.ts)
- Kết quả trước khi sửa: Web gọi thẳng `db.customers.add(cust)` mà không kiểm tra trùng SĐT canonical, nạp trùng lặp bản ghi vào IndexedDB.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: CustomerListPage (Modal Thêm Khách Hàng)
→ User Event: Nhập tên, SĐT và bấm "Lưu khách hàng"
→ Service: prepareCustomerForWrite(db, customerDraft)
→ Validation: 
    - Canonicalize SĐT: canonicalizeVietnamesePhone(phone)
    - Tra cứu IndexedDB: db.customers.filter(!isDeleted && phone === canonicalPhone)
    - Nếu trùng khách khác -> throw Error("Số điện thoại ... đã thuộc khách hàng '...'")
→ Database: 
    - Nếu hợp lệ -> db.customers.add(prepared)
    - Nếu trùng lặp -> Bắt lỗi ở UI, hiển thị thông báo đỏ trên Modal, giữ nguyên form
```

## 4. Root cause
`CustomerListPage.tsx` trước đây gọi trực tiếp `db.customers.add(cust)` mà không qua bước thẩm định dữ liệu (validation layer) của repository như phía Android Native (`CustomerRepositoryImpl.kt:L160-L198`).

## 5. Phương án sửa
1. Xây dựng service [`web/src/core/services/customer-validator.ts`](file:///c:/Users/k/Downloads/web/web/src/core/services/customer-validator.ts) với hàm `prepareCustomerForWrite`:
   - Chuẩn hóa SĐT theo `canonicalizeVietnamesePhone`.
   - Chuẩn hóa chuỗi tìm kiếm không dấu `nameNormalized`, `noteNormalized`.
   - Tra cứu SĐT canonical đối với các bản ghi chưa xóa (`!c.isDeleted`).
   - Xử lý ngoại lệ chính xác: Chặn trùng khách khác, cho phép sửa chính mình, bỏ qua nếu đến từ đồng bộ (`fromSync = true`).
2. Cập nhật [`web/src/pages/customers/CustomerListPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerListPage.tsx):
   - Gọi `prepareCustomerForWrite` trước khi `db.customers.add()`.
   - Bắt lỗi và hiển thị thông báo lỗi thân thiện trực tiếp trên Modal thêm khách hàng.

## 6. Danh sách file thay đổi
- `[NEW]` [`web/src/core/services/customer-validator.ts`](file:///c:/Users/k/Downloads/web/web/src/core/services/customer-validator.ts)
- `[NEW]` [`web/tests/unit/parity/crm-phone-duplicate.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-phone-duplicate.test.ts)
- `[MODIFY]` [`web/src/pages/customers/CustomerListPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerListPage.tsx)

## 7. Test được thêm hoặc sửa
- `web/tests/unit/parity/crm-phone-duplicate.test.ts`:
  1. `[REPRODUCTION & VERIFICATION] Chặn tạo khách hàng mới khi SĐT trùng với khách hàng đã có` -> PASS.
  2. `[REPRODUCTION & VERIFICATION] Phát hiện trùng lặp ngay cả khi định dạng SĐT khác nhau (+84 vs 0)` -> PASS.
  3. `Cho phép cập nhật thông tin của chính khách hàng mà không báo lỗi trùng SĐT` -> PASS.
  4. `Cho phép tạo khách hàng mới nếu khách hàng trùng SĐT cũ đã bị xóa (isDeleted = true)` -> PASS.
  5. `Cho phép tạo khách hàng khi không nhập SĐT` -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Có thể tạo vô hạn khách hàng cùng một số điện thoại; không phát hiện trùng khi nhập định dạng quốc tế `+84`.
- **Sau**: Phát hiện và chặn triệt để mọi trường hợp trùng số điện thoại chuẩn hóa; hiển thị thông báo lỗi rõ ràng trên form modal.

## 9. Command đã chạy
- `npx vitest run tests/unit/parity/crm-phone-duplicate.test.ts`
- `npm run test` (toàn bộ 14 test files, 68 tests)
- `npm run lint` (oxlint: 0 warnings, 0 errors)
- `npm run build` (`tsc -b && vite build`: built in 916ms)
- `npm run test:e2e` (Playwright: 11 tests passed in 15.9s)

## 10. Exit code
- Toàn bộ lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Trùng SĐT cùng định dạng*: Báo lỗi chính xác.
2. *Trùng SĐT khác định dạng (`+84` vs `0`)*: Chuẩn hóa canonical và báo lỗi chính xác.
3. *Sửa chính mình*: Không bị chặn.
4. *Khách trùng cũ đã bị xóa*: Cho phép tạo mới thành công.
5. *Khách không có SĐT*: Cho phép tạo bình thường.
6. *Bỏ qua khi sync*: Cờ `fromSync` đảm bảo không làm gián đoạn tiến trình đồng bộ dữ liệu hai chiều.

## 12. Rủi ro regression
- Không có: Các luồng nhập liệu hợp lệ đều diễn ra trơn tru.

## 13. Hành vi còn UNKNOWN
- Không còn. Thuật toán đã đối chiếu từng dòng mã với Android Native.

## 14. Trạng thái cuối cùng
- **`MATCH`**
