/**
 * Chuẩn hóa chuỗi tiếng Việt (loại bỏ dấu thanh, chuyển đ/Đ -> d/D, chữ thường, trim)
 * Khớp chính xác 100% với java.text.Normalizer.Form.NFD trong Customer.kt
 */
export function normalizeVietnamese(input: string): string {
  if (!input) return "";
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "d")
    .toLowerCase()
    .trim();
}

/**
 * Chuẩn hóa số điện thoại Việt Nam sang định dạng 10 chữ số bắt đầu bằng 0
 * Khớp 100% với canonicalizeVietnamesePhone trong Customer.kt
 */
export function canonicalizeVietnamesePhone(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  const digits = trimmed.replace(/\D/g, "");
  
  // Dạng +84 hoặc 84: 84 + 9 chữ số (tổng 11 chữ số) và số kế tiếp là đầu số di động VN [3|5|7|8|9]
  if (digits.startsWith("84") && digits.length === 11) {
    const suffix = digits.substring(2);
    if ("35789".includes(suffix.charAt(0))) {
      return "0" + suffix;
    }
    return digits;
  }

  // Dạng 9 chữ số người dùng nhập thiếu số 0 ở đầu (ví dụ 912345678, 38..., 7..., 8...)
  if (digits.length === 9 && "35789".includes(digits.charAt(0))) {
    return "0" + digits;
  }

  // Dạng chuẩn 10 chữ số bắt đầu bằng 0
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits;
  }

  // Các trường hợp khác (số bàn, số quốc tế khác, chuỗi số lạ): giữ nguyên digits
  return digits;
}

/**
 * Chuẩn hóa tên riêng, địa danh thành Title Case
 * (Ví dụ: "phường bến nghé" -> "Phường Bến Nghé")
 */
export function toTitleCase(input: string): string {
  if (!input) return "";
  const trimmed = input.trim();
  if (!trimmed) return "";

  return trimmed
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");
}

/**
 * Kiểm tra xem BĐS có khớp với một trong các khu vực được chọn trong bộ lọc không
 */
export function matchesArea(itemArea: string, filterAreas: string[]): boolean {
  if (!filterAreas || filterAreas.length === 0) return true;
  const normItem = normalizeVietnamese(itemArea);
  return filterAreas.some((area) => {
    const normFilter = normalizeVietnamese(area);
    return normItem.includes(normFilter) || normFilter.includes(normItem);
  });
}
