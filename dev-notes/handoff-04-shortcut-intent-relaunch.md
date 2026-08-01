# Handoff 04 — Intent khởi động bị xử lý lại mỗi lần Activity dựng lại

**Trạng thái:** chưa code. Chỉ sửa 1 file: `app/src/main/java/com/example/MainActivity.kt`.

> ⚠️ **GIẢ ĐỊNH CHƯA KIỂM CHỨNG — đọc trước khi làm.**
> Toàn bộ phân tích dưới đây chỉ đúng nếu người dùng **mở app bằng shortcut trên launcher**
> (giữ icon → "Thêm SP"). Điều này CHƯA được xác nhận.
> Đã rà: `navigate("property_add")` chỉ có 2 nguồn — shortcut (dòng 181) và nút FAB (dòng 292).
> `PropertyListScreen` không có `LaunchedEffect` nào tự gọi `onNavigateToAdd`.
> ⇒ **Nếu người dùng vào form bằng FAB thì không có đường nào trong code nhân đôi được form,
> và handoff này vô giá trị.** Xác nhận cách mở app TRƯỚC khi viết code.

## Triệu chứng người dùng

- Mở app bằng **shortcut launcher** (giữ icon → "Thêm SP") → nhập text vào form → thoát sang app khác → quay lại → **form trống trơn**. Ấn Back thì text cũ hiện lại nguyên vẹn.
- Nếu mở app bằng shortcut **"Kiểm tra trùng"** thì nặng hơn: form biến mất hẳn, ấn Back không lấy lại được.
- Mở app bằng **icon thường** thì không bị.

## Gốc lỗi

`MainActivity.onCreate` xử lý intent khởi động mà **không phân biệt "tạo mới" với "dựng lại"**:

| Dòng | Code | Hậu quả khi Activity dựng lại |
|---|---|---|
| 116 | `handleShortcutIntent(intent)` | `navigate("property_add")` lần 2 → **đẩy form rỗng chồng lên form đang nhập** |
| 121-124 | đọc `EXTRA_TEXT` từ `ACTION_SEND` | `navigate("unverified_list")` lần 2 |
| 149 | đọc `filter_view_today` | `navigate("property_list")` lần 2 |

Ba chỗ này cùng một lỗi, chỉ khác đường vào.

Đoạn dọn `intent?.action = null` ở dòng 170/179/184 **chỉ chặn được một nửa số ca** — đây là điểm dễ hiểu sai nhất của bug này:

| Kiểu dựng lại | Process | Intent lấy từ đâu | `action = null` có tác dụng? | Bug xảy ra? |
|---|---|---|---|---|
| Xoay màn hình, "Không giữ hoạt động" | **còn sống** | `ActivityClientRecord.intent` — **cùng object đã bị mutate** | Có | **Không** |
| Process bị hệ thống thu hồi khi ở nền | **đã chết** | unparcel lại từ `ActivityRecord` bên `system_server` — bản copy chưa bao giờ bị mutate | Không | **Có** |

⇒ Bug **chỉ tái hiện khi process chết thật**. Bật "Không giữ hoạt động" sẽ KHÔNG tái hiện được, dễ khiến người sửa tưởng đã hết lỗi.

Riêng nhánh `CHECK_DUPLICATE` (dòng 173-176) còn kèm `popUpTo(inclusive = true)` → **quét sạch back stack**, nên biểu hiện là mất hẳn form chứ không phải chồng lên.

Quan trọng: **bug xảy ra kể cả khi chưa nhập gì**, chỉ là vô hình vì form rỗng chồng form rỗng thì không phân biệt được. Đừng dùng "có text hay không" làm tiêu chí nghiệm thu.

## Diff

### 1. Guard cho toàn bộ intent khởi động — `onCreate`, dòng 112-124

```diff
     override fun onCreate(savedInstanceState: Bundle?) {
         installSplashScreen()
         super.onCreate(savedInstanceState)
         enableEdgeToEdge()
-        handleShortcutIntent(intent)
-
-
-        // Handle Share Intent inputs from outside (e.g. Zalo / FB)
-        var sharedTextFromIntent: String? = null
-        if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
-            sharedTextFromIntent = intent.getStringExtra(Intent.EXTRA_TEXT)
-            Log.d(TAG, "Received share text intent: $sharedTextFromIntent")
-        }
+
+        // savedInstanceState != null  ⇔  Activity đang được DỰNG LẠI, không phải mở mới.
+        // Lúc đó NavHost sẽ tự khôi phục back stack cũ, nên tuyệt đối không được
+        // điều hướng lại theo intent — nếu không sẽ chồng thêm một màn hình rỗng
+        // lên trên màn hình người dùng đang nhập dở.
+        val isFreshLaunch = savedInstanceState == null
+
+        var sharedTextFromIntent: String? = null
+        if (isFreshLaunch) {
+            handleShortcutIntent(intent)
+
+            // Handle Share Intent inputs from outside (e.g. Zalo / FB)
+            if (intent?.action == Intent.ACTION_SEND && intent.type == "text/plain") {
+                sharedTextFromIntent = intent.getStringExtra(Intent.EXTRA_TEXT)
+                Log.d(TAG, "Received share text intent: $sharedTextFromIntent")
+            }
+        }
```

### 2. Cờ `filter_view_today` — dòng 148-149

```diff
                 // Check and parse deep links or notification intent flags
-                val checkFilterToday = intent?.getBooleanExtra("filter_view_today", false) ?: false
+                val checkFilterToday = isFreshLaunch &&
+                    (intent?.getBooleanExtra("filter_view_today", false) ?: false)
```

### 3. Xoá 3 dòng dọn intent đã thành thừa — dòng 170, 179, 184

```diff
                         "com.aistudio.bdscollector.vskwzh.action.CHECK_DUPLICATE" -> {
-                            if (intent?.action == shortcutAction) intent?.action = null
                             pendingShortcutAction.value = null
```

(làm y hệt cho hai nhánh `ADD_PROPERTY` và `ADD_UNVERIFIED`)

Lý do xoá: sau khi có guard ở `onCreate` thì nó thành thừa. Nhưng **đừng xoá trước khi guard đã vào** — hiện tại nó đang chặn được nhánh "process còn sống" (xem bảng ở phần Gốc lỗi). Xoá trước là mở rộng vùng lỗi.

### 4. `onNewIntent` — KHÔNG sửa

Dòng 592-598 đã đúng sẵn: có `setIntent(intent)` + `handleShortcutIntent(intent)`. Đừng đụng vào.

## Lưu ý

1. **Đừng thay `savedInstanceState == null` bằng cờ trong `intent`.** Đó chính là cách hiện tại và nó sai. Cũng đừng dùng biến thành viên của Activity — Activity mới là instance mới, biến đó reset. Chỉ có `savedInstanceState` mới phân biệt được "mở mới" và "dựng lại".

2. **Đừng dùng `rememberSaveable` trong `setContent` để làm cờ này.** Nó nằm trong cùng bundle với back stack; khi bundle mất thì cờ cũng mất, quay lại đúng lỗi cũ. Guard phải ở `onCreate`.

3. **Trường hợp task bị hệ thống thu hồi hoàn toàn** (mở lại từ recents sau khi bị kill sâu): `savedInstanceState` sẽ là `null` và shortcut bắn lại. Đây là **hành vi đúng** — lúc đó back stack cũng không còn, không có gì để chồng lên.

4. **Bấm shortcut khi app đang chạy** đi qua `onNewIntent` → `setIntent` → intent mới được lưu. Guard ở `onCreate` không ảnh hưởng luồng này. Nhưng hệ quả: intent shortcut đó giờ nằm trong task record, nên nếu sau đó Activity dựng lại thì guard mới là thứ chặn nó bắn lần nữa. Nhớ test cả kịch bản này.

5. **`pendingShortcutAction` phải giữ nguyên là `MutableStateFlow` + `LaunchedEffect`**, đừng gọi `navigate` thẳng trong `onCreate` — lúc đó `navController` chưa tồn tại.

6. Sửa xong nhớ cập nhật `CLAUDE.md` nếu có mô tả luồng shortcut.

## Nghiệm thu

**KHÔNG dùng "Không giữ hoạt động" cho bug này** — chế độ đó giữ nguyên process nên không tái hiện được (xem bảng ở phần Gốc lỗi). Phải ép **process chết thật**:

```
# đang mở form, đã nhập text, đã chuyển sang app khác:
adb shell am kill com.aistudio.bdscollector.vskwzh
# rồi mở lại app TỪ RECENTS (không phải từ icon)
```

Hoặc bấm nút **Terminate Application** trong Android Studio. (Nhớ gọi adb bằng full path: `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"`.)

Chạy đủ 5 ca, mỗi ca đều: mở → nhập vài chữ vào ô Khu vực → chuyển sang app khác → kill process → mở lại từ recents.

| # | Cách mở app | Kỳ vọng sau khi quay lại |
|---|---|---|
| 1 | Shortcut "Thêm SP" | Text còn nguyên. Ấn Back → về thẳng danh sách SP (chỉ 1 lần Back) |
| 2 | Shortcut "Thêm SP chờ" | Như trên |
| 3 | Shortcut "Kiểm tra trùng" → rồi mở form thêm SP | Form còn nguyên, không bị đá về danh sách |
| 4 | Icon thường → FAB thêm SP | Text còn nguyên (ca đối chứng, trước khi sửa vốn đã đúng) |
| 5 | Chia sẻ text từ Zalo/FB vào app | Vào màn SP chờ **đúng một lần**, quay lại không bị đẩy vào lần nữa |

**Tiêu chí then chốt của ca 1-2:** ấn Back **một lần** phải ra khỏi form. Nếu phải ấn hai lần mới thoát → vẫn còn 2 entry chồng nhau → chưa sửa được.

Ca 6 (không cần bật "Không giữ hoạt động"): xoay ngang màn hình khi đang nhập dở ở form — cũng là một dạng dựng lại Activity, không được nhân đôi màn hình.
