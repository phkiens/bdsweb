# Ghi DB đã dedup (bds_fixed.db) ngược vào máy Android

## Bối cảnh
`bds_fixed.db` = bản DB local đã dedup: customer 402 → 66 (còn 0 nhóm trùng, 0 link mồ côi, integrity_check OK, đã merge WAL). Giữ nguyên toàn bộ property + ảnh + link. Supabase cũng đã về 66 sạch.

Việc còn lại: thay file DB trong máy bằng `bds_fixed.db`.

## ⚠️ RỦI RO — đọc trước
- Nếu app đang chạy hoặc còn file `-wal`/`-shm` cũ trong máy, chúng sẽ merge đè lên → hỏng. PHẢI force-stop + xóa wal/shm cũ TRƯỚC khi ghi.
- Đã có sẵn backup: file gốc `bds_collector_database.db` (402 khách) vẫn nằm trong folder — nếu sai, khôi phục được.

## Các lệnh (chạy trong PowerShell, cẩn thận từng dòng)

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
$pkg = "com.aistudio.bdscollector.vskwzh"

# 1) TẮT HẲN app (force-stop) để không ai ghi vào DB
& $adb shell am force-stop $pkg

# 2) Đẩy file đã dedup lên vùng tạm của máy
& $adb push bds_fixed.db /data/local/tmp/bds_fixed.db

# 3) XÓA wal/shm CŨ trong app (nếu còn) để chúng không merge đè
& $adb shell "run-as $pkg rm -f databases/bds_collector_database.db-wal databases/bds_collector_database.db-shm"

# 4) Ghi đè file DB chính bằng bản đã dedup
& $adb shell "run-as $pkg cp /data/local/tmp/bds_fixed.db databases/bds_collector_database"

# 5) Dọn file tạm
& $adb shell rm /data/local/tmp/bds_fixed.db
```

## Sau khi ghi xong — KIỂM
1. Mở app → vào màn Khách hàng → phải thấy **~66 khách**, không còn tên trùng lặp l1 cạnh nhau.
2. Kiểm property + ảnh vẫn còn nguyên (không mất).
3. Nếu muốn chắc bằng số: pull lại DB (cách cũ: cp ra /sdcard rồi adb pull) rồi báo Claude đếm lại.

## Nếu SAI (muốn quay lại 402)
File gốc còn trong folder tên `bds_collector_database.db`. Push lại y hệt các bước trên nhưng thay `bds_fixed.db` bằng file gốc đó.

## Lưu ý về sync sau đó
- Sau khi mở app, 66 khách local đã khớp 66 trên Supabase (cùng id) → sync KHÔNG đẻ lại.
- Code client đã vá (GĐ2) nên từ giờ thêm/sửa property không đẻ khách trùng nữa.
- catchUp chỉ upsert, không xóa — nên nó KHÔNG kéo ngược 402 về. An toàn.
