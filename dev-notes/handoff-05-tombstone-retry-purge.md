# Handoff 05 — Tombstone kẹt hàng đợi retry + bị purge xóa cứng

**Phạm vi:** chỉ 2 vấn đề #1 và #2 trong cụm tombstone. **KHÔNG** đụng `RealtimeSyncManager`
(vấn đề #3 — tombstone remote ghi đè bản local mới hơn) trong lần này.

**Nguyên tắc giao việc:** chỉ chỉ chỗ + mô tả thay đổi. Không copy code before/after.
Antigravity phải tự đọc code xác nhận lỗi có thật trước khi sửa.

---

## Bối cảnh (đã xác minh bằng đọc code, không phải suy đoán)

Chuỗi lỗi gồm 2 mắt nối nhau:

1. Xóa mềm đặt `isDeleted = 1, isTextSynced = 0`. Nếu lần push đầu thất bại (offline / lỗi mạng),
   `PropertySyncRetryWorker` được lên lịch để bù. Nhưng query hàng đợi retry lại loại chính
   những row `isDeleted = 1` → tombstone **kẹt vĩnh viễn**, máy kia không bao giờ biết đã xóa.
   (Xóa lúc **online** thì push bình thường — `propertyDao.getPropertyById` không lọc `isDeleted`
   nên đường push tức thì vẫn lấy được row. Bug chỉ nằm ở nhánh retry.)

2. `PurgeWorker` (chạy định kỳ 1 ngày/lần) xóa cứng mọi row `isDeleted = 1` cũ hơn 30 ngày,
   **không kiểm `isTextSynced`** → xóa luôn cái tombstone đang kẹt. Từ đó máy này mất sạch dấu vết,
   server + máy kia vẫn giữ bản ghi sống. Không có cơ chế nào hội tụ lại (catchUp lọc theo
   watermark `server_updated_at`, mà row trên server chưa từng bị bump).

---

## Việc 1 — Hàng đợi retry phải bao gồm tombstone

### 1a. `data/local/dao/PropertyDao.kt` — `getUnsyncedTextProperties` (~dòng 95)

Query hiện có điều kiện `isDeleted = 0`. **Bỏ điều kiện này**, giữ nguyên `isTextSynced = 0`.

### 1b. `data/local/dao/CustomerDao.kt` — `getUnsyncedCustomers` (~dòng 122)

Cùng lỗi, cùng cách sửa: bỏ `isDeleted = 0`, giữ `isSynced = 0`.

### Không cần đụng

- `getUnsyncedLinks` (`CustomerDao` ~dòng 106) — vốn đã **không** lọc `isDeleted`, link miễn nhiễm.
  Đừng "sửa cho đồng bộ", nó đang đúng.
- `PropertySyncRetryWorker` / `CustomerSyncRetryWorker` — logic vòng lặp không phân biệt loại row,
  đẩy được tombstone luôn. Không sửa.
- `markSyncedIfUnchanged` (`PropertyDao` ~80, `CustomerDao` ~53) — không lọc `isDeleted`,
  CAS chạy đúng với tombstone. Không sửa.
- `getUnsyncedTextUnverifiedProperties` (~99) và `getUnsyncedUnverifiedProperties` (~101) —
  hai query này phục vụ luồng khác (SP chờ), giữ nguyên `isDeleted = 0`.

### Lưu ý phụ (không phải bug, nhưng nên biết)

`SettingsViewModel` (~dòng 1013) dùng chung `getUnsyncedTextProperties` để hiện bộ đếm
"còn N mục chưa đồng bộ". Sau khi sửa 1a, bộ đếm sẽ **bắt đầu tính cả tombstone đang chờ** —
đây là hành vi mong muốn (trước đây tombstone kẹt bị ẩn hoàn toàn khỏi UI, không cách nào phát hiện).
Không cần sửa gì thêm ở đó, chỉ đừng hoảng khi thấy số đếm nhảy lên sau khi cài bản mới.

---

## Việc 2 — Purge không được xóa cứng tombstone chưa đẩy

### 2a. `data/local/dao/PropertyDao.kt` — `deleteOldDeletedProperties` (~dòng 48)

Thêm điều kiện: chỉ xóa cứng khi bản ghi **đã đẩy lên server thành công** (`isTextSynced = 1`).
Giữ nguyên 2 điều kiện cũ (`isDeleted = 1`, `updatedAt < :thirtyDaysAgo`).

### 2b. `data/local/dao/CustomerDao.kt` — `deleteOldDeletedCustomers` (~dòng 45)

Cùng cách, cột tương ứng ở bảng customers là `isSynced`.

### 2c. `data/worker/PurgeWorker.kt` — bộ lọc dọn folder Drive (~dòng 47-49)

Đoạn này lọc `isDeleted && updatedAt < thirtyDaysAgo && driveFolderId != null` rồi gọi
`driveHelper.deleteFile(folderId)`. Sau khi sửa 2a, cần thêm cùng điều kiện "đã sync" vào bộ lọc,
nếu không sẽ xóa folder ảnh trên Drive của một bản ghi mà local vẫn còn giữ và vẫn đang chờ đẩy.

### 2d. Dọn rác — `data/repository/PropertyRepositoryImpl.kt` (~dòng 570)

`deleteOldDeletedUnverified` gọi đúng cùng một hàm DAO như `deleteOldDeletedProperties`
(tàn dư sau đợt gộp bảng unverified vào `properties`). `PurgeWorker` dòng 64 và 65 gọi cả hai
→ chạy DELETE hai lần. Vô hại nhưng thừa.

Đề xuất: bỏ lời gọi thừa ở `PurgeWorker` dòng 65, và đánh dấu `deleteOldDeletedUnverified`
là deprecated hoặc gỡ hẳn nếu không còn ai gọi. **Kiểm tra toàn bộ call-site trước khi gỡ.**
Nếu thấy rủi ro thì để nguyên — đây là mục vệ sinh, không bắt buộc.

---

## Không thuộc phạm vi lần này

- `RealtimeSyncManager.upsertProperty/upsertCustomer/upsertCustomerPropertyLink` — nhánh
  `if (isDeleted) { ...; return }` chạy **trước** guard LWW, và
  `softDeletePropertyFromRemote` không có guard `updatedAt` trong WHERE.
  Đây là vấn đề #3, xử lý riêng ở handoff sau. **Đừng sửa kèm.**
- Đừng đổi `softDeleteProperty` (`PropertyDao` ~41) — đang đúng.

---

## Nghiệm thu

Build xong phải `installDebug` lên **máy thật**, thao tác, rồi **pull DB kiểm** — không tin
"BUILD SUCCESSFUL" hay giao diện.

### Test A — tombstone offline được đẩy sau khi có mạng lại

1. Bật chế độ máy bay.
2. Xóa 1 SP (và 1 khách hàng).
3. Pull DB → xác nhận row còn đó với `isDeleted = 1`, `isTextSynced = 0`.
4. Tắt máy bay, chờ `PropertySyncRetryWorker` chạy (hoặc bấm "Đồng bộ ngay").
5. Pull DB lại → `isTextSynced` phải thành `1`.
6. Kiểm bảng `properties` trên Supabase → `is_deleted = true`.
7. Máy thứ 2: mở app, chờ catchUp → SP phải biến mất khỏi danh sách.

### Test B — purge không xóa tombstone chưa đẩy

Không chờ 30 ngày được, nên phải giả lập: sửa tạm `thirtyDaysAgo` trong `PurgeWorker` thành
một mốc rất gần (ví dụ 1 phút trước), chạy worker thủ công, rồi **nhớ hoàn nguyên**.

1. Bật máy bay, xóa 1 SP → row có `isDeleted = 1`, `isTextSynced = 0`.
2. Chạy PurgeWorker (với mốc thời gian đã hạ).
3. Pull DB → row **vẫn phải còn**. Nếu mất là fix hỏng.
4. Tắt máy bay, để retry đẩy xong (`isTextSynced = 1`).
5. Chạy PurgeWorker lần nữa → lúc này row mới được xóa cứng.

### Test C — không hồi quy đường xóa online

1. Có mạng bình thường, xóa 1 SP.
2. Xác nhận vẫn push ngay lập tức, không phải chờ retry worker.
3. Kiểm Supabase có `is_deleted = true`.

### Kiểm log

`AppLogger` **không ra Logcat** — phải đọc bảng `sync_log` trong DB đã pull.

---

## Bẫy đã biết

- **CRLF**: sửa hàng loạt file `.kt` dễ làm hỏng line-ending. Kiểm `git diff` xem có file nào
  hiện toàn bộ là thay đổi không.
- **Null byte**: kiểm byte của file `.kt` sau khi Antigravity ghi, đã từng dính.
- Toàn bộ thay đổi ở đây là **SQL trong annotation `@Query`** — Room kiểm cú pháp lúc biên dịch,
  nên gõ sai tên cột sẽ fail build chứ không im lặng. Đây là điểm dễ ở lần fix này.
- **Không cần migration Room** — không đổi schema, chỉ đổi câu query. Giữ nguyên version DB.
