# Kế hoạch tách god-file MapSurveyScreen.kt (2146 dòng)

> Dành cho Antigravity thực thi. Claude đã đọc code thật để viết plan này (2026-07-18).
> **NGUYÊN TẮC BẮT BUỘC:** mỗi bước là 1 commit riêng, `assembleDebug` xanh MỚI sang bước sau. KHÔNG gộp bước. KHÔNG sửa logic — chỉ MOVE code + đổi import. Giữ rollback từng bước.

## Bối cảnh cấu trúc (đã verify)

File `app/src/main/java/com/example/ui/nearby/MapSurveyScreen.kt` gồm 4 loại phần:

| Phần | Dòng | Loại | Rủi ro tách |
|---|---|---|---|
| `PlaceholderBox` | 98-107 | Composable top-level | Thấp |
| `MapSurveyScreen` | 110-~1612 (~1500 dòng) | Composable LÕI, state chằng chịt | **CAO — KHÔNG đụng đợt này** |
| `getPinDrawable` / `getFocusIndicatorDrawable` / `getClusterDrawable` | 340, 389, 429 | Hàm LỒNG trong MapSurveyScreen, bắt cache qua closure | Trung (cần refactor cache) |
| `MapItemPreviewContent` | 1614-2080 (~466 dòng) | `private fun` top-level, tham số rõ ràng | **Thấp — ứng viên số 1** |
| `normalizeForSearch` / `matchesArea` + regex | 2081-2120 | Hàm string thuần top-level | **Thấp nhất — 0 rủi ro** |
| `InfoRow` | 2122-2146 | Composable top-level nhỏ | Thấp |

**LƯU Ý QUAN TRỌNG (đừng làm sai):**
- Ba hàm `getPinDrawable/getFocusIndicatorDrawable/getClusterDrawable` **KHÔNG phải top-level** — chúng lồng bên trong `MapSurveyScreen` và dùng `pinDrawableCache`/`focusIndicatorCache`/`clusterDrawableCache` (mấy cái này là `remember { mutableMapOf() }` khai báo trong Composable cha, dòng 338/387/427). **KHÔNG bê nguyên xi ra top-level được** — sẽ mất closure cache. Đợt này TẠM ĐỂ NGUYÊN (thuộc Bước 3, chưa làm).

## Bước 1 — Tách hàm string thuần (0 rủi ro). LÀM TRƯỚC.

Move ra file mới `app/src/main/java/com/example/ui/nearby/MapSearchUtils.kt`:
- Các `private val qRegex2/qRegex3/pRegex1/pRegex2/tpRegex/spaceRegex` (dòng ~2074-2079) và bất kỳ regex `private val` liên quan phía trên chúng.
- `private fun String.normalizeForSearch()` (2081)
- `private fun matchesArea(...)` (2090)

Đổi `private` → `internal` (để file khác trong cùng package `com.example.ui.nearby` gọi được — thực ra cùng package thì `internal` không bắt buộc, nhưng KHÔNG để `private` vì sẽ mất tầm nhìn). Vì cùng package `com.example.ui.nearby` nên **không cần thêm import** ở MapSurveyScreen.kt.

Kiểm sau bước: các regex `private val` này có bị dùng ở CHỖ KHÁC trong MapSurveyScreen ngoài normalizeForSearch/matchesArea không — grep trước khi move. Nếu có, move cả nơi dùng hoặc để lại.

`assembleDebug` → xanh → commit "refactor: tách MapSearchUtils khỏi MapSurveyScreen".

## Bước 2 — Tách MapItemPreviewContent + InfoRow (rủi ro thấp).

Move ra file mới `app/src/main/java/com/example/ui/nearby/MapItemPreview.kt`:
- `private fun MapItemPreviewContent(item, viewModel, scope, onNavigateToDetail, onNavigateToUnverifiedDetail, onDismiss)` (1614-2080) → đổi `private` → `internal`.
- `@Composable private fun InfoRow(label, value)` (2122-2146) → `internal` (InfoRow chỉ được MapItemPreviewContent dùng — grep xác nhận; nếu MapSurveyScreen cũng dùng thì để chung file gọi được).

MapItemPreviewContent nhận đủ tham số qua signature (không giữ state của màn cha) nên tách sạch. Nó dùng `viewModel.getFullProperty/getFullUnverifiedProperty`, `PhoneActionDialog`, `AppTextField`, `Property`, `UnverifiedProperty`, `PropertyStatus`, `getLabel`, `normalizeVietnamesePhone` — **copy các import tương ứng** sang file mới (xem import block dòng 3-40 của file gốc để lấy đúng).

Sau khi move, **xoá các import ở MapSurveyScreen.kt nếu giờ chỉ MapItemPreview dùng** (vd `PhoneActionDialog`, `AppTextField`) — nhưng CHỈ xoá khi chắc MapSurveyScreen không còn dùng (grep). Import thừa chỉ là warning, không lỗi — nếu không chắc thì cứ để.

`assembleDebug` → xanh → commit "refactor: tách MapItemPreview khỏi MapSurveyScreen".

→ Sau B1+B2: **2146 → ~1400 dòng**, cắt ~1/3, chưa động lõi rối.

## Bước 3 — Tách drawable factory + lõi (RỦI RO CAO). KHÔNG làm trong đợt này.

Chỉ ghi lại để sau. Muốn tách `getPinDrawable/getFocusIndicatorDrawable/getClusterDrawable` phải:
1. Đưa 3 cache map thành tham số hoặc gom vào 1 class `MapMarkerFactory(context)` giữ cache nội bộ, `remember { MapMarkerFactory(context) }` trong Composable.
2. Đổi mọi call-site `getPinDrawable(...)` → `markerFactory.getPin(...)`.
Đây là refactor có sửa cấu trúc (không phải move thuần) → RỦI RO recomposition/cache. Để phiên riêng, cân nhắc có đáng không sau khi B1+B2 đã nhẹ.

## Checklist review cho Claude sau mỗi bước Antigravity làm

1. Kiểm null-byte/encoding file mới (Antigravity hay ghi hỏng .kt) — `file` + xem đầu file.
2. Grep: hàm move đi có còn call-site mồ côi trong MapSurveyScreen không (nếu để `private` sẽ không compile).
3. Xác nhận CHỈ move, KHÔNG sửa logic — diff không được có thay đổi thân hàm.
4. `assembleDebug` máy thật xanh (K chạy) — KHÔNG tin tới khi thấy BUILD SUCCESSFUL.
5. App chạy: mở màn Bản đồ, bấm 1 pin xem preview hiện đúng (B2 đụng preview).
