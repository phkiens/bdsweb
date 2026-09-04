# BÁO CÁO REMEDIATION: MAP-SURVEY-GPS-001

## 1. Mô tả sai khác
- **Tiêu đề**: Bản đồ khảo sát: Lọc bán kính thực địa theo GPS và phân biệt màu ghim BĐS.
- **Biểu hiện lỗi**:
  - Web trước đây luôn mở mặc định ở tọa độ cố định `(10.7769, 106.7009)` nếu không có query param.
  - Không vẽ điểm định vị người dùng theo thời gian thực (GPS pulsating user dot).
  - Không có bộ lọc bán kính quanh vị trí hiện tại (500m, 1km, 2km, 5km) và không vẽ vòng tròn bán kính khảo sát.
  - Toàn bộ ghim BĐS trên bản đồ đều dùng chung 1 icon xanh dương mặc định, không phân biệt được BĐS chính thức và tin chờ khảo sát.
  - Bảng xem trước ở đáy màn hình không tính và hiển thị khoảng cách từ vị trí người dùng/tâm quét tới BĐS.
- **Hành vi Native**:
  - `MapSurveyViewModel.kt`:
    - Hỗ trợ tâm quét `scanCenter` linh hoạt: theo GPS người dùng, theo BĐS tâm (`PROPERTY`), hoặc theo điểm chọn trên bản đồ.
    - Lọc khoảng cách theo công thức Haversine với bán kính `radiusKm` (0.5km, 1km, 2km, 5km, hoặc Tất cả).
    - Tự động sắp xếp BĐS theo thứ tự gần nhất đến xa nhất so với tâm quét.
  - `MapMarkerFactory.kt`:
    - Phân biệt màu ghim rõ ràng: BĐS chính thức (`isVerified = true`) màu xanh dương (`#2563eb`), tin chờ khảo sát (`isVerified = false`) màu vàng cam (`#ea580c` / `#f59e0b`).
    - Điểm GPS người dùng hiển thị vòng tròn xanh pulsating.

## 2. Bằng chứng tái hiện trước khi sửa
- Test tái hiện: [`tests/unit/parity/map-survey-gps.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/map-survey-gps.test.ts)
- Kết quả trước khi sửa: Chưa có engine `map-survey-engine.ts`, không có cơ chế tính khoảng cách và lọc bán kính thực địa, ghim không phân biệt màu sắc.

## 3. Chuỗi gọi UI → dữ liệu
```text
UI Component: MapSurveyPage
→ User Interaction: Bấm nút GPS hoặc chọn chip bán kính (500m / 1km / 2km / 5km)
→ HTML5 Geolocation API: Lấy tọa độ (latitude, longitude) của thiết bị
→ State: userGps, scanCenter, radiusKm
→ Engine Calculation: filterMapProperties(properties, scanCenter, radiusKm, viewTodayOnly)
    - Loại bỏ BĐS không hợp lệ hoặc nằm ngoài lãnh thổ Việt Nam
    - Tính khoảng cách Haversine từ scanCenter đến từng BĐS
    - Lọc các BĐS có distanceKm <= radiusKm
    - Sắp xếp tăng dần theo khoảng cách (gần nhất lên đầu)
→ Leaflet Map Layers:
    - gpsLayer: Vẽ marker vị trí người dùng (pulsating animation)
    - radiusCircle: Vẽ vòng tròn bán kính khảo sát màu xanh nhạt
    - markersLayer: Vẽ ghim SVG với màu tương ứng (Xanh = Chính thức, Vàng cam = Chờ KS)
→ Preview Card: Hiển thị khoảng cách chính xác ("Cách 350m", "Cách 1.8km"), nhãn loại tin và nút đặt làm tâm quét
```

## 4. Root cause
`MapSurveyPage.tsx` ban đầu chỉ là trang hiển thị bản đồ tĩnh cơ bản, chưa port module quản lý tâm quét (`scanCenter`) và bộ lọc bán kính từ `MapSurveyViewModel.kt`, đồng thời sử dụng marker icon mặc định của Leaflet thay vì hệ thống icon phân màu theo loại BĐS như `MapMarkerFactory.kt`.

## 5. Phương án sửa
1. **Tạo module engine tính toán**: [`web/src/core/engine/map-survey-engine.ts`](file:///c:/Users/k/Downloads/web/web/src/core/engine/map-survey-engine.ts):
   - Định nghĩa `MapScanCenter`, `MapPropertyItem`, `MarkerColorType`.
   - Hàm `getMarkerColorType(p)`: Trả về `"blue"` cho BĐS chính thức (`isVerified = true`) và `"orange"` cho tin chờ (`isVerified = false`).
   - Hàm `filterMapProperties(properties, scanCenter, radiusKm, viewTodayOnly)`: Lọc tọa độ hợp lệ, tính khoảng cách Haversine và lọc theo bán kính.
2. **Tạo module giao diện marker Leaflet**: [`web/src/pages/map/map-marker-icons.ts`](file:///c:/Users/k/Downloads/web/web/src/pages/map/map-marker-icons.ts):
   - `createMapPinIcon`: Sinh `L.divIcon` vector SVG sắc nét với màu xanh dương hoặc vàng cam và viền chọn khi active.
   - `createGpsUserIcon`: Sinh `L.divIcon` cho vị trí GPS người dùng với hiệu ứng radar/pulse.
3. **Cập nhật Giao diện Bản đồ**: [`web/src/pages/map/MapSurveyPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/map/MapSurveyPage.tsx):
   - Tích hợp thanh chọn bán kính nhanh `[ Tất cả | 500m | 1 km | 2 km | 5 km ]`.
   - Hiển thị bảng chú thích màu sắc ghim (BĐS chính thức vs Tin chờ khảo sát).
   - Nút GPS nổi ở góc dưới hỗ trợ quét nhanh quanh vị trí đứng thực địa.
   - Vẽ vòng tròn bán kính khảo sát (`L.circle`) đồng bộ theo tâm quét và bán kính.
   - Thẻ xem trước dưới đáy hiển thị khoảng cách thực tế và nút "Tâm quét" để chuyển trọng tâm khảo sát.

## 6. Danh sách file thay đổi
- `[NEW]` [`web/src/core/engine/map-survey-engine.ts`](file:///c:/Users/k/Downloads/web/web/src/core/engine/map-survey-engine.ts)
- `[NEW]` [`web/src/pages/map/map-marker-icons.ts`](file:///c:/Users/k/Downloads/web/web/src/pages/map/map-marker-icons.ts)
- `[NEW]` [`web/tests/unit/parity/map-survey-gps.test.ts`](file:///c:/Users/k/Downloads/web/web/tests/unit/parity/map-survey-gps.test.ts)
- `[MODIFY]` [`web/src/pages/map/MapSurveyPage.tsx`](file:///c:/Users/k/Downloads/web/web/src/pages/map/MapSurveyPage.tsx)

## 7. Test được thêm hoặc sửa
- `web/tests/unit/parity/map-survey-gps.test.ts`:
  1. `Phân biệt màu sắc ghim: BĐS chính thức (Blue) vs Tin chờ khảo sát (Orange)` -> PASS.
  2. `Lọc theo bán kính GPS (0.5km, 1km, 2km, 5km) và tính khoảng cách chính xác` -> PASS.
  3. `Sắp xếp danh sách theo khoảng cách tăng dần khi có tâm quét` -> PASS.
  4. `Loại bỏ BĐS có tọa độ null hoặc ngoài phạm vi Việt Nam` -> PASS.

## 8. Kết quả trước và sau
- **Trước**: Bản đồ chỉ hiển thị các ghim xanh đơn điệu, không định vị người dùng, không lọc được bán kính, không tính được khoảng cách thực tế.
- **Sau**: Khớp 100% nghiệp vụ khảo sát thực địa của Native: định vị GPS, vẽ vòng tròn bán kính, lọc 500m - 5km, phân biệt ghim xanh/cam, sắp xếp BĐS gần nhất lên đầu.

## 9. Command đã chạy
- `npx vitest run tests/unit/parity/map-survey-gps.test.ts` (4/4 tests PASS)
- `npm run test` (16 test files, 78 tests PASS)
- `npm run lint` (0 warnings, 0 errors)
- `npm run build` (tsc -b && vite build: built in 919ms)
- `npm run test:e2e` (Playwright: 11 tests PASS in 15.9s)

## 10. Exit code
- Toàn bộ lệnh đều kết thúc với **Exit code 0**.

## 11. Những biến thể đã kiểm tra
1. *Tâm quét GPS*: Bấm nút GPS định vị vị trí người dùng và lọc bán kính chuẩn xác.
2. *Tâm quét BĐS*: Chọn một BĐS làm tâm quét từ URL (`?centerPropertyId=...`) hoặc từ nút "Tâm quét" trên thẻ chi tiết.
3. *Toàn bộ bản đồ*: Bán kính "Tất cả" hiển thị mọi BĐS có tọa độ hợp lệ.
4. *Phân biệt màu ghim*: BĐS chính thức (Blue) và Tin chờ (Orange) hiển thị phân biệt trên canvas Leaflet.
5. *Dữ liệu tọa độ lỗi*: Bỏ qua các tọa độ null hoặc ngoài lãnh thổ Việt Nam.

## 12. Rủi ro regression
- Không có: `SMOKE-009` (Leaflet canvas + markers inspection) và toàn bộ 10 kịch bản smoke test khác đều vượt qua 100%.

## 13. Hành vi còn UNKNOWN
- Không còn. Toàn bộ logic đã khớp với `MapSurveyViewModel.kt` và `MapMarkerFactory.kt`.

## 14. Trạng thái cuối cùng
- **`MATCH`**

