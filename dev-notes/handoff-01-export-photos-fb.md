# Handoff 01 — Export property photos to a public gallery album (for Facebook posting)

> Written for Antigravity (English, to avoid encoding issues). Reply to K in Vietnamese.
> Convention: this file gives **file + location + what to change + traps + acceptance**, NOT full before/after code.
> Follow the review flow in `CONG-VIEC-CON-DO.md` §4 (Plan v1 → Review → … ). Do not write code before the plan is approved.

---

## 1. Problem & goal

When the broker posts a listing to Facebook Marketplace, the Android photo picker shows undifferentiated albums (Camera, Timemark, Zalo…). The photos for a specific property live **only in the app's private storage** and are therefore **invisible to the FB picker**, so the broker cannot tell which photo belongs to which house.

**Goal:** add a button on the property detail screen that copies *that property's* photos into a **public gallery album**, so they appear as a dedicated, recognizable album in the FB (and any other app's) picker. Two modes, chosen at export time.

Verified facts this design relies on (checked in code 2026-07-23, do not re-litigate):

- Each property already stores its photos as local files. `Property.imagePath` is a `|||`-separated list of absolute paths (`parseImagePaths` in `PropertyDetailComponents.kt:48`).
- Source file resolution must mirror `MediaReconciler.isImagePresentFast` (`MediaReconciler.kt:94`): a path may exist **at its original absolute path**, or the real file may be at **`filesDir/bds_images/<fileName>`**. Resolve in that order.
- Files are in **app-private** storage (`filesDir`) → not in MediaStore → not visible to other apps. That is the whole reason export is needed.
- Because the source is local, export is a **local file copy — no Google Drive download, works offline, near-instant.**
- `minSdk = 24`, `targetSdk = 36` (`app/build.gradle.kts:20-21`). This forces a dual code path (see §5 trap T1).
- No storage permission is currently declared in the manifest.

---

## 2. Feature spec

Add an action (button / icon) on the property detail screen: **"Xuất ảnh để đăng FB"**.

Two modes, selected via a small toggle/checkbox in the same dialog or bottom sheet:

**Mode A — Đăng nhanh (default, overwrite).**
- Destination: one fixed public album, `Pictures/BĐS Đăng FB/`.
- Behavior: **delete everything the app previously wrote there, then copy this property's photos in.**
- Result: the album always contains exactly the current property → tidy, no manual cleanup, ideal for posting one house at a time.

**Mode B — Giữ lại (keep, per-property).**
- Destination: a per-property public album, `Pictures/BĐS/<album name>/` (naming in §3).
- Behavior: write this property's photos there; **never touch other properties' albums.** Accumulates as an on-device archive; user deletes manually (or via the optional cleanup in §4, item 4).
- Result: multiple houses can be staged at once, each still identifiable by album name — this is what solves the original "can't tell which house" complaint for long-term storage.

The toggle label: *"Giữ lại album này (không tự xoá)"* — on = Mode B, off = Mode A.

After a successful export, show a confirmation: `Đã xuất N ảnh vào album "<tên album>"`. Optionally offer a button that fires an `ACTION_VIEW`/share chooser, but that is out of scope for v1 — just confirming is enough.

---

## 3. Naming (decided — you may keep as-is)

- **Mode A album (fixed):** display name `BĐS Đăng FB` → `RELATIVE_PATH = "Pictures/BĐS Đăng FB"`.
- **Mode B album (per property):** `BĐS - {area} - {last6 of property.id}`, e.g. `BĐS - Quận 7 - a1b2c3`.
  - Include the short id suffix so two properties in the same area do not collide into one album.
  - Sanitize the area for filesystem/bucket use: strip `/ \ : * ? " < > |` and trim; if area is blank, use `Khong ro`.

The **last path segment is exactly the album name shown in the picker** (`bucket_display_name`). Confirm the Vietnamese diacritics render correctly on K's device; if any device shows mojibake, fall back to ASCII (`BDS Dang FB`, `BDS - Quan 7 - a1b2c3`). K's device is the only target — verify on it, don't assume.

---

## 4. Files to touch

1. **New file — the export logic.** Put it beside the other media use cases:
   `app/src/main/java/com/example/domain/usecase/media/ExportPhotosForPostingUseCase.kt` (new).
   Responsibilities:
   - Input: `Property` (or its `imagePath`) + a mode enum (`QUICK_OVERWRITE` / `KEEP_PER_PROPERTY`).
   - Resolve each source file (original path → else `filesDir/bds_images/<name>`); skip + count any that resolve to neither (those are Drive-only after a purge — see §5 T5).
   - Compute destination `RELATIVE_PATH` per mode (§3).
   - Mode A only: clear previously-exported files in the fixed album first (see §5 T3).
   - Copy via MediaStore (see §5 T1/T2).
   - Return a small result: `exported: Int`, `skipped: Int`, `albumName: String`.
   - Inject `@ApplicationContext context` via Hilt, consistent with `RestoreMissingMediaUseCase`.

2. **`app/src/main/java/com/example/ui/property/PropertyDetailScreen.kt`** — add the button + mode toggle + confirmation, in the image/actions area (the images list is read around `PropertyDetailScreen.kt:566` / `1211`). Wire it to call the use case via the existing detail ViewModel. Run the copy off the main thread (the ViewModel scope + `Dispatchers.IO`); disable the button while running.

3. **`app/src/main/AndroidManifest.xml`** — add, for the pre-Q path only:
   `<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28" />`
   On API 29+ writing your own media to `Pictures/` needs **no** permission — do not add a broad storage permission that would trigger a runtime prompt on modern Android.

4. **(Optional) cleanup control.** A "Xoá album đã xuất" action (settings or the same sheet) that deletes the app-created files in `Pictures/BĐS Đăng FB/` and/or the `Pictures/BĐS/` subtree. Only needed if K wants in-app cleanup; otherwise the Gallery app handles deletion. Confirm with K before building.

No entity/DB/Room/sync change. This feature does not touch `updatedAt`, `isTextSynced`, `isMediaSynced`, Supabase, or Drive. It is read-only w.r.t. app data — it only copies pixels out to public storage.

---

## 5. Traps & notes (read before coding)

- **T1 — dual path for `minSdk 24`.** `MediaStore` `RELATIVE_PATH` + `IS_PENDING` only exist on **API 29+ (Q)**.
  - API ≥ 29: insert into `MediaStore.Images.Media.EXTERNAL_CONTENT_URI` with `RELATIVE_PATH` + `DISPLAY_NAME`, open the returned `content://` uri, stream the bytes.
  - API ≤ 28: you must write a real `File` under the public `Pictures/` dir and then trigger a media scan (`MediaScannerConnection.scanFile`) so the picker sees it; this branch needs the `WRITE_EXTERNAL_STORAGE` permission from §4. Do not skip the scan — an unscanned file will not appear in the picker.

- **T2 — `IS_PENDING` (API 29+).** Set `IS_PENDING = 1` on insert, write bytes, then update to `0`. Otherwise the FB picker can pick a half-written file.

- **T3 — clearing Mode A safely.** Delete only files **the app itself created** (query MediaStore by `RELATIVE_PATH = "Pictures/BĐS Đăng FB"` and delete those uris). An app can delete its own MediaStore entries without extra consent; deleting other apps' media would raise `RecoverableSecurityException` on Q+ — you should never hit that if you only ever delete what this feature wrote.

- **T4 — ordering.** FB/pickers usually sort by `DATE_ADDED`/`DATE_MODIFIED` desc. To preserve the broker's intended order, either write files in `imagePath` order with a tiny increasing timestamp, or prefix names `01_`, `02_`, … The photo the broker wants first should end up first.

- **T5 — Drive-only images.** After a local purge, some `imagePath` entries resolve to neither the original path nor `bds_images` (the detail card still shows them by streaming from Drive — see memory "anh-sp-cho-stream-tu-drive"). For v1: **skip these and report the skipped count** (`Đã xuất N, thiếu M ảnh chỉ có trên Drive`). Downloading from Drive on export is possible but is the expensive/online path — leave it out of v1 unless K asks.

- **T6 — album-count creep (Mode B).** Every kept property adds a picker album. That is intended (identifiability), but tell K so it's a conscious choice; the optional cleanup (§4.4) is the escape hatch.

- **T7 — duplicate storage.** Exported photos are copies; the originals stay in `filesDir`. Exporting the same property to both modes, or repeatedly, costs disk. Acceptable; just don't also keep stale pending entries (T2).

- **T8 — CRLF / encoding.** Per `CONG-VIEC-CON-DO.md` §3b: this repo has mixed line-endings and Antigravity has mangled `.kt` (null bytes) and `.md` (cut em-dashes) before. After writing, `git diff --stat` and check `file <path>`; verify no null bytes in the new `.kt`.

---

## 6. Acceptance criteria

Verify on K's real device (installDebug), not on "BUILD SUCCESSFUL" alone — per `CONG-VIEC-CON-DO.md` §4:

1. Property with local photos → "Xuất ảnh để đăng FB", Mode A → open Facebook → the photo picker shows an album **`BĐS Đăng FB`** containing exactly that property's photos, in the expected order.
2. Export a **different** property in Mode A → the album now shows only the second property (old ones gone). No leftover/half files.
3. Same property in Mode B → a per-property album `BĐS - <area> - <id6>` appears and **persists** after another property is exported in either mode.
4. Confirmation message reports the right counts; if a property has Drive-only images, the skipped count is shown and the export does not crash.
5. Runs offline (airplane mode) — proves no Drive dependency.
6. Test on the actual `targetSdk 36` device **and**, if feasible, an API ≤ 28 emulator to exercise the pre-Q branch (T1).
7. No change to app data: after export, the property's `updatedAt`/sync flags are unchanged and no unexpected `sync_log` rows appear.

---

## 7. Out of scope for v1

- Downloading Drive-only images at export time (T5).
- A share-sheet / direct-to-Facebook launch after export (just confirm; the broker opens FB themselves).
- Any auto-cleanup schedule; deletion is manual or the optional §4.4 button.
