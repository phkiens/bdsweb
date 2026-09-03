# 09. KẾ HOẠCH KIỂM THỬ TƯƠNG THÍCH HÀNH VI (BEHAVIORAL PARITY TEST PLAN)

Kế hoạch này thiết lập các kịch bản kiểm thử (Test Cases) tương ứng 1:1 với 34 mã hành vi trong `04-behavior-catalog.yaml` để đảm bảo ứng dụng Web sau khi xây dựng đạt độ tương thích hành vi 100% (Behavioral Parity) so với ứng dụng Android native gốc.

---

## 1. TIÊU CHUẨN ĐẠT PARITY (PASS CRITERIA)

Một chức năng Web được coi là đạt chuẩn **Behavioral Parity** khi và chỉ khi:
1. **Dữ liệu đầu vào và kết quả đầu ra giống hệt**: Cùng một chuỗi địa chỉ, cùng tọa độ, cùng số điện thoại thì thuật toán bóc tách/chuẩn hóa/matching phải cho ra kết quả giống hệt.
2. **Trạng thái lưu trữ hội tụ**: Trạng thái ghi vào IndexedDB / Supabase phải khớp cấu trúc trường, kiểu dữ liệu và thứ tự LWW.
3. **Phản hồi giao diện tương đương**: Toast, banner mất mạng, bottom sheet, trạng thái loading/error hiển thị đúng điều kiện như trên mobile.

---

## 2. MA TRẬN TEST CASES THEO BEHAVIOR ID

### Nhóm 1: Khởi động & Điều hướng (BEH-NAV)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-NAV-01** | `BEH-NAV-001` | Chưa từng mở Web (`localStorage` trống) | Truy cập URL gốc `/` | Tự động chuyển hướng sang trang Onboarding (`/onboarding`). Sau khi bấm "Bắt đầu", lưu cờ và chuyển về `/properties`. Lần sau truy cập thẳng `/properties`. | E2E (Playwright) |
| **TC-NAV-02** | `BEH-NAV-002` | Đang ở danh sách BĐS, đã cuộn xuống vị trí dòng 20 | Click tab "Khách hàng" trên Navbar, sau đó click lại tab "Bất động sản" | Chuyển đổi qua lại giữa 4 màn hình chính không bị reload trang, vị trí cuộn được bảo lưu (Scroll preservation). | E2E (Playwright) |
| **TC-NAV-03** | `BEH-NAV-003` | Người dùng mở URL `/?action=check_duplicate` | Load trang web | Mở ngay hộp thoại `DuplicateCheckModal` trên màn hình danh sách BĐS. | E2E (Playwright) |
| **TC-NAV-04** | `BEH-NAV-004` | Người dùng mở URL `/properties/new` | Load trang | Mở form tạo BĐS với `isVerified = true`. | E2E (Playwright) |
| **TC-NAV-05** | `BEH-NAV-005` | Người dùng mở URL `/properties/new?isVerified=false` | Load trang | Mở form tạo tin chờ duyệt với `isVerified = false`. | E2E (Playwright) |
| **TC-NAV-06** | `BEH-NAV-006` | PWA Share Target nhận chuỗi văn bản tin rao vặt | Chia sẻ text bài đăng vào PWA Web | Điều hướng tới `/unverified`, tự động điền text vào ô trích xuất và kích hoạt phân tích. | Manual / PWA Test |
| **TC-NAV-07** | `BEH-NAV-007` | Truy cập `/property/20260903-120000-abcd` | Load URL trực tiếp | Tải đúng chi tiết BĐS có ID tương ứng từ IndexedDB / Supabase. | E2E (Playwright) |

### Nhóm 2: Danh sách BĐS (BEH-PROP)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-PROP-01** | `BEH-PROP-001` | Có 50 BĐS trong DB | Gõ `ben nghe` vào ô tìm kiếm | Lọc ra ngay các BĐS có chứa "Bến Nghé" không phân biệt hoa thường và không dấu. Phản hồi < 50ms. | Unit / E2E |
| **TC-PROP-02** | `BEH-PROP-002` | Đang ở `/properties` | Click nút "Bộ lọc" trên thanh công cụ | Mở Drawer / Sheet bộ lọc gồm: Giá, Diện tích, Hướng, Khu vực, Trạng thái. | E2E |
| **TC-PROP-03** | `BEH-PROP-003` | Chọn giá `2-5 tỷ`, hướng `Đông Nam` | Bấm "Áp dụng" | Danh sách chỉ hiển thị BĐS thỏa mãn đồng thời cả 2 điều kiện. Hiển thị badge `2` bộ lọc đang chọn. | E2E |
| **TC-PROP-04** | `BEH-PROP-004` | Đang có bộ lọc hoạt động | Bấm "Về bộ lọc cài đặt" | Bộ lọc được trả về trạng thái mặc định theo cấu hình Settings. | E2E |
| **TC-PROP-05** | `BEH-PROP-005` | Card BĐS đang có `needToViewToday = false` | Click icon Lịch trên Card | Icon chuyển sang màu xanh dương, DB cập nhật `needToViewToday = true`, `isTextSynced = 0`, đẩy sync lên server. | E2E / Unit |
| **TC-PROP-06** | `BEH-PROP-006` | BĐS đang có trạng thái "Đang bán" | Click badge trạng thái trên Card | Đổi thành "Tạm ngưng" hoặc hiển thị dropdown chuyển trạng thái. Cập nhật DB tức thì. | E2E |
| **TC-PROP-07** | `BEH-PROP-007` | Chọn 3 BĐS trong chế độ Multi-Select | Bấm "Xóa đã chọn" -> Xác nhận | Cả 3 BĐS biến mất khỏi màn hình, trong DB được gắn `isDeleted = 1`. | E2E |

### Nhóm 3: Form BĐS (BEH-FORM)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-FORM-01** | `BEH-FORM-001` | Mở form tạo BĐS trên trình duyệt hỗ trợ Geolocation | Bấm icon GPS cạnh ô tọa độ | Trình duyệt hỏi quyền vị trí -> Cho phép -> Tự động điền `latitude`, `longitude` với độ chính xác cao. | E2E Mock Geo |
| **TC-FORM-02** | `BEH-FORM-002` | Ở form BĐS | Chọn 5 file ảnh từ máy tính | 5 ảnh được preview dạng lưới, có nút xóa từng ảnh, ảnh được lưu tạm vào ObjectURL / IndexedDB blob. | E2E |
| **TC-FORM-03** | `BEH-FORM-004` | Nhập đoạn văn bản tin BĐS có giá, diện tích, SĐT | Bấm nút "Trích xuất" | Các ô Giá, Diện tích, Địa chỉ, SĐT chủ nhà tự động được điền chính xác. | Unit / Integration |
| **TC-FORM-04** | `BEH-FORM-005` | Điền đầy đủ thông tin hợp lệ | Bấm nút "Lưu BĐS" | Sinh ID dạng `yyyyMMdd-HHmmss-xxxx`, lưu vào IndexedDB với `isTextSynced = 0`, trigger sync Supabase và upload media lên R2. Điều hướng về màn hình chi tiết. | E2E / Integration |

### Nhóm 4: Chi tiết BĐS (BEH-DET)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-DET-01** | `BEH-DET-001` | Mở chi tiết BĐS có SĐT chủ nhà `0901234567` | Bấm SĐT -> Chọn "Gọi điện" | Thẻ `<a href="tel:0901234567">` kích hoạt ứng dụng gọi điện trên di động / thiết bị hỗ trợ. | E2E |
| **TC-DET-02** | `BEH-DET-002` | Mở chi tiết BĐS có SĐT chủ nhà | Bấm SĐT -> Chọn "Mở Zalo" | Mở tab mới tới `https://zalo.me/0901234567`. | E2E |
| **TC-DET-03** | `BEH-DET-003` | Bấm icon Chia sẻ trên TopBar | Chọn mẫu tin "Dành cho khách" | Tạo văn bản đã lược bỏ thông tin chủ nhà và số nhà chi tiết -> Sao chép vào Clipboard kèm Toast thông báo. | E2E |
| **TC-DET-04** | `BEH-DET-005` | Mở chi tiết tin chờ (`isVerified = false`) | Bấm "Xác minh tin" -> Lưu | BĐS chuyển thành `isVerified = true`, biến mất khỏi tab Tin chờ, xuất hiện trong danh sách chính thức. | E2E |
| **TC-DET-05** | `BEH-DET-006` | Mở tab Nhật ký | Nhập ghi chú "Đã gọi chủ nhà thương lượng giá 5.8 tỷ" -> Lưu | Dòng nhật ký xuất hiện trên đầu danh sách nhật ký kèm timestamp hiện tại. | E2E |

### Nhóm 5: Bản đồ & Định tuyến (BEH-MAP)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-MAP-01** | `BEH-MAP-001` | Mở màn hình bản đồ `/map` | Click vào 1 marker BĐS | Hiển thị thẻ Preview ở góc dưới màn hình với ảnh, giá, diện tích và nút "Chi tiết". | E2E Leaflet |
| **TC-MAP-02** | `BEH-MAP-002` | Đang ở bản đồ | Chuột phải (Desktop) hoặc nhấn giữ (Mobile) lên tọa độ mới | Xuất hiện menu: "Thêm BĐS chính thức" / "Thêm tin chờ" tại tọa độ đó. | E2E Leaflet |
| **TC-MAP-03** | `BEH-MAP-003` | Chọn 5 BĐS cần khảo sát | Bấm nút "Tối ưu lộ trình" | Chạy thuật toán TSP, vẽ đường nối Polyline tối ưu qua 5 điểm trên bản đồ và hiển thị thứ tự ghé thăm 1..5. | Unit / E2E |
| **TC-MAP-04** | `BEH-MAP-004` | Trên thẻ preview BĐS | Click nút "Dẫn đường" | Mở tab mới Google Maps với đích đến `destination=lat,lng`. | E2E |

### Nhóm 6: Khách hàng CRM & Matching (BEH-CUST)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-CUST-01** | `BEH-CUST-001` | Mở form thêm khách | Nhập tên "Nguyễn Văn A", SĐT `0912345678`, nhu cầu Mua Nhà 3-6 tỷ tại Bình Thạnh | Lưu thành công khách hàng với SĐT chuẩn hóa, cập nhật vào danh sách. | E2E |
| **TC-CUST-02** | `BEH-CUST-002` | Khách tìm "Nhà", ngân sách 4 tỷ tại "Bình Thạnh", hướng "Đông Nam" | Mở tab "Gợi ý BĐS" | BĐS Nhà 3.8 tỷ tại Bình Thạnh hướng Đông Nam đạt điểm tuyệt đối 100/100đ; BĐS Đất bị 0đ. | Unit MatchEngine |
| **TC-CUST-03** | `BEH-CUST-003` | Mở chi tiết khách | Bấm "Liên kết BĐS đã xem" -> Chọn 1 BĐS | Tạo bản ghi `CustomerPropertyLink` với role = `VIEWED`, hiển thị trong danh sách BĐS đã xem của khách. | E2E |

### Nhóm 7: Đồng bộ & Dữ liệu (BEH-SYNC & BEH-SET)

| Test ID | Behavior ID | Điều kiện tiền đề | Các bước thực hiện trên Web | Kỳ vọng tương thích Native (Expected) | Phương thức |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-SYNC-01** | `BEH-SYNC-001` | Có 3 bản ghi sửa offline (`isTextSynced = 0`), mạng online | Bấm nút "Đồng bộ ngay" | Đẩy 3 bản ghi lên Supabase, nhận HTTP 200/204, CAS cập nhật `isTextSynced = 1` trong IndexedDB. | Integration |
| **TC-SYNC-02** | `BEH-SYNC-003` | Mở 2 tab trình duyệt A và B trên cùng 1 tài khoản | Trên tab A: Đổi giá BĐS từ 5 tỷ thành 5.5 tỷ | Trong vòng 1 giây, tab B tự động cập nhật giá 5.5 tỷ qua WebSocket Realtime mà không cần tải lại trang. | E2E Supabase Realtime |
| **TC-SET-01** | `BEH-SET-001` | Có 100 BĐS trong IndexedDB | Bấm "Sao lưu cơ sở dữ liệu" | Tải về file `bds_backup_YYYYMMDD.json` hoặc sqlite dump chứa toàn bộ dữ liệu. | E2E |
| **TC-SET-02** | `BEH-SET-002` | Có file backup | Bấm "Khôi phục cơ sở dữ liệu" -> Chọn file | Ghi đè IndexedDB và reload lại toàn bộ state ứng dụng. | E2E |
| **TC-SET-03** | `BEH-SET-003` | Có bản ghi xóa mềm quá 30 ngày | Kích hoạt chức năng dọn dẹp | Bản ghi bị xóa vĩnh viễn khỏi cơ sở dữ liệu. | Unit / Integration |
