# Handoff 08 — Ba việc rẻ: backup token, index Room, sửa CLAUDE.md

**Phạm vi:** ba việc độc lập nhau, không đụng logic sync. Có thể làm một lượt, build một lần.

**Nguyên tắc giao việc:** chỉ chỉ chỗ + mô tả thay đổi. Antigravity phải tự đọc code xác nhận
trước khi sửa.

**Điều kiện tiên quyết:** handoff 05/06/07 đã nghiệm thu xong. Nếu chưa commit thì commit trước,
đừng để lẫn diff.

---

## Việc 1 — Loại khóa bí mật khỏi Android Auto Backup

### Vấn đề (đã xác minh)

`AndroidManifest.xml` dòng 26-28: `android:allowBackup="true"`, trỏ tới
`@xml/backup_rules` và `@xml/data_extraction_rules`.

`res/xml/backup_rules.xml` hiện **rỗng hoàn toàn** — chỉ có comment mẫu của Android Studio,
thẻ `<full-backup-content>` không chứa quy tắc nào. Nghĩa là **backup tất cả**, bao gồm
SharedPreferences chứa `EncryptedSharedPreferences` của `SettingsManager`
(token Drive, refresh token, Gemini API key, Supabase key).

Khóa mã hóa của `androidx.security.crypto` nằm trong Android Keystore của **thiết bị**,
không được backup. Khi khôi phục sang máy mới: file prefs về nhưng khóa không về →
không giải mã được. Code có fallback nên không crash, nhưng **người dùng mất token im lặng**,
không có thông báo, chỉ biết khi sync ngừng hoạt động.

### Cần làm

Tìm tên file prefs mã hóa thật trong `ui/common/SettingsManager.kt` (chuỗi truyền vào
`EncryptedSharedPreferences.create`). **Đừng đoán tên** — phải đọc code lấy đúng.

Rồi khai báo loại trừ file đó ở **cả hai** nơi:

- `res/xml/backup_rules.xml` — thẻ `<full-backup-content>`, dùng
  `<exclude domain="sharedpref" path="<tên_file>.xml"/>`. File này áp cho API < 31.
- `res/xml/data_extraction_rules.xml` — file này áp cho **API ≥ 31**, tức là phần lớn máy
  đang dùng. Phải khai báo loại trừ trong **cả hai khối** `<cloud-backup>` và `<device-transfer>`.
  Bỏ sót file này là bỏ sót đúng nhóm máy quan trọng nhất.

Kiểm luôn xem `SettingsManager` có dùng file prefs thứ hai (loại không mã hóa) cho các
thiết lập thường không — cái đó **nên giữ lại** trong backup, chỉ loại file chứa khóa.

### Nghiệm thu

Không dễ kiểm bằng tay (phải có 2 máy + tài khoản Google + chờ backup chạy). Chấp nhận
kiểm ở mức: build xong, mở app, vào Cài đặt xác nhận token Drive và API key **vẫn còn**
(không bị xóa nhầm bởi thay đổi cấu hình). Phần backup thì tin vào tính đúng của quy tắc XML.

Nếu muốn kiểm thật:
`adb shell bmgr backupnow <package>` rồi gỡ cài, cài lại, `adb shell bmgr restore <token>`.
Phiền, tùy bạn.

---

## Việc 2 — Thêm index Room cho các cột lọc nóng

### Vấn đề (đã xác minh)

`data/local/entity/PropertyEntity.kt` dòng 11-16 khai báo 6 index:
`latitude`, `longitude`, `status`, `propertyType`, `area`, `price`.

Nhưng **gần như mọi query nóng đều lọc theo `isDeleted` và `isVerified`** — hai cột này
không có index nào. Ví dụ `getAllPropertiesFlow` (`PropertyDao` ~dòng 17):
`WHERE isDeleted = 0 AND isVerified = 1 ORDER BY surveyDate DESC, id DESC`.
Index hiện tại nhắm sai mục tiêu.

### Cần làm

Thêm vào `PropertyEntity`:
- Một index **ghép** trên `(isDeleted, isVerified)` — thứ tự này khớp thứ tự cột trong WHERE
  của các query nóng nhất.
- Cân nhắc thêm index trên `isTextSynced` (các query hàng đợi retry lọc theo cột này).

Với `CustomerEntity` và `CustomerPropertyLink`: đọc các query trong `CustomerDao` xem có
mẫu lọc tương tự không, thêm nếu có. **Đừng thêm bừa** — mỗi index làm chậm ghi và tốn dung lượng.

### BẮT BUỘC: đây là thay đổi schema

Khác hẳn hai việc còn lại và khác các handoff trước. Room coi index là một phần schema:

1. **Tăng `version`** trong `AppDatabase.kt` (~dòng 22) từ **28 lên 29**.
2. **Viết `MIGRATION_28_29`** tạo index bằng `CREATE INDEX IF NOT EXISTS ...`,
   đặt tên index đúng quy ước Room (`index_properties_isDeleted_isVerified`) — sai tên thì
   `validateMigration` sẽ fail lúc chạy.
3. Đăng ký migration mới vào danh sách `addMigrations(...)`.
4. Migration cao nhất hiện tại là `MIGRATION_27_28`, đừng nhầm với con số ghi trong `CLAUDE.md`.

Nếu thấy phần migration rủi ro hơn lợi ích mang lại, **dừng lại và báo** — với 213 SP thì
lợi ích tốc độ gần như không cảm nhận được, giá trị chủ yếu là chuẩn bị cho về sau.
Đây là việc "nên làm" chứ không phải "phải làm".

### Nghiệm thu

- Chạy app trên máy đã có dữ liệu cũ (**không** gỡ cài, không xóa data) → phải mở được,
  không crash ở màn hình đầu. Đây là bài kiểm migration thật.
- Danh sách SP, SP chờ, khách hàng hiển thị đủ, số lượng không đổi.
- Nếu có test migration trong `androidTest`, chạy lại. Lưu ý: `MigrationTest` **đang hỏng sẵn**
  từ trước (thiếu file schema JSON), không phải do thay đổi này gây ra.

---

## Việc 3 — Sửa CLAUDE.md cho khớp thực tế

### Vấn đề (đã xác minh)

`CLAUDE.md` đang sai ở phần mô tả tầng data:

- Ghi Room **version 26** — thực tế `AppDatabase.kt` dòng 22 là **version 28**
  (sẽ thành 29 nếu làm Việc 2).
- Ghi "Migration cao nhất hiện tại là `MIGRATION_25_26`" và "**next migration là `MIGRATION_26_27`**"
  — thực tế `MIGRATION_26_27` và `MIGRATION_27_28` đã tồn tại từ lâu.

Tài liệu sai kiểu này nguy hiểm hơn không có tài liệu: người đọc (kể cả AI) sẽ tin và
viết migration đè lên số đã dùng.

### Cần làm

Cập nhật đúng số version và số migration hiện hành. Nếu làm Việc 2 thì ghi luôn v29 và
`MIGRATION_28_29`, và ghi "next migration là `MIGRATION_29_30`".

Nhân tiện sửa một câu sai khác trong `CLAUDE.md`, phần "Sync architecture" mục
**Server-side convergence**: đoạn kết luận "hệ thống **luôn hội tụ**" chỉ đúng cho **update**,
**không đúng cho delete**. Rà soát 25/07 cho thấy: khi push tombstone bị `sync_guard` drop
(vì `updated_at` cũ hơn), server **không bump `server_updated_at`**, nên `catchUp` phía client
không bao giờ kéo row đó về → máy đã xóa và máy còn giữ **lệch vĩnh viễn**, không tự hội tụ.
Ghi rõ ngoại lệ này vào đó.

### Nghiệm thu

Đọc lại. Không cần build.

---

## Không thuộc phạm vi lần này

Đã cân nhắc và **chốt để sau**, đừng tự ý làm kèm:

- Tách `PropertyDetailScreen.kt` (1895 dòng, đúng 1 `@Composable`, 40 `remember`) — nợ lớn nhất
  về UI nhưng rủi ro cao, phải làm riêng.
- 4 chỗ `catch(e: Exception) {}` rỗng ở `PropertyTextExtractor.kt` dòng 32, 38, 44, 50.
- `isMinifyEnabled = false` cho bản release, `versionCode = 1` chưa từng tăng.
- Thêm `key` cho ~7 `LazyColumn` phụ còn thiếu (các danh sách chính **đã có key**, không cần đụng).
- Magic string `"OWNER"`/`"VIEWER"`/`"BUYER"` (~15 chỗ) — dữ liệu DB đã kiểm là sạch,
  không gấp. Lưu ý: `Customer.role` (BUYER/OWNER) và `CustomerPropertyLink.role` (OWNER/VIEWER)
  là **hai field khác nhau với hai enum khác nhau**, đúng thiết kế — đừng "gộp cho thống nhất".
- Phân trang `catchUp`: **không sửa**. Chỉ sai khi một bảng vượt 500 row; hiện là 213/85/94.

---

## Bẫy đã biết

- **Việc 2 là việc duy nhất chạm schema.** Sai migration = app crash lúc mở trên máy có dữ liệu cũ.
  Nếu ngại, làm Việc 1 và 3 trước, commit, rồi mới làm Việc 2 riêng một commit.
- **CRLF** và **null byte**: kiểm `git diff` và kiểm byte file sau khi ghi.
- Đừng gỡ cài app để "cho sạch" khi test Việc 2 — làm vậy là bỏ qua đúng thứ cần kiểm.
