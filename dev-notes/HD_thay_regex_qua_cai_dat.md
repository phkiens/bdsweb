# Hướng dẫn: nút "Thay bộ regex" trong Cài đặt (nhờ AI sửa, có check)

Mục tiêu: chỉnh/nâng cấp regex bóc tách **không cần build lại app**. Cơ chế: lấy đúng bộ regex hiện tại trong code làm mẫu → nhờ AI thêm/bớt trên đó → dán lại vào 1 nút trong Cài đặt → app kiểm tra + chạy thử → áp dụng.

## Bộ regex hiện tại (nguồn trong `domain/usecase/ai/PropertyTextExtractor.kt`)

5 pattern khai báo đầu file:

| Tên trong code | Trường | Pattern hiện tại |
|---|---|---|
| `REGEX_PHONE` | SĐT | `\b0[35789](?:[.\s-]*\d){8}\b` |
| `REGEX_AREA` | Diện tích | `(\d+(?:[.,]\d+)?)\s*(m2|m²)` |
| `REGEX_PRICE` | Giá | `(\d+(?:[.,]\d+)?)\s*(tỷ|ty|triệu|tr)` |
| `MAP_LINK_PATTERN` | Link Maps | `(https?://\S*maps\S*|https?://goo\.gl/\S*)` |
| `COMBINING_MARKS_PATTERN` | (nội bộ, khử dấu) | `\p{InCombiningDiacriticalMarks}+` |

**Khuôn để dán (JSON)** — chính là bộ trên viết lại thành JSON. Đây là thứ AI sẽ sửa và bạn dán vào app:

```json
{
  "REGEX_PHONE": "\\b0[35789](?:[.\\s-]*\\d){8}\\b",
  "REGEX_AREA": "(\\d+(?:[.,]\\d+)?)\\s*(m2|m²)",
  "REGEX_PRICE": "(\\d+(?:[.,]\\d+)?)\\s*(tỷ|ty|triệu|tr)",
  "MAP_LINK_PATTERN": "(https?://\\S*maps\\S*|https?://goo\\.gl/\\S*)"
}
```

(Không đưa `COMBINING_MARKS_PATTERN` cho sửa — nó là khử dấu nội bộ, đổi là hỏng tìm kiếm địa chỉ.)

## Cách dùng (luồng người dùng)

1. Trong Cài đặt, mục **"Bộ regex bóc tách"**, có nút **"Xem bộ hiện tại"** → copy cục JSON đang chạy.
2. Đưa cục JSON đó cho AI kèm vài tin mẫu, nhờ: *"sửa regex trong JSON này để bắt đúng các mẫu sau, giữ nguyên tên khoá và định dạng JSON"*.
3. Copy JSON AI trả về → bấm **"Thay bộ regex"** → dán vào.
4. Bấm **"Kiểm tra"** → app parse + compile. Lỗi thì báo đỏ, **không nhận**.
5. Dán 1 tin thật vào ô **"Tin mẫu"** → bấm **"Chạy thử"** → app hiện bộ mới bắt ra gì (giá/diện tích/SĐT…).
6. Đúng ý → **"Áp dụng"** (lưu vào `SettingsManager`). Sai → sửa tiếp hoặc **"Khôi phục mặc định"**.

## Các bước code

### A. Tách pattern ra khỏi hardcode, cho đọc từ SettingsManager
- Trong `PropertyTextExtractor`, đổi 4 pattern (`REGEX_PHONE`, `REGEX_AREA`, `REGEX_PRICE`, `MAP_LINK_PATTERN`) từ `val` cứng sang **đọc từ `SettingsManager`**, ô nào trống thì dùng hằng mặc định (chính các chuỗi bảng trên).
- Vì `PropertyTextExtractor` đang là `object` thuần (không có DI), cần truyền bộ regex vào `parseWithRegex(...)` từ ngoài (ViewModel lấy từ `SettingsManager` rồi truyền xuống), HOẶC đổi cách khởi tạo để nó nhận `SettingsManager`. Chọn cách truyền tham số cho nhẹ, ít phá cấu trúc.
- `COMBINING_MARKS_PATTERN` **giữ nguyên hardcode**.

### B. Lưu trong SettingsManager
- Lưu **nguyên cục JSON** (1 khoá, vd `custom_extraction_regex`) trong prefs thường (không cần mã hoá — regex không nhạy cảm).
- Trống = chưa cấu hình = dùng mặc định.

### C. Màn Cài đặt
- Nút **"Xem bộ hiện tại"**: hiện JSON đang dùng (custom nếu có, không thì mặc định) để copy.
- Nút **"Thay bộ regex"**: ô dán JSON + "Kiểm tra" + ô "Tin mẫu" + "Chạy thử" + "Áp dụng" + "Khôi phục mặc định".
- "Chạy thử" gọi thẳng `PropertyTextExtractor.parseWithRegex(tinMau, ...)` với bộ vừa dán, hiển thị kết quả từng trường.

## LƯU Ý (đọc kỹ trước khi làm)

1. **Compile an toàn — không để sập.** Mỗi pattern bọc `try/catch` quanh `Pattern.compile`. Pattern lỗi cú pháp → báo đỏ tại "Kiểm tra", **giữ nguyên bộ đang chạy**, KHÔNG nạp nửa vời (nửa mới nửa cũ).

2. **GIÁ không chỉ là regex.** Ở `PropertyTextExtractor` dòng ~39–44 có LOGIC đổi đơn vị: nếu đơn vị bắt được chứa "triệu"/"tr" thì **chia 1000** (quy về tỷ). Nếu AI đổi `REGEX_PRICE` mà thêm/bớt nhóm bắt đơn vị (group 2), hoặc thêm đơn vị mới (vd "nghìn"), thì **logic chia đơn vị này KHÔNG tự hiểu** → giá sai âm thầm. → Khi sửa REGEX_PRICE phải giữ đúng cấu trúc 2 group: group(1) = số, group(2) = đơn vị; và chỉ dùng các đơn vị mà logic đã xử (tỷ/ty/triệu/tr). Muốn thêm đơn vị mới thì phải sửa CẢ code, không chỉ regex → việc đó vẫn cần build lại.

3. **DIỆN TÍCH cũng có hậu xử lý:** `group(1)` được `.replace(",", ".")` rồi `toDoubleOrNull()` (dòng 30). Regex mới phải giữ **group(1) là phần số**, nếu không sẽ ra null.

4. **SĐT:** kết quả đi qua `normalizeVietnamesePhone()` (dòng 24). Regex mới cứ bắt được chuỗi số là được, chuẩn hoá đã có hàm lo.

5. **Escape trong JSON.** Trong JSON, dấu `\` phải viết `\\`. Bộ hiện tại đã escape sẵn ở khuôn trên. Nhắc AI: "trả JSON hợp lệ, escape dấu gạch chéo ngược".

6. **`CoordinateExtractor` (toạ độ) KHÔNG externalize.** Toạ độ ít đổi, sai regex toạ độ bắt nhầm số âm thầm. Để yên trong code.

7. **`matchAddress` không dùng regex** — nó dò theo `knownAreas` (danh sách khu vực đã có trong DB), không phải pattern. Không đưa vào bộ thay được, và không cần.

8. **Chỉ áp cho máy đó.** Regex trong Cài đặt lưu local → mỗi máy tự cấu hình, không tự đồng bộ sang máy khác. Nếu sau này cần đồng bộ đa thiết bị mới tính đẩy lên Supabase (đợt khác).

## Kiểm thử

1. Chưa cấu hình gì → bóc tách chạy y như cũ (dùng mặc định).
2. Dán JSON hợp lệ có sửa 1 pattern → "Chạy thử" tin mẫu ra đúng → "Áp dụng" → bóc tin thật thấy đổi theo.
3. Dán JSON **sai cú pháp** (thiếu ngoặc / regex hỏng) → "Kiểm tra" báo đỏ, bộ cũ vẫn nguyên, bóc tách không sập.
4. Sửa `REGEX_PRICE` giữ 2 group, tin "3 tỷ" → 3.0; tin "500 triệu" → 0.5 (kiểm tra logic chia 1000 vẫn đúng).
5. "Khôi phục mặc định" → về đúng bộ gốc.
6. `./gradlew assembleDebug` + installDebug → thao tác thật → pull DB kiểm giá/diện tích/SĐT vào đúng.
