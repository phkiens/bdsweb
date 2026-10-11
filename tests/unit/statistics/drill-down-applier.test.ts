import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  PriceHistoryChangeType,
  PriceEditKind,
  PropertyPriceHistory
} from "../../../src/core/models/price-history";
import {
  DrillDownFilter,
  DrillDownSource
} from "../../../src/core/statistics/drill-down-filter";
import { VerifiedMode } from "../../../src/core/statistics/statistics-filter";
import {
  applyDrillDownFilter,
  getVisibleHistories
} from "../../../src/core/statistics/drill-down-applier";

describe("DrillDownApplierTest", () => {
  const now = 1_700_000_000_000;

  function createTestProperty(params: {
    id: string;
    area?: string;
    price?: number;
    status?: string;
    isVerified?: boolean;
    isDeleted?: boolean;
    isDraft?: boolean;
    createdAt?: number;
    priceHistoryClearedRev?: number;
    linkedCustomerId?: string | null;
  }): Property {
    const createdAt = params.createdAt ?? now;
    return createDefaultProperty({
      id: params.id,
      area: params.area ?? "Lê Chân",
      price: params.price ?? 2.5,
      status: params.status ?? PropertyStatus.FOR_SALE,
      isDraft: params.isDraft ?? false,
      isVerified: params.isVerified ?? true,
      isDeleted: params.isDeleted ?? false,
      createdAt,
      updatedAt: createdAt,
      priceHistoryClearedRev: params.priceHistoryClearedRev ?? 0,
      linkedCustomerId: params.linkedCustomerId ?? null
    });
  }

  it("testApplyDrillDownFilter_returnsAllWhenFilterIsNull", () => {
    const props = [createTestProperty({ id: "p1" }), createTestProperty({ id: "p2" })];
    expect(applyDrillDownFilter(props, null)).toEqual(props);
    expect(applyDrillDownFilter(props, undefined)).toEqual(props);
  });

  it("testApplyDrillDownFilter_filtersByVerifiedModeAndStatus", () => {
    const p1 = createTestProperty({ id: "p1", isVerified: true, status: PropertyStatus.FOR_SALE });
    const p2 = createTestProperty({ id: "p2", isVerified: true, status: PropertyStatus.SOLD });
    const p3 = createTestProperty({ id: "p3", isVerified: false, status: PropertyStatus.FOR_SALE });

    const forSaleFilter = new DrillDownFilter({
      source: DrillDownSource.INVENTORY,
      contextLabel: "Đang bán",
      verifiedMode: VerifiedMode.VERIFIED_ONLY,
      targetStatus: PropertyStatus.FOR_SALE
    });

    const result = applyDrillDownFilter([p1, p2, p3], forSaleFilter, { now });
    expect(result.map((p) => p.id)).toEqual(["p1"]);
  });

  it("testApplyDrillDownFilter_filtersUnverifiedOnly", () => {
    const p1 = createTestProperty({ id: "p1", isVerified: true });
    const p2 = createTestProperty({ id: "p2", isVerified: false });

    const unverifiedFilter = new DrillDownFilter({
      source: DrillDownSource.INVENTORY,
      contextLabel: "Chờ xác minh",
      verifiedMode: VerifiedMode.UNVERIFIED_ONLY
    });

    const result = applyDrillDownFilter([p1, p2], unverifiedFilter, { now });
    expect(result.map((p) => p.id)).toEqual(["p2"]);
  });

  it("testApplyDrillDownFilter_filtersAgingOver90Days", () => {
    const dayMs = 86_400_000;
    const pYoung = createTestProperty({ id: "pYoung", createdAt: now - 30 * dayMs });
    const pOld = createTestProperty({ id: "pOld", createdAt: now - 100 * dayMs });

    const agingFilter = new DrillDownFilter({
      source: DrillDownSource.AGING_BUCKET,
      contextLabel: "Tồn kho trên 90 ngày",
      minAgeDays: 91,
      verifiedMode: VerifiedMode.VERIFIED_ONLY,
      targetStatus: PropertyStatus.FOR_SALE
    });

    const result = applyDrillDownFilter([pYoung, pOld], agingFilter, { now });
    expect(result.map((p) => p.id)).toEqual(["pOld"]);
  });

  it("testGetVisibleHistories_filtersClearedRevisionsAndSortsAsc", () => {
    const p1 = createTestProperty({ id: "p1", priceHistoryClearedRev: 2 });
    const p2 = createTestProperty({ id: "p2", priceHistoryClearedRev: 0 });

    const histories: PropertyPriceHistory[] = [
      {
        id: "h3",
        revision: 3,
        propertyId: "p1",
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.MARKET_CHANGE,
        previousPrice: 3.0,
        currentPrice: 2.8,
        previousAreaSize: 50,
        currentAreaSize: 50,
        previousPricePerM2: 0.06,
        currentPricePerM2: 0.056,
        recordedAt: 3000
      },
      {
        id: "h1",
        revision: 1,
        propertyId: "p1", // revision 1 <= clearedRev 2 -> should be excluded
        changeType: PriceHistoryChangeType.BASELINE,
        editKind: PriceEditKind.UNSPECIFIED,
        previousPrice: null,
        currentPrice: 3.2,
        previousAreaSize: null,
        currentAreaSize: 50,
        previousPricePerM2: null,
        currentPricePerM2: 0.064,
        recordedAt: 1000
      },
      {
        id: "h2",
        revision: 2,
        propertyId: "p1", // revision 2 <= clearedRev 2 -> should be excluded
        changeType: PriceHistoryChangeType.PRICE_CHANGE,
        editKind: PriceEditKind.DATA_CORRECTION,
        previousPrice: 3.2,
        currentPrice: 3.0,
        previousAreaSize: 50,
        currentAreaSize: 50,
        previousPricePerM2: 0.064,
        currentPricePerM2: 0.06,
        recordedAt: 2000
      },
      {
        id: "h0",
        revision: 1,
        propertyId: "p2", // revision 1 > clearedRev 0 -> should be included
        changeType: PriceHistoryChangeType.BASELINE,
        editKind: PriceEditKind.UNSPECIFIED,
        previousPrice: null,
        currentPrice: 5.0,
        previousAreaSize: null,
        currentAreaSize: 100,
        previousPricePerM2: null,
        currentPricePerM2: 0.05,
        recordedAt: 500
      }
    ];

    const visible = getVisibleHistories(histories, [p1, p2]);
    expect(visible.map((h) => h.id)).toEqual(["h0", "h3"]);
    expect(visible[0].revision).toBe(1);
    expect(visible[1].revision).toBe(3);
  });
});
