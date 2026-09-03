# BÁO CÁO REMEDIATION: PROP-AUTO-CUSTOMER-LINK-001

## 1. Mô tả sai khác
- **Tiêu đề**: Tự động tạo/cập nhật hồ sơ Chủ nhà (OWNER) khi lưu BĐS.
- **Biểu hiện lỗi**: Khi người dùng thêm hoặc sửa BĐS có Tên chủ nhà và SĐT (hoặc xác thực tin chờ), hệ thống chỉ ghi vào bảng `properties`. Không có hồ sơ khách hàng nào được sinh ra trong danh bạ `customers`, và không có bản ghi nào được tạo trong `customer_property_links`.
- **Hành vi Native**: Tự động gọi `ensureCustomerForProperty(property)`:
  - Tra cứu SĐT chuẩn hóa (hoặc tên nếu không có SĐT). Nếu đã có, tái sử dụng và cập nhật thông tin chủ nhà.
  - Nếu chưa có, tự động tạo mới `Customer` với `role = OWNER`, `demandType = "Ký gửi BĐS"`.
  - Tự động tạo bản ghi liên kết trong `customer_property_links` với `role = OWNER`.

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/prop-auto-customer-link.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/prop-auto-customer-link.test.ts)
- Kết quả trước khi có service: `db.customers.count() == 0`, `db.customer_property_links.count() == 0`.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: PropertyFormPage / UnverifiedListPage / PropertyDetailPage
→ User Event: Bấm "Lưu bất động sản" (handleSubmit) hoặc "Xác thực tin" (handleVerify)
→ State/Store: formData / property
→ Validation: area.trim(), phone canonicalization
→ Service: ensureCustomerForProperty(db, property, paramCustomerId)
→ Database: 
    1. db.properties.put(property)
    2. db.customers.put(newOrUpdatedCustomer) (role = OWNER)
    3. db.customer_property_links.put(link) (role = OWNER)
→ State mới: IndexedDB cập nhật đồng loạt cả 3 bảng
→ UI mới: Chuyển hướng sang chi tiết BĐS; Tab Khách hàng CRM hiển thị chủ nhà mới.
```

## 4. Root cause
`PropertyFormPage.tsx` và `UnverifiedListPage.tsx` ban đầu chỉ tương tác đơn lẻ với bảng `db.properties`, thiếu hoàn toàn tầng logic nghiệp vụ `ensureCustomerForProperty` vốn tồn tại ở tầng Repository của app Android (`PropertyRepositoryImpl.kt:L370-L430`).

## 5. Phương án sửa
- Xây dựng service [`web/src/core/services/customer-linker.ts`](file:///c:/Users/k/Downloads/web/web/src/core/services/customer-linker.ts) thực thi chính xác thuật toán từ `PropertyRepositoryImpl.kt`:
  1. Hỗ trợ `explicitCustomerId` (nếu thêm từ URL query `?linkedCustomerId=...`).
  2. Tra cứu liên kết OWNER hiện có -> cập nhật Tên/SĐT nếu thay đổi.
  3. Tra cứu khách hàng cũ theo SĐT canonical `canonicalizeVietnamesePhone` hoặc tên chuẩn hóa.
  4. Tạo khách hàng mới với `role = OWNER`, `demandType = "Ký gửi BĐS"`, ghi chú `AUTO_NOTE_PREFIX`.
  5. Tạo dòng liên kết `customer_property_links`.
- Tích hợp gọi service này vào `PropertyFormPage.tsx`, `UnverifiedListPage.tsx`, và `PropertyDetailPage.tsx`.

## 6. Danh sách file thay đổi
- `[NEW]` [`web/src/core/services/customer-linker.ts`](file:///c:/Users/k/Downloads/web/web/src/core/services/customer-linker.ts)
- `[NEW]` [`web/tests/unit/parity/prop-auto-customer-link.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/prop-auto-customer-link.test.ts)
- `[MODIFY]` [`web/src/pages/properties/PropertyFormPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyFormPage.tsx)
- `[MODIFY]` [`web/src/pages/unverified/UnverifiedListPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/unverified/UnverifiedListPage.tsx)
- `[MODIFY]` [`web/src/pages/properties/PropertyDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyDetailPage.tsx)

## 7. Test được thêm hoặc sửa
- `web/tests/unit/parity/prop-auto-customer-link.test.ts`:
  1. `[REPRODUCTION & VERIFICATION] Tự động tạo hồ sơ Chủ nhà (OWNER) và liên kết khi lưu BĐS mới có Tên và SĐT` -> PASS.
  2. `[REPRODUCTION & VERIFICATION] Tái sử dụng chủ nhà nếu số điện thoại trùng khớp canonical` -> PASS.
  3. `[REPRODUCTION & VERIFICATION] Hỗ trợ liên kết trực tiếp khi có explicitCustomerId (?linkedCustomerId=...)` -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Lưu BĐS chỉ tạo 1 record trong `properties`. CRM trống.
- **Sau**: Lưu BĐS tạo đồng bộ 1 record trong `properties`, 1 record trong `customers` (hoặc tái sử dụng), và 1 record trong `customer_property_links`.

## 9. Command đã chạy
- `npx vitest run tests/unit/parity/prop-auto-customer-link.test.ts`
- `npm run test` (toàn bộ 10 test files)
- `npm run lint` (oxlint)
- `npm run build` (`tsc -b && vite build`)
- `npm run test:e2e` (Playwright)

## 10. Exit code
- Toàn bộ các lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Happy path*: BĐS có đủ tên và SĐT -> Tạo chủ nhà mới và link thành công.
2. *Trùng số điện thoại canonical*: Khách cũ có `0903112233`, BĐS mới nhập `+84 903 112 233` -> Tái sử dụng khách cũ, không nhân đôi.
3. *Explicit Customer ID*: Truyền `linkedCustomerId` -> Tạo liên kết trực tiếp với khách được chỉ định.
4. *BĐS không có tên và không có SĐT*: Không tạo rác trong bảng khách hàng.
5. *Xác thực tin chờ*: Bấm xác thực trong `UnverifiedListPage` hoặc `PropertyDetailPage` -> Đồng bộ chủ nhà vào CRM.
6. *Sửa BĐS đã có chủ*: Cập nhật tên/SĐT của chủ nhà tương ứng, không tạo thêm bản ghi mới.

## 12. Rủi ro regression
- Không có: Các thao tác được bọc an toàn, không thay đổi schema của Dexie hay Supabase.

## 13. Hành vi còn UNKNOWN
- Không còn. Thuật toán đã đối chiếu từng dòng mã với Android Native.

## 14. Trạng thái cuối cùng
- **`MATCH`**
