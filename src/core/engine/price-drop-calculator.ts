import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind
} from "../models/price-history";
import { FilterState, PropertyFilter } from "./property-filter";
import { PropertyListMode } from "../models/enums";

export enum PriceDropSort {
  RECENT = "RECENT",
  AMOUNT_DESC = "AMOUNT_DESC",
  PERCENT_DESC = "PERCENT_DESC"
}

export const PRICE_DROP_SORT_LABELS: Record<
  PriceDropSort,
  { label: string; shortLabel: string }
> = {
  [PriceDropSort.RECENT]: { label: "Mới giảm nhất", shortLabel: "Mới giảm" },
  [PriceDropSort.AMOUNT_DESC]: { label: "Giảm nhiều tiền nhất", shortLabel: "Nhiều tiền" },
  [PriceDropSort.PERCENT_DESC]: { label: "Giảm mạnh theo %", shortLabel: "Nhiều %" }
};

export enum PriceDropWindow {
  DAYS_7 = "DAYS_7",
  DAYS_30 = "DAYS_30",
  DAYS_90 = "DAYS_90",
  ALL = "ALL"
}

export const PRICE_DROP_WINDOW_CONFIG: Record<
  PriceDropWindow,
  { days: number; label: string }
> = {
  [PriceDropWindow.DAYS_7]: { days: 7, label: "7 ngày" },
  [PriceDropWindow.DAYS_30]: { days: 30, label: "30 ngày" },
  [PriceDropWindow.DAYS_90]: { days: 90, label: "90 ngày" },
  [PriceDropWindow.ALL]: { days: Infinity, label: "Tất cả" }
};

export interface PriceDropItem {
  property: Property;
  previousPrice: number;
  currentPrice: number;
  previousPricePerM2: number | null;
  currentPricePerM2: number | null;
  dropAmount: number;
  dropPercent: number;
  lastDropAt: number;
  dropCountInWindow: number;
  totalDropCountSinceBaseline: number;
  latestRevision: number;
}

export const PRICE_EPSILON = 1e-4;
export const MAX_FUTURE_TOLERANCE_MS = 60_000;

export function isActiveMarketProperty(property: Property): boolean {
  return (
    !property.isDeleted &&
    !property.isDraft &&
    (property.status === PropertyStatus.FOR_SALE ||
      property.status === PropertyStatus.PENDING_SURVEY)
  );
}

export function calculatePricePerM2Fallback(
  price: number | null | undefined,
  area: number | null | undefined
): number | null {
  if (price == null || !Number.isFinite(price) || price <= 0) return null;
  if (area == null || !Number.isFinite(area) || area <= 0) return null;
  return (price * 1000.0) / area;
}

function getLocalDateParts(
  epochMs: number,
  timeZone: string = "Asia/Ho_Chi_Minh"
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of parts) {
    if (part.type === "year") year = parseInt(part.value, 10);
    if (part.type === "month") month = parseInt(part.value, 10);
    if (part.type === "day") day = parseInt(part.value, 10);
  }
  return { year, month, day };
}

export function formatRelativeDropTime(
  recordedAt: number,
  now: number = Date.now(),
  timeZone: string = "Asia/Ho_Chi_Minh"
): string {
  const pNow = getLocalDateParts(now, timeZone);
  const pRec = getLocalDateParts(recordedAt, timeZone);
  const nowDateMs = Date.UTC(pNow.year, pNow.month - 1, pNow.day);
  const recDateMs = Date.UTC(pRec.year, pRec.month - 1, pRec.day);
  const diffDays = Math.round((nowDateMs - recDateMs) / 86_400_000);

  if (diffDays <= 0) return "Hôm nay";
  if (diffDays === 1) return "Hôm qua";
  if (diffDays >= 2 && diffDays <= 6) return `${diffDays} ngày trước`;
  if (diffDays >= 7 && diffDays <= 29) return `${Math.floor(diffDays / 7)} tuần trước`;

  const dd = String(pRec.day).padStart(2, "0");
  const mm = String(pRec.month).padStart(2, "0");
  const yyyy = String(pRec.year);
  return `${dd}/${mm}/${yyyy}`;
}

export const AMOUNT_DESC_ORDER = (a: PriceDropItem, b: PriceDropItem): number => {
  if (b.dropAmount !== a.dropAmount) return b.dropAmount - a.dropAmount;
  if (b.dropPercent !== a.dropPercent) return b.dropPercent - a.dropPercent;
  if (b.lastDropAt !== a.lastDropAt) return b.lastDropAt - a.lastDropAt;
  return a.property.id.localeCompare(b.property.id);
};

export const PERCENT_DESC_ORDER = (a: PriceDropItem, b: PriceDropItem): number => {
  if (b.dropPercent !== a.dropPercent) return b.dropPercent - a.dropPercent;
  if (b.dropAmount !== a.dropAmount) return b.dropAmount - a.dropAmount;
  if (b.lastDropAt !== a.lastDropAt) return b.lastDropAt - a.lastDropAt;
  return a.property.id.localeCompare(b.property.id);
};

export const RECENT_ORDER = (a: PriceDropItem, b: PriceDropItem): number => {
  if (b.lastDropAt !== a.lastDropAt) return b.lastDropAt - a.lastDropAt;
  if (b.latestRevision !== a.latestRevision) return b.latestRevision - a.latestRevision;
  if (b.dropAmount !== a.dropAmount) return b.dropAmount - a.dropAmount;
  return a.property.id.localeCompare(b.property.id);
};

export function priceDropMatchesFilter(property: Property, filter: FilterState): boolean {
  const fAny = filter as any;
  if (typeof fAny.includeVerified === "boolean" && !fAny.includeVerified && property.isVerified) {
    return false;
  }
  if (typeof fAny.includeUnverified === "boolean" && !fAny.includeUnverified && !property.isVerified) {
    return false;
  }

  return PropertyFilter.matches(
    property,
    filter,
    "",
    false,
    PropertyListMode.ALL
  );
}

export class PriceDropCalculator {
  static readonly AMOUNT_DESC_ORDER = AMOUNT_DESC_ORDER;
  static readonly PERCENT_DESC_ORDER = PERCENT_DESC_ORDER;
  static readonly RECENT_ORDER = RECENT_ORDER;

  static calculate(
    properties: Property[],
    allHistories: Map<string, PropertyPriceHistory[]> | Record<string, PropertyPriceHistory[]>,
    now: number,
    window: PriceDropWindow,
    sort: PriceDropSort = PriceDropSort.RECENT
  ): PriceDropItem[] {
    const windowStartMs =
      window === PriceDropWindow.ALL
        ? -Infinity
        : now - PRICE_DROP_WINDOW_CONFIG[window].days * 86_400_000;
    const candidateItems: PriceDropItem[] = [];

    const getHistories = (id: string): PropertyPriceHistory[] => {
      if (allHistories instanceof Map) {
        return allHistories.get(id) || [];
      }
      return (allHistories as Record<string, PropertyPriceHistory[]>)[id] || [];
    };

    for (const property of properties) {
      // 1. Must be active market property (not deleted, not draft, FOR_SALE or PENDING_SURVEY)
      if (!isActiveMarketProperty(property)) continue;

      // 2. Local restore pending must NOT appear in drops
      if ((property as any).priceHistoryResetPending) continue;

      // 3. Valid price
      if (property.price <= 0.0) continue;

      const histories = getHistories(property.id);
      if (histories.length === 0) continue;

      // Filter out future corrupt timestamps (> now + 60s)
      // Sort deterministically: revision ASC, recordedAt ASC
      const validHistories = histories
        .filter((h) => h.recordedAt <= now + MAX_FUTURE_TOLERANCE_MS)
        .sort((a, b) => {
          if (a.revision !== b.revision) return a.revision - b.revision;
          return a.recordedAt - b.recordedAt;
        });

      if (validHistories.length === 0) continue;

      // Latest accepted history event
      // Note: event with recordedAt > now (but <= now + 60s) is tolerated but not yet visible as of 'now'
      const visibleHistories = validHistories.filter((h) => h.recordedAt <= now);
      if (visibleHistories.length === 0) continue;

      const latestHistory = visibleHistories[visibleHistories.length - 1];

      // 4. Must match property.price within epsilon
      if (Math.abs(latestHistory.currentPrice - property.price) > PRICE_EPSILON) continue;

      // 5. Latest transition MUST be a PRICE_CHANGE with editKind == MARKET_CHANGE
      if (latestHistory.changeType !== PriceHistoryChangeType.PRICE_CHANGE) continue;
      if (latestHistory.editKind !== PriceEditKind.MARKET_CHANGE) continue;

      const previousPrice = latestHistory.previousPrice;
      if (previousPrice == null || previousPrice <= 0.0) continue;
      const currentPrice = latestHistory.currentPrice;

      // 6. Latest transition MUST be a price decrease!
      // If latest transition is increase or no-change, property is EXCLUDED even if it had earlier drops!
      const dropAmount = previousPrice - currentPrice;
      if (dropAmount <= PRICE_EPSILON) continue;

      // 7. Latest drop must have occurred within the selected window
      if (latestHistory.recordedAt < windowStartMs || latestHistory.recordedAt > now) continue;

      const dropPercent = (dropAmount / previousPrice) * 100.0;

      // 8. Snapshots of price-per-m2
      const currentArea = latestHistory.currentAreaSize ?? property.areaSize;
      const prevArea = latestHistory.previousAreaSize ?? currentArea;

      const currentPricePerM2 =
        latestHistory.currentPricePerM2 ??
        calculatePricePerM2Fallback(currentPrice, currentArea);

      const previousPricePerM2 =
        latestHistory.previousPricePerM2 ??
        calculatePricePerM2Fallback(previousPrice, prevArea);

      // 9. Count drops (only MARKET_CHANGE drops)
      let totalDropCount = 0;
      let dropCountInWindow = 0;
      for (const h of visibleHistories) {
        if (
          h.changeType === PriceHistoryChangeType.PRICE_CHANGE &&
          h.editKind === PriceEditKind.MARKET_CHANGE
        ) {
          const prev = h.previousPrice;
          if (prev != null && prev > 0.0 && prev - h.currentPrice > PRICE_EPSILON) {
            totalDropCount++;
            if (h.recordedAt >= windowStartMs && h.recordedAt <= now) {
              dropCountInWindow++;
            }
          }
        }
      }

      candidateItems.push({
        property,
        previousPrice,
        currentPrice,
        previousPricePerM2,
        currentPricePerM2,
        dropAmount,
        dropPercent,
        lastDropAt: latestHistory.recordedAt,
        dropCountInWindow,
        totalDropCountSinceBaseline: totalDropCount,
        latestRevision: latestHistory.revision
      });
    }

    // Sort items deterministically
    switch (sort) {
      case PriceDropSort.AMOUNT_DESC:
        return candidateItems.sort(AMOUNT_DESC_ORDER);
      case PriceDropSort.PERCENT_DESC:
        return candidateItems.sort(PERCENT_DESC_ORDER);
      case PriceDropSort.RECENT:
      default:
        return candidateItems.sort(RECENT_ORDER);
    }
  }

  static calculatePricePerM2Fallback = calculatePricePerM2Fallback;
  static formatRelativeDropTime = formatRelativeDropTime;
}
