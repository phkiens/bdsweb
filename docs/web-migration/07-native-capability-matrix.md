# 07. MA TRẬN KHẢ NĂNG NATIVE VÀ GIẢI PHÁP WEB (NATIVE CAPABILITY MATRIX)

Tài liệu này đánh giá chi tiết 16 tính năng phụ thuộc nền tảng native Android của BDS Collector và phân loại theo 5 mức độ khả thi khi chuyển đổi sang Web / PWA.

---

## 1. THANG PHÂN LOẠI KHẢ NĂNG CHUYỂN ĐỔI

- **Nhóm A**: Web hỗ trợ trực tiếp (Đạt 100% parity không cần phụ thuộc đặc biệt).
- **Nhóm B**: PWA có thể thay thế (Cần cài đặt ứng dụng Progressive Web App để đạt trải nghiệm tương đương).
- **Nhóm C**: Web hỗ trợ nhưng hành vi khác (Có thể triển khai nhưng khác biệt về UX/hạn chế trình duyệt).
- **Nhóm D**: Không có tương đương đầy đủ (Cần thiết kế lại kiến trúc giải pháp).
- **Nhóm E**: Không còn được sử dụng / Đã lỗi thời (Không cần chuyển dịch sang Web).

---

## 2. BẢNG MA TRẬN KHẢ NĂNG NATIVE (NATIVE CAPABILITY MATRIX)

| Mã | Tính Năng Native | Mức | Triển Khai Native Hiện Tại | Bằng Chứng Code | Giải Pháp Chuyển Đổi Sang Web |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **CAP-01** | Gọi điện thoại trực tiếp | **A** | `Intent(ACTION_DIAL, "tel:$phone")` | [`PhoneActionDialog.kt:50-65`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/PhoneActionDialog.kt#L50-L65) | Thẻ HTML `<a href="tel:0901234567">`. Trình duyệt trên mobile tự kích hoạt bàn phím số gọi điện. |
| **CAP-02** | Nhắn tin SMS trực tiếp | **A** | `Intent(ACTION_SENDTO, "smsto:$phone")` | [`PhoneActionDialog.kt:70-80`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/PhoneActionDialog.kt#L70-L80) | Thẻ HTML `<a href="sms:0901234567">`. |
| **CAP-03** | Mở ứng dụng Zalo chat | **A** | `Intent(ACTION_VIEW, "https://zalo.me/$phone")` | [`PhoneActionDialog.kt:85-95`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/PhoneActionDialog.kt#L85-L95) | `window.open("https://zalo.me/0901234567", "_blank")`. Universal link tự mở app Zalo nếu đã cài. |
| **CAP-04** | Chọn nhiều ảnh từ thư viện | **A** | `ActivityResultContracts.GetMultipleContents()` | [`PropertyFormScreen.kt:310-340`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormScreen.kt#L310-L340) | `<input type="file" multiple accept="image/*">`. Đọc bằng FileReader / URL.createObjectURL. |
| **CAP-05** | Lưu trữ dữ liệu Offline | **B** | Room SQLite DB v30, WAL mode | [`AppDatabase.kt:15-30`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/local/database/AppDatabase.kt#L15-L30) | **IndexedDB** (qua thư viện Dexie.js) hoặc **SQLite Wasm + OPFS** (Origin Private File System) cho hiệu năng cao. |
| **CAP-06** | Bản đồ ngoại tuyến & Khảo sát | **B** | OSMDroid `MapView` + Tile Cache bộ nhớ | [`MapSurveyScreen.kt:90-120`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/nearby/MapSurveyScreen.kt#L90-L120) | Thư viện **Leaflet.js** hoặc **Mapbox GL JS** kết hợp PWA Cache Storage API để lưu trữ map tiles offline. |
| **CAP-07** | Nhận tin chia sẻ từ app khác | **B** | `Intent(ACTION_SEND, text/plain)` | [`AndroidManifest.xml:46-50`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L46-L50) | **Web Share Target API** trong `manifest.json` PWA (nhận text bài đăng từ Zalo/FB qua share sheet di động). |
| **CAP-08** | App Shortcuts trên màn hình chính | **B** | Android Dynamic & Static Shortcuts (`shortcuts.xml`) | [`shortcuts.xml:1-41`](file:///c:/Users/k/Downloads/web/app/src/main/res/xml/shortcuts.xml#L1-L41) | Khai báo mục `shortcuts` trong Web App Manifest PWA (mở nhanh Tạo BĐS, Kiểm tra trùng). |
| **CAP-09** | Chụp ảnh camera thực địa | **C** | `ActivityResultContracts.TakePicture()` | [`PropertyFormScreen.kt:350-380`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormScreen.kt#L350-L380) | `<input type="file" accept="image/*" capture="environment">` hoặc MediaStream API (`getUserMedia`). Khác biệt: Web không can thiệp sâu vào raw camera settings. |
| **CAP-10** | Định vị GPS thực địa | **C** | `FusedLocationProviderClient` (High accuracy) | [`LocationHelper.kt:40-90`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/LocationHelper.kt#L40-L90) | `navigator.geolocation.getCurrentPosition({ enableHighAccuracy: true })`. Yêu cầu HTTPS bắt buộc. Trên Laptop không có GPS chip sẽ định vị qua WiFi kém chính xác. |
| **CAP-11** | La bàn xác định hướng nhà | **C** | `SensorManager.getDefaultSensor(TYPE_ROTATION_VECTOR)` | [`CompassDialog.kt:40-120`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/CompassDialog.kt#L40-L120) | `DeviceOrientationEvent` (yêu cầu quyền cảm biến trên Safari iOS). Fallback: Dropdown chọn hướng thủ công trên Desktop. |
| **CAP-12** | Quản lý tệp cục bộ (Xuất/Nhập DB) | **C** | Storage Access Framework (SAF), FileProvider | [`ZipHelper.kt:25-90`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/ZipHelper.kt#L25-L90) | File System Access API trên Chrome/Edge (`showSaveFilePicker`) hoặc tải file trực tiếp qua Blob/Data URL trên Safari/Firefox. |
| **CAP-13** | Thông báo đẩy & Nhắc việc | **C** | `NotificationManagerCompat` (3 channels, action buttons, ongoing) | [`NotificationHelper.kt:14-250`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/NotificationHelper.kt#L14-L250) | **Web Notifications API** + **Web Push API** qua Service Worker. Hạn chế: Web không hỗ trợ ongoing progress bar trên thanh trạng thái như Android native. |
| **CAP-14** | Tự động đồng bộ ngầm khi tắt app | **D** | WorkManager + AlarmManager (chạy đúng giờ cố định hàng ngày) | [`SyncAlarmReceiver.kt:37-120`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/SyncAlarmReceiver.kt#L37-L120) | **Không có tương đương 100% trên Web khi đóng tab**. Giải pháp kiến trúc: Kích hoạt đồng bộ ngay khi người dùng mở lại trang Web + Server cron job phía Supabase/Cloudflare. |
| **CAP-15** | Background Foreground Service | **E** | `SyncForegroundService` | [`SyncForegroundService.kt:1-30`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/SyncForegroundService.kt#L1-L30) | Đã `@Deprecated` trong code native do di trú sang R2. Không cần chuyển đổi. |
| **CAP-16** | Google OAuth PKCE & Google Drive | **E** | `OAuthTokenManager`, custom redirect scheme | [`MainActivity.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt) | Đã thay thế hoàn toàn bằng Supabase Auth + Cloudflare R2 direct upload. Không cần OAuth PKCE Drive trên Web. |

---

## 3. ĐÁNH GIÁ CHI TIẾT CÁC TÍNH NĂNG NHÓM D (CẦN THIẾT KẾ LẠI)

### CAP-14: Tự Động Đồng Bộ Ngầm (WorkManager & AlarmManager Replacement)

#### Thách thức trên môi trường Web:
- Trình duyệt Web (đặc biệt là iOS Safari) không cho phép mã nguồn JavaScript chạy ngầm sau khi người dùng đóng tab hoặc khóa màn hình quá một vài giây.
- API `Periodic Background Sync` của PWA chỉ hoạt động trên Android Chrome và phụ thuộc hoàn toàn vào "Site Engagement Score" (tần suất người dùng sử dụng trang web), không đảm bảo kích hoạt đúng giờ hẹn cố định (ví dụ chính xác 12:00 hay 18:00).

#### Kiến trúc thay thế tương đương hành vi (Parity Architecture):
1. **Sync On Focus / Wakeup**: Khi người dùng mở tab hoặc chuyển tab từ nền lên hoạt động (`document.visibilityState === 'visible'`), Web Client lập tức kiểm tra mốc thời gian lần đồng bộ trước. Nếu đã quá chu kỳ hoặc qua khung giờ hẹn, tự động kích hoạt tiến trình đồng bộ delta.
2. **Server-Side Trigger**: Đối với các tác vụ dọn dẹp dữ liệu cũ (`PurgeWorker`), chuyển giao cho **Supabase pg_cron** hoặc **Cloudflare Workers Cron Triggers** chạy độc lập phía server thay vì dựa dẫm vào thiết bị client.
3. **Supabase Realtime**: Khi tab Web đang mở, WebSocket Realtime đảm bảo mọi thay đổi từ các máy khác được cập nhật tức thì (sub-second) mà không cần chờ tới chu kỳ Alarm định kỳ.
