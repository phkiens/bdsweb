import { Property } from "../models/property";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind
} from "../models/price-history";

/**
 * Định dạng giá bất động sản hoặc mức chênh lệch giá (tương đương PropertySheetHelper.formatPrice trên Android):
 * - Giá < 1 tỷ: hiển thị triệu (ví dụ: 0.5 -> "500 triệu", 0.05 -> "50 triệu")
 * - Giá >= 1 tỷ: hiển thị tỷ (ví dụ: 1.5 -> "1.5 tỷ", 2 -> "2 tỷ")
 */
export function formatPrice(price: number | null | undefined): string {
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return "Thỏa thuận";
  }
  if (price < 1.0) {
    const millions = parseFloat((price * 1000).toFixed(2));
    return `${millions} triệu`;
  }
  const billions = parseFloat(price.toFixed(2));
  return `${billions} tỷ`;
}

export interface PriceChangeSummary {
  text: string;
  isDecrease: boolean | null; // true: decrease, false: increase, null: no change
}

/**
 * Tóm tắt biến động giá gần nhất (khớp calculateLatestPriceChangeSummary trên Android):
 * - Nếu không có lịch sử, hoặc không phải MARKET_CHANGE, hoặc previousPrice không hợp lệ, hoặc chênh lệch <= 1e-4: "Chưa thay đổi", isDecrease = null.
 * - Giảm: "↓ {diff} · {pct}%", isDecrease = true.
 * - Tăng: "↑ {diff} · {pct}%", isDecrease = false.
 */
export function summarizeLatestPriceChange(
  histories: PropertyPriceHistory[]
): PriceChangeSummary {
  const latestHistory = histories && histories.length > 0 ? histories[0] : null;
  if (
    !latestHistory ||
    latestHistory.changeType !== PriceHistoryChangeType.PRICE_CHANGE ||
    latestHistory.editKind !== PriceEditKind.MARKET_CHANGE ||
    latestHistory.previousPrice == null ||
    latestHistory.previousPrice <= 0 ||
    Math.abs(latestHistory.currentPrice - latestHistory.previousPrice) <= 1e-4
  ) {
    return {
      text: "Chưa thay đổi",
      isDecrease: null
    };
  }

  const prev = latestHistory.previousPrice;
  const diff = latestHistory.currentPrice - prev;
  const diffAbs = Math.abs(diff);
  const pct = (diffAbs / prev) * 100.0;
  const formattedDiff = formatPrice(diffAbs);
  const formattedPct = parseFloat(pct.toFixed(1)).toString();

  if (diff < -1e-4) {
    return {
      text: `↓ ${formattedDiff} · ${formattedPct}%`,
      isDecrease: true
    };
  } else {
    return {
      text: `↑ ${formattedDiff} · ${formattedPct}%`,
      isDecrease: false
    };
  }
}

export type QuickPriceEditResult =
  | { kind: "INVALID" }
  | { kind: "UNCHANGED" }
  | { kind: "CONFLICT" }
  | { kind: "OK"; updated: Property };

/**
 * Áp dụng sửa giá nhanh (khớp updatePrice trong ViewModel và updatePriceIfUnchanged trong PropertyDao trên Android):
 * - Làm tròn 4 chữ số thập phân cho expectedPrice và newPrice.
 * - Kiểm tra giá hợp lệ (> 0, finite, not NaN).
 * - Kiểm tra giá không thay đổi (abs diff < 0.0001).
 * - Kiểm tra xung đột (property đã xóa hoặc giá hiện tại lệch expectedPrice >= 0.0001).
 * - Cập nhật: price = newPrice, priceEditKind = MARKET_CHANGE, isTextSynced = false.
 *   Thời điểm: now > updatedAt ? now : updatedAt + 1 cho priceEditAt, updatedAt, lastEditedAt.
 */
export function applyQuickPriceEdit(
  property: Property,
  expectedPrice: number,
  newPrice: number,
  now: number
): QuickPriceEditResult {
  const normalizedNew = Math.round(newPrice * 10000) / 10000;
  const normalizedExpected = Math.round(expectedPrice * 10000) / 10000;

  if (
    !Number.isFinite(normalizedNew) ||
    normalizedNew <= 0 ||
    Number.isNaN(normalizedNew)
  ) {
    return { kind: "INVALID" };
  }

  if (Math.abs(normalizedNew - normalizedExpected) < 0.0001) {
    return { kind: "UNCHANGED" };
  }

  if (
    property.isDeleted ||
    Math.abs(property.price - normalizedExpected) >= 0.0001
  ) {
    return { kind: "CONFLICT" };
  }

  const newUpdatedAt = now > property.updatedAt ? now : property.updatedAt + 1;

  const updated: Property = {
    ...property,
    price: normalizedNew,
    priceEditKind: PriceEditKind.MARKET_CHANGE,
    priceEditAt: newUpdatedAt,
    updatedAt: newUpdatedAt,
    lastEditedAt: newUpdatedAt,
    isTextSynced: false
  };

  return {
    kind: "OK",
    updated
  };
}

/**
 * Áp dụng xoá lịch sử giá (khớp updatePriceHistoryClearedRev trong PropertyDao trên Android):
 * - Nếu mốc không tăng (priceHistoryClearedRev >= upToRevision): trả về null.
 * - Ngược lại: priceHistoryClearedRev = upToRevision, isTextSynced = false.
 *   updatedAt = max(now, updatedAt + 1).
 *   priceEditAt đi theo nếu đang bằng updatedAt cũ.
 */
export function applyClearPriceHistory(
  property: Property,
  upToRevision: number,
  now: number
): Property | null {
  const currentClearedRev = property.priceHistoryClearedRev ?? 0;
  if (currentClearedRev >= upToRevision) {
    return null;
  }

  const newUpdatedAt = Math.max(now, property.updatedAt + 1);
  const newPriceEditAt =
    property.priceEditAt != null && property.priceEditAt === property.updatedAt
      ? newUpdatedAt
      : property.priceEditAt;

  return {
    ...property,
    priceHistoryClearedRev: upToRevision,
    priceEditAt: newPriceEditAt,
    updatedAt: newUpdatedAt,
    isTextSynced: false
  };
}
