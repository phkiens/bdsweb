# Handoff 06 — Tombstone từ remote ghi đè bản sửa local mới hơn

**Phạm vi:** chỉ vấn đề #3. **KHÔNG** đụng vòng đời `syncJob`/`start()`/`stop()` (đó là #5,
để handoff 07). **KHÔNG** đụng lại các query đã sửa ở handoff 05.

**Điều kiện tiên quyết:** handoff 05 phải đã build + nghiệm thu xong trước khi bắt đầu cái này.

**Nguyên tắc giao việc:** chỉ chỉ chỗ + mô tả thay đổi. Antigravity phải tự đọc code xác nhận
lỗi có thật trước khi sửa.

---

## Bối cảnh (đã xác minh bằng đọc code)

`RealtimeSyncManager.upsertProperty` (~dòng 136-140), `upsertCustomer` (~214-218),
`upsertCustomerPropertyLink` (~262-266) đều có dạng:

```
if (remote.isDeleted) { softDelete...LocalOnly(id, remote.updatedAt); return }
... guard LWW (remote.updatedAt > existing.updatedAt) nằm ở DƯỚI, không bao giờ chạy cho tombstone
```

Và 3 câu DAO tương ứng (`softDeletePropertyFromRemote` ~PropertyDao:45,
`softDeleteCustomerFromRemote` ~CustomerDao:36, `softDeleteCustomerPropertyLinkFromRemote`
~CustomerDao:119) **không có điều kiện so sánh `updatedAt` trong WHERE** — áp vô điều kiện,
đồng thời set cờ đã-sync (`isTextSynced = 1` / `isSynced = 1`).

Hệ quả: máy A xóa lúc T1, máy B sửa lúc T2 > T1 → B nhận tombstone → **bản sửa T2 biến mất**,
và vì bị đánh dấu đã-sync nên không còn ai đẩy nó đi. Xóa cũ thắng sửa mới — ngược đúng nguyên tắc
LWW mà phần còn lại của app đang theo.

Đường lây không chỉ realtime: `catchUp()` (~dòng 319) cũng gọi `upsertProperty`.

---

## Việc 1 — Chặn tombstone cũ hơn bản local

### 1a. Ba câu DAO xóa-mềm-từ-remote

- `data/local/dao/PropertyDao.kt` — `softDeletePropertyFromRemote` (~dòng 45)
- `data/local/dao/CustomerDao.kt` — `softDeleteCustomerFromRemote` (~dòng 36)
- `data/local/dao/CustomerDao.kt` — `softDeleteCustomerPropertyLinkFromRemote` (~dòng 119)

Với cả ba:

1. Thêm vào WHERE điều kiện chỉ áp tombstone khi **bản local không mới hơn**:
   `updatedAt <= :timestamp`.
   Dùng `<=` chứ không phải `<` — khi hai bên bằng nhau thì cho xóa thắng, để hai máy
   ra cùng kết quả (tie-break tất định, không phụ thuộc bên nào chạy trước).
2. Đổi kiểu trả về từ `Unit` sang **`Int`** (Room trả số dòng bị ảnh hưởng).
   Cần con số này cho Việc 2.

Giữ nguyên phần SET (`isDeleted = 1`, cờ đã-sync = 1, `updatedAt = :timestamp`).

### 1b. Đẩy kiểu trả về lên trên

Sửa chữ ký cho khớp ở:
- `data/repository/PropertyRepositoryImpl.kt` — `softDeletePropertyLocalOnly` (~dòng 425)
- `data/repository/CustomerRepositoryImpl.kt` — `softDeleteCustomerLocalOnly` (~dòng 213)
  và `softDeleteCustomerPropertyLinkLocalOnly` (~dòng 351)
- `domain/repository/PropertyRepository.kt` (~dòng 13) và
  `domain/repository/CustomerRepository.kt` (~dòng 15, ~dòng 34)

Trả thẳng `Int` từ DAO lên.

---

## Việc 2 — Khi chặn tombstone thì phải kéo bản ghi sống lại trên server

**Đây là phần quan trọng nhất, đừng bỏ.** Nếu chỉ làm Việc 1, sẽ sinh ra phân kỳ mới:
local giữ bản T2 còn sống, server vẫn `is_deleted = true`, và nếu bản T2 **đã từng được sync**
(`isTextSynced = 1`) thì **không ai đẩy lại** → hai bên lệch vĩnh viễn.

Cách xử lý: khi DAO trả về **0 dòng** (tức tombstone bị chặn vì local mới hơn), đánh dấu
bản ghi local là "bẩn" để hàng đợi retry đẩy lên. Server có `sync_guard` sẽ nhận vì T2 > T1,
và bản ghi hồi sinh trên server → hai bên hội tụ về "còn sống", đúng LWW.

### 2a. Thêm DAO đánh dấu bẩn

Chưa có sẵn hàm nào làm việc này (`markSyncedIfUnchanged` là chiều ngược lại). Cần thêm mới:

- `PropertyDao`: đặt `isTextSynced = 0` theo `id`
- `CustomerDao`: đặt `isSynced = 0` theo `id`
- `CustomerDao`: đặt `isSynced = 0` theo cặp `customerId` + `propertyId` cho bảng link

Đặt tên theo quy ước sẵn có trong file. **Không** đụng `updatedAt` — giữ nguyên T2,
nếu bump lên thì phá LWW.

### 2b. Nối vào 3 chỗ gọi trong `RealtimeSyncManager`

Ở `upsertProperty` / `upsertCustomer` / `upsertCustomerPropertyLink`, nhánh
`if (remote.isDeleted)`: nhận số dòng trả về, nếu bằng 0 thì gọi hàm đánh dấu bẩn ở 2a,
rồi ghi một dòng `AppLogger` nêu rõ đã chặn tombstone cũ (kèm id, `remote.updatedAt`,
`existing.updatedAt`) để còn lần ra khi cần. Xong vẫn `return` như cũ.

Cần kích hoạt retry worker để đẩy ngay thay vì chờ. Xem cách `enqueueSyncRetryWorker()`
đang được gọi trong `PropertyRepositoryImpl` (~dòng 156) và làm tương tự cho từng loại.

---

## Không thuộc phạm vi lần này

- **Nhánh `PostgresAction.Delete`** (`RealtimeSyncManager` ~dòng 126, ~204, ~252) truyền
  `System.currentTimeMillis()` làm timestamp. Đây là xóa cứng phía Postgres — bản ghi đã biến mất
  hẳn trên server, không thể hồi sinh, nên áp vô điều kiện là đúng. Với guard `<=` ở Việc 1,
  timestamp `now()` sẽ luôn lớn hơn local nên nhánh này **giữ nguyên hành vi cũ**.
  Không sửa gì, nhưng phải kiểm lại đúng như vậy sau khi build.
- `softDeleteProperty` (`PropertyDao` ~dòng 41 — xóa do người dùng bấm) — đang đúng, không đụng.
- Vòng đời `syncJob`, `start()`, `stop()` — để handoff 07.
- Phân trang `catchUp` (biên trang, cursor) — vấn đề #4, chưa xử lý.

---

## Nghiệm thu

Cần **2 máy thật**. Không có cách nào kiểm cái này bằng 1 máy.

Ghi chú: `AppLogger` không ra Logcat, phải đọc bảng `sync_log` trong DB đã pull.
Pull DB bằng `run-as ... cat` qua `/data/local/tmp` (nhớ lấy cả file `-wal`).

### Test A — bản sửa mới thắng tombstone cũ (kịch bản chính)

1. Chọn 1 SP có trên cả 2 máy. Cho cả hai vào chế độ máy bay.
2. Máy A: xóa SP đó.
3. Đợi ~1 phút (để `updatedAt` của B chắc chắn lớn hơn), máy B: sửa SP đó (đổi giá chẳng hạn).
4. Bật mạng **máy A trước**, đợi đẩy xong (kiểm Supabase: `is_deleted = true`).
5. Bật mạng máy B.
6. Kết quả phải là:
   - Máy B: SP **vẫn còn**, giữ nguyên giá vừa sửa
   - `sync_log` máy B có dòng ghi đã chặn tombstone cũ
   - Sau khi retry đẩy xong, Supabase quay lại `is_deleted = false` với giá mới
   - Máy A: SP **hiện lại** sau lần catchUp kế tiếp
7. Trước khi sửa, kịch bản này cho kết quả ngược lại (SP mất ở cả hai, mất luôn giá mới) —
   nếu muốn thì chạy thử trên bản cũ một lần để thấy khác biệt.

### Test B — không hồi quy: xóa vẫn phải lan sang máy kia

1. Cả 2 máy online, đồng bộ xong.
2. Máy A xóa 1 SP (không ai đụng vào SP đó ở máy B).
3. Máy B phải thấy SP biến mất. Đây là đường đi thường ngày, hỏng cái này là hỏng nặng.

### Test C — tombstone mới hơn vẫn phải thắng

1. Cả 2 máy máy bay.
2. Máy B sửa SP trước.
3. Đợi ~1 phút, máy A xóa SP đó (tombstone giờ mới hơn).
4. Bật mạng cả hai → SP phải **biến mất ở cả hai máy**. Đây là chiều ngược của Test A,
   dễ làm hỏng khi cài guard sai dấu (`<` vs `<=`, hoặc so ngược chiều).

### Test D — khách hàng và link

Lặp lại Test A với 1 khách hàng, và với 1 liên kết khách–SP. Ba bảng dùng ba câu DAO khác nhau,
sửa đúng 2 sai 1 là chuyện bình thường.

---

## Bẫy đã biết

- **Sai dấu so sánh** là rủi ro lớn nhất ở lần này. `updatedAt <= :timestamp` nghĩa là
  "bản local KHÔNG mới hơn tombstone thì mới cho xóa". Viết ngược thành `>=` sẽ ra hành vi
  đảo hoàn toàn mà **vẫn build được và vẫn chạy** — chỉ Test C bắt được.
- Room kiểm cú pháp SQL lúc biên dịch, nhưng **không kiểm logic**. Build xanh không nói lên gì.
- Đổi kiểu trả về DAO `Unit` → `Int` sẽ làm hỏng biên dịch ở mọi call-site — đó là chuyện tốt,
  cứ theo lỗi biên dịch mà sửa cho hết.
- **CRLF** và **null byte**: kiểm `git diff` và kiểm byte file `.kt` sau khi ghi.
- **Không cần migration Room** — không đổi schema.
