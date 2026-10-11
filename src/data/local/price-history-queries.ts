import { db, AppDatabase } from "./db";
import { PropertyPriceHistory } from "../../core/models/price-history";

/**
 * Lấy danh sách lịch sử giá hiển thị được:
 * Bỏ các dòng có revision <= priceHistoryClearedRev của căn đó (căn không có trong DB => mốc 0).
 * Sắp xếp theo revision tăng dần.
 * Khớp hoàn toàn với PropertyPriceHistoryDao trong Android.
 */
export async function getVisibleHistories(
  propertyId?: string,
  database: AppDatabase = db
): Promise<PropertyPriceHistory[]> {
  if (propertyId) {
    const prop = await database.properties.get(propertyId);
    const clearedRev = prop?.priceHistoryClearedRev ?? 0;
    const histories = await database.price_histories
      .where("propertyId")
      .equals(propertyId)
      .toArray();

    return histories
      .filter((h) => h.revision > clearedRev)
      .sort((a, b) => a.revision - b.revision);
  }

  const allHistories = await database.price_histories.toArray();
  const properties = await database.properties.toArray();
  const clearedMap = new Map<string, number>();
  for (const p of properties) {
    clearedMap.set(p.id, p.priceHistoryClearedRev ?? 0);
  }

  return allHistories
    .filter((h) => {
      const clearedRev = clearedMap.get(h.propertyId) ?? 0;
      return h.revision > clearedRev;
    })
    .sort((a, b) => a.revision - b.revision);
}

/**
 * Lấy revision lớn nhất hiện có trong local database
 */
export async function getMaxPriceHistoryRevision(database: AppDatabase = db): Promise<number | null> {
  const last = await database.price_histories.orderBy("revision").last();
  return last ? last.revision : null;
}
