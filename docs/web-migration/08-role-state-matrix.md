# 08. MA TRẬN PHÂN QUYỀN VÀ TRẠNG THÁI (ROLE × STATE MATRIX)

Tài liệu này xác lập ma trận quan hệ giữa vai trò người dùng (role), trạng thái thực thể (entity state), điều kiện mạng (network), quyền hệ thống (permissions) và trạng thái dữ liệu (data state) tác động đến tính hiển thị (`visible`), tính khả dụng (`enabled`) và kết quả mong đợi (`expected result`) của các hành động trong hệ thống.

---

## 1. CÁC BIẾN SỐ TRẠNG THÁI TRONG HỆ THỐNG

1. **Vai trò Thực Thể (Customer / Link Role)**:
   - `BUYER`: Khách hàng tìm mua hoặc thuê BĐS.
   - `OWNER`: Chủ nhà gửi bán hoặc cho thuê.
   - `VIEWED`: BĐS đã từng được dẫn khách đi xem thực tế.
2. **Trạng thái BĐS (Property State)**:
   - `isVerified`: `true` (BĐS chính thức) | `false` (Tin chờ duyệt).
   - `status`: `Đang bán` (Active) | `Đã bán` (Sold) | `Chờ khảo sát` (Pending) | `Tạm ngưng` (Paused).
   - `isDeleted`: `false` (Hoạt động) | `true` (Đã xóa mềm).
   - `needToViewToday`: `true` (Cần xem hôm nay) | `false`.
   - `isTextSynced`: `0` (Chưa đồng bộ) | `1` (Đã đồng bộ).
   - `isMediaSynced`: `0` (Ảnh lưu máy) | `1` (Ảnh đã lên cloud R2).
3. **Trạng thái Khách Hàng (Customer State)**:
   - `status`: `ACTIVE` (Đang giao dịch) | `CLOSED` (Đã chốt / không còn nhu cầu).
   - `isDeleted`: `false` | `true`.
4. **Trạng thái Mạng (Connectivity)**:
   - `ONLINE`: Thiết bị có kết nối Internet.
   - `OFFLINE`: Không có kết nối Internet (Hiển thị thanh đỏ cảnh báo).
5. **Quyền Hệ Thống (Permissions)**:
   - `GPS_GRANTED` / `GPS_DENIED`: Quyền định vị vị trí thực địa.
   - `CAM_GRANTED` / `CAM_DENIED`: Quyền sử dụng máy ảnh.
   - `NOTIF_GRANTED` / `NOTIF_DENIED`: Quyền gửi thông báo.

---

## 2. MA TRẬN HÀNH ĐỘNG THEO TRẠNG THÁI (ROLE × STATE INTERACTION MATRIX)

| Hành Động (Action) | Entity State | Network | Permission | Data State | Visible | Enabled | Kết Quả Mong Đợi (Expected Result) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Xem danh sách BĐS chính thức** | `isVerified=true, isDeleted=false` | Any | Any | Populated | TRUE | TRUE | Hiển thị danh sách card BĐS từ Room DB cục bộ. |
| **Xem danh sách BĐS chính thức** | `isVerified=true, isDeleted=false` | Any | Any | Empty | TRUE | FALSE | Hiển thị màn hình rỗng: "Chưa có BĐS nào. Bấm + để thêm mới". |
| **Hiển thị Banner Mất Mạng** | Any | OFFLINE | Any | Any | TRUE | - | Hiển thị dải đỏ trên cùng: "Không có kết nối mạng" ([`MainActivity.kt:221-237`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L221-L237)). |
| **Bấm nút 'Đồng bộ ngay'** | Any | OFFLINE | Any | Any | TRUE | FALSE | Bị vô hiệu hóa hoặc bấm vào hiển thị Snackbar: "Không có kết nối mạng để đồng bộ". |
| **Bấm nút 'Đồng bộ ngay'** | Any | ONLINE | Any | Any | TRUE | TRUE | Kích hoạt WorkManager push local changes và pull remote changes. |
| **Lấy tọa độ GPS tự động** | Any | Any | GPS_GRANTED | Form Editing | TRUE | TRUE | Điền vĩ độ, kinh độ GPS hiện tại vào form với độ chính xác cao. |
| **Lấy tọa độ GPS tự động** | Any | Any | GPS_DENIED | Form Editing | TRUE | TRUE | Kích hoạt dialog xin quyền GPS; nếu từ chối hiển thị Toast: "Cần cấp quyền vị trí để lấy tọa độ". |
| **Chụp ảnh từ Camera** | Any | Any | CAM_GRANTED | Form Editing | TRUE | TRUE | Mở ứng dụng Camera native để chụp và lưu ảnh vào bộ nhớ app. |
| **Chụp ảnh từ Camera** | Any | Any | CAM_DENIED | Form Editing | TRUE | TRUE | Kích hoạt launcher xin quyền Camera; nếu từ chối thì báo lỗi và gợi ý chọn từ thư viện. |
| **Xác thực tin chờ (Promote)** | `isVerified=false` | Any | Any | Detail View | TRUE | TRUE | Mở form chỉnh sửa với `openForVerify=true`. Khi lưu sẽ đổi `isVerified=true`, chuyển sang danh sách chính thức. |
| **Xác thực tin chờ (Promote)** | `isVerified=true` | Any | Any | Detail View | FALSE | - | Nút xác thực bị ẩn hoàn toàn (BĐS đã là chính thức). |
| **Ghép nối khách hàng (Matching)**| `status=FOR_SALE` | Any | Any | Detail View | TRUE | TRUE | Hiển thị BottomSheet danh sách khách hàng khớp tiêu chí (Score 1..100). |
| **Ghép nối khách hàng (Matching)**| `status=Đã bán` | Any | Any | Detail View | TRUE | TRUE | Danh sách trả về rỗng kèm thông báo: "BĐS đã bán, không thể ghép nối khách". |
| **Ghép nối khách hàng (Matching)**| Khách có `status=CLOSED`| Any | Any | Customer View| TRUE | FALSE | Khách đã đóng không được đưa vào thuật toán tính điểm khớp nhu cầu. |
| **Gọi điện thoại chủ nhà/khách** | `phone` hợp lệ | Any | Any | Detail View | TRUE | TRUE | Mở bàn phím quay số điện thoại hệ thống (`Intent.ACTION_DIAL`). |
| **Gọi điện thoại chủ nhà/khách** | `phone` rỗng | Any | Any | Detail View | TRUE | FALSE | Nút gọi bị mờ/disable, hiển thị "Chưa có số điện thoại". |
| **Mở trò chuyện Zalo** | `phone` hợp lệ (VN) | Any | Any | Detail View | TRUE | TRUE | Mở ứng dụng Zalo dẫn tới cuộc trò chuyện số điện thoại đó. |
| **Mở trò chuyện Zalo** | `phone` không hợp lệ | Any | Any | Detail View | TRUE | FALSE | Hiển thị thông báo: "Số điện thoại không đúng định dạng để mở Zalo". |
| **Chỉ đường khảo sát (Maps)** | Có tọa độ `lat, lng` | Any | Any | Detail View | TRUE | TRUE | Mở ứng dụng Google Maps ngoài để dẫn đường bằng giọng nói. |
| **Chỉ đường khảo sát (Maps)** | Không có tọa độ | Any | Any | Detail View | TRUE | FALSE | Nút chỉ đường bị vô hiệu hóa; hiển thị gợi ý "Cần cập nhật tọa độ BĐS". |
| **Xóa BĐS (Soft Delete)** | `isDeleted=false` | Any | Any | Card / Detail | TRUE | TRUE | Đặt `isDeleted=1`, cập nhật `updatedAt=now`, ẩn khỏi giao diện ngay lập tức. |
| **Xóa vĩnh viễn (Purge)** | `isDeleted=true, age>30d`| Any | Any | DB Background | FALSE | TRUE | `PurgeWorker` xóa vật lý bản ghi khỏi SQLite Room và giải phóng bộ nhớ. |
| **Trích xuất AI (Gemini)** | Tin thô có text | ONLINE | Any | API Key Set | TRUE | TRUE | Gửi văn bản tới Google AI Studio trích xuất các trường thông tin có cấu trúc. |
| **Trích xuất AI (Gemini)** | Tin thô có text | Any | Any | No API Key | TRUE | TRUE | Hiển thị dialog cảnh báo thiếu API Key, điều hướng sang màn hình cấu hình API. |
| **Trích xuất AI (Gemini)** | Tin thô có text | OFFLINE | Any | API Key Set | TRUE | TRUE | Tự động chuyển sang chế độ Regex Parser dự phòng offline. |
| **Tải ảnh nền (Media Restore)** | `isMediaSynced=1` | ONLINE (WiFi) | Any | Local missing| TRUE | TRUE | Worker tải ảnh từ Cloudflare R2 / Drive về bộ nhớ máy khi có WiFi. |
| **Tải ảnh nền (Media Restore)** | `isMediaSynced=1` | ONLINE (4G) | Any | WiFi Only ON | TRUE | FALSE | Worker hoãn tải (WAITING_FOR_UNMETERED_NETWORK), hiển thị thông báo "Có N ảnh mới cần tải". |
