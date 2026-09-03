# 05. QUY TẮC NGHIỆP VỤ & LUỒNG XỬ LÝ (BUSINESS RULES)

Tài liệu này bóc tách toàn bộ logic nghiệp vụ, quy tắc xác thực (validation), kiểm soát xung đột (conflict resolution), cơ chế đồng bộ hai chiều (two-way sync) và thuật toán ghép nối (matching) của ứng dụng Android BDS Collector để tái hiện chính xác trên nền tảng Web (Behavioral Parity).

---

## 1. MAPPING LUỒNG DỮ LIỆU ĐẦU CUỐI (END-TO-END FLOW MAPPING)

Mọi thao tác thay đổi dữ liệu cốt lõi tuân thủ mô hình Kiến trúc Sạch (Clean Architecture) từ UI tới Data Source:

### 1.1. Luồng Tạo Mới BĐS (Insert Property Flow)
- **UI Action**: Nhấn nút "Lưu BĐS" trên `PropertyFormScreen` ([`PropertyFormScreen.kt:120-160`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormScreen.kt#L120-L160)).
- **ViewModel / Event**: `PropertyFormViewModel.saveProperty()` ([`PropertyFormViewModel.kt:350-450`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormViewModel.kt#L350-L450)).
- **Validation**:
  - `price >= 0` (đơn vị: tỷ VNĐ; nếu NaN/Infinite thì ép về 0.0) ([`Property.kt:65`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/model/Property.kt#L65)).
  - `area` không được rỗng, chuẩn hóa TitleCase via `StringUtils.toTitleCase()` ([`StringUtils.kt:15-35`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/common/StringUtils.kt#L15-L35)).
  - Số điện thoại chủ nhà `ownerPhone` được chuẩn hóa via `normalizeVietnamesePhone()` ([`Customer.kt:42-66`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/model/Customer.kt#L42-L66)).
  - Tạo ID theo format chuẩn: `yyyyMMdd-HHmmss-xxxx` (ví dụ `20260903-173000-a1b2`) ([`Property.kt:47-51`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/model/Property.kt#L47-L51)).
- **Use Case**: `AddPropertyUseCase.invoke(property)` ([`AddPropertyUseCase.kt:15-30`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/usecase/property/AddPropertyUseCase.kt#L15-L30)).
- **Repository**: `PropertyRepositoryImpl.insertProperty(property)` ([`PropertyRepositoryImpl.kt:120-180`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/repository/PropertyRepositoryImpl.kt#L120-L180)).
- **DAO / Storage**: 
  - Room SQLite: `PropertyDao.insertProperty(entity)` với `isTextSynced = false`, `updatedAt = System.currentTimeMillis()`.
  - Media local storage: Lưu ảnh vào thư mục files nội bộ của app.
- **Side Effect**:
  - Kích hoạt coroutine `syncSingleProperty(property.id)` hoặc enqueue `PropertySyncRetryWorker`.
  - Tải ảnh lên Cloudflare R2 qua `UploadPropertyMediaToR2UseCase` ([`UploadPropertyMediaToR2UseCase.kt:20-80`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/usecase/media/UploadPropertyMediaToR2UseCase.kt#L20-L80)).
  - Nếu có `linkedCustomerId`, tạo `CustomerPropertyLink` với role tương ứng.
- **New UI State**: `isSaving = false`, phát sự kiện `navigationEvent -> navigateBack / navigateToDetail`.

### 1.2. Luồng Cập Nhật BĐS & Khóa Lạc Quan (Update & CAS Optimistic Lock Flow)
- **UI Action**: Chỉnh sửa thông tin và bấm Lưu ([`PropertyFormScreen.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/ui/property/PropertyFormScreen.kt)).
- **ViewModel**: `PropertyFormViewModel.updateProperty()`.
- **Use Case**: `UpdatePropertyUseCase.invoke(property)`.
- **Repository**: `PropertyRepositoryImpl.updateProperty(property)`.
- **DAO CAS Operation**:
  - Cập nhật Room: Đặt `isTextSynced = false`, `updatedAt = now()`.
  - Khi push lên Supabase thành công, gọi `propertyDao.markSyncedIfUnchanged(id, updatedAt)`:
    ```sql
    UPDATE properties SET isTextSynced = 1 WHERE id = :id AND updatedAt = :updatedAt
    ```
    *Ý nghĩa*: Nếu trong lúc đang gọi API push, người dùng tiếp tục sửa dữ liệu (khiến `updatedAt` cục bộ tăng lên), câu lệnh CAS trên sẽ không khớp (`rows affected = 0`), giữ nguyên `isTextSynced = false` để chu kỳ đồng bộ kế tiếp tiếp tục đẩy bản mới nhất.

---

## 2. QUY TẮC CHỐNG TRÙNG BĐS (DEDUPLICATION RULES)

Được cài đặt trong [`CheckDuplicateCoordinatesUseCase.kt:21-64`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/usecase/property/CheckDuplicateCoordinatesUseCase.kt#L21-L64) và [`CoordinateUtils.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/util/CoordinateUtils.kt):

1. **Dung sai tọa độ (Tolerance Window)**:
   - Hằng số sai số tọa độ: `coordDelta = 0.000005` (tương đương bán kính ~1 mét trên mặt đất).
   - Truy vấn Room SQLite:
     ```sql
     SELECT * FROM properties 
     WHERE isDeleted = 0 
       AND latitude BETWEEN (:lat - 0.000005) AND (:lat + 0.000005)
       AND longitude BETWEEN (:lng - 0.000005) AND (:lng + 0.000005)
     ```
2. **Quy trình phân tích chuỗi đầu vào (Input Parsing Pipeline)**:
   - **Bước 1 (Regex cục bộ)**: Quét chuỗi người dùng dán vào bằng biểu thức chính quy để tìm cặp số thập phân nằm trong phạm vi địa lý Việt Nam:
     - Vĩ độ (`lat`): `8.0 <= lat <= 24.0`
     - Kinh độ (`lng`): `102.0 <= lng <= 110.0`
   - **Bước 2 (Giải mã rút gọn Google Maps link)**: Nếu không trích xuất được số trực tiếp nhưng chuỗi chứa liên kết bản đồ (`maps.app.goo.gl`, `goo.gl/maps`, `google.com/maps`):
     - Gọi `GeminiApi.resolveAndExtractLocation(mapUrl)` thực hiện HTTP HEAD request theo chuỗi chuyển hướng (redirect 301/302) để lấy URL đích đầy đủ.
     - Trích xuất tọa độ từ query string hoặc path (`/@lat,lng,...` hoặc `?q=lat,lng`).
     - Kiểm tra tọa độ có thuộc lãnh thổ Việt Nam (`CoordinateUtils.isInVietnam`).
3. **Kết quả kiểm tra (DuplicateCheckResult)**:
   - `NoCoordinates`: Không tìm thấy tọa độ hợp lệ.
   - `NoMatches(lat, lng)`: Tọa độ hợp lệ và chưa từng tồn tại trong hệ thống -> Cho phép bấm "Thêm BĐS chính thức" hoặc "Thêm BĐS chờ".
   - `MatchesFound(lat, lng, matches)`: Đã có 1 hoặc nhiều BĐS trùng vị trí trong cơ sở dữ liệu -> Hiển thị danh sách thẻ BĐS trùng để xem chi tiết, cảnh báo không tạo trùng.

---

## 3. THUẬT TOÁN MATCHING KHÁCH HÀNG - BĐS (MATCH ENGINE RULES)

Được cài đặt trong [`MatchEngineUseCase.kt:18-160`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/domain/usecase/match/MatchEngineUseCase.kt#L18-L160).
Nguyên tắc: Thang điểm tối đa luôn là **100 điểm**, phân bổ theo 4 tiêu chí:

### 3.1. Điều kiện loại trừ cứng (Hard Exclusions)
- Nếu BĐS có trạng thái khác `Đang bán` (`status != "Đang bán"`) -> Điểm = 0, Cảnh báo: `"BĐS đã bán"`.
- Nếu Khách hàng có trạng thái `CLOSED` (`status == "CLOSED"`) -> Điểm = 0, Cảnh báo: `"Khách hàng đã đóng"`.
- Nếu BĐS hoặc Khách hàng có cờ `isDeleted == true` -> Loại bỏ khỏi danh sách ghép nối.

### 3.2. Tiêu chí 1: Loại hình BĐS (Trọng số 40 điểm - BẮT BUỘC)
- Khách yêu cầu: "Đất", "Nhà", "Căn hộ", hoặc "Bất kỳ" (`bat ky`, `batky`, `any`, để trống).
- Nếu `customer.propertyType` là "Bất kỳ" HOẶC khớp chính xác loại hình BĐS: **+40 điểm**.
- Nếu khác loại hình: **Lập tức trả về 0 điểm tổng** (Mismatch cứng, không xét các bước tiếp theo).

### 3.3. Tiêu chí 2: Ngân sách / Giá bán (Trọng số 30 điểm)
- Nếu khách không đặt giá trần/giá sàn (`priceMin <= 0 && priceMax <= 0`): **+30 điểm** (Lý do: *"Ngân sách linh hoạt"*).
- Nếu giá BĐS nằm trong khoảng `[priceMin, priceMax]`: **+30 điểm** (Lý do: *"Khớp khoảng giá"*).
- Nếu giá BĐS < `priceMin` (Rẻ hơn mức khách tìm):
  - Rẻ hơn `<= 20%`: **+25 điểm** (Lý do: *"Giá tốt hơn mong đợi"*).
  - Rẻ hơn `> 20%`: **+10 điểm** (Cảnh báo: *"Giá thấp hơn nhiều so với phân khúc"*).
- Nếu giá BĐS > `priceMax` (Đắt hơn ngân sách của khách):
  - Vượt `<= 10%`: **+15 điểm** (Cảnh báo: *"Vượt ngân sách nhẹ (+X%)"*).
  - Vượt `10% - 20%`: **+5 điểm** (Cảnh báo: *"Vượt ngân sách đáng kể (+X%)"*).
  - Vượt `> 20%`: **0 điểm** (Cảnh báo: *"Vượt ngân sách quá nhiều (+X%)"*).

### 3.4. Tiêu chí 3: Khu vực (Trọng số 20 điểm)
- Khách quan tâm nhiều khu vực ngăn cách bởi dấu `|||` (ví dụ `Quận 1|||Bình Thạnh`).
- Nếu khách không chọn khu vực: **+20 điểm** (*"Khu vực linh hoạt"*).
- Nếu BĐS thuộc một trong các khu vực khách yêu cầu: **+20 điểm** (*"Khớp khu vực"*).
- Nếu không khớp: **0 điểm**.

### 3.5. Tiêu chí 4: Hướng nhà (Trọng số 10 điểm)
- Danh sách hướng khách yêu cầu ngăn cách bởi dấu `|||` (ví dụ `Đông Nam|||Chính Nam`).
- Nếu khách không chọn hướng: **+10 điểm** (*"Hướng linh hoạt"*).
- Nếu khớp hướng: **+10 điểm** (*"Khớp hướng"*).
- Nếu không khớp: **0 điểm**.

---

## 4. CƠ CHẾ ĐỒNG BỘ HAI CHIỀU & HỘI TỤ DỮ LIỆU (SYNC & CONVERGENCE)

### 4.1. Server-Side Guard Trigger (`sync_guard`)
Hội tụ dữ liệu giữa nhiều client offline được đảm bảo bởi trigger PostgreSQL phía Supabase:
```sql
CREATE OR REPLACE FUNCTION public.sync_guard() RETURNS trigger AS $$
BEGIN
    IF tg_op = 'UPDATE' AND new.updated_at < old.updated_at THEN
        RETURN old; -- Âm thầm bỏ qua update cũ, KHÔNG tăng server_updated_at
    END IF;
    new.server_updated_at := (extract(epoch from now()) * 1000)::bigint;
    RETURN new;
END;
$$ LANGUAGE plpgsql;
```
**Hệ quả kiến trúc**:
1. Stale push (bản ghi gửi từ máy offline có `updated_at` cũ hơn bản ghi trên server) sẽ được server chấp nhận với mã HTTP 200/204 nhưng dữ liệu cũ bị hủy âm thầm (`RETURN old`).
2. Client **không bao giờ bị lỗi HTTP** khi gửi dữ liệu cũ -> Không dựa vào HTTP error để rollback client.
3. Hệ thống hội tụ theo **Last-Write-Wins (LWW)** dựa trên timestamp `updated_at`.

### 4.2. Kéo Dữ Liệu Phân Trang Theo Watermark (Pull Catch-Up)
- **File**: [`PropertyUnverifiedPullWorker.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/PropertyUnverifiedPullWorker.kt), [`CustomerRestoreFromSupabaseWorker.kt`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/CustomerRestoreFromSupabaseWorker.kt).
- **Watermark**: Lưu trong `SyncPullPrefs` bằng `server_updated_at` (do đồng hồ máy chủ Supabase phát sinh để triệt tiêu độ lệch đồng hồ client - clock skew).
- **Truy vấn**:
  ```sql
  SELECT * FROM properties 
  WHERE server_updated_at > :lastWatermark 
  ORDER BY server_updated_at ASC 
  LIMIT 500
  ```
- **Nguyên tắc cập nhật Room khi nhận bản ghi remote**:
  - Chỉ ghi đè vào Room nếu `remote.updatedAt > local.updatedAt`.
  - Khi ghi đè, **giữ nguyên giá trị `isTextSynced = local.isTextSynced`** (tuyệt đối không hardcode `true`), nhằm tránh ghi đè làm mất trạng thái thay đổi chưa đẩy của client.
  - Chỉ cập nhật `lastWatermark = max(server_updated_at)` sau khi toàn bộ trang 500 dòng đã được lưu thành công vào Room DB.

---

## 5. QUY TẮC XÓA DỮ LIỆU (DELETE, SOFT-DELETE & PURGE)

1. **Xóa mềm (Soft Delete)**:
   - Khi người dùng bấm xóa trên UI (`PropertyList`, `PropertyDetail`, `CustomerScreen`):
   - Đặt cờ `isDeleted = true`.
   - Cập nhật `updatedAt = System.currentTimeMillis()`.
   - Đặt `isTextSynced = false`.
   - Record vẫn tồn tại trong Room SQLite và Supabase để đồng bộ cờ xóa tới các thiết bị khác.
2. **Ẩn khỏi giao diện (UI Filter)**:
   - Mọi câu truy vấn Room DAO và màn hình danh sách đều có điều kiện bắt buộc `WHERE isDeleted = 0`.
3. **Xóa vĩnh viễn (Hard Delete / Purge)**:
   - Được thực thi bởi `PurgeWorker` ([`PurgeWorker.kt:25-75`](file:///c:/Users/k/Downloads/web/app/src/main/java/com/example/data/worker/PurgeWorker.kt#L25-L75)).
   - Ngưỡng thời gian: `cutoffTime = System.currentTimeMillis() - 30.days` (30 ngày sau khi xóa mềm).
   - Xóa vật lý khỏi SQLite:
     ```sql
     DELETE FROM properties WHERE isDeleted = 1 AND updatedAt < :cutoffTime
     ```

---

## 6. QUY TẮC CHUẨN HÓA DỮ LIỆU (NORMALIZATION RULES)

1. **Chuẩn hóa số điện thoại Việt Nam (`normalizeVietnamesePhone`)**:
   - Bỏ toàn bộ khoảng trắng, dấu chấm, dấu gạch ngang, chỉ giữ lại chữ số (`digits`).
   - Nếu bắt đầu bằng `84` và có 11 chữ số (`84` + 9 số di động đầu 3, 5, 7, 8, 9) -> Đổi thành `0...` (10 chữ số).
   - Nếu có 9 chữ số và bắt đầu bằng `3, 5, 7, 8, 9` (người dùng nhập thiếu số 0) -> Thêm tiền tố `0` thành 10 chữ số.
   - Nếu đã có 10 chữ số bắt đầu bằng `0` -> Giữ nguyên.
   - Các trường hợp số bàn, tổng đài, số quốc tế khác -> Giữ nguyên chuỗi số lọc được.
2. **Chuẩn hóa chuỗi tìm kiếm tiếng Việt (`normalizeVietnamese`)**:
   - Dùng `java.text.Normalizer.Form.NFD` để bóc tách dấu thanh.
   - Loại bỏ combining diacritical marks `\p{InCombiningDiacriticalMarks}+`.
   - Thay thế `đ` -> `d`, `Đ` -> `D`.
   - Chuyển toàn bộ thành chữ thường (`lowercase`) và cắt tỉa (`trim`).
3. **Chuẩn hóa tên khu vực (Title Case)**:
   - Mọi tên khu vực khi tạo hoặc cập nhật được đi qua `StringUtils.toTitleCase`: Chữ cái đầu mỗi từ viết hoa, các chữ sau viết thường (ví dụ: `phường bến nghé` -> `Phường Bến Nghé`).
