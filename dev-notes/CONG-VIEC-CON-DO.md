# Công việc còn dở — dev-notes

> Gộp 26 file lẻ → 1 file (2026-07-21). Mọi mục dưới đây **đã xác thực bằng code thật**
> trên branch `goi-c-bo-address`, không chép từ kế hoạch cũ.
> Các việc đã xong đều bị loại khỏi file này — có gì trong đây là còn phải làm.

---

## 1. Commit tách mạch việc — ✅ XONG TOÀN BỘ (21/07)

Đã commit, theo đúng thứ tự an toàn:

| Commit | Nhóm | Trạng thái |
|---|---|---|
| `5949f7a` | E — gộp dev-notes | ✅ |
| `90c53b0` | D — P4 hoa/thường (toTitleCase lúc hiển thị) | ✅ |
| `f0ed6c3` | B — P1/P2/P3 sync retry + PurgeWorker | ✅ |
| `9e0a344` | A — Gói C bỏ cột address, Room v28 | ✅ `connectedDebugAndroidTest` xanh + K nghiệm thu |
| `5190bcf` | C — quét folder Drive mồ côi (nguyên trạng) | ✅ |
| `a71b00b` | C1 — chặn an toàn theo tỷ lệ | ✅ `assembleDebug` xanh 21/07 |

Chưa chạy thử nút trên máy thật — xem lưu ý ở mục 1c trước khi bấm lần đầu.

> Ghi chú lúc làm: `.git/index.lock` treo từ 19:20 chặn mọi thao tác git (kể cả `git reset`) — lock chết,
> đã xoá tay. Nếu gặp lại: kiểm file 0 byte + cũ hàng giờ thì mới xoá, đừng xoá khi Android Studio đang chạy git.

<details>
<summary>Phân nhóm gốc (giữ để tra lại file nào thuộc commit nào)</summary>

**Nhóm A — Gói C bỏ cột `address`** (code đã xong, chỉ còn nghiệm thu)
`AppDatabase.kt` (v28 + `MIGRATION_27_28`), `PropertyEntity.kt`, `SupabaseProperty.kt`, `Property.kt`,
`PropertyFormViewModel.kt`, `PropertyRepositoryImpl.kt`, `SyncForegroundService.kt`
(`unverified.address` → `unverified.area.ifBlank{}`), `RestoreMissingMediaUseCase.kt` (tương tự),
`app/schemas/.../28.json` (chưa track).

**Nhóm B — fix P1/P3 "migration đánh dấu dirty không ai push"** (memory ghi đã nghiệm thu 2 máy 21/07)
`MyApplication.kt` (+30 dòng: enqueue 3 worker retry lúc khởi động), `PropertySyncRetryWorker.kt` /
`CustomerSyncRetryWorker.kt` / `CustomerPropertyLinkSyncRetryWorker.kt`
(`Result.failure()` → `if (runAttemptCount < 5) Result.retry() else Result.failure()` = P3),
`PurgeWorker.kt` (`getAllUnverified` → `getAllProperties`, vá luôn P2 sót tombstone SP chính).

**Nhóm C — tính năng MỚI: quét folder Drive mồ côi** ⚠️ *không có trong bất kỳ dev-note nào,
chưa từng được lên kế hoạch hay review trước khi viết* — đã review ở mục 1b.
`FindOrphanDriveFoldersUseCase.kt` (mới, chưa track), `DriveHelper.kt` (+47 dòng `listSubFoldersInFolder`),
`SettingsScreen.kt` (nút "Đánh dấu folder Drive rác"), `SettingsViewModel.kt`.

**Nhóm D — fix P4 hoa/thường không hội tụ** (phương án A: bọc `toTitleCase` lúc HIỂN THỊ, không sửa dữ liệu)
`UnverifiedScreen.kt` + `UnverifiedViewModel.kt` — chỉ 2 dòng + 2 import. **Không thuộc Gói C**, đừng gộp nhầm.

**Nhóm E — dọn dev-notes** (26 file → 1 file này).

</details>

### 1b. Review nhóm C — quét folder Drive mồ côi (Claude đọc code 2026-07-21)

**Kết luận: thiết kế nền ĐÚNG, an toàn hơn vẻ ngoài. Lớp chặn còn thiếu (C1) đã bổ sung ở `a71b00b`.**

Những điểm đã kiểm và ĐÚNG (đừng "sửa cho chắc" mấy chỗ này):

- `getAllProperties()` = `SELECT * FROM properties`, **không lọc gì** → đúng như comment: gồm cả SP chờ
  lẫn record đã xoá mềm. Nếu dùng nhầm `getAllPropertiesFlow()` (`isDeleted=0 AND isVerified=1`)
  thì đã rename nhầm toàn bộ folder SP chờ.
- **Folder của SP được tra theo ID, không theo tên** (`checkFolderExists(folderId)` ở
  `SyncMediaUseCase:253`) → đổi tên folder KHÔNG làm mất liên kết, KHÔNG đẻ folder trùng. Đây là lý do
  cả tính năng này rủi ro thấp.
- Bỏ qua `"Customers"` theo tên là **bắt buộc và đúng**: folder đó được tra theo TÊN
  (`getOrCreateSubFolder(parent, "Customers")` ở `SyncSingleCustomerUseCase:30`) — đổi tên nó là
  lần sync khách tiếp theo đẻ folder Customers thứ hai.
- Đổi tên (không xoá) + bỏ qua tiền tố `ZZZ_MOCOI_` → chạy lại nhiều lần vô hại, và hồi phục được bằng tay.

**C1 [đã sửa] — lớp chặn cũ canh sai hướng.**
`getUnsyncedTextProperties()` = `isTextSynced=0 AND isDeleted=0`, tức chỉ chặn khi **local chưa đẩy lên**.
Nhưng nguy hiểm thật là chiều ngược lại: **remote chưa kéo về**. Kịch bản hỏng: máy mới cài / vừa restore /
pull chưa xong → local DB thiếu record → folder trên Drive của những record đó bị coi là mồ côi →
đổi tên hàng loạt (có thể gần hết 170+ folder). Không mất dữ liệu, nhưng dò tay lại rất mệt.
→ Thêm **chặn theo tỷ lệ** (rẻ và hiệu quả nhất): nếu số folder định đổi tên vượt ~30% tổng số folder quét
được, HOẶC `liveFolderIds` rỗng, thì DỪNG và báo số liệu ra để K tự xác nhận, không tự ý ghi.

**C1 — ✅ ĐÃ SỬA** (`a71b00b`): thêm chặn theo tỷ lệ trong use case (dừng nếu định đổi tên >30% tổng số
folder, hoặc `liveFolderIds` rỗng). Đặt ở use case nên chặn mọi đường gọi về sau, và nhìn vào *kết quả*
thay vì đoán *nguyên nhân*. DB đủ dữ liệu thì không bao giờ kích hoạt.

> **C2, C3, C4 — CHỐT 21/07: KHÔNG LÀM.** Nêu ra để biết, không phải để sửa.
> C2 gây bỏ sót (nghiêng phía an toàn), C3 làm phức tạp một nút chạy vài tháng một lần,
> C4 chỉ là con số trong thông báo. Chi phí sửa lớn hơn giá trị nhận lại. Nếu sau này thấy số liệu
> báo cáo lệch thì quay lại đọc C2. Nội dung gốc giữ nguyên bên dưới.

**C2 [không làm] — `Map<String, String>` khoá theo TÊN làm mất folder trùng tên.**
`listSubFoldersInFolder` trả `Map<name, id>`, mà Drive **cho phép trùng tên** → `result[name] = id` ghi đè,
2 folder cùng tên chỉ còn 1. Hệ quả là **sót** (không rename) chứ không rename nhầm — nhẹ, nhưng làm
số liệu báo cáo sai. Đổi sang `List<Pair<String, String>>`.

**C3 [không làm] — không có bước xem trước.** Đây là thao tác ghi hàng loạt lên Drive thật mà bấm phát chạy luôn.
Tách 2 nhịp: quét → hiện danh sách + số lượng sẽ đổi tên → K bấm xác nhận mới ghi.

**C4 [không làm] — `skipped` gộp cả "còn sống nên bỏ qua" lẫn "gọi API thất bại"** (dòng 38 tăng `skipped` khi
`updateFolderMetadata` trả false) → đọc báo cáo không biết có lỗi hay không. Tách thêm biến `failed`.

### Nghiệm thu Gói C — ĐÃ XONG (giữ checklist để tra lại nếu sau này nghi ngờ)

1. **Backup toàn bộ trong app TRƯỚC khi cài bản v28** — DB lên v28 thì APK v27 cũ không mở lại được;
   rollback bắt buộc qua backup, `git checkout` không cứu.
2. `connectedDebugAndroidTest` — thứ duy nhất kiểm được câu SQL `MIGRATION_27_28` trước khi nó chạm dữ liệu thật.
3. Máy A (nâng cấp từ v27, KHÔNG gỡ app): SP chính đủ **136**, SP chờ đủ **37**, khu vực hiện đúng;
   bản đồ lọc theo khu vực SP chờ vẫn đúng; sửa 1 SP → khu vực trong form không trống;
   dán 1 tin thô → khu vực vẫn được điền (kiểm pipeline Gemini còn nguyên);
   "Đồng bộ ngay" → `sync_log` không lỗi; thư mục Drive mới tạo tên `{khu_vuc}_...`, không phải `Chua_ro_...`.
4. Máy B: cài, chờ pull, so số lượng + khu vực với máy A.
5. Pull DB: `PRAGMA table_info(properties)` không còn `address`;
   `select count(*) from properties where area is null or trim(area)=''` phải ra **0**.

### `MigrationTest` đã hạ chuẩn — đã chốt chấp nhận

Test đổi từ chạy `v2 → v28` thành `v23 → v28` (`filter { it.startVersion >= 23 }`).
Lý do chính đáng: `app/schemas/` chỉ có từ `12.json` và **thiếu `18.json`** → chạy từ v2 chưa bao giờ khả thi
(khớp memory "MigrationTest thiếu json, chưa từng chạy qua").
Hệ quả: migration 2→23 giờ không được test phủ.

**ĐÃ CHỐT 21/07: chấp nhận, không bổ sung schema json.** Lý do: đoạn 2→23 không còn đường nào thực thi —
2 máy thật đều đã ở v27, máy cài mới thì Room tạo thẳng schema v28 (`createAllTables`), không chạy migration cũ.
Thứ cần lưới an toàn là `MIGRATION_27_28` (câu CREATE TABLE 33 cột chép tay) thì **vẫn nằm trong phạm vi
test v23→v28**. Chỉ cần nhớ: nếu sau này có máy thứ ba cài APK cũ rồi nâng, hoặc restore file `.db` cũ hơn v23,
thì vùng không được test mới sống lại.

`ExampleInstrumentedTest.kt` đã xoá (assert sai package) — chỉ cần commit.

### 1c. Lưu ý khi bấm nút quét folder Drive lần đầu

1. Bấm sau khi pull đã chạy đủ, để local DB chắc chắn đầy đủ record.
2. Xem kỹ số `renamed` ở thông báo trước khi tin — nếu thấy con số lớn bất thường thì dừng, kiểm DB.
3. Folder bị đánh dấu chỉ ĐỔI TÊN thành `ZZZ_MOCOI_...`, chưa xoá — K tự kiểm rồi xoá tay trên Drive.


---

## 2. Việc 3 (gộp UI SP chờ) — ✅ ĐÓNG HOÀN TOÀN 21/07

B0–B3 và B5 đã xong từ trước. **B4 (SP chờ dùng chung `PropertyCard`): CHỐT KHÔNG LÀM.**

Lý do (Claude đọc song song 2 card ngày 21/07, không suy đoán): hai card chỉ giống bộ khung
(thumbnail 60dp + cột giữa + vuốt ngang), còn phần quyết định hành vi thì **ngược nhau**:

| | `UnverifiedPropertyCard` | `PropertyCard` |
|---|---|---|
| Vuốt phải | **XÁC MINH** (mở form) | **bật/tắt sao** (`needToViewToday`) |
| Vuốt trái | **XOÁ TIN** | **đổi trạng thái** Đang bán ↔ Đã bán |
| Ngưỡng vuốt | cứng ±90px | 20% chiều rộng card + haptic + spring |
| Ảnh | local → **stream từ Drive kèm token** → thumbnail URL | **chỉ file local** |
| Thiếu toạ độ | có `isWarning` (icon vàng) | không có |
| Badge | "CHỜ XM" cam + chevron | sao vàng góc ảnh |
| Nội dung | 2 hàng | 3 hàng (thêm chủ nhà, ngày KS, icon sync) |
| `toTitleCase` khu vực | **có** (P4, `90c53b0`) | không |

Cùng một cử chỉ vuốt mang hai nghĩa nghiệp vụ khác hẳn. Gộp thì chỉ có 3 đường, đường nào cũng tệ hơn
hiện tại: (a) nhét 6–8 callback + cờ vào `PropertyCard` → biến nó thành component vạn năng, đúng thứ
vừa mất mấy phiên tách khỏi god-file; (b) SP chờ mất vuốt xác minh/xoá; (c) SP chính mọc hành vi vô nghĩa.
Ngoài ra gộp ẩu là SP chờ **mất ảnh stream từ Drive** và mất fix P4.

Phần thắng thật của việc 3 đã lấy hết ở B0–B3: hai màn dùng chung `PropertyFilter`, cùng đọc `Property`,
`matchesUnverified` đã xoá. B4 chỉ còn giá trị đồng bộ hình thức — không đáng.

> **Việc thay thế (nếu sau này muốn giảm trùng lặp thật, KHÔNG gấp):** tách riêng phần giải ảnh thumbnail
> thành composable dùng chung. Đó mới là đoạn trùng có giá trị, và bản của SP chờ đang **tốt hơn**
> (biết fallback sang Drive khi file local đã bị dọn). ~40 dòng, rủi ro thấp.

---

## 3. ✅ ĐÃ SỬA 21/07 — "Sửa nhanh" ở màn Bản đồ bày trạng thái không có trong enum

**Mức độ thật: bẫy đang ngủ, KHÔNG phải bug đang hại.** (Lần đầu tôi xếp là "bug thật" — nói quá,
đã kiểm lại theo thắc mắc rất đúng của K: "sao chưa thấy vấn đề này lần nào".)

Code cũ — `MapItemPreview.kt:167`, nhánh SP chờ của dialog "Sửa nhanh":
```kotlin
listOf("Chờ khảo sát", "Đã xác minh", "Đã xóa")
```
`"Đã xác minh"` và `"Đã xóa"` **không thuộc enum `PropertyStatus`** (chỉ có Đang bán / Đã bán /
Tạm ngưng / Chờ khảo sát). Chọn 1 trong 2 → chuỗi thô đi thẳng vào `updatePropertyQuickly`
(`MapSurveyViewModel:464`, không chuẩn hoá gì) → ghi vào cột `status` + `isTextSynced=false` → đẩy lên
Supabase. `fromValue()` không khớp nên fallback `?: FOR_SALE`: chọn "Đã xóa" mà hiện ra "Đang bán",
và **không hề xoá hay xác minh** (`isDeleted`/`isVerified` không đổi).

**Vì sao K chưa bao giờ gặp** (3 lý do, đã kiểm bằng code + DB thật):

1. **Đường vào hẹp**: Bản đồ → bấm pin SP chờ → sheet preview → nút "Sửa nhanh" (cạnh nó là
   "Chi tiết đầy đủ" mà K hay dùng) → chọn đúng 1 trong 2 lựa chọn rác → Lưu.
2. **Triệu chứng vô hình — lý do chính**: grep `status` trong `UnverifiedScreen.kt` và
   `UnverifiedDetailScreen.kt` đều **rỗng**. Màn SP chờ không hiển thị trạng thái ở đâu cả
   (badge "CHỜ XM" là chữ cứng, không đọc `status`), không có chip lọc trạng thái, và B3 còn chủ động
   `.copy(statuses = emptySet())`. Chuỗi rác nằm im trong DB mà UI không phản ánh.
3. **DB thật sạch**: pull 18/07, SP chờ chỉ có `Chờ khảo sát` 30 + `Đang bán` 9 — không row rác nào.

Chỗ duy nhất lộ ra được: nếu SP chờ đó về sau được xác minh. `PropertyFormViewModel:664` chỉ đổi status
sang FOR_SALE khi status cũ **đúng bằng** `PENDING_SURVEY` → chuỗi rác không khớp nên được giữ nguyên,
màn SP chính hiển thị qua enum → ra "Đang bán". Hiển thị vẫn bình thường, chỉ giá trị trong DB là sai.

**Đã sửa**: nhánh SP chờ dùng `listOf(PENDING_SURVEY, FOR_SALE, SOLD).map { it.value }`, kèm comment
giải thích tại chỗ để người sau không nhét lại hành động vào danh sách trạng thái.
Nếu sau này thật sự muốn "xác minh"/"xoá" từ màn Bản đồ thì gọi đúng hành động
(`onNavigateToEdit`, `softDeleteUnverified`), không phải ghi chuỗi vào `status`.

---

## 3b. Nợ vệ sinh — ✅ ĐÃ XỬ LÝ 21/07 (con số thật khác hẳn note cũ)

> `assembleDebug` xanh sau cả 3 commit `476be94` + `10c5c8f` + `33b8d55`.

**Đáng làm (rẻ, lợi ích thật):**

- ~~**Dọn log debug**~~ → **✅ ĐÃ XONG 21/07. Con số thật là 85 chỗ, không phải 9.**
  Rà bằng grep tag `*DEBUG*`: `PropertyFolderDebug` 33, `SYNC_UPLOAD_DEBUG` 22, `EDIT_PERF_DEBUG` 10,
  `EDIT_BTN_DEBUG` 9, `DOWNLOAD_DEBUG` 7, `PROPERTY_CLICK_DEBUG` 4. (`PULL_DEBUG` đã sạch từ trước.)
  Trong đó **36 chỗ ghi qua `AppLogger` tức đổ thẳng vào bảng `sync_log`** — đúng cái bảng K dùng để
  chẩn lỗi; 49 chỗ còn lại chỉ ra Logcat.
  → Đã xoá 82 dòng + gỡ 3 khối `if/else` rỗng còn lại sau khi xoá. Giữ lại 2 chỗ mang tín hiệu lỗi thật,
  đổi thành log tử tế: `SyncMediaUseCase` (không tạo được folder Drive → `AppLogger.e("MediaSync",…)`)
  và `MainActivity` (không mở được màn sửa → `AppLogger.e("Navigation",…)`).
  Log vận hành tag `MediaSync` (26 chỗ) **giữ nguyên** — đó là log thật, không phải debug.

  > ⚠️ **Bẫy gặp phải, ghi lại cho lần sau:** script python đọc/ghi file `.kt` bằng text mode đã
  > **nuốt CRLF → LF**, làm `PropertyFormScreen.kt` (1688 dòng, toàn CRLF) hiện nguyên file trong diff
  > dù chỉ xoá 1 dòng. Đã khôi phục. Repo này có file trộn line-ending — luôn `git diff --stat` sau khi
  > sửa hàng loạt, thấy số dòng đổi vô lý thì kiểm `file <đường dẫn>` ngay.

- ~~**`printStackTrace()` 35 chỗ — nuốt lỗi**~~ → **✅ ĐÃ XỬ LÝ 21/07, và con số cũ SAI.**
  Rà lại từng chỗ: **`RealtimeSyncManager` (8) KHÔNG hề nuốt lỗi** — cả 8 đều có
  `AppLogger.log`/`record` **nằm trong chính khối `catch`**; `printStackTrace` chỉ là thứ duy nhất
  đưa stack trace ra Logcat, đổi sang `AppLogger.e` là **mất** stack (`AppLogger.e` chỉ ghi
  `localizedMessage`). 2 worker pull/restore cũng vậy. → **giữ nguyên**.
  Chỗ nuốt thật là **`MyApplication` 6/6**: dòng `AppLogger.log(...)` ở đó nằm **TRONG `try`**
  nên khi lỗi không bao giờ chạy tới (lần quét đầu tôi nhìn 3 dòng phía trên nên đếm nhầm thành
  "đã có log"). → Đã thêm `AppLogger.e` vào **5 chỗ** (46, 65, 95, 112, 124), **giữ** `printStackTrace`
  để không mất stack. Dòng 31 để nguyên: đó là `catch` của chính `AppLogger.init()`, chưa có logger để ghi.
  **`AppLogger.kt:57/87/119` TUYỆT ĐỐI giữ nguyên** — `catch` bên trong chính logger, gọi `AppLogger`
  từ đó là tự gọi lại mình lúc đang lỗi.
  Còn lại để nguyên (giá trị thấp): `AppDatabase:190/205` (parse JSON media trong migration cũ),
  `Converters:31`, `PropertyRepositoryImpl:412`, `NotificationHelper` ×3, `PropertyDetailScreen:1370`.

**KHÔNG nên làm (chi phí > lợi ích, đã cân nhắc):**

- **Bật minify** — `proguard-rules.pro` hiện là **template mặc định 100%, mọi dòng đều bị comment**.
  Stack có kotlinx.serialization + supabase + ktor + Room + Hilt + osmdroid + Coil → thiếu rule là crash
  runtime, mà chỉ lộ ra ở bản release đã cài. Đổi lại: APK nhỏ hơn + che tên lớp — với app cá nhân
  tự cài thì lợi ích gần bằng 0. **Để nguyên.**
- **Tách `PropertyFormScreen` (1688 dòng)** — cả file chỉ có **2 hàm top-level**: `PropertyFormScreen`
  (~1580 dòng) và `ExtractedRow`. Không còn mảnh nào tách thuần được như 4 màn kia; muốn tách phải cắt
  vào thân composable = đổi cấu trúc state, đúng loại rủi ro recomposition đã quyết tránh ở B3b MapSurvey.
  **Để nguyên** cho tới khi có lý do nghiệp vụ phải sửa màn này.
- **VM scope Activity** (6 VM `by viewModels()` ở `MainActivity:90-96`) — đổi sang `hiltViewModel()`
  per-destination là refactor điều hướng, đổi vòng đời state, dễ sinh bug tinh vi. Lợi ích thuần lý thuyết.
- **`PropertyEntity` map tay** — nợ bảo trì, chỉ đau khi thêm cột. Không làm gì bây giờ.

**Coi như đã xong:**

- **Magic string status** — enum bước 1 đã dọn gần hết. Chỗ cuối cùng ghi chuỗi thô là
  `MapItemPreview:167`, đã sửa ở mục 3 trên. Grep `"Đang bán"|"Đã bán"|"Chờ khảo sát"` giờ chỉ còn
  `StatusUiMapper` (map enum → nhãn, đúng thiết kế) và comment.
  `StatusUiMapper` map enum → nhãn tiếng Việt là thiết kế đúng, đừng "dọn" nhầm nó.
- **Rác ở thư mục gốc repo** — 0 file `.db/.wal/.shm/applog.txt`, `.gitignore` đã có.

---

## 4. Quy trình Antigravity code — Claude review (tham khảo, không phải việc)

Antigravity là bên duy nhất sửa code; Claude chỉ đọc/audit, không tự sửa file.
Trao đổi qua `handoff-NN-<slug>.md`, **viết tiếng Anh** (Antigravity hay hỏng encoding tiếng Việt);
trả lời K vẫn tiếng Việt. Thứ tự bắt buộc, mỗi mục chỉ viết khi mục trước đã xong:

`Plan v1` (AG) → `Review v1` (Claude) → `Plan v2 final` (AG) → `Review v2` (Claude) →
`Changes v1` (AG) → `Review v3 code review` (Claude) → `Fix log v1` (AG) → lặp tới khi hết Critical.

Nguyên tắc: **không tin "BUILD SUCCESSFUL" hay tóm tắt bằng chữ** — luôn mở file/`git diff` thật rồi mới ký duyệt.
Sau mỗi lần Antigravity ghi file: kiểm null byte (`.kt`) và em-dash bị cắt (`.md`).

---

## Phụ lục — 2 việc tưởng còn dở, thực ra ĐÃ XONG (xác minh 21/07)

Ghi lại để không ai lên kế hoạch làm lại:

- **Hiện `rawText` ở màn Chi tiết SP chính** — xong. `PropertyDescriptionSection` trong
  `PropertyDetailComponents.kt` (đủ `displayDescription`, `showRawText` 3 vế, `heightIn(320.dp)` + scroll),
  gọi ở `PropertyDetailScreen.kt:1188`. Bẫy chia sẻ an toàn: dòng 1341 vẫn dùng `p.description` thuần,
  `toReadableText()` vẫn không xuất `rawText`.
- **Thay bộ regex qua Cài đặt** — xong. `SettingsManager.customExtractionRegex`
  (khoá `custom_extraction_regex`), `PropertyTextExtractor.parseWithRegex(customRegexJson)` override 4 pattern
  có `try/catch`, `RegexConfigDialog.kt` đủ xem/dán/kiểm tra/chạy thử/khôi phục.
