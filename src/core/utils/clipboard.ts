/**
 * Sao chép văn bản vào bộ nhớ đệm. Thử Clipboard API trước; nếu trình duyệt chặn
 * hoặc không hỗ trợ (trình duyệt trong app Zalo/Facebook, iOS cũ...) thì dùng
 * textarea ẩn + execCommand("copy").
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // rơi xuống cách dự phòng
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
