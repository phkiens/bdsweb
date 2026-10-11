import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import JSZip from "jszip";
import { AppDatabase } from "../../src/data/local/db";
import {
  mapRemotePropertyToDomain,
  mapDomainPropertyToRemote,
  mapRemotePriceHistoryToDomain
} from "../../src/data/sync/sync-manager";
import {
  PriceHistoryChangeType,
  PriceEditKind,
  parsePriceHistoryChangeType,
  parsePriceEditKind,
  toDisplayLabel,
  PropertyPriceHistory
} from "../../src/core/models/price-history";
import {
  normalizePropertyPrice,
  determinePriceEditFields,
  computeCatchUpCursor
} from "../../src/core/utils/price-history-helper";
import { getVisibleHistories } from "../../src/data/local/price-history-queries";
import { exportDatabaseToZip, importDatabaseFromZip } from "../../src/core/utils/zip-backup";
import { createDefaultProperty } from "../../src/core/models/property";

describe("1. Map Remote ↔ Domain cho 4 cột mới và Price History", () => {
  it("mapRemotePropertyToDomain đọc đủ 4 cột mới khi có dữ liệu", () => {
    const remote = {
      id: "prop-test-01",
      area: "Bình Thạnh",
      price: 5.5,
      updated_at: 1789000000000,
      sold_at: 1789000001000,
      price_edit_kind: "DATA_CORRECTION",
      price_edit_at: 1789000000000,
      price_history_cleared_rev: 42
    };

    const domain = mapRemotePropertyToDomain(remote);
    expect(domain.soldAt).toBe(1789000001000);
    expect(domain.priceEditKind).toBe("DATA_CORRECTION");
    expect(domain.priceEditAt).toBe(1789000000000);
    expect(domain.priceHistoryClearedRev).toBe(42);
  });

  it("mapRemotePropertyToDomain gán mặc định null/0 khi 4 cột là null hoặc thiếu", () => {
    const remote = {
      id: "prop-test-02",
      area: "Quận 1",
      price: 10.0,
      updated_at: 1789000000000,
      sold_at: null,
      price_edit_kind: null,
      price_edit_at: null,
      price_history_cleared_rev: null
    };

    const domain = mapRemotePropertyToDomain(remote);
    expect(domain.soldAt).toBeNull();
    expect(domain.priceEditKind).toBeNull();
    expect(domain.priceEditAt).toBeNull();
    expect(domain.priceHistoryClearedRev).toBe(0);
  });

  it("mapDomainPropertyToRemote gửi đủ 4 cột mới (kể cả khi null)", () => {
    const propWithData = createDefaultProperty({
      id: "prop-dom-01",
      area: "Phú Nhuận",
      price: 8.2,
      soldAt: 1789100000000,
      priceEditKind: "MARKET_CHANGE",
      priceEditAt: 1789100000000,
      priceHistoryClearedRev: 15
    });

    const remote1 = mapDomainPropertyToRemote(propWithData);
    expect(remote1.sold_at).toBe(1789100000000);
    expect(remote1.price_edit_kind).toBe("MARKET_CHANGE");
    expect(remote1.price_edit_at).toBe(1789100000000);
    expect(remote1.price_history_cleared_rev).toBe(15);

    const propWithNulls = createDefaultProperty({
      id: "prop-dom-02",
      area: "Gò Vấp",
      price: 4.0,
      soldAt: null,
      priceEditKind: null,
      priceEditAt: null,
      priceHistoryClearedRev: 0
    });

    const remote2 = mapDomainPropertyToRemote(propWithNulls);
    expect("sold_at" in remote2).toBe(true);
    expect(remote2.sold_at).toBeNull();
    expect("price_edit_kind" in remote2).toBe(true);
    expect(remote2.price_edit_kind).toBeNull();
    expect("price_edit_at" in remote2).toBe(true);
    expect(remote2.price_edit_at).toBeNull();
    expect(remote2.price_history_cleared_rev).toBe(0);
  });

  it("mapRemotePriceHistoryToDomain ánh xạ chính xác và chuyển đổi kiểu chuẩn", () => {
    const remoteHistory = {
      id: "hist-001",
      revision: "105",
      property_id: "prop-01",
      change_type: "PRICE_CHANGE",
      edit_kind: "DATA_CORRECTION",
      previous_price: "4.5",
      current_price: "5.0",
      previous_area_size: "50",
      current_area_size: "50",
      previous_price_per_m2: "0.09",
      current_price_per_m2: "0.1",
      recorded_at: 1789200000000
    };

    const domain = mapRemotePriceHistoryToDomain(remoteHistory);
    expect(domain.id).toBe("hist-001");
    expect(domain.revision).toBe(105);
    expect(domain.propertyId).toBe("prop-01");
    expect(domain.changeType).toBe(PriceHistoryChangeType.PRICE_CHANGE);
    expect(domain.editKind).toBe(PriceEditKind.DATA_CORRECTION);
    expect(domain.previousPrice).toBe(4.5);
    expect(domain.currentPrice).toBe(5.0);
    expect(domain.recordedAt).toBe(1789200000000);
  });
});

describe("2. Lọc ẩn lịch sử giá theo mốc xóa (revision <= priceHistoryClearedRev)", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.price_histories.clear();
  });

  it("getVisibleHistories(propertyId) loại bỏ các dòng có revision <= priceHistoryClearedRev và sắp tăng dần", async () => {
    const prop1 = createDefaultProperty({
      id: "prop-cleared-01",
      area: "Bình Thạnh",
      priceHistoryClearedRev: 10
    });
    await db.properties.put(prop1);

    const histories: PropertyPriceHistory[] = [
      {
        id: "h1",
        revision: 5,
        propertyId: "prop-cleared-01",
        changeType: PriceHistoryChangeType.BASELINE,
        editKind: PriceEditKind.UNSPECIFIED,
        previousPrice: null,
        currentPrice: 4.0,
        previousAreaSize: null,
        currentAreaSize: null,
        previousPricePerM2: null,
        currentPricePerM2: null,
        recordedAt: 1000
      },
      {
        id: "h2",
        revision: 10,
        propertyId: "prop-cleared-01",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.DATA_CORRECTION,
        previousPrice: 4.0,
        currentPrice: 4.5,
        previousAreaSize: null,
        currentAreaSize: null,
        previousPricePerM2: null,
        currentPricePerM2: null,
        recordedAt: 2000
      },
      {
        id: "h3",
        revision: 15,
        propertyId: "prop-cleared-01",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.MARKET_CHANGE,
        previousPrice: 4.5,
        currentPrice: 5.0,
        previousAreaSize: null,
        currentAreaSize: null,
        previousPricePerM2: null,
        currentPricePerM2: null,
        recordedAt: 3000
      },
      {
        id: "h4",
        revision: 12,
        propertyId: "prop-cleared-01",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.DATA_CORRECTION,
        previousPrice: 4.5,
        currentPrice: 4.8,
        previousAreaSize: null,
        currentAreaSize: null,
        previousPricePerM2: null,
        currentPricePerM2: null,
        recordedAt: 2500
      }
    ];

    await db.price_histories.bulkPut(histories);

    const visible = await getVisibleHistories("prop-cleared-01", db);
    // revision 5 và 10 <= 10 nên bị ẩn; chỉ còn 12 và 15, sắp tăng dần
    expect(visible.map((h) => h.id)).toEqual(["h4", "h3"]);
    expect(visible.map((h) => h.revision)).toEqual([12, 15]);
  });

  it("căn không có trong DB thì mốc xóa = 0, hiển thị mọi dòng có revision > 0", async () => {
    const histories: PropertyPriceHistory[] = [
      {
        id: "h-ext-1",
        revision: 1,
        propertyId: "unknown-prop",
        changeType: PriceHistoryChangeType.BASELINE,
        editKind: PriceEditKind.UNSPECIFIED,
        previousPrice: null,
        currentPrice: 3.0,
        previousAreaSize: null,
        currentAreaSize: null,
        previousPricePerM2: null,
        currentPricePerM2: null,
        recordedAt: 1000
      },
      {
        id: "h-ext-2",
        revision: 4,
        propertyId: "unknown-prop",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.MARKET_CHANGE,
        previousPrice: 3.0,
        currentPrice: 3.5,
        previousAreaSize: null,
        currentAreaSize: null,
        previousPricePerM2: null,
        currentPricePerM2: null,
        recordedAt: 2000
      }
    ];

    await db.price_histories.bulkPut(histories);

    const visible = await getVisibleHistories("unknown-prop", db);
    expect(visible.map((h) => h.id)).toEqual(["h-ext-1", "h-ext-2"]);
    expect(visible.map((h) => h.revision)).toEqual([1, 4]);
  });
});

describe("3. Tính con trỏ bắt đầu tải bù (Catch-Up Cursor)", () => {
  it("watermark lưu > localMax: lấy min là localMax và lùi 200 không âm", () => {
    const { startRevision, cursor } = computeCatchUpCursor(600, 450, 200);
    expect(startRevision).toBe(450);
    expect(cursor).toBe(250);
  });

  it("watermark lưu < localMax: lấy min là persistedWatermark", () => {
    const { startRevision, cursor } = computeCatchUpCursor(300, 500, 200);
    expect(startRevision).toBe(300);
    expect(cursor).toBe(100);
  });

  it("không có dữ liệu (0 hoặc null): con trỏ = 0", () => {
    const { startRevision, cursor } = computeCatchUpCursor(0, null, 200);
    expect(startRevision).toBe(0);
    expect(cursor).toBe(0);

    const res2 = computeCatchUpCursor(0, 0, 200);
    expect(res2.startRevision).toBe(0);
    expect(res2.cursor).toBe(0);
  });

  it("lùi 200 không bao giờ âm (chặn ở 0)", () => {
    const { startRevision, cursor } = computeCatchUpCursor(120, 120, 200);
    expect(startRevision).toBe(120);
    expect(cursor).toBe(0);
  });
});

describe("4. Nhãn Edit Kind và phân tích chuỗi", () => {
  it("toDisplayLabel trả về đúng nhãn tiếng Việt chuẩn Android", () => {
    expect(toDisplayLabel(PriceEditKind.MARKET_CHANGE)).toBe("Thay đổi giá");
    expect(toDisplayLabel(PriceEditKind.DATA_CORRECTION)).toBe("Sửa thông tin giá");
    expect(toDisplayLabel(PriceEditKind.UNSPECIFIED)).toBe("Chưa phân loại");

    expect(toDisplayLabel("MARKET_CHANGE")).toBe("Thay đổi giá");
    expect(toDisplayLabel("DATA_CORRECTION")).toBe("Sửa thông tin giá");
    expect(toDisplayLabel("UNSPECIFIED")).toBe("Chưa phân loại");
  });

  it("chuỗi lạ hoặc null fallback về mặc định", () => {
    expect(toDisplayLabel("SOME_STRANGE_VALUE")).toBe("Chưa phân loại");
    expect(toDisplayLabel(null)).toBe("Chưa phân loại");
    expect(toDisplayLabel(undefined)).toBe("Chưa phân loại");

    expect(parsePriceEditKind("UNKNOWN")).toBe(PriceEditKind.UNSPECIFIED);
    expect(parsePriceEditKind(null)).toBe(PriceEditKind.UNSPECIFIED);

    expect(parsePriceHistoryChangeType("UNKNOWN")).toBe(PriceHistoryChangeType.BASELINE);
    expect(parsePriceHistoryChangeType(null)).toBe(PriceHistoryChangeType.BASELINE);
  });
});

describe("5. Form: Sửa giá gán DATA_CORRECTION và priceEditAt === updatedAt", () => {
  it("khi sửa căn và giá đổi (> 0.0001) => DATA_CORRECTION và priceEditAt === updatedAt", () => {
    const oldProp = createDefaultProperty({
      id: "prop-edit-01",
      price: 4.5
    });

    const now = 1789500000000;
    const result = determinePriceEditFields(true, oldProp, 4.8, now);

    expect(result.priceEditKind).toBe("DATA_CORRECTION");
    expect(result.priceEditAt).toBe(now);
    expect(result.priceEditAt).toBe(now);
  });

  it("khi giá không đổi (chênh lệch <= 0.0001) => cả hai null", () => {
    const oldProp = createDefaultProperty({
      id: "prop-edit-02",
      price: 4.5
    });

    const now = 1789500000000;
    // Chênh lệch cực nhỏ do số thực
    const result1 = determinePriceEditFields(true, oldProp, 4.50001, now);
    expect(result1.priceEditKind).toBeNull();
    expect(result1.priceEditAt).toBeNull();

    // Giữ nguyên giá
    const result2 = determinePriceEditFields(true, oldProp, 4.5, now);
    expect(result2.priceEditKind).toBeNull();
    expect(result2.priceEditAt).toBeNull();
  });

  it("căn mới (isEditMode = false) => cả hai luôn null", () => {
    const now = 1789500000000;
    const result = determinePriceEditFields(false, null, 6.0, now);
    expect(result.priceEditKind).toBeNull();
    expect(result.priceEditAt).toBeNull();
  });

  it("normalizePropertyPrice chuẩn hóa 3 chữ số thập phân", () => {
    expect(normalizePropertyPrice(4.5000001)).toBe(4.5);
    expect(normalizePropertyPrice(4.1236)).toBe(4.124);
    expect(normalizePropertyPrice(0)).toBe(0);
    expect(normalizePropertyPrice(-5)).toBe(0);
    expect(normalizePropertyPrice(NaN)).toBe(0);
  });
});

describe("6. ZIP: Xuất rồi nhập lại giữ nguyên 4 trường và lịch sử giá", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.customers.clear();
    await db.customer_property_links.clear();
    await db.price_histories.clear();
  });

  it("xuất và nhập ZIP giữ nguyên 4 trường mới và bảng price_histories", async () => {
    const testProp = createDefaultProperty({
      id: "prop-zip-full",
      area: "Quận 3, TP.HCM",
      price: 15.0,
      soldAt: 1789000000000,
      priceEditKind: "DATA_CORRECTION",
      priceEditAt: 1789000000000,
      priceHistoryClearedRev: 8
    });
    await db.properties.put(testProp);

    const testHistories: PropertyPriceHistory[] = [
      {
        id: "hist-zip-1",
        revision: 9,
        propertyId: "prop-zip-full",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.DATA_CORRECTION,
        previousPrice: 14.0,
        currentPrice: 15.0,
        previousAreaSize: 100,
        currentAreaSize: 100,
        previousPricePerM2: 0.14,
        currentPricePerM2: 0.15,
        recordedAt: 1789000000000
      }
    ];
    await db.price_histories.bulkPut(testHistories);

    // Xuất ra ZIP
    const zipBlob = await exportDatabaseToZip(db);
    expect(zipBlob).toBeDefined();

    // Kiểm tra cấu trúc ZIP chứa price_histories.json
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    expect(zip.file("price_histories.json")).toBeDefined();

    // Xóa sạch DB
    await db.properties.clear();
    await db.price_histories.clear();

    // Nhập lại từ ZIP
    const file = new File([zipBlob], "backup_with_history.zip", { type: "application/zip" });
    const importResult = await importDatabaseFromZip(file, db);

    expect(importResult.propertiesCount).toBe(1);
    // Commit 7b81f08: Bỏ qua nhập lịch sử giá từ ZIP, lịch sử giá được kéo từ máy chủ
    expect(importResult.priceHistoriesCount ?? 0).toBe(0);

    // Kiểm tra dữ liệu BĐS phục hồi
    const restoredProp = await db.properties.get("prop-zip-full");
    expect(restoredProp).toBeDefined();
    expect(restoredProp?.soldAt).toBe(1789000000000);
    expect(restoredProp?.priceEditKind).toBe("DATA_CORRECTION");
    expect(restoredProp?.priceEditAt).toBe(1789000000000);
    expect(restoredProp?.priceHistoryClearedRev).toBe(8);

    // Dữ liệu lịch sử giá từ ZIP được bỏ qua (không ghi đè cục bộ)
    const restoredHistories = await db.price_histories.toArray();
    expect(restoredHistories.length).toBe(0);

  });

  it("nhập ZIP cũ không có price_histories.json và thiếu 4 trường => nạp bình thường với mặc định null/0", async () => {
    const legacyZip = new JSZip();
    legacyZip.file(
      "properties.json",
      JSON.stringify([
        {
          id: "prop-legacy-01",
          area: "Tân Bình",
          price: 7.2,
          isVerified: true,
          updatedAt: 1000
        }
      ])
    );
    legacyZip.file("customers.json", JSON.stringify([]));
    legacyZip.file("customer_property_links.json", JSON.stringify([]));

    const zipBlob = await legacyZip.generateAsync({ type: "blob" });
    const file = new File([zipBlob], "legacy_backup.zip", { type: "application/zip" });

    const importResult = await importDatabaseFromZip(file, db);
    expect(importResult.propertiesCount).toBe(1);

    const restoredProp = await db.properties.get("prop-legacy-01");
    expect(restoredProp).toBeDefined();
    expect(restoredProp?.soldAt).toBeNull();
    expect(restoredProp?.priceEditKind).toBeNull();
    expect(restoredProp?.priceEditAt).toBeNull();
    expect(restoredProp?.priceHistoryClearedRev).toBe(0);

    const histories = await db.price_histories.toArray();
    expect(histories.length).toBe(0);
  });
});
