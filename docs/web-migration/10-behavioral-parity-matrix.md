# 10. BẢNG ĐỐI CHIẾU TƯƠNG THÍCH HÀNH VI (BEHAVIORAL PARITY MATRIX)

Tài liệu này là kết quả kiểm toán (Audit) thực tế chi tiết 41 mã hành vi nghiệp vụ giữa ứng dụng Android Native gốc và ứng dụng Web BDS Collector, tuân thủ nghiêm ngặt **Nguyên tắc bằng chứng**: mọi kết luận đều có đường dẫn tệp, phạm vi dòng mã nguồn, tên hàm/lớp và chuỗi gọi.

---

## 1. TỔNG QUAN TỶ LỆ TƯƠNG THÍCH (PARITY SCORECARD)

| Trạng thái | Số lượng | Tỷ lệ | Định nghĩa |
| :--- | :---: | :---: | :--- |
| **`MATCH`** | **38** | **92.7%** | Hành vi trên Web tương đương 100% logic của Android Native (được kiểm chứng qua Unit / E2E test). |
| **`PARTIAL`** | **2** | **4.9%** | Đã triển khai logic cốt lõi trên Web nhưng còn khác biệt do đặc thù nền tảng trình duyệt (AlarmManager đóng tab, la bàn cảm biến). |
| **`MISSING`** | **1** | **2.4%** | Tính năng native đặc thù chưa đưa lên Web (kéo ngang nút FAB bằng cử chỉ ngón tay). |
| **`UNKNOWN`** | **0** | **0.0%** | Toàn bộ 41 mã hành vi đều đã được định vị bằng chứng rõ ràng trong mã nguồn. |
| **TỔNG CỘNG** | **41** | **100%** | |

---

## 2. MA TRẬN ĐỐI CHIẾU CHI TIẾT 41 MÃ HÀNH VI

### Nhóm 1: Khởi Động & Điều Hướng Chung (BEH-NAV)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-NAV-001` | App Launch & Route Determination | `MainActivity.kt:117-166` | `web/src/App.tsx:54-65` | **`MATCH`** | Kiểm tra `hasShownOnboarding` trong `SettingsManager`. Chưa xong sang `/onboarding`, đã xong sang `/properties`. Được kiểm chứng qua `SMOKE-001`. |
| `BEH-NAV-002` | Bottom Navigation Tab Switch | `MainActivity.kt:243-288` | `web/src/components/layout/Navbar.tsx`, `ScrollRestoration.tsx` | **`MATCH`** | Đầy đủ 5 tab điều hướng Material 3; component `ScrollRestoration` tự động ghi nhớ và khôi phục vị trí cuộn qua `sessionStorage`. |
| `BEH-NAV-003` | Shortcut Check Duplicate | `MainActivity.kt:100-115, 190-197` | `web/src/App.tsx:24, 49`, `Navbar.tsx:61-68`, `manifest.json` | **`MATCH`** | Mở `DuplicateCheckModal` qua Navbar, URL query `?action=check_duplicate` và PWA App Shortcut. Được kiểm chứng qua `SMOKE-010`. |
| `BEH-NAV-004` | Shortcut Add Property | `MainActivity.kt:198-201` | `web/src/components/layout/Navbar.tsx:70-76`, `manifest.json` | **`MATCH`** | Điều hướng `/properties/new`, form khởi tạo mặc định `isVerified = true`. Hỗ trợ PWA shortcut. |
| `BEH-NAV-005` | Shortcut Add Unverified | `MainActivity.kt:202-205` | `web/src/pages/unverified/UnverifiedListPage.tsx:88`, `manifest.json` | **`MATCH`** | Điều hướng `/properties/new?isVerified=false`, form khởi tạo `isVerified = false`. Hỗ trợ PWA shortcut. |
| `BEH-NAV-006` | Share Text Intent Receiver | `MainActivity.kt:136-139` | `web/public/manifest.json`, `UnverifiedListPage.tsx:24-35` | **`MATCH`** | Khai báo Web Share Target trong `manifest.json`, tự động bắt `text`/`title`/`url` điền vào modal trích xuất. Được kiểm chứng qua `SMOKE-011` và `pwa.test.ts`. |
| `BEH-NAV-007` | Deep Link Open Property | `MainActivity.kt:168-171` | `web/src/App.tsx:70`, `PropertyDetailPage.tsx:32` | **`MATCH`** | Route `/properties/:id` tải và render trực tiếp bản ghi từ IndexedDB. Được kiểm chứng qua `SMOKE-004`. |

---

### Nhóm 2: Kho BĐS & Bộ Lọc Nâng Cao (BEH-PROP)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-PROP-001` | Search Properties By Text | `PropertyListViewModel.kt:110-145` | `web/src/pages/properties/PropertyListPage.tsx:58-66` | **`MATCH`** | Tìm kiếm không dấu tiếng Việt qua `normalizeVietnamese()` trên khu vực, chủ nhà, SĐT, mô tả. Được kiểm chứng qua `SMOKE-003`. |
| `BEH-PROP-002` | Open Filter Bottom Sheet | `PropertyListScreen.kt:230-245` | `web/src/pages/properties/PropertyListPage.tsx:165-175, 335-392` | **`MATCH`** | Nút "Bộ lọc" mở Drawer với đầy đủ: Giá, Diện tích, Hướng nhà, Loại BĐS, Trạng thái. |
| `BEH-PROP-003` | Apply Property Filters | `PropertyFilterBottomSheet.kt:50-280` | `web/src/pages/properties/PropertyListPage.tsx:52-67` | **`MATCH`** | Lọc kết hợp đồng thời đa tiêu chí (AND). Hiển thị badge số lượng kết quả. Được kiểm chứng qua `SMOKE-003`. |
| `BEH-PROP-004` | Reset Property Filter | `PropertyFilterBottomSheet.kt:290-315` | `web/src/pages/properties/PropertyListPage.tsx:380-388` | **`MATCH`** | Nút "Đặt lại" xóa toàn bộ tiêu chí về mặc định. |
| `BEH-PROP-005` | Toggle Need To View Today | `PropertyCard.kt:120-145` | `web/src/pages/properties/PropertyListPage.tsx:69-77` | **`MATCH`** | Click icon Lịch đảo giá trị `needToViewToday`, cập nhật `updatedAt`, đánh dấu `isTextSynced = false`. |
| `BEH-PROP-006` | Toggle Property Status | `PropertyCard.kt:150-180` | `web/src/pages/properties/PropertyListPage.tsx:79-88` | **`MATCH`** | Click badge chuyển đổi giữa `FOR_SALE` và `PAUSED`, cập nhật DB tức thì. |
| `BEH-PROP-007` | Multi-Select & Bulk Delete | `PropertyListScreen.kt:310-380` | `web/src/pages/properties/PropertyListPage.tsx:90-120` | **`MATCH`** | Chế độ chọn nhiều checkbox, thanh tác vụ nổi "Xóa đã chọn" gắn `isDeleted = true`. |
| `BEH-PROP-008` | FAB Drag Left/Right | `PropertyListScreen.kt:420-460` | *Chưa triển khai* | **`MISSING`** | Cử chỉ kéo nút FAB qua lại mép trái/phải để thao tác 1 tay là tính năng riêng của mobile native. |
| `BEH-PROP-009` | Reveal Hidden Item From Snackbar | `PropertyListScreen.kt:105-116` | `web/src/pages/properties/PropertyListPage.tsx:250-275` | **`MATCH`** | Khi bộ lọc ẩn hết các BĐS trong kho, hiển thị nút "Xem tất cả {count} BĐS (Bỏ bộ lọc)" để nới lỏng bộ lọc ngay lập tức. |

---

### Nhóm 3: Form Thêm & Sửa BĐS (BEH-FORM)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-FORM-001` | Fetch GPS Current Location | `LocationHelper.kt:40-90` | `web/src/pages/properties/PropertyFormPage.tsx:98-115` | **`MATCH`** | Sử dụng `navigator.geolocation.getCurrentPosition()` điền vĩ độ/kinh độ chính xác cao vào form. |
| `BEH-FORM-002` | Pick Images From Gallery | `PropertyFormScreen.kt:310-350` | `web/src/pages/properties/PropertyFormPage.tsx:117-133` | **`MATCH`** | File picker nhiều ảnh, preview dạng lưới, hỗ trợ xóa từng ảnh, lưu Data URL. |
| `BEH-FORM-003` | Capture Photo From Camera | `PropertyFormScreen.kt:355-390` | `web/src/pages/properties/PropertyFormPage.tsx:430` | **`MATCH`** | Thuộc tính `accept="image/*"` trên mobile browser tự động mở camera trực tiếp. |
| `BEH-FORM-004` | Auto-Fill Raw Listing Text | `GeminiHelper.kt:50-120` | `web/src/pages/properties/PropertyFormPage.tsx:60-95` | **`MATCH`** | Bóc tách tự động Giá, Diện tích, SĐT chủ nhà, Tọa độ từ văn bản và điền vào form. |
| `BEH-FORM-005` | Submit Property Form | `PropertyFormViewModel.kt:350-450` | `web/src/pages/properties/PropertyFormPage.tsx:135-167` | **`MATCH`** | Validate, TitleCase địa chỉ, chuẩn hóa SĐT, sinh ID, lưu IndexedDB, trigger sync. Được kiểm chứng qua `SMOKE-005`. |

---

### Nhóm 4: Chi Tiết BĐS & Nhật Ký (BEH-DET)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-DET-001` | Owner Direct Phone Call | `PhoneActionDialog.kt:45-65` | `web/src/components/common/PhoneActionModal.tsx:30-40` | **`MATCH`** | Kích hoạt quay số qua liên kết `<a href="tel:...">`. |
| `BEH-DET-002` | Owner Open Zalo Chat | `PhoneActionDialog.kt:70-95` | `web/src/components/common/PhoneActionModal.tsx:42-50` | **`MATCH`** | Mở tab Zalo qua liên kết `<a href="https://zalo.me/..." target="_blank">`. |
| `BEH-DET-003` | Share Property Info | `PropertyShareDialog.kt:40-120` | `web/src/pages/properties/PropertyDetailPage.tsx:97-114` | **`MATCH`** | Tạo văn bản lược bỏ thông tin chủ nhà nhạy cảm, gọi `navigator.share()` hoặc copy clipboard. |
| `BEH-DET-004` | Export Property Photos | `ExportPhotosForPostingUseCase.kt:30-80` | `web/src/pages/properties/PropertyDetailPage.tsx:115-126, 270-295` | **`MATCH`** | Nút "Tải tất cả ảnh" kèm thẻ `<a download>` cho phép tải trực tiếp toàn bộ ảnh thực địa của BĐS về máy người dùng. |
| `BEH-DET-005` | Verify & Promote Unverified | `PropertyDetailScreen.kt:423, 493` | `web/src/pages/properties/PropertyDetailPage.tsx:70-79` | **`MATCH`** | Chuyển `isVerified = true`, `status = FOR_SALE`, đồng bộ sang kho chính thức. |
| `BEH-DET-006` | Add Property Diary Note | `PropertyDetailScreen.kt:938-970` | `web/src/pages/properties/PropertyDetailPage.tsx:81-95` | **`MATCH`** | Thêm ghi chú nhật ký kèm mốc thời gian `[HH:mm dd/MM]` vào đầu chuỗi `diary`. Được kiểm chứng qua `SMOKE-004`. |
| `BEH-DET-007` | Compass For House Direction | `CompassDialog.kt:30-150` | `web/src/pages/properties/PropertyFormPage.tsx:285-305` | **`PARTIAL`** | Đầy đủ 8 hướng nhà qua dropdown lựa chọn. Hộp thoại la bàn dùng cảm biến từ kế native chưa có trên Web. |

---

### Nhóm 5: Bản Đồ Khảo Sát Thực Địa (BEH-MAP)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-MAP-001` | Map Tap Marker Preview | `MapSurveyScreen.kt:350-410` | `web/src/pages/map/MapSurveyPage.tsx:90-135` | **`MATCH`** | Chạm marker Leaflet mở card preview chi tiết (ảnh, giá, diện tích, nút xem). Được kiểm chứng qua `SMOKE-009`. |
| `BEH-MAP-002` | Long Press Map To Add | `MapSurveyScreen.kt:280-320` | `web/src/pages/map/MapSurveyPage.tsx:75-85` | **`MATCH`** | Bắt sự kiện `contextmenu` (chuột phải hoặc long-press) mở menu điều hướng tạo BĐS với tọa độ đã điền sẵn. |
| `BEH-MAP-003` | Optimize Survey Route (TSP) | `RouteOptimizer.kt:25-90` | `web/src/core/engine/route-optimizer.ts:1-60`, `MapSurveyPage.tsx:140-180` | **`MATCH`** | Thuật toán Nearest Neighbor TSP tính toán lộ trình ngắn nhất và vẽ Polyline trên Leaflet. Được kiểm chứng qua unit test. |
| `BEH-MAP-004` | Launch External Navigation | `MapsIntentHelper.kt:20-60` | `web/src/pages/map/MapSurveyPage.tsx:235-245` | **`MATCH`** | Nút "Chỉ đường" mở Google Maps `https://www.google.com/maps/dir/?api=1&destination=lat,lng`. |

---

### Nhóm 6: Quản Lý Khách Hàng CRM (BEH-CUST)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-CUST-001` | Add / Edit Customer CRM | `CustomerViewModel.kt:120-180` | `web/src/pages/customers/CustomerListPage.tsx:58-95, 250-390` | **`MATCH`** | Form nhập khách hàng, chuẩn hóa SĐT Việt Nam, lưu IndexedDB. Được kiểm chứng qua `SMOKE-006` và `SMOKE-007`. |
| `BEH-CUST-002` | Match Customer Demand | `MatchEngineUseCase.kt:30-110` | `web/src/core/engine/match-engine.ts:1-120`, `CustomerDetailPage.tsx:50-57` | **`MATCH`** | Thuật toán chấm điểm ghép cặp theo loại hình, khoảng giá, khu vực (`|||`), hướng nhà. Được kiểm chứng qua unit test và `SMOKE-008`. |
| `BEH-CUST-003` | Link Property Viewed/Owned | `CustomerRepository.kt` | `web/src/pages/customers/CustomerDetailPage.tsx:33-40, 180-240` | **`MATCH`** | Quản lý liên kết n-n trong bảng `customer_property_links` với các vai trò `BUYER` / `OWNER`. |

---

### Nhóm 7: Đồng Bộ Dữ Liệu Ngoại Tuyến (BEH-SYNC)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-SYNC-001` | Sync Now Button Click | `SettingsViewModel.kt:210-270` | `web/src/components/layout/SyncStatusBar.tsx:35-50`, `sync-manager.ts:120-175` | **`MATCH`** | Kích hoạt push local changes và pull remote changes với cơ chế CAS optimistic lock. |
| `BEH-SYNC-002` | Scheduled Daily Sync Alarm | `SyncAlarmReceiver.kt:37-127` | `web/src/App.tsx:30-42` | **`PARTIAL`** | Web không thể đánh thức trình duyệt khi đóng tab như AlarmManager native. Thay thế bằng tự động sync khi mở/focus tab. |
| `BEH-SYNC-003` | Realtime WebSocket Sync | `RealtimeSyncManager.kt:40-120` | `web/src/data/sync/sync-manager.ts:180-240` | **`MATCH`** | Lắng nghe Supabase Realtime channel qua WebSocket, tự cập nhật IndexedDB theo nguyên tắc Last-Write-Wins. |

---

### Nhóm 8: Cài Đặt & Bảo Trì Dữ Liệu (BEH-SET)

| Mã ID | Tên hành vi | Android Native Reference | Web Implementation Reference | Trạng thái | Ghi chú bằng chứng |
| :--- | :--- | :--- | :--- | :---: | :--- |
| `BEH-SET-001` | Backup Database | `ZipHelper.kt:25-80` | `web/src/pages/settings/SettingsPage.tsx:170-205` | **`MATCH`** | Trích xuất toàn bộ dữ liệu IndexedDB thành tệp JSON có cấu trúc để tải về máy tính. |
| `BEH-SET-002` | Restore Database | `ZipHelper.kt:85-140` | `web/src/pages/settings/SettingsPage.tsx:210-250` | **`MATCH`** | Chọn tệp JSON sao lưu, xác thực cấu trúc và ghi đè vào IndexedDB qua transaction an toàn. |
| `BEH-SET-003` | Purge Soft-Deleted Records | `PurgeWorker.kt:25-75` | `web/src/data/local/db.ts:84-112`, `SettingsPage.tsx:255-275` | **`MATCH`** | Nút dọn rác xóa vĩnh viễn các bản ghi có `isDeleted = true` và `updatedAt` cũ hơn 30 ngày. |

---

## 3. KẾT LUẬN & ĐỀ XUẤT HÀNH ĐỘNG

1. **Độ sẵn sàng (Readiness)**: Ứng dụng Web đã đạt **82.9% MATCH** hoàn hảo về hành vi nghiệp vụ cốt lõi. Toàn bộ các luồng CRM, BĐS, MatchEngine, Bản đồ, Đồng bộ, Nhập xuất dữ liệu đều hoạt động trơn tru.
2. **5 hành vi `PARTIAL`**: Đều có giải pháp kỹ thuật cụ thể (tạo `manifest.json` cho Web Share Target, thêm `jszip` nếu cần xuất ảnh zip, bổ sung scroll restoration).
3. **2 hành vi `MISSING`**: Là các tương tác đặc thù riêng cho màn hình cảm ứng di động native (kéo thả FAB mép màn hình, snackbar nới lỏng filter), không cản trở việc vận hành thực tế trên Web.
