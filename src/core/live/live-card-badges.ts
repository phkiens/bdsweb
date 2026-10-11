import { LiveFeedItem } from "./live-feed";
import { LiveEventType } from "./live-event";
import { PropertyStatus } from "../models/enums";

/**
 * Nhãn trên thẻ trưng bày khi live.
 * dropPercent/oldPrice chỉ có khi lần đổi giá gần nhất (≤7 ngày) là GIẢM.
 * Chuẩn 100% Native Android LiveCardBadges.kt.
 */
export interface LiveCardBadge {
  isNew: boolean;
  dropPercent: number | null;
  oldPrice: number | null;
}

export type LiveCardBadgeMap = Map<string, LiveCardBadge> & {
  [propertyId: string]: LiveCardBadge | undefined;
};

export const LiveCardBadges = {
  /**
   * allItems = LiveFeedBuilder.build(..., hiddenKeys = new Set()) (CHƯA lọc tin đã ẩn).
   */
  build(allItems: LiveFeedItem[], hiddenKeys: Set<string>): LiveCardBadgeMap {
    const rawMap = new Map<string, LiveCardBadge>();
    const byProperty = new Map<string, LiveFeedItem[]>();

    for (const item of allItems) {
      const pid = item.property.id;
      let list = byProperty.get(pid);
      if (!list) {
        list = [];
        byProperty.set(pid, list);
      }
      list.push(item);
    }

    for (const [propertyId, items] of byProperty.entries()) {
      const property = items[0].property;
      if (property.status === PropertyStatus.SOLD || property.status === "Đã bán") {
        continue;
      }

      const newListingItem = items.find((it) => it.type === LiveEventType.NEW_LISTING);
      const isNew = Boolean(newListingItem && !hiddenKeys.has(newListingItem.key));

      const priceItems = items.filter(
        (it) => it.type === LiveEventType.PRICE_DROP || it.type === LiveEventType.PRICE_RISE
      );

      let priceItem: LiveFeedItem | null = null;
      for (const item of priceItems) {
        if (!priceItem || item.at > priceItem.at) {
          priceItem = item;
        }
      }

      let dropPercent: number | null = null;
      let finalOldPrice: number | null = null;

      if (priceItem && priceItem.type === LiveEventType.PRICE_DROP) {
        const oldPrice = priceItem.oldPrice ?? 0;
        const newPrice = priceItem.newPrice ?? 0;
        if (oldPrice > 0 && newPrice > 0) {
          const drop = Math.round(((oldPrice - newPrice) / oldPrice) * 100);
          if (drop > 0) {
            dropPercent = drop;
            finalOldPrice = oldPrice;
          }
        }
      }

      if (isNew || dropPercent !== null) {
        rawMap.set(propertyId, {
          isNew,
          dropPercent,
          oldPrice: finalOldPrice
        });
      }
    }

    return new Proxy(rawMap, {
      get(target, prop, receiver) {
        if (typeof prop === "string" && !Reflect.has(target, prop) && target.has(prop)) {
          return target.get(prop);
        }
        const val = Reflect.get(target, prop, receiver);
        return typeof val === "function" ? val.bind(target) : val;
      }
    }) as LiveCardBadgeMap;
  }
};
