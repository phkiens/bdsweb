# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

BĐS Collector (`metadata.json`) — a field data-collection app for Vietnamese real-estate brokers ("Ứng dụng quản lý bất động sản thực địa dành cho môi giới BĐS Việt Nam"). Native Android app, single `:app` module, package `com.example`, applicationId `com.aistudio.bdscollector.vskwzh`. Originally scaffolded by Google AI Studio (see README).

## Commands

Build with the Gradle wrapper from the project root.

- Build debug APK: `./gradlew assembleDebug`
- Build release APK: `./gradlew assembleRelease`
- Run unit tests (Robolectric + Roborazzi): `./gradlew testDebugUnitTest`
- Run a single unit test class: `./gradlew testDebugUnitTest --tests "com.example.SomeTestClass"`
- Run instrumented tests (device/emulator required): `./gradlew connectedDebugAndroidTest`
- Lint: `./gradlew lint`
- Update Roborazzi screenshot baselines: `./gradlew recordRoborazziDebug`

Setup before building:
1. Create `.env` in the project root with `GEMINI_API_KEY` set (see `.env.example`) — read via the Secrets Gradle Plugin.
2. For release builds, remove/adjust the `signingConfig` in `app/build.gradle.kts` or provide `KEYSTORE_PATH`, `STORE_PASSWORD`, `KEY_PASSWORD` env vars (see `signingConfigs["release"]`).
3. `app/google-services.json` is required for Firebase (App Check / Gemini via Firebase AI).

## Architecture

Standard Clean Architecture layering under `app/src/main/java/com/example`: `data` → `domain` → `ui`, wired with Hilt (`di/`).

- **domain**: pure Kotlin models (`domain/model`), repository interfaces (`domain/repository`), and use cases grouped by feature (`domain/usecase/{property,customer,match,media,sync,ai}`).
  - Note: `ApiConfig` now only stores Supabase credentials (URL, Key). Sync interval and other periodic timing settings have been simplified.
- **data**:
  - `data/local`: Room database (**version 26**, entities `PropertyEntity`, `CustomerEntity`, `CustomerPropertyLink`, `SyncLogEntity`). SP chờ (unverified) đã được **gộp vào `PropertyEntity`**, phân biệt bằng cờ `isVerified` — không còn `UnverifiedPropertyEntity`/bảng riêng. Migration cao nhất hiện tại là `MIGRATION_25_26` (backfill area cho v25, backfill status cho v26); **next migration là `MIGRATION_26_27`.**
  - `data/remote`: three external integrations:
    - `drive/`: Google Drive REST via raw OkHttp + custom OAuth PKCE flow (stores photos/documents).
    - `gemini/`: `GeminiHelper` parses/extracts structured property data using regex + Gemini. **Gemini API Key and Model are stored in `SettingsManager` (single source of truth; Key is in encrypted shared preferences) instead of DataStore.**
    - `supabase/`: Postgrest + Realtime client (remote sync backend/source of truth).
  - `data/repository`: implements domain repositories. Writes are local-first, then asynchronously pushed to Supabase.
  - `data/worker`: WorkManager workers for background sync (`*SyncRetryWorker`), pull/restore workers (`PropertyUnverifiedPullWorker`, `CustomerRestoreFromSupabaseWorker`, `MediaRestoreWorker`), media upload (`MediaSyncWorker`), text sync (`TextSyncWorker`), cleanup (`PurgeWorker`), and local notifications (`ReminderWorker`).
- **ui**: Jetpack Compose screens. `ui/common` holds:
  - `SettingsManager` (encrypted prefs via `androidx.security.crypto` for tokens/API keys, regular prefs for models/preferences).
  - `SyncScheduler` (AlarmManager-based fixed time slot auto-sync, no periodic interval).
  - `SyncStatusBus`/`SyncStatusBar` (sync status UI).
  - `NetworkStateObserver` & `AppLogger` (writes to `SyncLogEntity`).
  - Navigation is a single `NavHost` in `MainActivity` with string routes. `"settings_sync"` is removed, `"settings_icon_sorting"` is added for functional icon sorting.
  - Settings screen features a unified **"Đồng bộ ngay"** button that runs push (`SyncForegroundService`) and pull workers concurrently.

### Core domain concepts

- **Property** vs **Customer** (CRM contact, linked to properties via `CustomerPropertyLink` with a `role`, matched against property demand via `MatchEngineUseCase`). "SP chờ" (unverified listing) **không còn là một loại entity riêng** — nó chỉ là `Property` với `isVerified = false`. Danh sách/wizard chờ (`ui/unverified/`: `UnverifiedScreen`, `UnverifiedVerifyWizardScreen`…) chỉ là **màn hình lọc `isVerified = false`**, không phải nguồn dữ liệu riêng; xác minh = set `isVerified = true`.
- `domain/model/UnverifiedProperty` vẫn tồn tại nhưng chỉ còn là **DTO trung gian của pipeline trích xuất** (Gemini/regex bóc text thô → `UnverifiedProperty` → đổ vào `PropertyEntity` với `isVerified=false`), KHÔNG map với bảng riêng. `ui/unverified/` + route `unverified_list` là code còn sót sau đợt gộp — trong danh sách "code chết cần dọn".
- Two-way sync model: Room is the local source of truth for offline-first UX; Supabase is the remote source of truth for cross-device sync; Google Drive stores media/binary attachments (photos, generated docs) referenced by ID from entities (`driveFolderId`, `driveMediaIds`, `txtFileId`, etc.). Every entity carries `isTextSynced`/`isMediaSynced`/`isDeleted`/`updatedAt` flags used to reconcile the two directions.
- Text extraction pipeline: user pastes raw listing text (e.g., shared from Zalo/Facebook via `ACTION_SEND` intent, handled in `MainActivity`) → `GeminiHelper`/`ExtractPropertyUseCase` parses it into an `UnverifiedProperty` → user verifies/promotes it into a full `Property` via the wizard.
- Navigation is a single `NavHost` in `MainActivity` with string routes (`property_list`, `unverified_list`, `customer_list`, `nearby_scan`, `settings`, etc.); bottom nav only shows on the main 5 top-level routes.

### Auth

Google Drive access uses Google Identity Services `AuthorizationClient` (`Identity.getAuthorizationClient`). The app does not use custom OAuth PKCE, client secrets, refresh tokens, or redirect URIs. Short-lived access tokens are held temporarily in RAM cache only (never written to persistent storage).

## Notes

- All Vietnamese-language UI strings and business logic (property types, statuses, demand types) are hardcoded in Vietnamese throughout; `normalizeVietnamese`/`normalizeVietnamesePhone` in `domain/model` handle diacritics-insensitive search and VN phone formats.
- `StringUtils.toTitleCase` is applied to area names on insert; `TitleCaseMigrationWorker` is a one-time backfill for existing rows.
- **Magic string risk**: một số nơi so sánh status bằng string thô ("Đang bán") thay vì enum — dễ sai âm thầm, nên dần migrate sang enum comparison.

## Sync architecture (tóm tắt)

- **Push**: local-first, optimistic lock — `syncPropertyToSupabase` đọc lại DAO trước khi push, dùng `markSyncedIfUnchanged(id, updatedAt)` (CAS) sau khi push thành công. Mutex theo `propertyId` tránh push song song cùng một record.
- **Pull / Realtime**: `RealtimeSyncManager` subscribe Supabase Realtime cho 4 bảng. `upsertProperty/Customer/Link` chỉ ghi đè khi `remote.updatedAt > existing.updatedAt`. Khi ghi đè, giữ `isTextSynced = existing.isTextSynced` (không hard-code `true`) để tránh nuốt thay đổi local chưa push.
- **catchUp**: chạy khi app start, phân trang 500 dòng với `ORDER BY server_updated_at ASC` để bù các thay đổi bị bỏ lỡ lúc offline. Watermark chỉ tiến sau khi toàn bộ trang thành công.
- **Watermark**: lưu trong `SyncPullPrefs` (SharedPreferences), dùng `server_updated_at` (do Supabase trigger set) — không dùng đồng hồ client để tránh clock skew.
- **Conflict resolution**: Last-Write-Wins theo `updatedAt` (client timestamp). Khi hai thiết bị sửa cùng record offline, bản có `updatedAt` lớn hơn thắng. Không có field-level merge; client KHÔNG tự phát hiện/hòa giải xung đột.
- **Server-side convergence (`sync_guard` — kiến thức không có trong repo)**: hội tụ được cưỡng chế bởi trigger `properties_sync_guard` gọi function `public.sync_guard()` trên Supabase:

```sql
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
      return old;   -- drop update cũ, KHÔNG bump server_updated_at
  end if;
  new.server_updated_at := (extract(epoch from now()) * 1000)::bigint;
  return new;
```

  Hệ quả cần nhớ khi sửa sync:
  1. Stale push (`updated_at` < bản trên server) bị **drop âm thầm** — `return old`, KHÔNG raise exception. Do đó `pushToSupabase()` vẫn nhận HTTP success → trả `true`, KHÔNG phải `false`. Đừng viết logic dựa vào giả định "push bị reject sẽ trả false".
  2. Vì stale push không bao giờ hồi sinh dữ liệu cũ trên server, hệ thống **luôn hội tụ** về bản có `updated_at` lớn nhất → KHÔNG cần guard/merge/pull-on-reject phía client.
  3. Nếu về sau bỏ/đổi trigger này (ví dụ dùng upsert thuần), toàn bộ phân tích trên hết đúng, client sẽ cần cơ chế chống ghi ngược chiều thời gian.
