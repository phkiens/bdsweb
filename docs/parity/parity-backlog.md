# KHO LƯU TRỮ SAI KHÁC NGHIỆP VỤ (FEATURE PARITY BACKLOG)

> **Mục tiêu**: Lập danh mục các điểm sai khác cụ thể giữa App Android Native và Web SPA theo từng hành trình nghiệp vụ.  
> **Chế độ**: Read-Only Audit (Không thay đổi code sản phẩm).  
> **Thứ tự ưu tiên khắc phục**: `P0 → P1 → P2 → P3`.

---

## BẢNG TỔNG HỢP BACKLOG

| Feature ID | Tên tính năng | Phân loại | Mức độ | Trạng thái |
| :--- | :--- | :--- | :---: | :---: |
| **`PROP-AUTO-CUSTOMER-LINK-001`** | Tự động tạo/cập nhật hồ sơ Chủ nhà (OWNER) khi lưu BĐS | `DATA_WRITE`, `STATE_TRANSITION` | **P1** | **MATCH (RESOLVED)** |
| **`CRM-OWNER-FILTER-001`** | Lọc và sắp xếp chủ nhà theo kho hàng (`OwnerStockFilter`, `OwnerPropertySort`) | `CALCULATION`, `DATA_READ` | **P1** | **MATCH (RESOLVED)** |
| **`CRM-LINK-CREATION-002`** | Tạo BĐS từ Khách hàng không sinh liên kết `customer_property_links` | `DATA_WRITE` | **P1** | **MATCH (RESOLVED)** |
| **`CRM-OWNER-DETAIL-003`** | Chi tiết khách hàng OWNER hiển thị nhầm tính năng ghép cặp mua nhà | `VISIBILITY`, `DATA_READ` | **P1** | **MATCH (RESOLVED)** |
| **`CRM-PHONE-DUPLICATE-VALIDATION-001`** | Chặn trùng lặp SĐT chuẩn hóa khi thêm/sửa Khách hàng CRM | `VALIDATION` | **P1** | **MATCH (RESOLVED)** |
| **`PROP-FILTER-ADVANCED-001`** | Bộ lọc BĐS nâng cao (Khoảng giá, diện tích m², hướng nhà, phạm vi) | `CALCULATION`, `DATA_READ` | **P2** | **MATCH (RESOLVED)** |
| **`MAP-SURVEY-GPS-001`** | Bản đồ: Lọc bán kính thực địa theo GPS và phân biệt màu ghim BĐS | `CALCULATION`, `UI_PRESENTATION` | **P2** | **MATCH (RESOLVED)** |
| **`PROP-MERGED-ACTIVITY-001`** | Hợp nhất Nhật ký thực địa và Lịch sử dẫn khách xem nhà | `DATA_READ`, `UI_PRESENTATION` | **P2** | **MATCH (RESOLVED)** |
| **`UNVERIFIED-VERIFY-WIZARD-001`** | Quy trình xác thực tin chờ qua Wizard và tự động liên kết chủ nhà | `STATE_TRANSITION`, `DATA_WRITE` | **P2** | **CONFIRMED** |

---

## CHI TIẾT TỪNG TÍNH NĂNG (FEATURE TICKETS)

### 1. `FEATURE ID: PROP-AUTO-CUSTOMER-LINK-001`
- **Tên tính năng**: Tự động tạo/cập nhật hồ sơ Chủ nhà (OWNER) khi thêm hoặc sửa BĐS
- **Bối cảnh**:
  - Role: Môi giới thêm/sửa BĐS
  - Route/Màn hình: `/properties/new`, `/properties/:id/edit`
  - Trạng thái dữ liệu: Nhập thông tin BĐS có tên chủ nhà và số điện thoại
  - Online/offline: Cả hai
- **Các bước tái hiện**:
  1. Vào trang Thêm BĐS (`/properties/new`).
  2. Điền: Địa chỉ `"123 Lê Quang Định"`, Chủ nhà `"Bác Nam"`, SĐT `"0903112233"`.
  3. Bấm "Lưu bất động sản".
  4. Mở tab Khách hàng (`/customers`).
- **Hành vi của app native**:
  - Tự động gọi `ensureCustomerForProperty(property)`:
    - Nếu SĐT `0903112233` đã có trong danh bạ -> tự động gán BĐS cho chủ nhà này.
    - Nếu chưa có -> tự động tạo một Khách hàng mới với Role `OWNER`, Tên `"Bác Nam"`, SĐT `"0903112233"`, Nhu cầu `"Ký gửi BĐS"`, đồng thời tạo một dòng liên kết trong bảng `customer_property_links` với `role = "OWNER"`.
- **Hành vi web hiện tại**:
  - Chỉ lưu vào bảng `db.properties`.
  - Không kiểm tra, không tạo khách hàng trong `db.customers`, không ghi dòng nào vào `db.customer_property_links`.
  - Danh bạ khách hàng vẫn trống trơn.
- **Kết quả đúng**:
  - Khi lưu BĐS có chủ nhà / SĐT, phải tự động đồng bộ sang bảng `customers` (Role `OWNER`) và tạo bản ghi liên kết `customer_property_links`.
- **Dữ liệu được phép thay đổi**: Bảng `properties`, `customers`, `customer_property_links`.
- **Bằng chứng**:
  - Native: `PropertyRepositoryImpl.kt:L370-L430`
  - Web: `PropertyFormPage.tsx:L180-L195`
- **Suspected Layer**: Domain Service / Repository
- **Mức độ**: **P1**
- **Confidence**: **CONFIRMED**
- **Recommended Test**: Unit/Integration test kiểm tra sau khi gọi lưu BĐS thì cả `customers` và `customer_property_links` đều có bản ghi tương ứng.

---

### 2. `FEATURE ID: CRM-OWNER-FILTER-001`
- **Tên tính năng**: Lọc và sắp xếp danh sách Chủ nhà theo trạng thái kho hàng
- **Bối cảnh**:
  - Role: OWNER (Chủ nhà)
  - Route/Màn hình: `/customers`
  - Trạng thái dữ liệu: Có nhiều chủ nhà, người có nhà đang bán, người chỉ có nhà đã bán, người chưa có nhà
- **Các bước tái hiện**:
  1. Mở danh sách Khách hàng (`/customers`).
  2. Muốn lọc riêng danh sách Chủ nhà đang có hàng bán (`Còn hàng`).
- **Hành vi của app native**:
  - Có tab/bộ lọc riêng cho `Khách mua` vs `Chủ nhà`.
  - Trong ngữ cảnh Chủ nhà (`OWNER`), có bộ lọc `OwnerStockFilter`:
    - `Tất cả`: Hiện mọi chủ nhà.
    - `Còn hàng`: Chỉ hiện chủ nhà có `forSaleCount > 0` (ít nhất 1 nhà trạng thái "Đang bán").
    - `Đã bán hết`: Chỉ hiện chủ nhà có `totalCount > 0` và `soldCount == totalCount`.
  - Có sắp xếp `OwnerPropertySort`: Theo số lượng nhà (Tăng dần / Giảm dần).
- **Hành vi web hiện tại**:
  - Web chỉ có thanh lọc theo `demandType` ("Cần mua", "Cần thuê").
  - Không có tính toán thống kê số nhà đang bán/đã bán (`ownerPropertyStats`).
  - Không có bộ lọc `Còn hàng` / `Đã bán hết`.
- **Kết quả đúng**:
  - Tính toán `ownerPropertyStats` từ `customer_property_links` + `properties`.
  - Bổ sung bộ lọc `OwnerStockFilter` và sắp xếp `OwnerPropertySort` theo chuẩn native.
- **Bằng chứng**:
  - Native: `Customer.kt:L105-L127`, `OwnerStockFilter.kt:L1-L8`, `OwnerPropertySort.kt:L1-L8`
  - Web: `CustomerListPage.tsx:L48-L58`
- **Suspected Layer**: UI Component & View Model Filter Logic
- **Mức độ**: **P1**
- **Confidence**: **CONFIRMED**
- **Recommended Test**: Unit test lọc danh sách chủ nhà với các trạng thái kho hàng khác nhau.

---

### 3. `FEATURE ID: CRM-LINK-CREATION-002`
- **Tên tính năng**: Thêm BĐS từ màn hình Khách hàng (`?linkedCustomerId=...`) không ghi nhận liên kết `customer_property_links`
- **Bối cảnh**:
  - Role: Môi giới đang xem chi tiết một Khách hàng
  - Route/Màn hình: `/customers/:id` -> `/properties/new?linkedCustomerId=...`
- **Các bước tái hiện**:
  1. Mở chi tiết một khách hàng A.
  2. Bấm "Thêm BĐS cho khách hàng này".
  3. Form mở ra với URL có query param `?linkedCustomerId=cust-xxx`.
  4. Điền thông tin và bấm "Lưu bất động sản".
  5. Quay lại trang chi tiết khách hàng A.
- **Hành vi của app native**:
  - Lưu BĐS đồng thời chèn một bản ghi vào `customer_property_links` với `customerId = cust-xxx`, `propertyId = prop-yyy`.
  - Màn hình chi tiết khách hàng hiển thị BĐS vừa tạo trong danh sách BĐS liên kết.
- **Hành vi web hiện tại**:
  - `PropertyFormPage.tsx` đọc `paramCustomerId` và gán vào thuộc tính `linkedCustomerId` của Property, nhưng **không hề gọi lệnh chèn vào bảng `customer_property_links`**.
  - Quay lại trang chi tiết khách hàng A -> tab BĐS liên kết vẫn rỗng.
- **Kết quả đúng**:
  - Khi `linkedCustomerId` tồn tại, phải thực hiện giao dịch ghi cả BĐS vào `properties` và dòng liên kết vào `customer_property_links`.
- **Bằng chứng**:
  - Native: `CustomerRepositoryImpl.kt:L209-L226` (`insertCustomerWithLink`)
  - Web: `PropertyFormPage.tsx:L188-L195`
- **Suspected Layer**: Data Write / Storage
- **Mức độ**: **P1**
- **Confidence**: **CONFIRMED**
- **Recommended Test**: Integration test kiểm tra bảng `customer_property_links` sau khi lưu form với query param.

---

### 4. `FEATURE ID: CRM-OWNER-DETAIL-003`
- **Tên tính năng**: Màn hình Chi tiết Khách hàng OWNER hiển thị nhầm tính năng ghép cặp mua nhà
- **Bối cảnh**:
  - Role: OWNER (Chủ nhà)
  - Route/Màn hình: `/customers/:id`
- **Các bước tái hiện**:
  1. Tạo một khách hàng có role `OWNER` (Chủ nhà ký gửi).
  2. Bấm vào xem chi tiết khách hàng này.
- **Hành vi của app native**:
  - Nhận biết khách hàng là `OWNER` (`!isBuyerSide`).
  - Màn hình hiển thị danh sách BĐS mà chủ nhà này đang sở hữu/gửi bán.
  - Hiển thị thống kê: Tổng số nhà, Số nhà đang bán, Số nhà đã bán.
  - Nút bấm chính: "Thêm BĐS cho chủ nhà này".
  - **Không hiển thị** tab "Gợi ý BĐS phù hợp" (MatchEngine) vì chủ nhà không đi mua nhà.
- **Hành vi web hiện tại**:
  - Dù khách hàng là `OWNER`, Web vẫn chạy thuật toán `MatchEngine.score()` so sánh ngân sách của chủ nhà với toàn bộ kho BĐS để tìm nhà gợi ý mua.
- **Kết quả đúng**:
  - Ẩn tab MatchEngine đối với role `OWNER`.
  - Hiển thị danh sách các BĐS thuộc quyền sở hữu của chủ nhà và thống kê kho hàng.
- **Bằng chứng**:
  - Native: `Customer.kt:L68-L75` (`isBuyerSide`, `isEligibleForMatching`), `CustomerDetailViewScreen.kt:L630-L750`
  - Web: `CustomerDetailPage.tsx:L49-L57`
- **Suspected Layer**: Domain Logic & UI Presentation
- **Mức độ**: **P1**
- **Confidence**: **CONFIRMED**
- **Recommended Test**: Unit test kiểm tra `isEligibleForMatching` trả về `false` đối với `OWNER` và UI chỉ render danh sách nhà gửi bán.

---

### 5. `FEATURE ID: CRM-PHONE-DUPLICATE-VALIDATION-001`
- **Tên tính năng**: Chặn trùng lặp số điện thoại chuẩn hóa khi thêm/sửa Khách hàng CRM
- **Bối cảnh**:
  - Role: Môi giới thêm khách hàng
  - Route/Màn hình: `/customers` (Modal thêm khách hàng)
- **Các bước tái hiện**:
  1. Đã có khách hàng "Anh Tuấn" với SĐT `0909112233`.
  2. Bấm thêm khách hàng mới: Tên "Anh Tuấn 2", SĐT `+84 909 112 233` (cùng số điện thoại khi chuẩn hóa).
  3. Bấm "Lưu".
- **Hành vi của app native**:
  - `prepareCustomerForWrite` kiểm tra số điện thoại chuẩn hóa canonical trong database.
  - Nếu đã tồn tại khách hàng khác chưa xóa mang cùng số điện thoại -> Báo lỗi chặn lại: *"Số điện thoại 0909112233 đã thuộc khách hàng 'Anh Tuấn'"*.
- **Hành vi web hiện tại**:
  - Web không kiểm tra trùng SĐT, trực tiếp gọi `db.customers.add()`.
  - Tạo ra 2 bản ghi khách hàng trùng lặp số điện thoại.
- **Kết quả đúng**:
  - Kiểm tra `canonicalizeVietnamesePhone(phone)` trong bảng `customers` trước khi lưu. Nếu trùng lặp, hiển thị thông báo lỗi và từ chối lưu.
- **Bằng chứng**:
  - Native: `CustomerRepositoryImpl.kt:L180-L196`
  - Web: `CustomerListPage.tsx:L60-L85`
- **Suspected Layer**: Validation / Repository
- **Mức độ**: **P1**
- **Confidence**: **CONFIRMED**
- **Recommended Test**: Unit test kiểm tra validation chặn số điện thoại trùng lặp.

---

### 6. `FEATURE ID: PROP-FILTER-ADVANCED-001`
- **Tên tính năng**: Bộ lọc BĐS nâng cao (Khoảng giá, diện tích m², hướng nhà, phạm vi)
- **Bối cảnh**:
  - Role: Môi giới tìm kiếm BĐS
  - Route/Màn hình: `/properties`
- **Các bước tái hiện**:
  1. Mở danh sách BĐS (`/properties`).
  2. Bấm mở bộ lọc.
- **Hành vi của app native**:
  - Cung cấp đầy đủ các nhóm lọc:
    - Khoảng giá buckets (< 2 tỷ, 2-4 tỷ, 4-6 tỷ, 6-10 tỷ, > 10 tỷ) hoặc nhập min/max tùy ý.
    - Diện tích m² buckets (< 30m², 30-50m², 50-80m², 80-120m², > 120m²) hoặc nhập min/max.
    - Hướng nhà đa chọn (Đông, Tây, Nam, Bắc, Đông Bắc, Đông Nam, Tây Bắc, Tây Nam).
    - Lọc theo nhiều khu vực cùng lúc.
    - Chọn phạm vi lọc `FilterScope`: `CURRENT_TAB` (chỉ BĐS chính thức) hoặc `ALL` (cả chính thức lẫn tin chờ).
- **Hành vi web hiện tại**:
  - Web chỉ có thanh chip chọn đơn: Trạng thái (Tất cả / Đang bán / Tạm dừng / Đã bán) và Loại hình (Nhà / Đất).
  - Chưa có bộ lọc giá, diện tích, hướng nhà, phạm vi.
- **Kết quả đúng**:
  - Cung cấp modal/drawer bộ lọc nâng cao đầy đủ các trường theo `PropertyFilter.kt`.
- **Bằng chứng**:
  - Native: `PropertyFilter.kt:L8-L120`, `PropertyFilterBottomSheet.kt`
  - Web: `PropertyListPage.tsx:L197-L225`
- **Suspected Layer**: UI Presentation & Filter Engine
- **Mức độ**: **P2**
- **Trạng thái**: **MATCH (RESOLVED)** - Xem báo cáo [`PROP-FILTER-ADVANCED-001.md`](PROP-FILTER-ADVANCED-001.md)
- **Recommended Test**: Unit test `tests/unit/parity/prop-filter-advanced.test.ts` (6/6 PASS) & Playwright E2E `smoke.spec.ts` (11/11 PASS).

---

### 7. `FEATURE ID: MAP-SURVEY-GPS-001`
- **Tên tính năng**: Bản đồ khảo sát: Lọc bán kính thực địa theo GPS và phân biệt màu ghim BĐS
- **Bối cảnh**:
  - Role: Môi giới đi thực địa
  - Route/Màn hình: `/map`
  - Quyền hệ thống: Geolocation
- **Các bước tái hiện**:
  1. Mở màn hình bản đồ khảo sát (`/map`).
  2. Cho phép truy cập vị trí GPS.
- **Hành vi của app native**:
  - Hiển thị điểm xanh vị trí GPS hiện tại của môi giới.
  - Cho phép chọn bán kính quét xung quanh vị trí đứng: 500m, 1km, 2km, 5km.
  - Ghim BĐS chính thức màu xanh dương, ghim tin chờ khảo sát màu vàng cam để dễ phân biệt.
- **Hành vi web hiện tại**:
  - Luôn mở mặc định ở tọa độ cố định `(10.7769, 106.7009)` nếu không có query param.
  - Không vẽ điểm định vị người dùng theo thời gian thực.
  - Không có bộ lọc bán kính quanh vị trí hiện tại.
  - Tất cả ghim đều dùng một icon xanh dương giống nhau.
- **Kết quả đúng**:
  - Tích hợp HTML5 Geolocation vẽ vị trí môi giới.
  - Bổ sung bộ lọc bán kính khoanh vùng BĐS gần đây.
  - Đổi màu icon marker cho tin chờ (`isVerified = false`).
- **Bằng chứng**:
  - Native: `MapSurveyViewModel.kt:L150-L200`, `MapItemPreview.kt`
  - Web: `MapSurveyPage.tsx:L50-L95`
- **Suspected Layer**: UI Presentation & Calculation
- **Mức độ**: **P2**
- **Trạng thái**: **MATCH (RESOLVED)** - Xem báo cáo [`MAP-SURVEY-GPS-001.md`](MAP-SURVEY-GPS-001.md)
- **Recommended Test**: Unit test `tests/unit/parity/map-survey-gps.test.ts` (4/4 PASS) & Playwright E2E `smoke.spec.ts` (11/11 PASS).

---

### 8. `FEATURE ID: PROP-MERGED-ACTIVITY-001`
- **Tên tính năng**: Hợp nhất Nhật ký thực địa và Lịch sử dẫn khách xem nhà trong Chi tiết BĐS
- **Bối cảnh**:
  - Role: Môi giới xem chi tiết BĐS
  - Route/Màn hình: `/properties/:id`
- **Các bước tái hiện**:
  1. Mở chi tiết BĐS.
  2. Bấm vào tab "Nhật ký làm việc".
- **Hành vi của app native**:
  - Hiển thị danh sách kết hợp (`MergedActivityItem`):
    - Các ghi chú nhật ký môi giới nhập (`p.diary`) kèm mốc thời gian `[yyyy-MM-dd HH:mm]`.
    - Các lần dẫn khách xem nhà ghi nhận từ bảng `customer_property_links` (tên khách hàng, SĐT, ngày xem `viewDate`, nhận xét `viewNote`).
- **Hành vi web hiện tại**:
  - Chỉ hiển thị một khung văn bản thô `property.diary`.
  - Không liên kết và không hiển thị lịch sử dẫn khách xem nhà từ `customer_property_links`.
- **Kết quả đúng**:
  - Hợp nhất và hiển thị dạng timeline gồm cả nhật ký tay và lịch sử dẫn khách.
- **Bằng chứng**:
  - Native: `PropertyDetailScreen.kt:L895-L935` (`MergedActivityItem`), `PropertyDetailViewModel.kt:L300-L330`
  - Web: `PropertyDetailPage.tsx:L420-L435`
- **Suspected Layer**: Data Read & UI Presentation
- **Mức độ**: **P2**
- **Trạng thái**: **MATCH (RESOLVED)** - Xem báo cáo [`PROP-MERGED-ACTIVITY-001.md`](PROP-MERGED-ACTIVITY-001.md)
- **Recommended Test**: Unit test `tests/unit/parity/prop-merged-activity.test.ts` (10/10 PASS) & Playwright E2E `smoke.spec.ts` (11/11 PASS).

---

### 9. `FEATURE ID: UNVERIFIED-VERIFY-WIZARD-001`
- **Tên tính năng**: Quy trình xác thực tin chờ qua Wizard và tự động liên kết chủ nhà
- **Bối cảnh**:
  - Role: Môi giới duyệt tin chờ khảo sát
  - Route/Màn hình: `/unverified`
- **Các bước tái hiện**:
  1. Mở danh sách tin chờ khảo sát (`/unverified`).
  2. Bấm nút "Xác thực".
- **Hành vi của app native**:
  - Mở màn hình Wizard / Form biên tập chi tiết: Cho phép môi giới kiểm tra lại thông tin AI bóc tách, chụp thêm ảnh thực tế, đo tọa độ GPS, kiểm tra số điện thoại chủ nhà.
  - Khi xác nhận -> chuyển `isVerified = true` đồng thời gọi `ensureCustomerForProperty` để tạo/cập nhật chủ nhà trong CRM.
- **Hành vi web hiện tại**:
  - Bấm nút là ngay lập tức đổi `isVerified = true` mà không cho phép kiểm tra, bổ sung ảnh hay tạo hồ sơ chủ nhà trong CRM.
- **Kết quả đúng**:
  - Điều hướng sang trang xác minh hoặc mở modal chỉnh sửa đầy đủ trước khi lưu thành BĐS chính thức.
- **Bằng chứng**:
  - Native: `UnverifiedScreen.kt:L300-L400`, `UnverifiedViewModel.kt:L188-L220`
  - Web: `UnverifiedListPage.tsx:L44-L52`
- **Suspected Layer**: UI Navigation & State Transition
- **Mức độ**: **P2**
- **Confidence**: **CONFIRMED**
- **Recommended Test**: E2E test cho luồng xác minh tin chờ qua form chi tiết.

---

## TỔNG KẾT & KẾ HOẠCH THỰC HIỆN

Các phiếu sai khác đã được phân loại rõ ràng theo mức độ nghiêm trọng:

1. **Nhóm P1 (Ảnh hưởng nghiệp vụ cốt lõi & dữ liệu - Thực hiện trước):**
   - `PROP-AUTO-CUSTOMER-LINK-001` (Tự động liên kết chủ nhà khi lưu BĐS)
   - `CRM-OWNER-FILTER-001` (Lọc chủ nhà theo kho hàng)
   - `CRM-LINK-CREATION-002` (Tạo BĐS từ khách hàng ghi nhận liên kết)
   - `CRM-OWNER-DETAIL-003` (Sửa màn hình chi tiết chủ nhà)
   - `CRM-PHONE-DUPLICATE-VALIDATION-001` (Chặn trùng lặp SĐT khách hàng)

2. **Nhóm P2 (Luồng phụ & hoàn thiện nâng cao - Thực hiện sau):**
   - `PROP-FILTER-ADVANCED-001` (Bộ lọc BĐS nâng cao)
   - `MAP-SURVEY-GPS-001` (Bản đồ bán kính GPS)
   - `PROP-MERGED-ACTIVITY-001` (Nhật ký dẫn khách hợp nhất)
   - `UNVERIFIED-VERIFY-WIZARD-001` (Wizard xác minh tin chờ)
