# 06. HỢP ĐỒNG DỮ LIỆU & LƯU TRỮ (DATA CONTRACTS)

Tài liệu này định nghĩa chi tiết toàn bộ cấu trúc dữ liệu, lược đồ bảng (schema), khóa chính/ngoại, chỉ mục (index), migration v1–v30, kho lưu trữ cục bộ/đám mây và ma trận Đọc/Ghi cho từng hành vi `BEH-xxx`.

---

## 1. ROOM DATABASE SCHEMA (PHIÊN BẢN 30)

Cơ sở dữ liệu SQLite cục bộ được định nghĩa tại [`AppDatabase.kt:15-30`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/local/database/AppDatabase.kt#L15-L30):
- **Tên database**: `bds_collector_database`
- **Phiên bản hiện tại**: `30`
- **Type Converters**: `Converters.kt` (Date, List<String>, JSON string converters).

### 1.1. Bảng `properties` (`PropertyEntity`)
- **File định nghĩa**: [`PropertyEntity.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/local/entity/PropertyEntity.kt)
- **Khóa chính (PK)**: `id` (TEXT, NOT NULL) - Định dạng `yyyyMMdd-HHmmss-xxxx`
- **Chỉ mục (Indexes)**:
  - `index_properties_latitude` ON (`latitude`)
  - `index_properties_longitude` ON (`longitude`)
  - `index_properties_status` ON (`status`)
  - `index_properties_propertyType` ON (`propertyType`)
  - `index_properties_area` ON (`area`)
  - `index_properties_price` ON (`price`)

| Tên Cột | Kiểu SQLite | Nullable | Mặc định | Ý nghĩa Nghiệp Vụ & Ghi Chú |
| :--- | :--- | :--- | :--- | :--- |
| `id` | TEXT | NO | PK | ID duy nhất sinh theo thời gian (VD: `20260903-173000-a1b2`) |
| `area` | TEXT | NO | `""` | Khu vực, địa danh, tên đường (Title Case) |
| `latitude` | REAL | YES | NULL | Vĩ độ thực địa (8.0 .. 24.0) |
| `longitude` | REAL | YES | NULL | Kinh độ thực địa (102.0 .. 110.0) |
| `imagePath` | TEXT | YES | NULL | Đường dẫn file ảnh local, ngăn cách bởi `\|\|\|` |
| `driveMediaIds` | TEXT | YES | NULL | Chuỗi JSON map `{ localPath: driveFileId }` (Google Drive legacy) |
| `driveFolderId` | TEXT | YES | NULL | ID thư mục trên Google Drive (legacy) |
| `priceAtFolderCreation` | REAL | YES | NULL | Giá tại thời điểm tạo folder Drive (đóng băng tên folder) |
| `documentUrl` | TEXT | NO | `""` | Link tài liệu sổ đỏ / quy hoạch |
| `areaSize` | REAL | YES | NULL | Diện tích đất/sàn (m²) |
| `price` | REAL | NO | `0.0` | Giá bán/thuê (đơn vị: tỷ VNĐ) |
| `description` | TEXT | NO | `""` | Mô tả chi tiết (chứa tin 1 và tin 2 qua `ListingTextCodec`) |
| `status` | TEXT | NO | `'Đang bán'` | Trạng thái: `Đang bán`, `Đã bán`, `Chờ khảo sát`, `Tạm ngưng` |
| `surveyDate` | TEXT | NO | `yyyy-MM-dd` | Ngày khảo sát thực địa |
| `direction` | TEXT | NO | `""` | Hướng nhà (Đông, Tây, Nam, Bắc, Đông Nam...) |
| `ownerName` | TEXT | NO | `""` | Tên chủ nhà / người liên hệ |
| `ownerPhone` | TEXT | NO | `""` | SĐT chủ nhà (chuẩn hóa 10 chữ số) |
| `propertyType` | TEXT | NO | `'Nhà'` | Loại hình: `Đất`, `Nhà` |
| `needToViewToday` | INTEGER | NO | `0` | Cờ đánh dấu cần đi khảo sát/dẫn khách hôm nay (0/1) |
| `isDraft` | INTEGER | NO | `0` | Cờ bản nháp chưa hoàn thiện |
| `isTextSynced` | INTEGER | NO | `0` | Cờ CAS đồng bộ dữ liệu chữ với Supabase (0: chưa, 1: rồi) |
| `rawText` | TEXT | NO | `""` | Văn bản gốc bài đăng trích xuất từ Zalo/FB |
| `diary` | TEXT | NO | `""` | Nhật ký làm việc, ghi chú thay đổi giá/khách |
| `updatedAt` | INTEGER | NO | timestamp | Thời gian cập nhật gần nhất (client timestamp LWW) |
| `isDeleted` | INTEGER | NO | `0` | Cờ xóa mềm (0: còn, 1: đã xóa) |
| `propertyDetailJsonFileId` | TEXT | YES | NULL | ID file JSON chi tiết trên Drive (legacy) |
| `txtFileId` | TEXT | YES | NULL | ID file TXT trên Drive (legacy) |
| `isMediaSynced` | INTEGER | NO | `0` | Cờ đồng bộ file ảnh lên R2/Drive (0/1) |
| `title` | TEXT | YES | NULL | Tiêu đề tin đăng (nếu có từ trích xuất) |
| `mapLink` | TEXT | YES | NULL | Link Google Maps gốc người đăng chia sẻ |
| `extractedBy` | TEXT | YES | NULL | Phương thức trích xuất (`GEMINI`, `REGEX`, `MANUAL`) |
| `createdAt` | INTEGER | NO | timestamp | Thời điểm tạo record |
| `isVerified` | INTEGER | NO | `1` | Phân loại tin: `1` = BĐS chính thức, `0` = Tin chờ duyệt |
| `lastEditedAt` | INTEGER | NO | `0` | Thời điểm người dùng trực tiếp sửa tay (khác updatedAt khi sync) |
| `r2MediaKeys` | TEXT | YES | NULL | Chuỗi JSON chứa danh sách R2 Object Keys của media |

### 1.2. Bảng `customers` (`CustomerEntity`)
- **File định nghĩa**: [`CustomerEntity.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/local/entity/CustomerEntity.kt)
- **Khóa chính (PK)**: `id` (TEXT, NOT NULL) - UUID v4

| Tên Cột | Kiểu SQLite | Nullable | Mặc định | Ý nghĩa Nghiệp Vụ |
| :--- | :--- | :--- | :--- | :--- |
| `id` | TEXT | NO | PK | UUID định danh khách hàng |
| `name` | TEXT | NO | `""` | Họ tên khách hàng |
| `nameNormalized` | TEXT | NO | `""` | Tên bỏ dấu tiếng Việt phục vụ tìm kiếm |
| `phone` | TEXT | NO | `""` | Số điện thoại chuẩn hóa |
| `demandType` | TEXT | NO | `'Cần mua'` | Nhu cầu: `Cần mua`, `Cần thuê`, `Cần bán` |
| `propertyType` | TEXT | NO | `'Nhà'` | Loại hình tìm kiếm: `Đất`, `Nhà`, `Bất kỳ` |
| `demandAreas` | TEXT | NO | `""` | Các khu vực quan tâm, ngăn cách bởi `\|\|\|` |
| `demandDirections` | TEXT | NO | `""` | Các hướng quan tâm, ngăn cách bởi `\|\|\|` |
| `priceMin` | REAL | NO | `0.0` | Ngân sách tối thiểu (tỷ VNĐ) |
| `priceMax` | REAL | NO | `0.0` | Ngân sách tối đa (tỷ VNĐ) |
| `note` | TEXT | NO | `""` | Ghi chú nhu cầu chi tiết |
| `noteNormalized` | TEXT | NO | `""` | Ghi chú bỏ dấu |
| `role` | TEXT | NO | `'BUYER'` | Vai trò: `BUYER` (khách tìm), `OWNER` (chủ gửi) |
| `status` | TEXT | NO | `'ACTIVE'` | Trạng thái: `ACTIVE` (đang tìm), `CLOSED` (đã chốt) |
| `updatedAt` | INTEGER | NO | timestamp | Thời gian cập nhật |
| `isSynced` | INTEGER | NO | `0` | Cờ CAS đồng bộ Supabase |
| `isDeleted` | INTEGER | NO | `0` | Cờ xóa mềm |
| `avatarPath` | TEXT | YES | NULL | File avatar cục bộ |
| `avatarDriveUrl` | TEXT | YES | NULL | URL avatar trên Cloud |

### 1.3. Bảng `customer_property_links` (`CustomerPropertyLink`)
- **File định nghĩa**: [`CustomerPropertyLink.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/local/entity/CustomerPropertyLink.kt)
- **Khóa chính tổng hợp**: (`customerId`, `propertyId`)

| Tên Cột | Kiểu SQLite | Nullable | Mặc định | Ý nghĩa Nghiệp Vụ |
| :--- | :--- | :--- | :--- | :--- |
| `customerId` | TEXT | NO | Composite PK | ID khách hàng liên kết |
| `propertyId` | TEXT | NO | Composite PK | ID bất động sản liên kết |
| `role` | TEXT | NO | `'OWNER'` | Vai trò liên kết: `OWNER` (chủ sở hữu) hoặc `VIEWED` (đã dẫn xem) |
| `updatedAt` | INTEGER | NO | `0` | Thời điểm tạo/cập nhật liên kết |
| `isDeleted` | INTEGER | NO | `0` | Cờ xóa mềm liên kết |
| `isSynced` | INTEGER | NO | `0` | Cờ đồng bộ Supabase |

### 1.4. Bảng `sync_log` (`SyncLogEntity`)
- **File định nghĩa**: [`SyncLogEntity.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/local/entity/SyncLogEntity.kt)
- **Khóa chính**: `id` (INTEGER AUTOINCREMENT)
- **Các trường**: `timestamp` (INTEGER), `type` (TEXT: PUSH/PULL/MEDIA/GENERAL), `status` (TEXT: SUCCESS/FAILED/IN_PROGRESS), `tag` (TEXT), `message` (TEXT), `itemCount` (INTEGER?), `totalCount` (INTEGER?).

---

## 2. TIẾN TRÌNH MIGRATION TỔNG HỢP (V1 -> V30)

| Bước Migration | Mục tiêu & Thay đổi lược đồ |
| :--- | :--- |
| **v2 -> v3** | Bổ sung `description`, `status`, `surveyDate`, `isDraft` vào `unverified_properties`. |
| **v3 -> v4** | Thêm cột `role`, `status` vào `customers`; tạo bảng liên kết `customer_property_links`. |
| **v4 -> v5** | Backfill `address = title` cho tin chờ chưa có địa chỉ. |
| **v5 -> v6** | Bổ sung trường avatar `avatarPath`, `avatarDriveUrl` cho `customers`. |
| **v7 -> v8** | Bổ sung trường nhật ký `diary` vào `properties`. |
| **v8 -> v9** | Thêm timestamp `updatedAt` cho `properties` phục vụ LWW. |
| **v9 -> v10** | Bổ sung `driveFolderId` cho `properties`. |
| **v10 -> v11** | Loại bỏ cột thừa `name` khỏi bảng `properties`. |
| **v11 -> v12** | Đổi kiểu dữ liệu `price` từ chuỗi sang `REAL` (số thực). |
| **v12 -> v13** | Thêm cột xóa mềm `isDeleted` cho cả 2 bảng. |
| **v13 -> v14** | Thêm cột `priceAtFolderCreation` lưu giá thời điểm tạo thư mục. |
| **v14 -> v15** | Thêm cột `driveMediaIds` dạng JSON map. |
| **v15 -> v16** | Bổ sung `propertyDetailJsonFileId`, `txtFileId`. |
| **v16 -> v17** | Tạo bảng ghi log đồng bộ `sync_log`. |
| **v19 -> v20** | Thêm `updatedAt`, `isDeleted`, `isSynced` vào `customer_property_links`. |
| **v20 -> v21** | Thêm cờ đồng bộ media `isMediaSynced` vào `properties`. |
| **v21 -> v22** | Bổ sung `driveFolderId` cho `unverified_properties`. |
| **v22 -> v23** | **GỘP BẢNG**: Hợp nhất toàn bộ dữ liệu từ `unverified_properties` vào `properties`, dùng cờ `isVerified = 0/1`. |
| **v23 -> v24** | Xóa hẳn bảng cũ `DROP TABLE unverified_properties`. |
| **v24 -> v25** | Backfill `area = address` cho các tin unverified bị thiếu area. |
| **v25 -> v26** | Backfill chuẩn hóa `status = 'Đang bán'` cho tin verified có status 'Chờ khảo sát'. |
| **v26 -> v27** | Chuẩn hóa `role = 'BUYER'` cho khách có role cũ 'VIEWER'. |
| **v27 -> v28** | Xóa cột `address` khỏi bảng `properties` (tái cấu trúc bảng). |
| **v28 -> v29** | Bổ sung cột `lastEditedAt` để lưu thời điểm sửa tay người dùng. |
| **v29 -> v30** | Bổ sung cột `r2MediaKeys` lưu danh sách key của Cloudflare R2. |

---

## 3. LƯU TRỮ CẤU HÌNH (PREFERENCES & STORAGE CONTRACTS)

### 3.1. Standard SharedPreferences (`bds_collector_prefs`)
- `has_shown_permission_onboarding` (Boolean): Đã xem qua màn hình xin quyền lần đầu chưa.
- `auto_sync_enabled` (Boolean): Bật/tắt tự động đồng bộ hàng ngày.
- `sync_time` (String): Giờ đồng bộ cố định dạng `HH:mm`.
- `wifi_only_for_media_restore` (Boolean): Chỉ tải ảnh khi kết nối WiFi.
- `keep_screen_on` (Boolean): Giữ màn hình sáng khi ở màn hình bản đồ khảo sát.
- `reverse_geocoding_enabled` (Boolean): Tự động tìm địa chỉ từ GPS.
- `filter_mode` (String: `LAST_USED`, `FIXED`, `ALL`): Cơ chế bộ lọc khởi động.
- `map_zoom_scope` (String: `WARD`, `DISTRICT`, `PROVINCE`): Zoom mặc định bản đồ.
- `map_radius_default` (String: `all`, `1km`, `2km`, `5km`, `10km`): Bán kính mặc định.
- `fab_on_left` (Boolean): Vị trí FAB thêm nhanh (trái hoặc phải).
- `gemini_model` (String): Tên model Gemini sử dụng (VD: `gemini-1.5-flash`).

### 3.2. Secure SharedPreferences (`bds_secure_prefs`)
Mã hóa phần cứng AES256-GCM via AndroidX Security:
- `gemini_api_key` (String): API Key dùng để gọi Google AI Studio Gemini API.
- `supabase_url` (String): URL instance Supabase của người dùng.
- `supabase_anon_key` (String): Public/Anon Key Supabase.

### 3.3. Watermark Preferences (`sync_pull_prefs`)
- `last_server_updated_at_property` (Long): Watermark server đồng bộ bảng properties.
- `last_server_updated_at_customer` (Long): Watermark server đồng bộ bảng customers.
- `last_server_updated_at_link` (Long): Watermark server đồng bộ bảng links.

---

## 4. MA TRẬN ĐỌC & GHI THEO BEHAVIOR ID

| Behavior ID | Dữ Liệu Đọc (Read Path) | Dữ Liệu Ghi (Write Path) |
| :--- | :--- | :--- |
| **BEH-NAV-001** | `bds_collector_prefs` (`has_shown_permission_onboarding`) | None |
| **BEH-NAV-006** | Intent Extra Text | `UnverifiedViewModel.pastedText` (StateFlow) |
| **BEH-PROP-001** | `PropertyDao.getAllActivePropertiesFlow()` | None |
| **BEH-PROP-003** | `PropertyDao.getPropertiesFiltered(...)` | StateFlow UI filter |
| **BEH-PROP-005** | `PropertyDao.getPropertyById(id)` | `PropertyDao.updateProperty()` (`needToViewToday`, `isTextSynced=0`, `updatedAt=now`) |
| **BEH-PROP-006** | `PropertyDao.getPropertyById(id)` | `PropertyDao.updateProperty()` (`status`, `isTextSynced=0`, `updatedAt=now`) |
| **BEH-PROP-007** | List `selectedIds` | `PropertyDao.softDeleteProperty(id, now)` (`isDeleted=1`, `isTextSynced=0`) |
| **BEH-FORM-001** | `FusedLocationProviderClient` | Form State (`latitude`, `longitude`) |
| **BEH-FORM-002** | Android MediaStore Image URI | Local Storage (`files/photos/...`) |
| **BEH-FORM-005** | Form State | `PropertyDao.insertProperty()` + Supabase `properties` table push |
| **BEH-DET-006** | `PropertyEntity.diary` | `PropertyDao.updateProperty()` (`diary` append text, `updatedAt=now`) |
| **BEH-DET-005** | `PropertyDao.getPropertyById(id)` | `PropertyDao.updateProperty()` (`isVerified=1`, `status='Đang bán'`) |
| **BEH-MAP-001** | OSMDroid TileCache, Memory Items | `MapSurveyViewModel.selectedItem` |
| **BEH-MAP-003** | List coordinates các BĐS | None (Render Polyline lên bản đồ) |
| **BEH-CUST-001** | Customer Form State | `CustomerDao.insertCustomer()` + Supabase `customers` table push |
| **BEH-CUST-002** | `CustomerEntity`, `PropertyDao.getAllActiveProperties()` | None (Match Result Score List) |
| **BEH-CUST-003** | Selected CustomerId & PropertyId | `CustomerDao.insertCustomerPropertyLink()` + Supabase `customer_properties` |
| **BEH-SYNC-001** | Unsynced records trong 3 bảng | Push tới Supabase REST API + CAS mark synced trong Room |
| **BEH-SYNC-002** | `bds_collector_prefs` (`auto_sync_enabled`) | Enqueue WorkManager background jobs |
| **BEH-SYNC-003** | Supabase Realtime WebSocket events | `PropertyDao.insertProperty()`, `CustomerDao.insertCustomer()` |
| **BEH-SET-001** | SQLite DB file `bds_collector_database` | Zip file xuất qua Storage Access Framework |
| **BEH-SET-002** | Zip file nhập từ SAF | Ghi đè SQLite DB file, khởi tạo lại `AppDatabase` |
| **BEH-SET-003** | `properties`, `customers` (`isDeleted=1`) | `PropertyDao.deleteOldDeletedProperties(cutoff)` (Hard delete) |
