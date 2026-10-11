import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import { PriceEditKind } from "../models/price-history";
import { parseR2MediaKeys } from "../../data/remote/r2-media-client";

export enum LiveEventType {
  NEW_LISTING = "NEW_LISTING",
  PRICE_DROP = "PRICE_DROP",
  PRICE_RISE = "PRICE_RISE",
  SOLD = "SOLD",
  BACK_ON_SALE = "BACK_ON_SALE",
  PHOTOS_ADDED = "PHOTOS_ADDED",
}

/**
 * Một thay đổi đáng "khoe" khi livestream. Mang theo bản trước/sau để mọi hiệu ứng tự lấy dữ liệu,
 * không phải truy vấn lại DB. seq và publishedAt do LiveEventBus gán lúc phát.
 */
export interface LiveEvent {
  type: LiveEventType;
  before: Property | null;
  after: Property;
  photosAdded?: number;
  seq?: number;
  publishedAt?: number;
  propertyId?: string;
}

export const FRESH_WINDOW_MS = 2 * 60 * 1000;
const PRICE_EPSILON = 0.0001;

function isPublic(p: Property): boolean {
  return p.isVerified && !p.isDraft && !p.isDeleted;
}

export function mediaCount(p: Property): number {
  const local = p.imagePath
    ? p.imagePath.split("|||").filter((it) => it.trim().length > 0).length
    : 0;
  let remote = 0;
  if (p.r2MediaKeys && p.r2MediaKeys.trim().length > 0) {
    try {
      const parsed = JSON.parse(p.r2MediaKeys);
      remote = Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      remote = parseR2MediaKeys(p.r2MediaKeys).length;
    }
  }
  return Math.max(local, remote);
}

/** So bản trước/sau của một BĐS => các sự kiện live. Hàm thuần, không I/O. */
export class LiveEventDetector {
  static readonly FRESH_WINDOW_MS = FRESH_WINDOW_MS;

  static mediaCount(p: Property): number {
    return mediaCount(p);
  }

  static detect(before: Property | null, after: Property, now: number): LiveEvent[] {
    if (!isPublic(after)) return [];
    if (now - after.updatedAt > FRESH_WINDOW_MS) return [];
    if (before == null || !isPublic(before)) {
      return [
        {
          type: LiveEventType.NEW_LISTING,
          before,
          after,
          photosAdded: 0,
          seq: 0,
          publishedAt: 0,
          propertyId: after.id,
        },
      ];
    }

    const events: LiveEvent[] = [];
    const wasSold = before.status === PropertyStatus.SOLD;
    const isSold = after.status === PropertyStatus.SOLD;
    if (!wasSold && isSold) {
      events.push({
        type: LiveEventType.SOLD,
        before,
        after,
        photosAdded: 0,
        seq: 0,
        publishedAt: 0,
        propertyId: after.id,
      });
    }
    if (wasSold && after.status === PropertyStatus.FOR_SALE) {
      events.push({
        type: LiveEventType.BACK_ON_SALE,
        before,
        after,
        photosAdded: 0,
        seq: 0,
        publishedAt: 0,
        propertyId: after.id,
      });
    }

    // Sửa giá trong form = sửa nhập sai (DATA_CORRECTION) => không coi là giảm/tăng giá thật.
    const priceChanged =
      before.price > 0.0 &&
      after.price > 0.0 &&
      Math.abs(after.price - before.price) > PRICE_EPSILON;
    const isCorrection = after.priceEditKind === PriceEditKind.DATA_CORRECTION;
    if (priceChanged && !isCorrection) {
      const type = after.price < before.price ? LiveEventType.PRICE_DROP : LiveEventType.PRICE_RISE;
      events.push({
        type,
        before,
        after,
        photosAdded: 0,
        seq: 0,
        publishedAt: 0,
        propertyId: after.id,
      });
    }

    const added = mediaCount(after) - mediaCount(before);
    if (added > 0) {
      events.push({
        type: LiveEventType.PHOTOS_ADDED,
        before,
        after,
        photosAdded: added,
        seq: 0,
        publishedAt: 0,
        propertyId: after.id,
      });
    }

    return events;
  }
}
