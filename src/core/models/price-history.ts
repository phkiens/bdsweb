export enum PriceHistoryChangeType {
  BASELINE = "BASELINE",
  PRICE_CHANGE = "PRICE_CHANGE",
  RESTORE_BASELINE = "RESTORE_BASELINE"
}

export function parsePriceHistoryChangeType(value: string | null | undefined): PriceHistoryChangeType {
  if (!value) return PriceHistoryChangeType.BASELINE;
  const upper = value.toUpperCase();
  if (upper === "BASELINE") return PriceHistoryChangeType.BASELINE;
  if (upper === "PRICE_CHANGE") return PriceHistoryChangeType.PRICE_CHANGE;
  if (upper === "RESTORE_BASELINE") return PriceHistoryChangeType.RESTORE_BASELINE;
  return PriceHistoryChangeType.BASELINE;
}

export enum PriceEditKind {
  DATA_CORRECTION = "DATA_CORRECTION",
  MARKET_CHANGE = "MARKET_CHANGE",
  UNSPECIFIED = "UNSPECIFIED"
}

export function parsePriceEditKind(value: string | null | undefined): PriceEditKind {
  if (!value) return PriceEditKind.UNSPECIFIED;
  const upper = value.toUpperCase();
  if (upper === "DATA_CORRECTION") return PriceEditKind.DATA_CORRECTION;
  if (upper === "MARKET_CHANGE") return PriceEditKind.MARKET_CHANGE;
  if (upper === "UNSPECIFIED") return PriceEditKind.UNSPECIFIED;
  return PriceEditKind.UNSPECIFIED;
}

export function toDisplayLabel(kind: PriceEditKind | string | null | undefined): string {
  const resolved = typeof kind === "string" ? parsePriceEditKind(kind) : (kind ?? PriceEditKind.UNSPECIFIED);
  switch (resolved) {
    case PriceEditKind.MARKET_CHANGE:
      return "Thay đổi giá";
    case PriceEditKind.DATA_CORRECTION:
      return "Sửa thông tin giá";
    case PriceEditKind.UNSPECIFIED:
    default:
      return "Chưa phân loại";
  }
}

export const toPriceEditKindDisplayLabel = toDisplayLabel;

export interface PropertyPriceHistory {
  id: string;
  revision: number;
  propertyId: string;
  changeType: PriceHistoryChangeType;
  editKind: PriceEditKind;
  previousPrice: number | null;
  currentPrice: number;
  previousAreaSize: number | null;
  currentAreaSize: number | null;
  previousPricePerM2: number | null;
  currentPricePerM2: number | null;
  recordedAt: number;
}
