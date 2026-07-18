# Quy trình: Antigravity code — Claude Code review/audit

---

## PROTOCOL (agent-to-agent, English — read this first)

> This section is the shared contract between Antigravity and Claude Code. All agent-to-agent writing in handoff files MUST be in English to avoid Vietnamese encoding/font corruption. Messages to the human user stay in Vietnamese.

**Language**
- Agent ↔ agent (everything written into `handoff-*.md`): **English only.**
- Agent → human user (chat replies): **Vietnamese.**
- Reason: Antigravity was rendering Vietnamese text in these files as corrupted glyphs. English removes the ambiguity.

**Roles (unchanged)**
- **Antigravity** = the ONLY party that edits source code.
- **Claude Code** = read-only. Audits plans and reviews code. Never edits source files. May only append review notes into `handoff-*.md`.

**State machine — do the CURRENT step, never skip ahead**

Each work package lives in ONE numbered file `handoff-NN-<slug>.md`. Sections are appended in strict order. A party may only act when the previous section is filled by the OTHER party:

| Section | Author | Precondition |
|---|---|---|
| `## Plan v1` | Antigravity | package created |
| `## Review v1` | Claude Code | Plan v1 exists |
| `## Plan v2 (final)` | Antigravity | Review v1 exists |
| `## Review v2` | Claude Code | Plan v2 exists |
| `## Changes v1` | Antigravity | Review v2 says "OK to code" |
| `## Review v3 (code review)` | Claude Code | Changes v1 exists |
| `## Fix log v1` | Antigravity | Review v3 has Critical/Should-fix items |

- **Do not request the next party's section before your own is done.** (Example of the bug we just hit: Antigravity finished `Plan v2` but asked for `Review v3` — a code review — before any code existed. That is two steps ahead.)
- Before acting, each agent MUST read the file top-to-bottom and identify the LAST filled section, then write only the next one.
- Every section starts with a one-line header: `> Author: <name> | Depends on: <section> | Date: <YYYY-MM-DD>`.

**Verification rule (Claude Code)**
- Never trust "BUILD SUCCESSFUL" or a prose summary of changes. Always open the actual files (or `git diff`) and confirm line-by-line before signing off. Note in the code repo: `git` may show no diff if Antigravity hasn't committed — in that case read the files directly.

---

Nguyên tắc: Antigravity là bên duy nhất được sửa file. Claude Code chỉ đọc, phân tích, và trả nhận xét bằng chữ — không tự sửa code. Bạn là người chuyển tiếp thông điệp giữa hai bên (copy/paste), qua file `.md` dùng chung trong repo để hai bên đọc lại được lịch sử.

Tạo trước 1 file dùng chung trong repo, ví dụ `docs/handoff.md`, để lưu plan, review log, danh sách fix — cả hai bên đều đọc file này khi cần nhớ lại ngữ cảnh.

---

## Bước 0 — Khởi tạo plan (Antigravity, Planning Mode)

Gửi cho Antigravity:

```
Tôi cần làm: <mô tả tính năng/bugfix>.

Yêu cầu:
- Đề xuất kế hoạch triển khai (implementation plan) chi tiết theo từng bước.
- Liệt kê các file sẽ tạo/sửa.
- Nêu rủi ro hoặc điểm chưa rõ cần tôi quyết định.
- CHƯA CODE, chỉ lên plan.

Sau khi xong, ghi toàn bộ plan vào file docs/handoff.md dưới mục "## Plan v1".
```

## Bước 1 — Audit plan (Claude Code, Plan Mode)

Chạy `claude` trong terminal (Plan Mode, để không cho sửa file), gửi:

```
Đọc file docs/handoff.md, mục "## Plan v1".

Vai trò của bạn: chỉ audit, KHÔNG code, KHÔNG sửa file nào.

Hãy đánh giá:
1. Plan có bỏ sót bước nào không (migration, test, rollback, edge case)?
2. Có rủi ro kỹ thuật, bảo mật, hoặc performance nào không?
3. Cấu trúc file/module đề xuất có hợp lý với codebase hiện tại không?
4. Đề xuất chỉnh sửa cụ thể (nếu có), càng ngắn gọn càng tốt.

Trả lời dạng danh sách vấn đề + đề xuất, không cần diễn giải dài dòng.
```

Copy phần trả lời của Claude, dán vào Antigravity ở bước 2.

## Bước 2 — Chỉnh plan theo audit (Antigravity)

```
Claude Code đã audit plan, đây là nhận xét:

<dán nhận xét của Claude>

Hãy cập nhật plan theo các điểm hợp lý, giải thích ngắn nếu bạn không đồng ý điểm nào.
Ghi bản plan mới vào docs/handoff.md dưới mục "## Plan v2 (final)".
```

## Bước 3 — Antigravity code theo plan v2

```
Plan v2 trong docs/handoff.md đã chốt. Bắt đầu implement đúng theo plan.
Sau khi xong, ghi tóm tắt các file đã thay đổi vào docs/handoff.md dưới mục "## Changes v1" (liệt kê file + mô tả ngắn thay đổi).
```

## Bước 4 — Claude review code đã implement

Trong terminal Claude Code (vẫn Plan Mode / read-only):

```
Đọc mục "## Changes v1" trong docs/handoff.md, sau đó tự đọc các file được liệt kê
(hoặc chạy git diff nếu cần xem chi tiết thay đổi).

Vai trò: chỉ review, KHÔNG sửa file.

Kiểm tra:
1. Code có đúng với plan v2 không?
2. Bug logic, edge case chưa xử lý, lỗi type/null safety?
3. Vi phạm convention/pattern hiện có trong repo?
4. Vấn đề bảo mật (input validation, injection, secrets lộ ra...)?
5. Thiếu test hay không?

Trả về danh sách vấn đề theo mức độ ưu tiên (Critical / Nên sửa / Gợi ý), mỗi mục nêu rõ file + dòng nếu có.
```

Gợi ý: nếu repo có git, có thể để Claude tự chạy `git diff` thay vì bạn liệt kê file — nhanh và chính xác hơn.

## Bước 5 — Antigravity fix theo review

```
Claude Code đã review code, đây là danh sách vấn đề:

<dán review của Claude>

Hãy fix toàn bộ mục Critical và Nên sửa. Với mục Gợi ý, làm nếu hợp lý, bỏ qua nếu không cần thiết (giải thích ngắn nếu bỏ qua).
Ghi log các fix vào docs/handoff.md dưới mục "## Fix log v1".
```

## Bước 6 — Vòng lặp

Lặp lại Bước 4–5 (đổi tên "Changes v2", "Fix log v2"...) cho đến khi Claude không còn issue Critical/Nên sửa nào.

---

## Mẹo vận hành

- Luôn chạy Claude Code ở chế độ Plan Mode (`claude` rồi bật Plan Mode, hoặc `claude --permission-mode plan`) trong toàn bộ quy trình này, để tránh nó lỡ tay sửa file.
- File `docs/handoff.md` đóng vai trò "biên bản họp" — nếu quy trình kéo dài nhiều ngày, cả hai bên (và bạn) đọc lại vẫn hiểu được ngữ cảnh.
- Nếu ngại copy/paste thủ công, có thể rút gọn: bỏ qua audit plan (Bước 1–2), chỉ dùng Claude để review code sau khi Antigravity code xong (Bước 3 → 4 → 5 → lặp).
- Với repo có GitHub: sau khi ổn, push lên PR và tag `@claude` để có thêm một lớp review tự động độc lập.
