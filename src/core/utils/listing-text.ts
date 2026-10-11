import { formatPropertyPrice } from "./property-price";
import { Property } from "../models/property";

export interface ListingTexts {
  first: string;
  second: string;
}

export const LISTING_TEXTS_PREFIX = "BDS_LISTINGS_V1:";

export const CONTACT_LINE = "0️⃣9️⃣6️⃣3️⃣7️⃣2️⃣2️⃣4️⃣9️⃣8️⃣";
export const CONTACT_DIGITS = "0963722498";

/**
 * Mã hóa 2 bản tin (Tin 1, Tin 2) thành chuỗi lưu trữ.
 * Nếu Tin 2 rỗng và Tin 1 không bắt đầu bằng tiền tố, trả về Tin 1 nguyên bản.
 * Ngược lại, đóng gói JSON có tiền tố BDS_LISTINGS_V1:.
 */
export function encodeListingTexts(first: string, second: string): string {
  const safeFirst = first ?? "";
  const safeSecond = second ?? "";
  if (safeSecond === "" && !safeFirst.startsWith(LISTING_TEXTS_PREFIX)) {
    return safeFirst;
  }
  const payload = JSON.stringify({ first: safeFirst, second: safeSecond });
  return `${LISTING_TEXTS_PREFIX}${payload}`;
}

/**
 * Giải mã chuỗi lưu trữ thành 2 bản tin (Tin 1, Tin 2).
 * Chuỗi rỗng -> 2 chuỗi rỗng.
 * Chuỗi không có tiền tố -> first = chuỗi gốc, second = "".
 * Chuỗi có tiền tố nhưng JSON hỏng / thiếu trường / sai kiểu -> first = chuỗi gốc, second = "".
 */
export function decodeListingTexts(stored: string | null | undefined): ListingTexts {
  if (!stored) {
    return { first: "", second: "" };
  }
  if (!stored.startsWith(LISTING_TEXTS_PREFIX)) {
    return { first: stored, second: "" };
  }
  const jsonPayload = stored.substring(LISTING_TEXTS_PREFIX.length);
  try {
    const parsed = JSON.parse(jsonPayload);
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      typeof parsed.first === "string" &&
      typeof parsed.second === "string"
    ) {
      return { first: parsed.first, second: parsed.second };
    }
    return { first: stored, second: "" };
  } catch {
    return { first: stored, second: "" };
  }
}

/**
 * Thêm dòng liên hệ mặc định vào cuối text nếu chưa có dãy số 0963722498 (dạng emoji hay số thường).
 */
export function appendContactLine(text: string): string {
  const safeText = text ?? "";
  const digits = safeText.replace(/\D/g, "");
  if (digits.includes(CONTACT_DIGITS)) {
    return safeText;
  }
  const trimmed = safeText.trimEnd();
  return trimmed.length === 0 ? CONTACT_LINE : `${trimmed}\n${CONTACT_LINE}`;
}

export interface ShareOptions {
  includeBasic: boolean;
  includeDesc: boolean;
  includeLocation: boolean;
  includeOwner: boolean;
}

/**
 * Xây dựng nội dung chia sẻ tin đăng BĐS theo đúng chuẩn Android.
 */
export function buildPropertyShareBody(
  property: Partial<Property>,
  resolvedDescText: string,
  opts: ShareOptions
): string {
  let result = "📢 BĐS ĐẸP ĐANG BÁN:\n";

  if (opts.includeBasic) {
    const formattedPrice = formatPropertyPrice(property.price) || "Thương lượng";
    result += `📍 Khu vực: ${property.area ?? ""}\n`;
    result += `💰 Giá: ${formattedPrice}\n`;
    result += `📐 Diện tích: ${property.areaSize != null ? `${property.areaSize} m²` : ""}\n`;
    result += `🏠 Loại hình: ${property.propertyType ?? ""}\n`;
    if (property.direction && property.direction.trim().length > 0) {
      const parts = property.direction.split("|||").map((d) => d.trim()).filter(Boolean);
      const firstDir = parts.length > 0 ? parts[0] : property.direction.trim();
      if (firstDir) {
        result += `🧭 Hướng: ${firstDir}\n`;
      }
    }
  }

  if (opts.includeDesc && resolvedDescText && resolvedDescText.trim().length > 0) {
    result += `📝 Mô tả: ${resolvedDescText}\n`;
  }

  const hasCoords =
    property.latitude != null &&
    property.longitude != null &&
    property.latitude !== 0 &&
    property.longitude !== 0;

  if (opts.includeLocation && hasCoords) {
    const mapUrl = `https://www.google.com/maps/search/?api=1&query=${property.latitude},${property.longitude}`;
    result += `📌 Định vị: ${mapUrl}\n`;
  }

  if (opts.includeOwner) {
    const ownerName = property.ownerName?.trim() || "";
    const ownerPhone = property.ownerPhone?.trim() || "";
    if (ownerName.length > 0 || ownerPhone.length > 0) {
      const nameStr = ownerName.length > 0 ? ownerName : "Chủ nhà";
      const phoneStr = ownerPhone.length > 0 ? ownerPhone : "Chưa có SĐT";
      result += `📞 Liên hệ: ${nameStr} - ${phoneStr}\n`;
    }
  }

  return result.trimEnd();
}
