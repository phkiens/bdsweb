# BÁO CÁO REMEDIATION: CRM-OWNER-FILTER-001

## 1. Mô tả sai khác
- **Tiêu đề**: Lọc và sắp xếp danh sách Chủ nhà theo trạng thái kho hàng (`OwnerStockFilter`, `OwnerPropertySort`).
- **Biểu hiện lỗi**: Web chỉ lọc theo nhu cầu mua bán chung chung (`demandType`), không phân tách vai trò Khách mua (`BUYER`) và Chủ nhà (`OWNER`). Không có thống kê số lượng BĐS sở hữu, không có bộ lọc "Còn hàng" (có ít nhất 1 BĐS đang bán) / "Đã bán hết", và không thể sắp xếp danh sách chủ nhà theo số lượng nhà đang ký gửi.
- **Hành vi Native**:
  - `CustomerFilter`: Hỗ trợ các tab `ALL` (Tất cả), `BUYER_ACTIVE` (Khách đang tìm), `OWNER_ACTIVE` (Chủ đang gửi), `CLOSED` (Đã đóng).
  - Khi ở ngữ cảnh `OWNER_ACTIVE`:
    - Bộ lọc `OwnerStockFilter`:
      - `Tất cả`: Hiển thị mọi chủ nhà.
      - `Còn hàng` (`HAS_STOCK`): Chỉ hiển thị chủ nhà có `forSaleCount > 0`.
      - `Đã bán hết` (`SOLD_OUT`): Chỉ hiển thị chủ nhà có `totalCount > 0 && soldCount == totalCount`.
    - Sắp xếp `OwnerPropertySort`:
      - `Mặc định` (`DEFAULT`).
      - `Giảm dần số nhà` (`DESCENDING`): Sắp xếp theo `totalCount DESC`, sau đó theo `updatedAt DESC`.
      - `Tăng dần số nhà` (`ASCENDING`): Sắp xếp theo `totalCount ASC`, sau đó theo `updatedAt DESC`.
  - Trên thẻ khách hàng: Hiển thị badge vai trò và số lượng BĐS (`totalCount` BĐS gửi bán, `{forSaleCount}` đang bán, `{soldCount}` đã bán).

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/crm-owner-filter.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-owner-filter.test.ts)
- Kết quả trước khi sửa: Web không có `calculateOwnerPropertyStats`, không có enum `OwnerStockFilter` / `OwnerPropertySort`, không thể phân loại chủ nhà còn hàng hay đã bán hết.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: CustomerListPage
→ User Event: Bấm chọn tab "Chủ nhà" (CustomerFilter.OWNER_ACTIVE), chọn chip "Còn hàng", chọn sắp xếp "Giảm dần số nhà"
→ State/Store: customerFilter, ownerStockFilter, ownerPropertySort, searchQuery
→ Engine: 
    1. calculateOwnerPropertyStats(links, properties)
    2. applyCustomerFilters(customers, customerFilter, stats, searchQuery, ownerStockFilter, ownerPropertySort)
→ Database: Đọc IndexedDB từ các bảng customers, customer_property_links, properties
→ State mới: Danh sách filteredCustomers được lọc và sắp xếp chính xác
→ UI mới: Hiển thị đúng danh sách chủ nhà có nhà đang bán, sắp xếp theo số lượng BĐS.
```

## 4. Root cause
Web thiếu tầng tính toán thống kê kho hàng (`OwnerPropertyStats`) từ bảng liên kết `customer_property_links` và thiếu các enum, logic lọc `OwnerStockFilter` / `OwnerPropertySort` theo chuẩn Android Native (`Customer.kt:L105-L151` & `CustomerDao.kt:L144-L154`).

## 5. Phương án sửa
- Bổ sung các enum `CustomerFilter`, `OwnerStockFilter`, `OwnerPropertySort` vào [`web/src/core/models/enums.ts`](file:///c:/Users/k/Downloads/web/web/src/core/models/enums.ts).
- Xây dựng engine [`web/src/core/engine/customer-filter.ts`](file:///c:/Users/k/Downloads/web/web/src/core/engine/customer-filter.ts) khớp 100% với Kotlin `Customer.kt` và `CustomerDao.kt`:
  - `calculateOwnerPropertyStats(links, properties)`
  - `applyCustomerFilters(...)`
- Cập nhật [`web/src/pages/customers/CustomerListPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerListPage.tsx):
  - Thay thế thanh filter cũ bằng hệ thống tab chuẩn: Tất cả, Khách mua, Chủ nhà, Đã đóng.
  - Khi ở tab Chủ nhà: Mở thanh sub-filter kho hàng (Tất cả / Còn hàng / Đã bán hết) và thanh chọn sắp xếp.
  - Hiển thị badge thống kê kho hàng trên từng thẻ chủ nhà.

## 6. Danh sách file thay đổi
- `[NEW]` [`web/src/core/engine/customer-filter.ts`](file:///c:/Users/k/Downloads/web/web/src/core/engine/customer-filter.ts)
- `[NEW]` [`web/tests/unit/parity/crm-owner-filter.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/crm-owner-filter.test.ts)
- `[MODIFY]` [`web/src/core/models/enums.ts`](file:///c:/Users/k/Downloads/web/web/src/core/models/enums.ts)
- `[MODIFY]` [`web/src/pages/customers/CustomerListPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/customers/CustomerListPage.tsx)

## 7. Test được thêm hoặc sửa
- `web/tests/unit/parity/crm-owner-filter.test.ts`:
  1. `tính toán chính xác OwnerPropertyStats (totalCount, forSaleCount, soldCount)` -> PASS.
  2. `lọc OwnerStockFilter.HAS_STOCK ('Còn hàng'): chỉ trả về chủ nhà có ít nhất 1 BĐS đang bán (forSaleCount > 0)` -> PASS.
  3. `lọc OwnerStockFilter.SOLD_OUT ('Đã bán hết'): chỉ trả về chủ nhà có nhà nhưng toàn bộ đã bán` -> PASS.
  4. `sắp xếp OwnerPropertySort.DESCENDING: sắp xếp giảm dần theo tổng số nhà sở hữu` -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Không có bộ lọc chủ nhà; không hiển thị số lượng BĐS sở hữu; không lọc được chủ nhà có hàng hay hết hàng.
- **Sau**: Có đầy đủ tab Khách mua / Chủ nhà; thanh lọc kho hàng Còn hàng / Đã bán hết; sắp xếp Tăng / Giảm số nhà; hiển thị số lượng BĐS và trạng thái đang bán / đã bán trên thẻ chủ nhà.

## 9. Command đã chạy
- `npx vitest run tests/unit/parity/crm-owner-filter.test.ts`
- `npm run test` (toàn bộ 11 test files, 59 tests)
- `npm run lint` (oxlint)
- `npm run build` (`tsc -b && vite build`)
- `npm run test:e2e` (Playwright, 11 tests)

## 10. Exit code
- Toàn bộ lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Chủ nhà chưa có BĐS*: `totalCount = 0`, không bị tính nhầm vào "Còn hàng" hay "Đã bán hết".
2. *Chủ nhà có cả nhà đang bán và nhà đã bán*: Được lọc chính xác vào "Còn hàng".
3. *Chủ nhà có tất cả nhà đều đã bán*: Được lọc chính xác vào "Đã bán hết".
4. *Sắp xếp DESCENDING vs ASCENDING*: Sắp xếp số lượng nhà chính xác, nếu trùng số nhà sắp xếp tiếp theo mốc thời gian `updatedAt DESC`.
5. *Tìm kiếm kết hợp*: Tìm kiếm từ khóa không dấu hoạt động song song với bộ lọc kho hàng.
6. *Khách mua*: Tab "Khách mua" hiển thị nhu cầu và ngân sách, không hiển thị thanh lọc kho hàng chủ nhà.

## 12. Rủi ro regression
- Không có: Tính toán hoàn toàn trên bộ nhớ từ IndexedDB LiveQuery, không ảnh hưởng tới dữ liệu gốc.

## 13. Hành vi còn UNKNOWN
- Không còn. Thuật toán đã đối chiếu từng dòng mã với Android Native.

## 14. Trạng thái cuối cùng
- **`MATCH`**
