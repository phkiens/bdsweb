# Handoff 07 — Vòng đời `syncJob` của RealtimeSyncManager

**Phạm vi:** chỉ vấn đề #5 — vòng đời job và guard khởi động. **KHÔNG** đụng logic
`upsertProperty`/`upsertCustomer`/`upsertCustomerPropertyLink` (đó là #3, handoff 06).

**Mức độ:** đây là **phòng ngừa**, không phải bug đang gây hại. DB pull ngày 25/07 cho thấy
sync đang chạy tốt, `sync_log` sạch. Làm sau handoff 05 và 06.

---

## Bối cảnh (đã xác minh bằng đọc code)

Ba khiếm khuyết chồng lên nhau trong cùng một cơ chế, xếp theo mức dễ xảy ra:

### 1. Guard trả lời sai câu hỏi (dễ xảy ra nhất)

`RealtimeSyncManager.start()` ~dòng 46: `if (syncJob != null) return`.

Điều kiện này nghĩa là "đã từng khởi động chưa", không phải "còn đang chạy không".
Khi websocket rớt mà flow **không ném exception** (mạng chập chờn, server đóng kết nối),
job vẫn tồn tại, khối `catch` không chạy, `syncJob` vẫn khác null → realtime chết im lặng
và `start()` từ chối khởi động lại. Triệu chứng: app ngừng nhận thay đổi từ máy kia
cho tới khi tắt hẳn rồi mở lại.

### 2. `start()` và `stop()` có thể đan vào nhau

`MyApplication.kt` ~dòng 110-137: `onStart` launch một coroutine IO gọi `start()`,
`onStop` launch một coroutine IO **khác** gọi `stop()`. Hai coroutine độc lập,
không có gì đảm bảo thứ tự. Chuyển màn hình nhanh hoặc xoay máy là đủ để chúng chồng nhau:

- Chiều 1: `stop()` đang cancel job, `start()` xen vào thấy `syncJob != null` → return sớm →
  realtime tắt hẳn tới lần foreground sau.
- Chiều 2: `start()` chạy trước khi `stop()` kịp set null → **hai job cùng subscribe**
  một channel tên `realtime-sync-channel` → mỗi event xử lý hai lần.

### 3. Race lúc gán `syncJob` (hiếm nhất)

~dòng 51-97: `syncJob = scope.launch { ... catch { syncJob = null } }`.
Body chạy trên `Dispatchers.IO`, có thể fail và set `syncJob = null` **trước khi** phép gán
ngoài hoàn tất → `syncJob` giữ một Job đã chết, guard chặn mọi lần start sau.
Cửa sổ chỉ vài micro-giây nên hiếm, nhưng `syncJob` là `var` thường không `@Volatile`,
bị đọc/ghi từ nhiều thread nên còn thêm vấn đề memory visibility.

---

## Việc cần làm — `data/remote/supabase/RealtimeSyncManager.kt`

Cả ba khiếm khuyết dùng chung một hướng sửa:

1. **Đổi guard** ở `start()` (~dòng 46) từ `syncJob != null` sang kiểm tra job **còn sống thật**
   (`isActive`). Job đã chết hoặc đã hủy phải cho khởi động lại.

2. **Bỏ `syncJob = null`** trong khối `catch` (~dòng 95). Không cần nữa: job fail thì `isActive`
   đã là false, guard mới tự xử lý. Giữ nguyên phần log lỗi.

3. **`@Volatile`** cho `syncJob` (~dòng 38) và `channel` (~dòng 39).

4. **Bọc `start()` và `stop()` bằng một `Mutex` dùng chung** (`kotlinx.coroutines.sync.Mutex`,
   `withLock`). Cả hai đã là `suspend fun` nên dùng được trực tiếp, không cần đổi chữ ký.
   Đây là phần xử lý khiếm khuyết số 2 — không có nó thì sửa guard vẫn còn đan nhau.

5. Trong `stop()` (~dòng 100-108): cân nhắc `syncJob?.cancelAndJoin()` thay vì `cancel()`,
   để chắc chắn job cũ đã dừng hẳn trước khi nhả mutex. Nếu thấy có nguy cơ treo
   (job đang collect flow không phản hồi cancel) thì bọc `withTimeoutOrNull`.

### Không thuộc phạm vi

- `MyApplication.kt` — **không sửa**. Việc launch hai coroutine rời ở `onStart`/`onStop`
  là hợp lý, chỗ cần đồng bộ hóa nằm trong `RealtimeSyncManager`. Sửa cả hai nơi dễ thành
  khóa chồng khóa.
- Cơ chế tự kết nối lại khi websocket rớt — **chưa làm lần này**. Sửa guard mới chỉ đảm bảo
  lần `start()` kế tiếp (khi app quay lại foreground) sẽ khởi động lại được. Muốn tự hồi phục
  ngay khi đang mở app thì cần theo dõi trạng thái kết nối của Supabase Realtime,
  là việc riêng và lớn hơn.

---

## Nghiệm thu

`AppLogger` không ra Logcat — đọc bảng `sync_log` trong DB đã pull.

Trước khi test, thêm log tạm ở đầu `start()` và `stop()` ghi rõ `syncJob` đang null hay
`isActive` bằng gì. Không có log này thì không phân biệt được "chạy đúng" với
"return sớm im lặng" — cả hai đều trông giống nhau từ ngoài.

### Test A — foreground/background liên tục

1. Mở app, đợi `sync_log` báo subscribe thành công.
2. Nhấn Home rồi mở lại app **10 lần liên tiếp, thật nhanh**.
3. Đọc `sync_log`: mỗi lần foreground phải có đúng **một** lần khởi động thành công.
   Không được có lần nào return sớm, cũng không được có hai lần subscribe liền nhau.
4. Sửa 1 SP ở máy kia → máy này phải nhận được thay đổi. Đây mới là bằng chứng
   realtime còn sống thật, chứ không phải log.

### Test B — xoay máy

Xoay ngang/dọc liên tục ~10 lần rồi kiểm như bước 4 ở trên. Xoay máy sinh ra chuỗi
stop/start dày hơn thao tác tay.

### Test C — mất mạng rồi có lại

1. Đang mở app, bật máy bay ~30 giây, tắt máy bay.
2. Sửa 1 SP ở máy kia.
3. Máy này có nhận được không? **Nhiều khả năng là KHÔNG** — vì phần tự kết nối lại
   không nằm trong phạm vi lần này.
4. Đưa app xuống nền rồi mở lại → lúc này **phải** nhận được. Nếu vẫn không, tức là
   guard mới chưa đúng.

### Test D — không hồi quy

App mở bình thường, sửa dữ liệu qua lại giữa 2 máy vài lượt, xác nhận không có bản ghi nào
bị xử lý hai lần (dấu hiệu: `sync_log` ghi trùng liên tiếp cùng một id).

---

## Bẫy đã biết

- **Không thể kiểm bằng mắt.** Realtime chết và realtime sống trông y hệt nhau nếu bạn
  không chủ động sửa dữ liệu ở máy kia. Mọi bước nghiệm thu đều phải kết thúc bằng
  "sửa ở máy kia, xem máy này có nhận không".
- `cancelAndJoin()` trong mutex có thể treo nếu job không phản hồi cancel. Nếu thấy app
  đứng khi xuống nền, đó là chỗ cần xem đầu tiên.
- **CRLF** và **null byte**: kiểm `git diff` và kiểm byte file sau khi ghi.
- Không đụng DB, không cần migration.
