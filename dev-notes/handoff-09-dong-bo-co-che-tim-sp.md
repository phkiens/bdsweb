# Handoff 09 — Đồng bộ cơ chế tìm SP cho toàn bộ ô tìm bất động sản

**Phạm vi:** UI thuần + một lần tách hàm ở `PropertyFilter`. Không đụng Room, không đụng sync,
không migration.

**Nguyên tắc giao việc:** chỉ chỉ chỗ + mô tả thay đổi. Antigravity phải tự đọc code xác nhận
hiện trạng trước khi sửa. Nếu đọc thấy khác mô tả dưới đây thì **dừng lại báo**, đừng tự suy diễn.

**Điều kiện tiên quyết:** commit sạch trước khi bắt đầu, đừng để lẫn diff với việc đang dở.

---

## Bối cảnh

Toàn app hiện có **4 ô tìm SP**, dùng **3 cơ chế khác nhau**:

| # | Nơi | File:dòng | Cơ chế hiện tại |
|---|---|---|---|
| 1 | Danh sách SP | `ui/property/PropertyListScreen.kt:363` | `PropertyFilter.matches()` |
| 2 | Danh sách SP chờ | `ui/unverified/UnverifiedScreen.kt:334` | `PropertyFilter.matches()` (đã dùng chung, xem `UnverifiedViewModel.kt:247`) |
| 3 | Dialog "Thêm lịch sử xem nhà" (chi tiết KH) | `ui/customer/CustomerDetailViewScreen.kt:1252` | `contains()` thô trên `area`, `propertyType`, `direction` |
| 4 | Dialog "Chọn nhà sở hữu" (gắn SP sẵn có) | `ui/customer/CustomerDetailViewScreen.kt:1465` | `contains()` thô trên `area`, `description` |

Ngoài ra `ui/customer/CustomerScreen.kt:617` có dialog "Thêm lịch sử xem nhà" **bản thứ hai**
(đường vào cũ: thẻ khách → badge vai trò → bottom sheet → nút `+`), dùng `DropdownMenu` đổ
toàn bộ SP, **không có ô tìm nào**. Đây là việc 3 phía dưới.

**Mục tiêu:** tất cả các chỗ chọn/tìm SP đều dùng đúng một cơ chế — cơ chế của danh sách SP.

### Cơ chế của danh sách SP là gì (đọc kỹ trước khi sửa)

Nằm ở `ui/property/PropertyFilter.kt`, **bước 8** trong hàm `matches()` (khoảng dòng 57–101):

1. `trim()` query, đổi dấu `,` thành `.`
2. Đoán xem có phải **truy vấn giá** không: parse được thành `Double`, không phải SĐT
   (không bắt đầu bằng `0` mà dài ≥ 9 ký tự), và ≤ 5 chữ số.
   Nếu đúng → so khớp theo prefix chữ số của giá **và** theo giá trị có sai số
   (gõ `5` ra 5–6 tỷ, `5.5` ra 5.5–5.6, `550` hiểu là 0.55 tỷ…).
3. Nếu không phải giá → **từ khoá**: `contains(ignoreCase = true)` trên **5 trường**:
   `area`, `description`, `rawText`, `ownerName`, `ownerPhone`.

Lưu ý: cơ chế này **không bỏ dấu tiếng Việt** (gõ "go vap" không ra "Gò Vấp"). Đó là hạn chế
chung của cả 4 ô, **không nằm trong phạm vi handoff này** — đừng tự ý thêm `normalizeVietnamese`,
nó kéo theo chuyện cache chuỗi chuẩn hoá và migration, sẽ làm riêng.

---

## Việc 1 — Tách hàm `matchesQuery` khỏi `PropertyFilter.matches`

### Cần làm

File `app/src/main/java/com/example/ui/property/PropertyFilter.kt`.

Cắt **nguyên khối bước 8** (từ `val trimmedQuery = query.trim()` đến hết nhánh
`else { ... matchKeyword ... }`) ra thành một hàm public mới trong cùng `object PropertyFilter`:

```
fun matchesQuery(p: Property, query: String): Boolean
```

Yêu cầu bắt buộc:

- **Query rỗng/trắng phải trả `true`.** Trong `matches()` hiện tại, khối bước 8 nằm trong
  `if (trimmedQuery.isNotEmpty())` nên query rỗng đi thẳng xuống `return true`. Khi tách ra,
  hàm mới phải tự xử lý: `if (query.trim().isEmpty()) return true`. Sai chỗ này thì danh sách
  trống trơn khi chưa gõ gì.
- Bước 8 trong `matches()` thay bằng đúng một dòng gọi lại `matchesQuery(p, query)` và
  `return false` nếu không khớp. **Không sao chép logic ra hai nơi.**
- Giữ nguyên 100% logic bên trong, kể cả các hằng số `0.015`, `0.1`, `1.0`, ngưỡng `>= 100`,
  `>= 10`, và điều kiện đoán SĐT. Đây là refactor thuần, **không phải dịp để sửa logic giá**.

### Nghiệm thu việc 1

`./gradlew testDebugUnitTest --tests "com.example.ui.property.FilterPagingMultiSelectTest"`
phải xanh — test này đang đụng trực tiếp `PropertyFilter`.

Rồi mở app, màn danh sách SP: gõ `5` (ra SP giá 5–6 tỷ), gõ một tên khu vực, xoá trắng ô tìm
(phải hiện lại đủ danh sách). Hành vi phải **y hệt trước khi sửa**.

---

## Việc 2 — Hai dialog ở màn chi tiết Khách hàng dùng `matchesQuery`

File `app/src/main/java/com/example/ui/customer/CustomerDetailViewScreen.kt`.

Cần thêm import `com.example.ui.property.PropertyFilter` (khác package; đã có tiền lệ ở
`ui/unverified/UnverifiedViewModel.kt:24`).

### 2a — Dialog "Thêm lịch sử xem nhà" (khoảng dòng 1229–1441)

- Khối `filteredProps` (khoảng dòng 1235–1245): thay toàn bộ thân `remember` bằng
  lọc qua `PropertyFilter.matchesQuery(it, searchQuery)`. Giữ nguyên `remember(searchQuery, allProps)`.
- Placeholder ô tìm (khoảng dòng 1256) hiện là `"Tìm tên, khu vực, hướng..."` — đã sai
  ngay từ bây giờ (không hề tìm theo tên chủ). Sửa thành mô tả đúng phạm vi mới, ví dụ
  `"Tìm khu vực, mô tả, chủ, SĐT, giá..."`.

### 2b — Dialog "Chọn nhà sở hữu" / gắn SP sẵn có (khoảng dòng 1444–1650)

- Khối `filteredProps` (khoảng dòng 1450–1458): thay tương tự.
  Tiện thể bỏ dấu `?.` thừa ở `it.description` — `Property.description` là `String` non-null
  (`domain/model/Property.kt:20`), đang bị viết `it.description?.contains(...) == true`.
- Placeholder (khoảng dòng 1469) `"Tìm theo khu vực, mô tả..."` → sửa như 2a.

### Lưu ý chung cho việc 2

- **Không thêm debounce.** Danh sách lọc trong RAM, cỡ vài trăm SP, lọc mỗi lần gõ là bình thường.
  Danh sách SP có debounce vì nó gắn với phân trang, dialog thì không.
- Nguồn dữ liệu `viewModel.allProperties` là `getAllPropertiesFlow()`, DAO đã lọc sẵn
  `isDeleted = 0 AND isVerified = 1` (`data/local/dao/PropertyDao.kt:17`) — cùng tập với danh sách SP.
  **Không cần** lọc thêm gì, và **không được** đổi sang nguồn khác.
- Nút "Chọn tất cả" ở 2b (khoảng dòng 1488–1498) đang thao tác trên `filteredProps` — giữ nguyên
  hành vi đó (chọn tất cả trong kết quả tìm, không phải toàn bộ SP).

### Nghiệm thu việc 2

Mở chi tiết một khách hàng:

1. Mục "Lịch sử xem nhà" → `+` → gõ **tên chủ nhà** của một SP bất kỳ → SP đó phải hiện ra
   (trước khi sửa thì **không** ra — đây là bằng chứng cơ chế mới đã áp).
2. Cũng ô đó, gõ **số giá** ví dụ `5` → chỉ còn SP giá 5–6 tỷ.
3. Nút gắn SP sở hữu → lặp lại 2 phép thử trên.
4. Xoá trắng ô tìm ở cả hai dialog → hiện lại đủ danh sách.

---

## Việc 3 — Dialog "Thêm lịch sử xem nhà" bản cũ ở màn danh sách KH

**K đã chốt: giữ cả hai dialog, không gộp, không xoá.** Việc này chỉ là bổ sung ô tìm cho bản cũ.

File `app/src/main/java/com/example/ui/customer/CustomerScreen.kt`, dialog khoảng dòng 617–700
(mở từ nút `+` ở bottom sheet, dòng 522).

### Cần làm

Hiện chỗ chọn SP là `OutlinedTextField` readOnly + `DropdownMenu` đổ thẳng `allProps.forEach`
(khoảng dòng 629–668). Với vài trăm SP thì không dùng được.

Thay cụm dropdown đó bằng **đúng cấu trúc của dialog ở `CustomerDetailViewScreen.kt:1229`**:

- một `AppTextField` làm ô tìm, `leadingIcon = Icons.Default.Search`, `singleLine = true`
- một `val filteredProps = remember(searchQuery, allProps) { allProps.filter { PropertyFilter.matchesQuery(it, searchQuery) } }`
- một `Box(Modifier.heightIn(max = 240.dp))` bọc `LazyColumn` các thẻ SP bấm chọn được,
  thẻ đang chọn đổi màu / có icon `CheckCircle`
- nhánh rỗng: `Text("Không tìm thấy BĐS nào")`

Giữ nguyên phần dưới của dialog: ô `viewLinkNote`, nút Lưu gọi `viewModel.addViewedProperty(...)`
với `selectedOwner!!.id`, và phần reset state khi đóng.

**Không đổi** điều kiện hiển thị bottom sheet ở dòng 488
(`selectedOwner != null && viewingCustomerDetail == null`) — vế thứ hai là để chặn sheet cũ
đè lên màn chi tiết, bỏ đi là hỏng.

### Nghiệm thu việc 3

Màn danh sách Khách hàng → bấm badge vai trò trên một thẻ khách → bottom sheet mở →
nút `+` → dialog phải có ô tìm, gõ tên chủ / số giá lọc đúng như việc 2. Chọn 1 SP, ghi chú,
Lưu → sheet phải hiện thêm dòng lịch sử xem nhà vừa thêm.

---

## Nghiệm thu tổng

1. `./gradlew testDebugUnitTest` — toàn bộ phải xanh (không chỉ 1 class).
2. `./gradlew installDebug`, chạy 4 phép thử "gõ tên chủ" ở cả 4 ô tìm SP
   (danh sách SP, danh sách SP chờ, 2 dialog ở chi tiết KH) + dialog ở việc 3.
   Kết quả phải **nhất quán**: cùng một từ khoá cho ra cùng tập SP.
3. Xác nhận danh sách SP và SP chờ **không đổi hành vi** so với trước (đây là chỗ dễ hỏng nhất,
   vì việc 1 động vào hàm chúng đang dùng).

## Lưu ý về encoding

Antigravity có tiền sử ghi file `.kt` lẫn null byte và cắt ký tự em-dash trong `.md`.
Sau khi nó sửa xong, kiểm byte trước khi review.

**Không dùng `grep -c $'\000'`** — bash không nhét được NUL vào chuỗi nên `$'\000'` thành chuỗi
rỗng, grep khớp mọi dòng, kết quả luôn khác 0 và **không chứng minh được gì**. Dùng:

```
grep -c -P '\x00' <file>.kt      # phải ra 0
```

hoặc chắc ăn hơn: `python3 -c "print(open('<file>.kt','rb').read().count(b'\x00'))"`.

Nếu có NUL, cứu bằng `tr -d '\000'`.

Kiểm luôn line ending: `CustomerScreen.kt` vốn là **CRLF**, các file còn lại là **LF**.
Nếu file bị lật kiểu xuống dòng thì diff phình toàn bộ file, review không nhìn ra thay đổi thật.

## Nhắc chốt

- Antigravity phải **tự đọc code xác nhận** từng mô tả ở trên là đúng rồi mới sửa.
  Các số dòng trong tài liệu này là mốc tham chiếu, không phải chân lý.
- **Không** tự ý thêm `normalizeVietnamese` / bỏ dấu.
- **Không** tự ý gộp hay xoá dialog trùng ở việc 3.
- **Không** sửa logic đoán giá trong `matchesQuery` khi tách hàm.
