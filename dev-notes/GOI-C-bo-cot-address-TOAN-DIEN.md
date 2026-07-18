# Gói C — Bỏ cột `address` dư thừa: hồ sơ toàn diện

> Trạng thái: **CHƯA LÀM — để dành phiên riêng.** File này gom toàn bộ phân tích để lần sau khỏi soát lại từ đầu.
> Soát code 2026-07-17 (sau khi đóng 5 gói #01–#05). Mức độ: **NẶNG, rủi ro cao, ~40 điểm chạm, 6 tầng.**

---

## 1. Vấn đề gốc

Có HAI trường mang nghĩa "khu vực/địa chỉ" trùng nhau, và nghĩa của chúng **ĐẢO** giữa hai model:

| Model | Trường "khu vực" | Trường "kích thước" | Ghi chú |
|---|---|---|---|
| `PropertyEntity` / `Property` (domain) | `area: String` | `areaSize: Double?` | `address: String?` là DƯ THỪA, gần như == `area` |
| `UnverifiedProperty` (DTO) | `address: String?` | `area: Double?` | Ở đây `area` là **m²**, `address` là **khu vực** — ĐẢO nghĩa! |

→ Chính sự đảo nghĩa này là gốc của cả loạt bug đã phải vá tạm bằng migration (xem mục 4). Mục tiêu gói C: **bỏ hẳn `address` khỏi `Property`/`PropertyEntity`, dùng `area` làm nguồn duy nhất cho khu vực.** DTO `UnverifiedProperty` là chuyện riêng cần cân nhắc (xem mục 5).

---

## 2. Toàn bộ điểm chạm `address` (đọc từ source, ~40 chỗ, 6 tầng)

### Tầng Room (local DB)
- `PropertyEntity.kt:49` — khai `val address: String?`
- `PropertyEntity.kt:86, 126` — map domain↔entity
- `AppDatabase.kt:128, 156, 261` — migration cũ đọc/ghi cột address (cursor + bindString(30))
- `AppDatabase.kt:341-342` — migration cũ `SET address = title WHERE title IS NOT NULL AND (address IS NULL OR address = '')` → **address từng là dữ liệu thật**, không thể xoá mù.

### Tầng Supabase (remote — NGOÀI TẦM ĐỌC CỦA CLAUDE)
- `SupabaseProperty.kt:34` — `val address: String?` (cột `address` trên bảng Postgres)
- `SupabaseProperty.kt:68, 103` — map domain↔remote (fromDomain/toDomain)
- **⚠️ Remote còn cột `address`.** Bỏ ở client mà remote giữ → khi pull về, `toDomain` gán address, có thể ghi đè area; hoặc push thiếu cột. RỦI RO MẤT DỮ LIỆU CROSS-DEVICE. **Bắt buộc kiểm schema Supabase thật + quyết migrate remote cùng lúc hay giữ cột.**

### Tầng Gemini / trích xuất (pipeline bóc text)
- `GeminiApi.kt:71` — prompt yêu cầu AI trả field `"address"`
- `GeminiHelper.kt:66, 93` — parse `address` từ JSON AI
- `GeminiHelper.kt:162-165` — nếu address rỗng thì `matchAddress(rawText, knownAreas)` điền vào address
- `PropertyTextExtractor.kt:106, 111` — `matchAddress()` → đổ vào `address`
- → Pipeline bóc tách sinh ra `address` TRƯỚC rồi mới map sang area. Bỏ address phải chuyển toàn bộ pipeline sang sinh thẳng `area`.

### Tầng sync
- `SyncTextUseCase.kt:86` — `put("address", u.address)` khi ghi JSON đồng bộ
- `SettingsViewModel.kt:535` — `put("address", u.address)` (backup)
- `SettingsViewModel.kt:783` — `address = obj.optString("address", null)` (restore) → **file backup cũ có key address**, bỏ field phải giữ tương thích đọc ngược.

### Tầng UI / logic
- **⚠️ NGUY HIỂM NHẤT — `MapSurveyViewModel.kt:227-228`**: lọc khu vực dùng `p.address.contains(area)`. NHƯNG đây là `matchesUnverifiedFilter(p: UnverifiedProperty)` → `p.address` ở đây ĐÚNG nghĩa (address=khu vực trong DTO). Dòng 201-224 lọc size dùng `p.area` (đúng, area=m² trong DTO). **KHÔNG được sửa mù dòng 227 thành `p.area`** — sẽ so khu vực với số m² → lọc bản đồ hỏng âm thầm. Chỗ này chỉ đúng khi giải quyết đảo nghĩa DTO ở mục 5.
- `MapSurveyViewModel.kt:73` — `unverifiedList.mapNotNull { it.address... }` (gom khu vực SP chờ)
- `MapSurveyViewModel.kt:284` — `title = prop.address ?: "Chưa rõ địa chỉ"`
- `MapSurveyScreen.kt:2001-2002` — hiển thị `fullUnverifiedProperty?.address ?: ...area`
- `PropertyFormViewModel.kt:361, 407` — `area = extracted.address?.ifBlank { null } ?: extracted.title...` (đổ address DTO vào area khi bóc)
- `PropertyFormViewModel.kt:535` — load form: `savedStateHandle["area"] = property.area.ifBlank { property.address ?: "" }` (fallback area←address)
- `PropertyFormViewModel.kt:812, 835` — khi lưu: ghi CẢ `area` lẫn `address = area.value.trim()` (ghi trùng)
- `UnverifiedDetailScreen.kt:98` — `text = itemState?.address ?: "Chi tiết BĐS thô"`
- `SyncForegroundService.kt:209` — `unverifiedArea = unverified.address ?: "Sản phẩm chờ"`
- `RestoreMissingMediaUseCase.kt:70` — `unv.address?.takeIf...` (tên hiển thị)

### Mapping hai chiều (domain/model/Property.kt)
- `Property.kt:39` — `val address: String? = null`
- `Property.kt:82` — `put("address", address ?: JSONObject.NULL)` (toJson)
- `Property.kt:145` — `toUnverified()`: `address = address ?: area` (Property→DTO: address DTO lấy từ area)
- `Property.kt:228` — `toProperty()`: `address = address` (DTO→Property: giữ address)
- `Property.kt:200` (đọc ở #03) — `toProperty()`: `area = address ?: ""` (DTO.address→Property.area)

---

## 3. Vì sao phải làm phiên riêng, không gộp

- Đụng **Supabase remote schema** mà Claude KHÔNG đọc được DB thật → phải có bạn cung cấp/kiểm.
- Đụng **pipeline Gemini** (prompt + parse) → sai là bóc tách hỏng.
- `MapSurvey` filter vướng đảo nghĩa DTO → sai là lọc bản đồ hỏng âm thầm.
- Có **migration Room** (drop cột) + có thể **migration Supabase** → mỗi bước cần rollback.
- File backup JSON cũ có key `address` → cần tương thích ngược đọc.
- Antigravity đã từng làm CỤT FILE ở refactor nhỏ hơn nhiều (#04); refactor 6 tầng này rủi ro gấp bội → cần plan cực kỹ, chia bước nhỏ, mỗi bước build+test.

---

## 4. Các bug đã vá TẠM liên quan (đừng phá khi làm gói C)

- `MIGRATION_24_25`: backfill `area = address WHERE isVerified=0 AND area rỗng` — fix "SP chờ danh sách hiện khu vực, form trống" ([[khu-vuc-area-address-lech]]).
- Bug "path ma" / area-address lệch cột đã vá bằng migration trên. Gói C phải giữ kết quả các migration này, KHÔNG hồi quy.

---

## 5. Câu hỏi/quyết định cần chốt TRƯỚC khi lập plan

1. **Supabase còn cột `address` không?** (Cần bạn kiểm dashboard.) Nếu còn: giữ cột remote (client bỏ đọc/ghi) hay migrate drop remote cùng lúc? → quyết định độ rủi ro sync.
2. **`UnverifiedProperty` DTO có đổi luôn không?** DTO đảo nghĩa (`address`=khu vực, `area`=m²). Nếu chỉ bỏ address ở Property mà giữ DTO → MapSurvey filter (227) vẫn phải dùng `p.address` cho SP chờ. Có thể phải đổi tên DTO cho rõ (`areaName`/`sizeM2`) thay vì bỏ.
3. **Pipeline Gemini**: đổi prompt để AI trả thẳng `area` thay `address`, hay giữ prompt + map ở tầng parse?
4. **File backup JSON**: giữ đọc ngược key `address` cũ (chỉ bỏ ghi mới) — xác nhận.

---

## 6. Hướng plan sơ bộ (KHI làm — chưa chốt)

Chia bước nhỏ, mỗi bước build+test+rollback:
1. **Client ngừng GHI address** (giữ đọc): mọi nơi lưu `address = area` → bỏ, chỉ ghi `area`. Backup/sync ngừng put address mới. (Chưa drop cột, chưa đổi remote.)
2. **Chuyển đọc address→area**: các chỗ fallback `?: address` → bỏ dần, đảm bảo `area` luôn có dữ liệu (đã backfill xong ở MIGRATION_24_25).
3. **Pipeline Gemini/extractor**: sinh thẳng `area`.
4. **DTO UnverifiedProperty**: đổi tên trường cho hết đảo nghĩa (`address`→`areaName`), sửa MapSurvey filter theo.
5. **Drop cột Room** (`MIGRATION_26_27` hoặc mới nhất+1): `ALTER TABLE ... DROP COLUMN address` (SQLite cần recreate table). Rollback = migration ngược.
6. **Supabase**: (tùy quyết định mục 5.1) drop cột remote hoặc để nguyên.
7. Test: form thêm/sửa SP giữ khu vực; MapSurvey lọc khu vực đúng cả Property lẫn SP chờ; sync cross-device không mất khu vực; restore backup cũ vẫn ra khu vực.

---

## 7. Liên kết bộ nhớ
- [[danh-gia-goi-C-bo-address]] — đánh giá ngắn
- [[todo-bo-cot-address]] — TODO gốc
- [[khu-vuc-area-address-lech]] — bug lệch đã vá tạm
- [[gop-sp-cho-vao-property]] — bối cảnh gộp SP chờ
- [[tien-do-refactor-goi-01-04]] — 5 gói đã đóng
