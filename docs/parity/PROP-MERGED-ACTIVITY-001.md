# BÁO CÁO REMEDIATION: PROP-MERGED-ACTIVITY-001

## 1. Mô tả sai khác
- **Tiêu đề**: Hợp nhất Nhật ký thực địa và Lịch sử dẫn khách xem nhà trong Chi tiết BĐS (`MergedActivityItem`).
- **Biểu hiện lỗi**:
  - Web trước đây chỉ hiển thị chuỗi văn bản thô `property.diary` trong một khối `<pre>` thô sơ.
  - Hoàn toàn bỏ qua bảng liên kết `customer_property_links` và các lượt dẫn khách xem nhà (`role = "VIEWER"`, `viewDate`, `viewNote`).
  - Không phân biệt được hoạt động nào là nhật ký thực địa cá nhân (Diary Note) và hoạt động nào là tương tác dẫn khách thực tế (Customer Viewing).
  - Không hỗ trợ ghi nhận lượt dẫn khách xem nhà trực tiếp từ danh bạ khách hàng CRM đang hoạt động.
  - Không hỗ trợ xóa mềm lượt xem nhà hay lọc nhanh hoạt động theo loại.
- **Hành vi Native**:
  - `PropertyDetailScreen.kt:L895-L1220`: Sử dụng cấu trúc sealed class `MergedActivityItem`:
    - `DiaryNote`: Tách từng dòng trong `p.diary` (`date - text` hoặc `[date] text`), phân tích ngày tháng và gán nhãn biểu tượng `Book/Notes` (màu chính).
    - `CustomerViewing`: Lấy các liên kết `customer_property_links` có `role = "VIEWER"` và `!isDeleted`, đối chiếu với `customers` để lấy tên khách hàng, số điện thoại, ghi chú dẫn xem (`viewNote`), ngày dẫn xem (`viewDate`), biểu tượng `Person` (màu phụ), hiển thị hậu tố `(Đã đóng)` nếu khách hàng có trạng thái `CLOSED`.
    - Hợp nhất cả hai nguồn thành một dòng thời gian duy nhất sắp xếp giảm dần theo thời gian (`sortDate`).
  - Cho phép thêm nhật ký nhanh với cú pháp chuẩn hóa: `dd/MM/yyyy - <nội dung>`.
  - Hỗ trợ modal `AddViewingDialog` để chọn khách hàng CRM chưa liên kết, chọn ngày dẫn xem và ghi chú phản hồi của khách.
  - Hỗ trợ xóa lượt xem nhà (soft delete).

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/prop-merged-activity.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/prop-merged-activity.test.ts)
- Kết quả trước khi sửa: Web không có module `activity-timeline-engine.ts`, không có `viewDate`/`viewNote` trong `CustomerPropertyLink`, không hợp nhất được các mốc nhật ký và xem nhà.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: PropertyDetailPage
→ Dexie Live Queries:
    - db.properties.get(id): Lấy property và trường diary
    - db.customer_property_links.where("propertyId").equals(id): Lấy các liên kết active
    - db.customers: Lấy danh sách khách hàng active để đối chiếu tên, SĐT, trạng thái
→ Engine: buildMergedActivityTimeline(property.diary, propertyLinks, customersMap)
    1. parseDiaryEntries(property.diary): Bóc tách ngày tháng và nội dung nhật ký
    2. Lọc propertyLinks với role == "VIEWER" || role == "VIEWED" và !isDeleted
    3. Tra cứu customer: Bỏ qua khách đã xóa (!isDeleted), gắn cờ "(Đã đóng)" nếu status == CLOSED
    4. parseActivityDate(viewDate): Đổi ngày dd/MM/yyyy thành timestamp epoch
    5. Hợp nhất danh sách và sắp xếp giảm dần theo sortDate (mới nhất lên đầu)
→ Render:
    - Tab 1: Activity Preview Card hiển thị mốc hoạt động gần nhất và tổng số hoạt động
    - Tab 2: Dòng thời gian chi tiết với phân biệt trực quan:
        * Thẻ Nhật ký: Accent xanh dương, icon BookOpen, badge "Nhật ký"
        * Thẻ Khách xem nhà: Accent tím, icon UserCheck, badge "Khách xem nhà", liên kết tới chi tiết khách, ghi chú phản hồi, nút xóa lượt xem
    - Nút "Thêm nhật ký" & Nút "Khách xem nhà" (kèm AddViewingModal)
```

## 4. Root cause
1. Interface `CustomerPropertyLink` trong `web/src/core/models/customer.ts` bị thiếu 2 trường `viewDate` và `viewNote` so với schema Room `CustomerPropertyLink.kt` của Android Native.
2. Web thiếu bộ máy trích xuất và phân tích ngày tháng tiếng Việt đa định dạng (`dd/MM/yyyy`, `dd/MM/yyyy HH:mm`, `[HH:mm dd/MM/yyyy]`, ISO).
3. Giao diện `PropertyDetailPage.tsx` chỉ hiển thị trường `property.diary` thô sơ mà không truy vấn và liên kết với `customer_property_links` và `customers`.

## 5. Phương án sửa
1. **Bổ sung Model & Schema**:
   - Thêm `viewDate?: string | null;` và `viewNote?: string | null;` vào `CustomerPropertyLink` trong [`web/src/core/models/customer.ts`](file:///c:/Users/k/Downloads/web/web/src/core/models/customer.ts).
   - Thêm `VIEWER = "VIEWER"` vào `CustomerPropertyRole` trong [`web/src/core/models/enums.ts`](file:///c:/Users/k/Downloads/web/web/src/core/models/enums.ts).
2. **Tạo Pure Domain Activity Engine**: [`web/src/core/engine/activity-timeline-engine.ts`](file:///c:/Users/k/Downloads/web/web/src/core/engine/activity-timeline-engine.ts):
   - `parseActivityDate`: Phân tích ngày giờ đa định dạng sang epoch timestamp.
   - `parseDiaryEntries`: Phân tách các dòng nhật ký thành `DiaryActivityItem` kèm ngày tháng và nội dung.
   - `buildMergedActivityTimeline`: Hợp nhất nhật ký và lượt xem nhà, xử lý khách hàng đã đóng (`CLOSED`), sắp xếp giảm dần theo thời gian.
   - `canAddViewingLink`: Kiểm tra ngăn chặn trùng lặp liên kết giữa khách hàng và BĐS.
   - `formatDiaryEntry`: Chuẩn hóa định dạng nhật ký mới `dd/MM/yyyy - <nội dung>`.
3. **Tạo Component Modal Thêm Lượt Xem**: [`web/src/pages/properties/AddViewingModal.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/AddViewingModal.tsx):
   - Tìm kiếm nhanh khách hàng CRM theo tên/SĐT.
   - Lọc bỏ các khách hàng đã có liên kết với BĐS này hoặc khách hàng đã xóa / không hoạt động.
   - Cho phép nhập ngày xem (mặc định hôm nay `dd/MM/yyyy`) và nhận xét của khách.
   - Lưu vào `customer_property_links` và kích hoạt `syncManager.pushChanges()`.
4. **Cập nhật Giao diện Chi Tiết BĐS**: [`web/src/pages/properties/PropertyDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyDetailPage.tsx):
   - Tab 1: Thêm thẻ xem trước hoạt động gần nhất (Activity Preview Card) với số lượng mục.
   - Tab switcher: Cập nhật nhãn và số lượng: "Nhật ký & Xem nhà (N)".
   - Tab 2: Xây dựng toàn diện giao diện dòng thời gian với bộ lọc nhanh [Tất cả | Nhật ký | Khách xem nhà].
   - Thêm hành vi xóa lượt xem nhà (soft delete).

## 6. Danh sách file thay đổi
- [NEW] [`web/src/core/engine/activity-timeline-engine.ts`](file:///c:/Users/k/Downloads/web/web/src/core/engine/activity-timeline-engine.ts)
- [NEW] [`web/src/pages/properties/AddViewingModal.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/AddViewingModal.tsx)
- [NEW] [`web/tests/unit/parity/prop-merged-activity.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/prop-merged-activity.test.ts)
- [MODIFY] [`web/src/core/models/customer.ts`](file:///c:/Users/k/Downloads/web/web/src/core/models/customer.ts)
- [MODIFY] [`web/src/core/models/enums.ts`](file:///c:/Users/k/Downloads/web/web/src/core/models/enums.ts)
- [MODIFY] [`web/src/pages/properties/PropertyDetailPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/properties/PropertyDetailPage.tsx)

## 7. Dữ liệu đã đổi
- `customer_property_links`: Lưu thêm các bản ghi có `role = "VIEWER"`, `viewDate`, `viewNote`, `isDeleted = false`.
- `properties.diary`: Cập nhật khi thêm nhật ký mới với định dạng chuẩn `dd/MM/yyyy - <nội dung>`.

## 8. Dữ liệu không đổi
- Cấu trúc các bảng dữ liệu khác trong Dexie DB (`customers`, `sync_logs`).
- Logic tính điểm khớp nhu cầu `MatchEngine`.
- Dữ liệu liên kết chủ nhà `role = "OWNER"`.

## 9. Rủi ro / Edge Cases
- **Khách hàng bị xóa sau khi dẫn xem**: Logic `buildMergedActivityTimeline` tự động bỏ qua các bản ghi liên kết mà khách hàng tương ứng đã bị xóa mềm (`customer.isDeleted == true`), khớp 100% với xử lý native: `if (customer == null || customer.isDeleted) return@mapNotNull null`.
- **Khách hàng đã chốt / đóng giao dịch**: Tự động hiển thị thêm hậu tố `(Đã đóng)` cạnh tên khách hàng.
- **Ngày tháng không hợp lệ hoặc ghi chép tự do**: Nếu nhật ký không chứa ngày hoặc không parse được, `sortDate = 0`, mục sẽ được hiển thị ở cuối danh sách thay vì gây lỗi ứng dụng.

## 10. Biến thể liên quan
- Trang Chi tiết khách hàng CRM (`/customers/:id`): Đã hỗ trợ tab "BĐS liên kết", liệt kê cả BĐS sở hữu (`OWNER`) lẫn BĐS đã dẫn xem (`VIEWER`).
- Trang Ghép cặp khách hàng (`CustomerMatches`): Sử dụng dữ liệu nhu cầu độc lập, không bị ảnh hưởng bởi danh sách xem nhà.

## 11. Bằng chứng test tự động
1. **Unit test**:
   - `tests/unit/parity/prop-merged-activity.test.ts`: **10/10 PASS** (15ms).
   - Toàn bộ suite: **17 test files, 88 tests PASS** (100%).
2. **Linter (Oxlint)**:
   - 0 warnings, 0 errors trên 63 files.
3. **Build**:
   - `tsc -b && vite build` thành công trong 915ms.
4. **E2E Smoke Tests (Playwright)**:
   - **11/11 tests PASS** (bao gồm SMOKE-004 kiểm tra Chi tiết BĐS).

## 12. Hướng dẫn kiểm thử thủ công
1. Mở trang danh sách BĐS (`/properties`), chọn một BĐS bất kỳ (ví dụ BĐS `p-1`).
2. Quan sát thẻ "Nhật ký & Xem nhà" tại tab Chi tiết để thấy mốc hoạt động gần nhất.
3. Chuyển sang tab "Nhật ký & Xem nhà", bấm nút "+ Thêm nhật ký" -> nhập "Chủ nhà đồng ý thương lượng giá" -> Bấm "Lưu nhật ký". Kiểm tra dòng thời gian hiển thị thẻ xanh dương với ngày hôm nay.
4. Bấm nút "+ Khách xem nhà", tìm và chọn một khách hàng có nhu cầu mua -> nhập nhận xét "Khách thích hướng Đông Nam" -> Bấm "Lưu lượt xem". Kiểm tra dòng thời gian hiển thị thẻ màu tím với tên khách hàng và nhận xét.
5. Thử bấm vào chip lọc [Tất cả | Nhật ký | Khách xem nhà] để kiểm tra lọc nhanh.
6. Thử bấm nút xóa (biểu tượng thùng rác) trên thẻ xem nhà -> xác nhận xóa -> thẻ xem nhà biến mất ngay lập tức.

## 13. Mức độ tự tin
**HIGH (100%)**: Cấu trúc dữ liệu và logic trích xuất ngày tháng, phân loại `DiaryNote` vs `CustomerViewing`, lọc trạng thái và hiển thị đều được kiểm chứng chặt chẽ theo đúng mã nguồn của Android Native (`PropertyDetailScreen.kt` & `PropertyDetailViewModel.kt`).

## 14. Trạng thái kết luận
**MATCH (RESOLVED)**: Khắc phục hoàn toàn sai khác giữa Android Native và Web SPA cho hành trình quản lý nhật ký thực địa và lịch sử dẫn khách xem nhà.
