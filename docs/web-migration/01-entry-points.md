# 01. BẢN ĐỒ ĐIỂM VÀO (ENTRY POINTS MAPPING)

Tài liệu này kiểm kê và lập bản đồ toàn diện mọi điểm vào (entry point) của ứng dụng Android native BDS Collector (`com.aistudio.bdscollector.vskwzh`). Phục vụ đối chiếu Behavioral Parity khi chuyển đổi sang Web.

---

## 1. TỔNG QUAN HỆ THỐNG ĐIỂM VÀO

| Loại Điểm Vào | Số lượng | Trạng thái Runtime | Ghi chú Web Parity |
| :--- | :--- | :--- | :--- |
| **Activity** | 1 | ACTIVE | Single-Activity (`MainActivity`), Web chuyển thành SPA root |
| **Fragment** | 0 | NONE | App dùng 100% Jetpack Compose, không có Fragment |
| **Compose Screen** | 12 | ACTIVE | Ánh xạ thành các Web Routes/Pages |
| **Navigation Route** | 15 | ACTIVE | Cấu hình NavHost trong `MainActivity.kt` |
| **Dialog / Modal Window** | 24 | ACTIVE | Ánh xạ thành HTML `<dialog>` / Modal components |
| **Bottom Sheet** | 4 | ACTIVE | Ánh xạ thành Drawer / Slide-over sheet trên Web |
| **Deep Link / Custom Scheme** | 1 | ACTIVE | `bdsapp://property` -> Chuyển thành Web URL routing `/property/:id` |
| **Shortcuts (App Shortcuts)** | 3 | ACTIVE | Web App Manifest `shortcuts` (PWA) |
| **Share Entry (Intents)** | 3 | ACTIVE | Web Share Target API (PWA) |
| **Notification Action** | 2 | ACTIVE | Web Notifications API + Push Service Worker |
| **Broadcast Receiver** | 3 | ACTIVE | Web dùng Service Worker / Event listeners |
| **Service** | 2 | 1 Deprecated / 1 WorkManager | Chuyển sang Web Worker / Service Worker |
| **Background Triggered Flow** | 8 | ACTIVE | Chuyển sang Web periodic sync / server cron / Web Workers |
| **Widget** | 0 | NONE | Không có AppWidgetProvider trong codebase |

---

## 2. KIỂM KÊ CHI TIẾT CÁC ĐIỂM VÀO

### 2.1. Activity & Lifecycle

#### EP-ACT-01: `MainActivity`
- **File**: [`MainActivity.kt:71-587`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L71-L587)
- **Khai báo Manifest**: [`AndroidManifest.xml:28-71`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L28-L71)
- **Thuộc tính**: `launchMode="singleTop"`, `theme="@style/Theme.App.Starting"`, `windowSoftInputMode="adjustResize"`, `exported=true`.
- **Hành vi khi khởi chạy**:
  - Cài đặt Splash Screen via `installSplashScreen()` ([`MainActivity.kt:118`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L118)).
  - Hủy notification R2 backfill cũ ([`MainActivity.kt:122-124`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L122-L124)).
  - Phân biệt fresh launch (`savedInstanceState == null`) vs process death reconstruction ([`MainActivity.kt:129-130`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L129-L130)).
  - Gọi `backgroundCoordinator.onActivated()` ([`MainActivity.kt:151-153`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L151-L153)).
  - Khởi tạo Navigation Controller và xác định `startDestination`: Nếu `has_shown_permission_onboarding == true` thì vào `property_list`, ngược lại vào `permission_onboarding` ([`MainActivity.kt:160-166`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L160-L166)).
  - Giám sát trạng thái mạng online/offline qua `networkStateObserver.isOnline` ([`MainActivity.kt:219`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L219)).
- **Xử lý `onNewIntent`**: Nhận intent mới khi Activity đang chạy ở foreground ([`MainActivity.kt:579-585`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L579-L585)).

---

### 2.2. Navigation Routes & Compose Screens

Navigation được định nghĩa tập trung trong `NavHost` tại [`MainActivity.kt:291-555`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L291-L555).

| Route ID | Route Pattern | Màn hình Compose / Symbol | File Bằng Chứng | Hành vi & Tham số |
| :--- | :--- | :--- | :--- | :--- |
| **ROUTE-01** | `permission_onboarding` | `PermissionOnboardingScreen` | [`PermissionOnboardingScreen.kt:28`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/permission/PermissionOnboardingScreen.kt#L28) | Màn hình giới thiệu & xin quyền khi mở app lần đầu. PopUpTo inclusive sang `property_list`. |
| **ROUTE-02** | `property_list` | `PropertyListScreen` | [`PropertyListScreen.kt:70`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyListScreen.kt#L70) | Danh sách BĐS chính thức (`isVerified = true`). Có bottom bar. Hỗ trợ lọc, tìm kiếm, multi-select. |
| **ROUTE-03** | `property_add?linkedCustomerId={}&isVerified={}&lat={}&lng={}` | `PropertyFormScreen` | [`PropertyFormScreen.kt:80`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormScreen.kt#L80) | Form tạo mới BĐS. Nhận tham số tùy chọn: `linkedCustomerId`, `isVerified` (mặc định true), `lat`, `lng`. |
| **ROUTE-04** | `property_edit/{propertyId}?openForVerify={}` | `PropertyFormScreen` | [`PropertyFormScreen.kt:80`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormScreen.kt#L80) | Form chỉnh sửa BĐS hoặc thẩm định (`openForVerify=true`). |
| **ROUTE-05** | `property_detail/{propertyId}` | `PropertyDetailScreen` | [`PropertyDetailScreen.kt:130`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyDetailScreen.kt#L130) | Xem chi tiết BĐS chính thức. Quản lý ảnh, chủ nhà, lịch sử dẫn khách, nhật ký, matching. |
| **ROUTE-06** | `unverified_list` | `UnverifiedScreen` | [`UnverifiedScreen.kt:70`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/unverified/UnverifiedScreen.kt#L70) | Danh sách tin BĐS chờ duyệt/trích xuất (`isVerified = false`). Nhận text từ Share Intent. |
| **ROUTE-07** | `unverified_detail/{unverifiedId}` | `PropertyDetailScreen` | [`PropertyDetailScreen.kt:130`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyDetailScreen.kt#L130) | Tái sử dụng `PropertyDetailScreen` để xem chi tiết tin chờ duyệt. |
| **ROUTE-08** | `map_survey?centerPropertyId={}&selectedKeys={}` | `MapSurveyScreen` | [`MapSurveyScreen.kt:102`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/nearby/MapSurveyScreen.kt#L102) | Bản đồ khảo sát thực địa (OSMDroid). Hiển thị marker, clustering, định tuyến tối ưu khảo sát. |
| **ROUTE-09** | `customer_list` | `CustomerScreen` | [`CustomerScreen.kt:45`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/customer/CustomerScreen.kt#L45) | Danh sách khách hàng CRM. Tìm kiếm, phân loại theo nhu cầu mua/thuê. |
| **ROUTE-10** | `customer_list/{customerId}` | `CustomerScreen` | [`CustomerScreen.kt:45`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/customer/CustomerScreen.kt#L45) | Danh sách khách hàng với `initialCustomerId` để mở thẳng chi tiết khách hàng. |
| **ROUTE-11** | `statistics` | `StatisticsScreen` | [`StatisticsScreen.kt:35`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/statistics/StatisticsScreen.kt#L35) | Thống kê số liệu kho BĐS: phân bố giá, diện tích, trạng thái, khu vực. |
| **ROUTE-12** | `settings` | `SettingsScreen` | [`SettingsScreen.kt:60`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/settings/SettingsScreen.kt#L60) | Cài đặt hệ thống: đồng bộ, sao lưu/khôi phục, cấu hình lọc mặc định, bản đồ, regex. |
| **ROUTE-13** | `sync_history` | `SyncHistoryScreen` | [`SyncHistoryScreen.kt:25`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/synchistory/SyncHistoryScreen.kt#L25) | Lịch sử đồng bộ chi tiết và log lỗi (`SyncLogEntity`). |
| **ROUTE-14** | `settings_api_config` | `ApiConfigScreen` | [`ApiConfigScreen.kt:25`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/settings/ApiConfigScreen.kt#L25) | Cấu hình API Supabase (URL, Anon Key) và Gemini (API Key, Model ID). |
| **ROUTE-15** | `settings_icon_sorting` | `IconSortingScreen` | [`IconSortingScreen.kt:25`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/settings/IconSortingScreen.kt#L25) | Tùy biến thứ tự các icon thao tác nhanh trên màn hình chi tiết BĐS. |

---

### 2.3. App Shortcuts

Được khai báo trong [`app/src/main/res/xml/shortcuts.xml:1-41`](file:///c:/Users/k/Downloads/web/app/src/main/res/xml/shortcuts.xml#L1-L41) và xử lý tại [`MainActivity.kt:105-115, 187-208`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L105-L115):

| Shortcut ID | Intent Action | Xử lý trong `MainActivity.kt` | Hành vi |
| :--- | :--- | :--- | :--- |
| `check_duplicate` | `...action.CHECK_DUPLICATE` | [`MainActivity.kt:190-197`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L190-L197) | Mở dialog `DuplicateCheckDialog` ngay trên màn hình `property_list`. |
| `add_property` | `...action.ADD_PROPERTY` | [`MainActivity.kt:198-201`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L198-L201) | Điều hướng thẳng tới form tạo BĐS: `property_add`. |
| `add_unverified` | `...action.ADD_UNVERIFIED` | [`MainActivity.kt:202-205`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L202-L205) | Điều hướng tới form tạo tin chờ: `property_add?isVerified=false`. |
| *debug_backfill* | `...action.BACKFILL_R2` | [`MainActivity.kt:106-108`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L106-L108) | Enqueue `PropertyR2BackfillWorker` (chỉ chạy trên DEBUG build). |
| *debug_restore* | `...action.RESTORE_MEDIA` | [`MainActivity.kt:109-111`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L109-L111) | Enqueue `MediaRestoreScheduler` (chỉ chạy trên DEBUG build). |

---

### 2.4. Share Targets & Implicit Intents

Được khai báo trong [`AndroidManifest.xml:45-63`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L45-L63):

1. **Share Text (`ACTION_SEND`, `text/plain`)**:
   - **Bằng chứng**: [`AndroidManifest.xml:46-50`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L46-L50), [`MainActivity.kt:136-139, 173-178`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L136-L139).
   - **Hành vi**: Nhận văn bản bài đăng BĐS chia sẻ từ Zalo/Facebook/Browser. Tự động chuyển qua `unverifiedViewModel.setPastedText(text)` và điều hướng sang `unverified_list` để trích xuất dữ liệu.
2. **Share Single Image (`ACTION_SEND`, `image/*`)**:
   - **Bằng chứng**: [`AndroidManifest.xml:52-57`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L52-L57).
   - **Hành vi**: Khai báo trong manifest; hiện tại chưa có nhánh code xử lý riêng trong `MainActivity.onCreate` (được ghi nhận là UNKNOWN/Dead path trong Audit Gaps).
3. **Share Multiple Images (`ACTION_SEND_MULTIPLE`, `image/*`)**:
   - **Bằng chứng**: [`AndroidManifest.xml:58-62`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L58-L62).
   - **Hành vi**: Tương tự như Share Single Image.

---

### 2.5. Deep Links

- **Scheme**: `bdsapp://property`
- **Bằng chứng**: [`AndroidManifest.xml:65-70`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L65-L70).
- **Hành vi**: Cho phép các ứng dụng ngoài hoặc liên kết website mở app và điều hướng tới sản phẩm cụ thể.

---

### 2.6. Broadcast Receivers

1. **`BootReceiver`**:
   - **Bằng chứng**: [`BootReceiver.kt:1-45`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/BootReceiver.kt#L1-L45), [`AndroidManifest.xml:86-90`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L86-L90).
   - **Trigger**: `android.intent.action.BOOT_COMPLETED`.
   - **Hành vi**: Khởi động lại `syncScheduler.scheduleAll()` nếu `autoSyncEnabled = true` để phục hồi lịch đồng bộ cố định hàng ngày.
2. **`SyncAlarmReceiver`**:
   - **Bằng chứng**: [`SyncAlarmReceiver.kt:1-129`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/SyncAlarmReceiver.kt#L1-L129), [`AndroidManifest.xml:84`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L84).
   - **Trigger**: `AlarmManager` kích hoạt theo khung giờ cố định (ví dụ 12:00, 18:00).
   - **Hành vi**:
     - Lập lại lịch cho ngày tiếp theo qua `syncScheduler.rescheduleAfterFired(syncTime)`.
     - Kích hoạt chuỗi WorkManager: Retry Push (`PropertySyncRetryWorker`, `CustomerSyncRetryWorker`, `CustomerPropertyLinkSyncRetryWorker`) -> Pull Chain (`CustomerRestoreFromSupabaseWorker` -> `PropertyUnverifiedPullWorker` -> `MediaRestoreWorker`) -> `PropertyR2BackfillWorker`.
3. **`MediaRestoreActionReceiver`**:
   - **Bằng chứng**: [`MediaRestoreActionReceiver.kt:1-45`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/MediaRestoreActionReceiver.kt#L1-L45), [`AndroidManifest.xml:85`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L85).
   - **Trigger**: Nhấn nút "Tải về" (`ACTION_DOWNLOAD`) trên thông báo ảnh mới từ Google Drive/R2.
   - **Hành vi**: Gọi `MediaRestoreScheduler.enqueue(context)` để bắt đầu tải media ngầm.

---

### 2.7. Services

1. **`SyncForegroundService`**:
   - **Bằng chứng**: [`SyncForegroundService.kt:1-30`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/SyncForegroundService.kt#L1-L30), [`AndroidManifest.xml:80-82`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L80-L82).
   - **Trạng thái**: `@Deprecated("Legacy Google Drive sync service - no longer used in runtime")`.
   - **Hành vi**: Khi được gọi, lập tức in log warning và `stopSelf(startId)`.
2. **`SystemForegroundService`** (`androidx.work.impl.foreground.SystemForegroundService`):
   - **Bằng chứng**: [`AndroidManifest.xml:74-77`](file:///c:/Users/k/Downloads/web/app/src/main/AndroidManifest.xml#L74-L77).
   - **Loại**: `foregroundServiceType="dataSync"`.
   - **Hành vi**: Hỗ trợ WorkManager chạy các tác vụ nền đòi hỏi quyền foreground service trên Android 12+.

---

### 2.8. WorkManager Background Jobs

| Worker Tên | File Bằng Chứng | Trigger / Enqueue | Chức Năng Nghiệp Vụ |
| :--- | :--- | :--- | :--- |
| **`PropertySyncRetryWorker`** | [`PropertySyncRetryWorker.kt:1-120`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/PropertySyncRetryWorker.kt) | AlarmReceiver / SyncNow / Network back | Đẩy các bản ghi `PropertyEntity` chưa sync (`isTextSynced = false`) lên Supabase. |
| **`CustomerSyncRetryWorker`** | [`CustomerSyncRetryWorker.kt:1-110`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/CustomerSyncRetryWorker.kt) | AlarmReceiver / SyncNow / Network back | Đẩy các bản ghi `CustomerEntity` chưa sync lên Supabase. |
| **`CustomerPropertyLinkSyncRetryWorker`** | [`CustomerPropertyLinkSyncRetryWorker.kt:1-115`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/CustomerPropertyLinkSyncRetryWorker.kt) | AlarmReceiver / SyncNow / Network back | Đẩy các liên kết `CustomerPropertyLink` chưa sync lên Supabase. |
| **`CustomerRestoreFromSupabaseWorker`** | [`CustomerRestoreFromSupabaseWorker.kt:1-105`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/CustomerRestoreFromSupabaseWorker.kt) | Pull Chain / SyncNow | Kéo danh sách khách hàng mới nhất từ Supabase về Room (phân trang theo watermark). |
| **`PropertyUnverifiedPullWorker`** | [`PropertyUnverifiedPullWorker.kt:1-60`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/PropertyUnverifiedPullWorker.kt) | Pull Chain / SyncNow | Kéo các BĐS (cả verified & unverified) từ Supabase về Room. |
| **`MediaRestoreWorker`** | [`MediaRestoreWorker.kt:1-250`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/MediaRestoreWorker.kt) | Pull Chain / ActionReceiver | Tải các file ảnh từ R2/Drive về bộ nhớ máy nội bộ (có kiểm tra constraint WiFi). |
| **`MediaSyncWorker`** | [`MediaSyncWorker.kt:1-50`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/MediaSyncWorker.kt) | Sau khi thêm/sửa ảnh BĐS | Tải ảnh từ local storage lên Cloudflare R2 / Google Drive. |
| **`PropertyR2BackfillWorker`** | [`PropertyR2BackfillWorker.kt:1-180`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/PropertyR2BackfillWorker.kt) | AlarmReceiver / Debug shortcut | Chuyển dịch toàn bộ media từ Google Drive sang Cloudflare R2 theo lộ trình di trú. |
| **`PurgeWorker`** | [`PurgeWorker.kt:1-80`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/PurgeWorker.kt) | Định kỳ (PeriodicWork) | Xóa vĩnh viễn (Hard delete) các record đã soft-delete (`isDeleted = true`) quá 30 ngày. |
| **`ReminderWorker`** | [`ReminderWorker.kt:1-50`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/ReminderWorker.kt) | Định kỳ 8h sáng | Quét BĐS có cờ `needToViewToday = true` và hiển thị thông báo nhắc lịch khảo sát. |
| **`TitleCaseMigrationWorker`** | [`TitleCaseMigrationWorker.kt:1-70`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/TitleCaseMigrationWorker.kt) | Chạy 1 lần sau cập nhật Room | Chuẩn hóa Title Case tên khu vực trong cơ sở dữ liệu. |

---

### 2.9. Notification Channels & Actions

Được quản lý tại [`NotificationHelper.kt:14-250`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/NotificationHelper.kt#L14-L250):

1. **Kênh `sync_channel` (Đồng bộ dữ liệu - IMPORTANCE_LOW)**:
   - Thông báo tiến trình đồng bộ (`showSyncProgress`).
   - Thông báo ảnh mới cần tải về (`showPendingMediaNotification`): Kèm action button `"Tải về"` kích hoạt broadcast `MediaRestoreActionReceiver.ACTION_DOWNLOAD`.
2. **Kênh `reminder_channel` (Nhắc nhở khảo sát - IMPORTANCE_HIGH)**:
   - Thông báo nhắc lịch khảo sát hôm nay (`showReminderNotification`): Chứa pending intent với `filter_view_today = true`. Khi người dùng chạm vào, `MainActivity` tự động bật bộ lọc hiển thị BĐS cần xem hôm nay ([`MainActivity.kt:169-171, 180-185`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MainActivity.kt#L169-L171)).
3. **Kênh `system_channel` (Thông báo hệ thống - IMPORTANCE_DEFAULT)**:
   - Thông báo cảnh báo retry hoặc thông tin chung từ hệ điều hành.

---

### 2.10. App Lifecycle Entry: `MyApplication`

- **File**: [`MyApplication.kt:18-76`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MyApplication.kt#L18-L76)
- **Hành vi khi khởi động ứng dụng (`onCreate`)**:
  - Gán `SyncLogDao` vào singleton `AppLogger` ([`MyApplication.kt:28-33`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MyApplication.kt#L28-L33)).
  - Khởi tạo Notification Channels qua `NotificationHelper.createNotificationChannels(this)` ([`MyApplication.kt:36`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MyApplication.kt#L36)).
  - Đăng ký `ProcessLifecycleOwner`:
    - `onStart`: Set `isInForeground = true`, gọi `realtimeSyncManager.start()` kết nối Supabase WebSocket Realtime ([`MyApplication.kt:47-59`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MyApplication.kt#L47-L59)).
    - `onStop`: Set `isInForeground = false`, gọi `realtimeSyncManager.stop()` ngắt kết nối WebSocket tiết kiệm tài nguyên ([`MyApplication.kt:61-73`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/MyApplication.kt#L61-L73)).
