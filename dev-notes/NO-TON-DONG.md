# Nợ tồn đọng — BĐS Collector

_Rà soát 2026-07-17. Đã loại các mục không phải bug. Không còn bug sống cần fix gấp — toàn bộ dưới đây là nợ kiến trúc / vệ sinh, làm khi muốn._

## Nợ kiến trúc (rủi ro cao, làm phiên riêng)

**God-file UI.** Các màn Compose quá lớn, khó test, recomposition thừa:

- MapSurveyScreen — 2146 dòng (ưu tiên tách trước)
- PropertyDetailScreen — 1603
- PropertyFormScreen — 1505
- PropertyListScreen — 1392
- SettingsScreen — 1224

Rủi ro cao vì động vào Compose UI lớn. Ưu tiên MapSurvey + PropertyDetail.

**Release chưa tối ưu.** `isMinifyEnabled = false` + `proguard-rules.pro` rỗng → APK không rút gọn/obfuscate, file lớn, lộ tên lớp. Bật minify + shrinkResources dễ gõ nhưng dễ crash runtime nếu thiếu proguard rule → **phải test kỹ trên release build thật**.

**PropertyEntity 34 field map tay.** Thêm 1 cột phải sửa 5 nơi (entity + 2 hàm map `toDomain`/`fromDomain` + Property model + Supabase model) → dễ quên. Nợ bảo trì, chưa gây bug.

**ViewModel scope Activity.** MainActivity giữ VM bằng `by viewModels()` rồi truyền xuống NavHost — lệch chuẩn `hiltViewModel()` per-destination. State sống suốt vòng đời Activity.

## Gói lớn treo (cần đầu vào)

**Gói C — bỏ cột address.** Nặng nhất, đụng nhiều tầng (Supabase + Gemini + MapSurvey filter). Cần biết **Supabase còn cột address không** trước khi làm. Để phiên riêng, giữ rollback. → Hồ sơ chi tiết (~40 điểm chạm, 6 tầng): [GOI-C-bo-cot-address-TOAN-DIEN.md](./GOI-C-bo-cot-address-TOAN-DIEN.md). Xác minh 2026-07-17: cột `address` vẫn tồn tại ở `PropertyEntity` + `Property` domain, còn ánh xạ lẫn `address ?: area`.

## Vệ sinh code (nhỏ, ít cấp bách)

- 16 log debug `PULL_DEBUG` / `EDIT_BTN_DEBUG` còn trong production
- 34 `printStackTrace()` nuốt lỗi → nên qua AppLogger
- Nhiều `catch { // Ignore }`
- Magic string status ("Đang bán", "Chờ khảo sát") rải khắp, kể cả hard-code trong migration
- Root repo ngập ~15 file `.db`/`.wal`/`.shm` + `applog.txt` 174KB + hàng chục `.md` kế hoạch → nên `.gitignore` + dọn

## Lưu ý bảo mật (không gấp)

Policy Supabase là `anon full access` — ai có anon key đều đọc/ghi toàn bộ. Chấp nhận được với app cá nhân; thành lỗ hổng nếu mở rộng nhiều user.

---

## Đã đóng trong phiên 2026-07-17 (không còn là vấn đề)

- **#1 Realtime `customers`** — ĐÃ FIX: bảng `customers` bị thiếu trong publication `supabase_realtime` → đã `alter publication ... add table`. Nay đủ 3 bảng, realtime khách hàng chạy.
- **#3 RLS links** — không phải bug: `customer_property_links` đã có policy `Allow anon full access` (cmd=ALL) từ trước. Không chặn push, không retry vô hạn.
- **#2 GET "cancelled"** — không phải bug: catchUp chạy trong scope riêng của `RealtimeSyncManager`; log "cancelled" là do `stop()` hủy `syncJob` khi app xuống nền. Watermark chỉ tiến sau khi cả trang xong → không mất dữ liệu.
- **Doc CLAUDE.md v24** — thực tế đã ghi đúng **version 26**, khớp `AppDatabase.kt`. Không lệch.
