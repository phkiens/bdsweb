import { Property } from "../models/property";

/**
 * Chuẩn hóa giá BĐS (tỷ VNĐ): làm tròn 3 chữ số thập phân, khớp với Android normalizePropertyPrice
 */
export function normalizePropertyPrice(price: number): number {
  if (isNaN(price) || !isFinite(price) || price <= 0) return 0.0;
  return Math.round(price * 1000) / 1000;
}

/**
 * Xác định các trường priceEditKind và priceEditAt khi lưu form BĐS:
 * - Khi sửa căn và giá thay đổi (chênh lệch > 0.0001 sau chuẩn hóa) => DATA_CORRECTION và priceEditAt = updatedAt
 * - Khi giá không đổi hoặc là căn mới => cả hai null
 * Khớp hoàn toàn với PropertyFormViewModel trong Android.
 */
export function determinePriceEditFields(
  isEditMode: boolean,
  originalProperty: Property | null | undefined,
  newPrice: number,
  updatedAt: number
): { priceEditKind: string | null; priceEditAt: number | null } {
  if (!isEditMode || !originalProperty) {
    return { priceEditKind: null, priceEditAt: null };
  }

  const normalizedNewPrice = normalizePropertyPrice(newPrice);
  const normalizedOldPrice = normalizePropertyPrice(originalProperty.price);
  const isPriceChanged = Math.abs(normalizedNewPrice - normalizedOldPrice) > 0.0001;

  if (isPriceChanged) {
    return {
      priceEditKind: "DATA_CORRECTION",
      priceEditAt: updatedAt
    };
  }

  return { priceEditKind: null, priceEditAt: null };
}

/**
 * Giải quyết con trỏ bắt đầu tải bù (Catch-Up):
 * min(persistedWatermark, localMaxRevision ?? 0)
 * Khớp chính xác với RealtimeSyncManager.kt resolveCatchUpCursor của Android.
 */
export function resolveCatchUpCursor(
  persistedWatermark: number,
  localMaxRevision: number | null | undefined
): number {
  const localMax = localMaxRevision ?? 0;
  return Math.min(persistedWatermark, localMax);
}

/**
 * Tính toán con trỏ tải bù có lùi overlap (mặc định 200, không âm)
 */
export function computeCatchUpCursor(
  persistedWatermark: number,
  localMaxRevision: number | null | undefined,
  overlap: number = 200
): { startRevision: number; cursor: number } {
  const startRevision = resolveCatchUpCursor(persistedWatermark, localMaxRevision);
  const cursor = Math.max(0, startRevision - overlap);
  return { startRevision, cursor };
}
