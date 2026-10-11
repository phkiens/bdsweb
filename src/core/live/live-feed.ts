import { LiveEventType } from "./live-event";
import { Property } from "../models/property";
import {
  PropertyPriceHistory,
  PriceHistoryChangeType,
  PriceEditKind,
} from "../models/price-history";
import { PropertyStatus } from "../models/enums";

/** Một tin trong màn "Tin mới". key ổn định để nhớ tin đã xem/đã bỏ. */
export interface LiveFeedItem {
  key: string;
  type: LiveEventType; // chỉ NEW_LISTING, PRICE_DROP, PRICE_RISE, SOLD
  property: Property;
  at: number;
  oldPrice?: number | null;
  newPrice?: number | null;
}

export enum LiveFeedDay {
  TODAY = "TODAY",
  YESTERDAY = "YESTERDAY",
  EARLIER = "EARLIER",
}

function getLocalDateParts(epochMs: number, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
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

export const LiveFeedBuilder = {
  WINDOW_MS: 7 * 24 * 60 * 60 * 1000,

  build(
    properties: Property[],
    histories: PropertyPriceHistory[],
    now: number,
    hiddenKeys: Set<string>
  ): LiveFeedItem[] {
    const minTime = now - LiveFeedBuilder.WINDOW_MS;
    const items: LiveFeedItem[] = [];
    const propMap = new Map<string, Property>();
    for (const p of properties) {
      propMap.set(p.id, p);
    }

    for (const property of properties) {
      if (!property.isVerified || property.isDraft || property.isDeleted) continue;

      // NEW_LISTING
      const createdAt = property.createdAt;
      if (createdAt >= minTime && createdAt <= now) {
        items.push({
          key: `new:${property.id}`,
          type: LiveEventType.NEW_LISTING,
          property,
          at: createdAt,
        });
      }

      // SOLD
      if (
        property.status === PropertyStatus.SOLD &&
        property.soldAt != null &&
        property.soldAt >= minTime &&
        property.soldAt <= now
      ) {
        items.push({
          key: `sold:${property.id}:${property.soldAt}`,
          type: LiveEventType.SOLD,
          property,
          at: property.soldAt,
        });
      }
    }

    // PRICE CHANGES
    for (const history of histories) {
      const property = propMap.get(history.propertyId);
      if (!property) continue;
      if (!property.isVerified || property.isDraft || property.isDeleted) continue;

      if (
        history.changeType === PriceHistoryChangeType.PRICE_CHANGE &&
        history.editKind !== PriceEditKind.DATA_CORRECTION
      ) {
        if (history.recordedAt >= minTime && history.recordedAt <= now) {
          const old = history.previousPrice;
          const current = history.currentPrice;
          if (old != null && old > 0.0 && current > 0.0 && Math.abs(current - old) > 0.0001) {
            const type = current < old ? LiveEventType.PRICE_DROP : LiveEventType.PRICE_RISE;
            items.push({
              key: `price:${history.id}`,
              type,
              property,
              at: history.recordedAt,
              oldPrice: old,
              newPrice: current,
            });
          }
        }
      }
    }

    return items
      .filter((it) => !hiddenKeys.has(it.key))
      .sort((a, b) => {
        if (b.at !== a.at) return b.at - a.at;
        return a.key.localeCompare(b.key);
      });
  },

  dayOf(at: number, now: number, timeZone: string = "Asia/Ho_Chi_Minh"): LiveFeedDay {
    const pAt = getLocalDateParts(at, timeZone);
    const pNow = getLocalDateParts(now, timeZone);

    const dateAtMs = Date.UTC(pAt.year, pAt.month - 1, pAt.day);
    const dateNowMs = Date.UTC(pNow.year, pNow.month - 1, pNow.day);
    const diffDays = Math.round((dateNowMs - dateAtMs) / 86_400_000);

    if (diffDays === 0) return LiveFeedDay.TODAY;
    if (diffDays === 1) return LiveFeedDay.YESTERDAY;
    return LiveFeedDay.EARLIER;
  },
};
