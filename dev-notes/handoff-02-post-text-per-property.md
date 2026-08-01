# Handoff 02 — Simplify the "tin đăng" copy UX (feature already exists)

> Written for Antigravity (English, to avoid encoding issues). Reply to K in Vietnamese.
> Convention: **file + location + what to change + traps + acceptance**, NOT full before/after code.
> Follow the review flow in `CONG-VIEC-CON-DO.md` §4. Do not write code before the plan is approved.

> **This is a SIMPLIFY/REDESIGN of code that already exists, NOT a new build.** Verified in code 2026-07-23.
> K's complaint: the copy UI is cluttered ("giao diện copi nhì nhằng"), and copy is buried behind the edit dialog.

---

## 0. Current state (already built — read before planning)

The per-property listing text feature already exists and persists/syncs correctly:

- **View section:** `PropertyDescriptionSection` (`PropertyDetailComponents.kt:83–135+`). Header row (98–127) = Description icon + title **`"Mô tả / Tin đăng"`** (line 108) + a **"Sửa tin đăng"** edit button (113–126, via `onEditListingText`). Body `Text` = `displayDescription = description.ifBlank { rawText }` (88, rendered 129–135). Below it, an expandable "Tin nhắn gốc" (rawText) block.
- **Edit dialog:** `EditListingTextDialog` in `PropertyDetailScreen.kt:1591–1815`, opened by `showEditListingDialog`. Contains: quick **Paste** (append) + **Clear** icons (1618–1665), the edit `OutlinedTextField` (1667–1674), a **"Copy từng phần"** section (1676–1747), and a dismiss row with **"Copy cả tin"** (1763–1799), **"Chia sẻ"**, **"Hủy"**.
- **Save:** `viewModel.updateDescription(currentProp, draftText)` (`PropertyDetailViewModel.kt:336`) → `updateProperty(copy(description=…, updatedAt=now), fromSync=false)` → repo lowers `isTextSynced` → syncs. **Persistence + sync already work — do not touch this path.**

So the whole thing is built. What K wants is a cleaner arrangement, below.

---

## 1. What K wants (2026-07-23)

1. **Copy from the detail view screen**, without opening the edit dialog.
2. **One "Copy tất cả" button** next to the section title — NOT the per-part copy grid.
3. **Native Android text selection** on the tin đăng body: double-tap / long-press → selection handles → drag to select any region → system Copy. This replaces per-part copy for "copy a piece".
4. **Shorten the section title** from "Mô tả / Tin đăng" to just **"TĐ"**.
5. **Strip the copy clutter out of the edit dialog** — after tapping "Sửa tin đăng" there should be no copy UI, just editing.

---

## 2. Changes

### 2.1 `PropertyDetailComponents.kt` — `PropertyDescriptionSection` (the view section)

- **a. Rename title.** Line 108: `"Mô tả / Tin đăng"` → `"TĐ"`.
- **b. Add ONE "Copy tất cả" button** in the header Row (98–127), next to the title (keep the existing "Sửa tin đăng" button). Use `Icons.Default.ContentCopy`, `contentDescription = "Copy tất cả"`. On tap it copies the **full listing post** and shows a Toast "Đã copy tin đăng".
  - The full-post text = the builder currently at `PropertyDetailScreen.kt:1765–1791` (header + khu vực + giá + diện tích + loại hình + hướng + mô tả + định vị + liên hệ). **Extract that into a shared helper** — e.g. `fun Property.toFullPost(formattedPrice: String): String` in `Property.kt` — and call it from both here and the dialog's "Chia sẻ"/existing paths (removes a duplicated builder).
  - `PropertyDescriptionSection` has no clipboard/context today. Prefer adding an **`onCopyAll: (() -> Unit)? = null`** parameter (mirroring `onEditListingText`) and wiring it at the call site `PropertyDetailScreen.kt:1224` where `context`/clipboard are in scope. Keeps the composable clean.
- **c. Native selection on the body.** Wrap the body `Text` (129–135) in a **`SelectionContainer`** (`androidx.compose.foundation.text.selection.SelectionContainer`). That alone gives the OS long-press/double-tap → handles → drag-select → Copy behavior K described ("bôi đậm kéo thả"). No zoom needed. Optionally wrap the expanded "Tin nhắn gốc" body too.

### 2.2 `PropertyDetailScreen.kt` — `EditListingTextDialog` (remove copy clutter)

- **Remove the whole "Copy từng phần" section: lines ~1676–1747** (the `Divider`, the "Copy từng phần" label, the `partsList` builder, and the per-row copy `Column`).
- **Remove "Copy cả tin"** from the dismiss row (~1763–1799); copy-all now lives on the view screen (2.1b).
- **Delete the now-unused `copyToClipboard` lambda** (1604–1608) if nothing else references it after removal.
- **Keep:** the Paste(append)+Clear icons (1618–1665), the edit `OutlinedTextField` (1667–1674), **"Lưu"** (1751–1759), **"Chia sẻ"** (1801–1808), **"Hủy"** (1810–1812).
- Result: the dialog is edit-only — box + Dán/Xoá + Lưu/Chia sẻ/Hủy.

### 2.3 De-duplicate the post builder (nice-to-have, same PR)

There are now three near-identical full-post builders: share dialog (~1361–1390), edit dialog (~1765–1791), and the new view button. Fold them onto the single `Property.toFullPost(...)` helper from 2.1b. If risky to touch the share dialog in this PR, at minimum share the helper between the new view button and the edit dialog.

---

## 3. Traps & notes

- **T1 — don't touch the save/sync path.** `updateDescription` → `updateProperty(fromSync=false)` already handles the dirty flag (`PropertyDetailViewModel.kt:336`, memory `bug-toggle-khong-set-isTextSynced`). This change is copy/UI only; leave persistence alone.
- **T2 — `SelectionContainer` + gestures.** Don't put a `clickable`/long-press modifier on the body `Text` inside the `SelectionContainer` — it will swallow the selection long-press. The plain body Text is fine as-is. Keep the "Sửa tin đăng" affordance in the header, not on the body.
- **T3 — context in the composable.** Pass `onCopyAll` as a callback rather than threading `Context`/`ClipboardManager` into `PropertyDescriptionSection`'s signature.
- **T4 — "phóng to" is not required.** K guessed at "zoom/enlarge"; the real need is drag-select, which `SelectionContainer` delivers directly. Only add a tap-to-expand full-screen reader if selecting on a long post proves fiddly on device — out of scope for v1.
- **T5 — CRLF / encoding.** Repo has mixed line-endings; Antigravity has produced null-byte `.kt` / cut em-dashes before (`CONG-VIEC-CON-DO.md` §3b). After writing: `git diff --stat`, `file <path>`, no null bytes in edited `.kt`. Removing ~70 lines from a large CRLF file is exactly where a text-mode rewrite silently flips line-endings — verify the diff is only the intended lines.

---

## 4. Acceptance criteria

Verify on K's real device (installDebug).

1. Detail view: the section title reads **"TĐ"**; a **"Copy tất cả"** button sits next to it (alongside "Sửa tin đăng").
2. Tap "Copy tất cả" → the full framed post is on the clipboard (Toast "Đã copy tin đăng"); paste into FB/chat confirms.
3. Long-press or double-tap the tin đăng body → Android selection handles appear → drag to select part of it → system Copy works.
4. Open "Sửa tin đăng": only the edit box + Dán/Xoá icons + Lưu/Chia sẻ/Hủy. **No "Copy từng phần", no "Copy cả tin" inside the dialog.**
5. Edit + "Lưu" still persists and syncs (unchanged behavior; edit on device A shows on B after sync, `sync_log` clean).
6. `assembleDebug` + `lint` green; `git diff --stat` shows only intended lines; no null bytes; no CRLF flip in `PropertyDetailScreen.kt`.

---

## 5. Out of scope

- Zoom / full-screen reader on double-tap (T4) — revisit only if drag-select is awkward on a long post.
- A separate synced `postText` column (dropped earlier — `description` is the store).
- A global master template with placeholders.
