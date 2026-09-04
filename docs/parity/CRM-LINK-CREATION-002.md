# BÁO CÁO REMEDIATION: CRM-LINK-CREATION-002

## 1. Mô tả sai khác
- **Tiêu đề**: Thêm BĐS từ màn hình Khách hàng (`?linkedCustomerId=...`) không ghi nhận liên kết `customer_property_links`.
- **Biểu hiện lỗi**:
  1. Trong màn hình chi tiết khách hàng (`/customers/:id`), tab "BĐS đã liên kết" bị hardcode thông báo trống, không hiển thị các BĐS được gắn cờ đã xem hoặc ký gửi bán bởi khách hàng này.
  2. Không có nút hành động để thêm BĐS trực tiếp cho khách hàng.
  3. Khi mở form tạo BĐS với param `?linkedCustomerId=...`, thông tin Tên chủ nhà và SĐT không được tự động điền từ hồ sơ khách hàng.
- **Hành vi Native**:
  - Khi xem chi tiết khách hàng (đặc biệt là Chủ nhà `OWNER`): Cung cấp nút "Thêm BĐS cho chủ nhà này" -> Mở form với `linkedCustomerId`, `ownerName`, `ownerPhone` được điền sẵn.
  - Sau khi lưu BĐS: Tự động ghi nhận một bản ghi liên kết hai chiều trong bảng `customer_property_links` (`customerId`, `propertyId`, `role = OWNER`).
  - Màn hình chi tiết khách hàng hiển thị đầy đủ danh sách các BĐS liên kết (khu vực, loại hình, giá, hướng, trạng thái bán, vai trò sở hữu / đã xem).

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/crm-link-creation.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-link-creation.test.ts)
- Kết quả trước khi sửa: Web không hiển thị BĐS liên kết trong tab Linked của `CustomerDetailPage.tsx` và không prefill dữ liệu chủ nhà trong `PropertyFormPage.tsx`.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: CustomerDetailPage
→ User Event: Bấm nút "Thêm BĐS cho khách này"
→ Navigation: Chuyển sang /properties/new?linkedCustomerId=...&ownerName=...&ownerPhone=...
→ Form prefill: PropertyFormPage tự động đọc param và nạp thông tin chủ nhà từ db.customers
→ User Event: Điền thông tin nhà và bấm "Lưu bất động sản"
→ Service: ensureCustomerForProperty(db, property, paramCustomerId)
→ Database: 
    - db.properties.add(property)
    - db.customer_property_links.put({ customerId, propertyId, role: "OWNER", ... })
→ UI mới: Quay lại /customers/:id -> Tab "BĐS đã liên kết" hiển thị ngay căn nhà vừa tạo.
```

## 4. Root cause
- `CustomerDetailPage.tsx` thiếu logic truy vấn join giữa bảng `customer_property_links` và `properties`, đồng thời thiếu nút điều hướng "Thêm BĐS cho khách này".
- `PropertyFormPage.tsx` chỉ gán thuộc tính `linkedCustomerId` mà không tự động nạp thông tin Tên và SĐT của khách hàng vào form.

## 5. Phương án sửa
1. Cập nhật [`web/src/pages/customers/CustomerDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerDetailPage.tsx):
   - Thay thế `linkedLinks` đơn thuần bằng `linkedItems` truy vấn join với `properties`.
   - Bổ sung nút hành động "Thêm BĐS cho khách này" điều hướng sang form kèm query params.
   - Render danh sách thẻ BĐS đã liên kết với đầy đủ thông tin: Địa chỉ, Giá, Diện tích, Hướng, Loại hình, Trạng thái bán và Tag vai trò (`Chủ sở hữu` / `Đã dẫn xem`).
2. Cập nhật [`web/src/pages/properties/PropertyFormPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyFormPage.tsx):
   - Trong `useEffect`: Nếu `!isEditMode && paramCustomerId`, tự động nạp tên và số điện thoại của khách hàng từ `db.customers` vào state form.
3. Kiểm chứng tầng lưu trữ:
   - Dịch vụ `ensureCustomerForProperty` đảm bảo ghi nhận liên kết vào `customer_property_links` không bị trùng lặp.

## 6. Danh sách file thay đổi
- `[NEW]` [`web/tests/unit/parity/crm-link-creation.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-link-creation.test.ts)
- `[MODIFY]` [`web/src/pages/customers/CustomerDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerDetailPage.tsx)
- `[MODIFY]` [`web/src/pages/properties/PropertyFormPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyFormPage.tsx)

## 7. Test được thêm hoặc sửa
- `web/tests/unit/parity/crm-link-creation.test.ts`:
  1. `[REPRODUCTION & VERIFICATION] Thêm BĐS từ màn hình Khách hàng (?linkedCustomerId=...) ghi nhận liên kết hai chiều trong customer_property_links` -> PASS.
  2. `Không tạo bản ghi liên kết trùng lặp nếu đã tồn tại cặp customerId - propertyId` -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Tab BĐS liên kết bị bỏ trống (hardcoded empty text); không có cách nào thêm BĐS cho khách từ trang chi tiết; form tạo BĐS không tự điền tên/SĐT khách hàng.
- **Sau**: Có nút "Thêm BĐS cho khách này"; form tự động điền tên và SĐT của khách; lưu xong quay lại hiển thị ngay danh sách BĐS đã liên kết kèm tag "Chủ sở hữu".

## 9. Command đã chạy
- `npx vitest run tests/unit/parity/crm-link-creation.test.ts`
- `npm run test` (toàn bộ 12 test files, 61 tests)
- `npm run lint` (oxlint)
- `npm run build` (`tsc -b && vite build`)
- `npm run test:e2e` (Playwright, 11 tests)

## 10. Exit code
- Toàn bộ lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Tạo BĐS với linkedCustomerId*: Tạo liên kết role OWNER và hiển thị ở cả chi tiết khách hàng lẫn chi tiết BĐS.
2. *Prefill tự động*: Khi vào form từ khách hàng, tên và SĐT được điền tự động.
3. *Tránh liên kết trùng lặp*: Thêm nhiều lần cùng 1 cặp customer-property không gây sinh thêm bản ghi rác.
4. *Khách hàng chưa có BĐS*: Hiển thị empty state thân thiện kèm nút bấm "Thêm BĐS ngay".
5. *Bấm vào thẻ BĐS liên kết*: Điều hướng chính xác sang trang chi tiết của BĐS đó.

## 12. Rủi ro regression
- Không có: Truy vấn join thực hiện trên client IndexedDB an toàn và độc lập.

## 13. Hành vi còn UNKNOWN
- Không còn. Luồng nghiệp vụ khớp hoàn toàn với Android Native.

## 14. Trạng thái cuối cùng
- **`MATCH`**
