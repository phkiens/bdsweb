import { LiveEvent, LiveEventType } from "./live-event";
import { formatPropertyPrice } from "../utils/property-price";
import { toTitleCase } from "../utils/vietnamese";

export interface LiveEventText {
  title: string;
  subtitle: string;
  detail: string;
}

export const LiveEventStyle = {
  BANNER_MS: 6000,
  HIGHLIGHT_MS: 15000,
  MAX_BACKLOG: 3,

  color(type: LiveEventType): string {
    switch (type) {
      case LiveEventType.NEW_LISTING:
        return "#1E88E5";
      case LiveEventType.PRICE_DROP:
        return "#E53935";
      case LiveEventType.PRICE_RISE:
        return "#FB8C00";
      case LiveEventType.SOLD:
        return "#2E7D32";
      case LiveEventType.BACK_ON_SALE:
        return "#00897B";
      case LiveEventType.PHOTOS_ADDED:
        return "#8E24AA";
    }
  },

  emoji(type: LiveEventType): string {
    switch (type) {
      case LiveEventType.NEW_LISTING:
        return "🆕";
      case LiveEventType.PRICE_DROP:
        return "🔥";
      case LiveEventType.PRICE_RISE:
        return "📈";
      case LiveEventType.SOLD:
        return "🎉";
      case LiveEventType.BACK_ON_SALE:
        return "🔄";
      case LiveEventType.PHOTOS_ADDED:
        return "📸";
    }
  },

  percentLabel(event: LiveEvent): string | null {
    const type = event.type;
    if (type !== LiveEventType.PRICE_DROP && type !== LiveEventType.PRICE_RISE) return null;
    const before = event.before;
    if (!before || before.price <= 0.0) return null;
    const after = event.after;
    const percent = Math.round(((after.price - before.price) / before.price) * 100);
    if (percent === 0) return null;
    const sign = type === LiveEventType.PRICE_DROP ? "−" : "+";
    return `${sign}${Math.abs(percent)}%`;
  },

  text(event: LiveEvent): LiveEventText {
    const type = event.type;
    const before = event.before;
    const after = event.after;

    const area = toTitleCase(after.area) || "BĐS";
    const areaSizeVal = after.areaSize ?? 0.0;
    const sizeStr = areaSizeVal > 0 ? ` · ${Number(areaSizeVal.toFixed(1))} m²` : "";
    const subtitle = area + sizeStr;

    let detail = "";
    switch (type) {
      case LiveEventType.PRICE_DROP:
      case LiveEventType.PRICE_RISE: {
        const pLabel = LiveEventStyle.percentLabel(event);
        if (before != null && before.price > 0.0) {
          const percentStr = pLabel != null ? ` (${pLabel})` : "";
          const beforeStr = formatPropertyPrice(before.price) ?? "0";
          const afterStr = formatPropertyPrice(after.price) ?? "0";
          detail = `${beforeStr} → ${afterStr}${percentStr}`;
        } else {
          detail = formatPropertyPrice(after.price) ?? "";
        }
        break;
      }
      case LiveEventType.PHOTOS_ADDED: {
        detail = `+${event.photosAdded ?? 0} ảnh mới`;
        break;
      }
      case LiveEventType.NEW_LISTING:
      case LiveEventType.SOLD:
      case LiveEventType.BACK_ON_SALE: {
        detail = formatPropertyPrice(after.price) ?? "";
        break;
      }
    }

    let title = "";
    switch (type) {
      case LiveEventType.NEW_LISTING:
        title = "SP MỚI";
        break;
      case LiveEventType.PRICE_DROP:
        title = "GIẢM GIÁ";
        break;
      case LiveEventType.PRICE_RISE:
        title = "TĂNG GIÁ";
        break;
      case LiveEventType.SOLD:
        title = "ĐÃ BÁN";
        break;
      case LiveEventType.BACK_ON_SALE:
        title = "MỞ BÁN LẠI";
        break;
      case LiveEventType.PHOTOS_ADDED:
        title = "THÊM ẢNH";
        break;
    }

    return { title, subtitle, detail };
  },
};
