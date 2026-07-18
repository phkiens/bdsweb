# Đã fix (xác minh bằng code 2026-07-17)

- Đẻ trùng khách khi chủ không có SĐT → dedup theo tên (`getCustomerByNameWhenNoPhone` + nhánh trong `PropertyRepositoryImpl`).
- Văng app khi lưu config Supabase sau reinstall → `InMemorySharedPreferences` + try-catch keystore trong `SettingsManager`.
- Gộp SP chờ vào SP chính → Room v26, cờ `isVerified`, bỏ `UnverifiedPropertyEntity`.
- Gom regex bóc tin → `PropertyTextExtractor.kt`.
- Các migration Supabase (`server_updated_at`, `sync_guard`, RLS, drive_folder_id...) → đã chạy.
- Dọn khách trùng: customer 402 → 66, cả local lẫn Supabase đều sạch. Code client đã vá nên không đẻ lại. XONG hoàn toàn.
- Cảnh báo BĐS trùng khi thêm: đủ 4 tầng — DAO (`findByExactCoordinates`, `findByAreaPriceOwner`), Repo (`findPotentialDuplicates`, nhánh toạ độ + bộ ba area/price/phone), ViewModel (state `DuplicateWarning` + cờ `ignoreDuplicates`), UI (AlertDialog "Vẫn thêm"). Cảnh báo mềm, có `id != selfId`.
