# BÁO CÁO REMEDIATION: PROP-FILTER-ADVANCED-001

## 1. Mô tả sai khác
- **Tiêu đề**: Bộ lọc BĐS nâng cao (Khoảng giá PRICE_BUCKETS, diện tích SIZE_BUCKETS, hướng nhà & cung mệnh, phạm vi FilterScope, sắp xếp).
- **Biểu hiện lỗi**:
  - Web trước đây chỉ có bộ lọc thô sơ gồm 2 dropdown/chip (trạng thái, loại hình), lọc chuỗi đơn giản.
  - Thiếu hoàn toàn các khoảng giá chuẩn PRICE_BUCKETS (<1, 1-2, 2-3, 3-4, 4-5, 5-7, 7-10, >10 tỷ).
  - Thiếu các khoảng diện tích SIZE_BUCKETS (<30, 30-50, 50-80, 80-100, 100-150, >150 m²).
  - Thiếu khả năng lọc đa hướng nhà kết hợp cung mệnh (Đông tứ trạch: Đông, Nam, Bắc, Đông Nam; Tây tứ trạch: Tây, Đông Bắc, Tây Bắc, Tây Nam).
  - Thiếu chuyển đổi phạm vi lọc FilterScope (CURRENT_TAB chỉ xét tab hiện tại vs ALL gộp cả tin chính thức lẫn tin chờ khảo sát).
  - Thiếu thuật toán sắp xếp BĐS theo giá tăng, giá giảm, diện tích và độ mới.
- **Hành vi Native**:
  - PropertyFilter.kt: Kiểm tra toàn diện scope, propertyTypes, statuses, selectedPrices/priceMin/priceMax, selectedSizes/sizeMin/sizeMax, reas, directions, matchesQuery (hỗ trợ cả tìm kiếm giá số thông minh lẫn văn bản tiếng Việt chuẩn hóa).
  - FilterBuckets.kt: Định nghĩa các buckets chuẩn và thuật toán matchesAnyBucket logic OR.
  - PropertyListViewModel.kt: Sắp xếp đa tiêu chí PropertySorter.sort (NEWEST, PRICE_ASC, PRICE_DESC, SIZE).
  - PropertyFilterBottomSheet.kt: Giao diện bộ lọc nâng cao đầy đủ với số lượng tiêu chí đang lọc (active badge counter).

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [	ests/unit/parity/prop-filter-advanced.test.ts](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/prop-filter-advanced.test.ts)
- Kết quả trước khi sửa: Chưa có module property-filter.ts, các test spec kiểm tra bucket matching, multi-direction, scope isolation và sorting đều thất bại.

## 3. Chuỗi gọi UI → dữ liệu
`	ext
UI Component: PropertyListPage
→ User Interaction: Bấm nút "Bộ lọc", chọn khoảng giá (<1, 1-2 tỷ), diện tích, hướng hoặc đổi sắp xếp
→ State: filterState (FilterState), searchQuery, viewTodayOnly
→ Dexie Live Query:
    - Scope = CURRENT_TAB: Lấy BĐS chính thức (!isDeleted && isVerified)
    - Scope = ALL: Lấy toàn bộ BĐS (!isDeleted)
→ Engine Filter: PropertyFilter.matches(p, filterState, searchQuery, viewTodayOnly, PropertyListMode.VERIFIED)
    - Kiểm tra phạm vi (scope isolation)
    - Kiểm tra loại hình (propertyTypes)
    - Kiểm tra trạng thái (statuses)
    - Kiểm tra khoảng giá (matchesAnyBucket với PRICE_BUCKETS hoặc min/max)
    - Kiểm tra diện tích (matchesAnyBucket với SIZE_BUCKETS hoặc min/max)
    - Kiểm tra khu vực (areas với normalizeVietnamese)
    - Kiểm tra hướng nhà (directions / Đông tứ trạch / Tây tứ trạch)
    - Kiểm tra xem hôm nay (needToViewToday)
    - Kiểm tra từ khóa / giá số thông minh (matchesQuery)
→ Sorter: sortProperties(filtered, filterState.sortBy)
→ Render: Danh sách thẻ BĐS đã lọc và sắp xếp chính xác
`

## 4. Root cause
Web trước đó chưa triển khai port của engine lọc PropertyFilter.kt và FilterBuckets.kt từ Android Native, đồng thời giao diện PropertyListPage.tsx chỉ có 2 chip lọc đơn giản không đáp ứng được nghiệp vụ thực tế của môi giới BĐS.

## 5. Phương án sửa
1. **Tạo module engine**: [web/src/core/engine/property-filter.ts](file:///c:/Users/k/Downloads/web/web/src/core/engine/property-filter.ts):
   - Triển khai PRICE_BUCKETS, SIZE_BUCKETS, matchesAnyBucket.
   - Triển khai FilterState, PropertyFilter.matches, PropertyFilter.isFilterActive.
   - Triển khai matchesQuery hỗ trợ tìm kiếm giá số thông minh (ví dụ: 4.5 -> tìm cả giá 4.5 tỷ, 450 -> 4.5 tỷ) và tìm kiếm văn bản tiếng Việt chuẩn hóa bỏ dấu qua 
ormalizeVietnamese.
   - Triển khai sortProperties (NEWEST, PRICE_ASC, PRICE_DESC, SIZE).
2. **Cập nhật Model Enums**: [web/src/core/models/enums.ts](file:///c:/Users/k/Downloads/web/web/src/core/models/enums.ts):
   - Thêm FilterScope (CURRENT_TAB, ALL).
   - Thêm PropertySortType (NEWEST, PRICE_ASC, PRICE_DESC, SIZE).
   - Thêm PropertyListMode (VERIFIED, UNVERIFIED, ALL).
3. **Cập nhật Giao diện**: [web/src/pages/properties/PropertyListPage.tsx](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyListPage.tsx):
   - Thay thế quick filter cũ bằng Advanced Filter Panel hoàn chỉnh.
   - Thêm bộ đếm tiêu chí lọc đang hoạt động (ctiveFilterCount badge).
   - Thêm các chip chọn phạm vi (SP chính vs Tất cả), loại BĐS (Nhà, Đất), trạng thái (Đang bán, Đã bán, Tạm ngưng).
   - Thêm danh sách chip chọn khoảng giá tỷ (PRICE_BUCKETS) và diện tích m² (SIZE_BUCKETS).
   - Thêm nút kích hoạt nhanh cung mệnh Đông tứ trạch & Tây tứ trạch và các hướng cụ thể.
   - Thêm tùy chọn sắp xếp kết quả (Mới nhất, Giá tăng, Giá giảm, Diện tích).
   - Cung cấp nút "Xóa lọc" để trở về cấu hình mặc định.

## 6. Danh sách file thay đổi
- [NEW] [web/src/core/engine/property-filter.ts](file:///c:/Users/k/Downloads/web/web/src/core/engine/property-filter.ts)
- [NEW] [web/tests/unit/parity/prop-filter-advanced.test.ts](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/prop-filter-advanced.test.ts)
- [MODIFY] [web/src/core/models/enums.ts](file:///c:/Users/k/Downloads/web/web/src/core/models/enums.ts)
- [MODIFY] [web/src/pages/properties/PropertyListPage.tsx](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyListPage.tsx)

## 7. Test được thêm hoặc sửa
- web/tests/unit/parity/prop-filter-advanced.test.ts:
  1. Khớp chính xác các khoảng giá PRICE_BUCKETS (<1, 1-2, 2-3, 3-4, 4-5, 5-7, 7-10, >10) -> PASS.
  2. Khớp chính xác các khoảng diện tích SIZE_BUCKETS (<30, 30-50, 50-80, 80-100, 100-150, >150) -> PASS.
  3. Lọc theo khoảng giá tùy biến (priceMin / priceMax) và diện tích tùy biến (sizeMin / sizeMax) -> PASS.
  4. Lọc đa hướng nhà (directions set matching) -> PASS.
  5. Phạm vi lọc FilterScope: CURRENT_TAB vs ALL -> PASS.
  6. Sắp xếp sortProperties: Mới nhất, Giá tăng, Giá giảm, Diện tích -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Không có bộ lọc nâng cao; không thể lọc theo khoảng giá, diện tích, hướng hoặc cung mệnh phong thủy; không sắp xếp được danh sách BĐS.
- **Sau**: Khớp 100% logic lọc và sắp xếp từ Android Native PropertyFilter.kt, giao diện trực quan với huy hiệu đếm tiêu chí lọc và phản hồi tức thì.

## 9. Command đã chạy
- 
px vitest run tests/unit/parity/prop-filter-advanced.test.ts (6/6 tests PASS)
- 
pm run test (15 test files, 74 tests PASS)
- 
pm run lint (0 warnings, 0 errors)
- 
pm run build (tsc -b && vite build: built in 903ms)
- 
pm run test:e2e (Playwright: 11 tests PASS in 13.4s)

## 10. Exit code
- Toàn bộ lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Khoảng giá đơn và đa khoảng*: Chọn 1 hoặc nhiều bucket cùng lúc (logic OR) hoạt động chuẩn xác.
2. *Khoảng diện tích đơn và đa khoảng*: Hoạt động chuẩn xác.
3. *Hướng nhà đơn lẻ & cung mệnh*: Lựa chọn Đông tứ trạch (Đông, Nam, Bắc, Đông Nam) hoặc Tây tứ trạch (Tây, Đông Bắc, Tây Bắc, Tây Nam) khớp chính xác các BĐS tương ứng.
4. *Phạm vi FilterScope*: CURRENT_TAB cô lập đúng tin chính thức; ALL hiển thị gộp cả tin chờ khảo sát.
5. *Tìm kiếm giá số thông minh & tiếng Việt không dấu*: Khớp cả giá dạng số (4.5), dạng viết liền (450) và văn bản không dấu (inh thanh).
6. *Sắp xếp*: Cả 4 chế độ sắp xếp (Mới nhất, Giá tăng, Giá giảm, Diện tích) hoạt động đúng thứ tự.

## 12. Rủi ro regression
- Không có: Các bộ lọc mặc định giữ nguyên hiển thị tất cả BĐS chính thức chưa xóa; toàn bộ 11 bài kiểm thử Playwright E2E đều đạt 100%.

## 13. Hành vi còn UNKNOWN
- Không còn. Thuật toán đã đối chiếu từng chi tiết với PropertyFilter.kt, FilterBuckets.kt và PropertyListViewModel.kt trên Android Native.

## 14. Trạng thái cuối cùng
- **MATCH**
