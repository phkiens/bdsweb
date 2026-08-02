# Công cụ Quản lý Activation (Admin API & Backup SQL)

Thư mục này chứa các công cụ dùng trên máy quản trị để tạo, theo dõi và thu hồi mã mời kích hoạt hoặc thiết bị trực tiếp qua Activation Admin API.

## 1. Cách sử dụng chính (Menu BAT trực tiếp với Admin API)

1. Mở thư mục `tools\activation`.
2. Bấm đúp file **`Activation-Menu.bat`**.
3. Công cụ tự động kết nối Activation Admin API sử dụng:
   - File `.env` chứa URL Edge Function và Publishable Key.
   - Admin token mã hoá Windows DPAPI lưu tại:
     `%USERPROFILE%\Documents\bds-activation-admin\admin-token.dpapi`
4. Chọn chức năng tương ứng:
   - **`1. Tao ma moi`**: Nhập tên/label, số thiết bị (mặc định 1), số ngày hiệu lực (mặc định 7). Mã gốc được server tạo và tự động chép vào clipboard.
   - **`2. Xem danh sach ma`**: Hiển thị danh sách mã mời, trạng thái (CO THE SU DUNG, DA DUNG DU, HET HAN, DA THU HOI), số lượng thiết bị kích hoạt và lần xác minh gần nhất.
   - **`3. Thu hoi ma moi`**: Chọn mã cần thu hồi từ danh sách và xác nhận.
   - **`4. Xem thiet bi cua ma`**: Chọn mã mời để xem danh sách các thiết bị đã kích hoạt từ mã đó.
   - **`5. Thu hoi thiet bi`**: Chọn mã và thiết bị ACTIVE cần thu hồi.

### Lưu ý quan trọng về Security & Workflow:
- Admin token được giải mã an toàn trong bộ nhớ (SecureString + BSTR) chỉ khi gửi HTTP request và lập tức giải phóng memory trong `finally`.
- Mã gốc chỉ xuất hiện duy nhất 1 lần khi vừa tạo. Database chỉ lưu SHA-256 hash của mã mời.
- Menu chính làm việc trực tiếp với Admin API; **không còn cần thao tác copy SQL vào Supabase SQL Editor trong luồng chính**.

---

## 2. Hướng dẫn dòng lệnh SQL Dự phòng (Emergency SQL Fallback)

Chỉ sử dụng các script dưới đây khi Admin API không khả dụng và bạn cần tạo SQL dán thủ công vào Supabase SQL Editor.

### Tạo mã mời thủ công (`New-AppInvite.ps1`)
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\activation\New-AppInvite.ps1 -Label "khach-a" -MaxActivations 1 -ExpiresInDays 7
```

Tuỳ chọn chép mã vào clipboard:
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\activation\New-AppInvite.ps1 -Label "khach-b" -CopyCode
```

### Thu hồi mã mời thủ công (`Disable-AppInvite.ps1`)
```powershell
powershell -ExecutionPolicy Bypass -File .\tools\activation\Disable-AppInvite.ps1 -Id "<uuid>"
```
