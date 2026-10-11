import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import { PriceTableCalculator } from "../../../src/core/statistics/price-table-calculator";
import { PerformanceCalculator } from "../../../src/core/statistics/performance-calculator";
import { PriceMapCalculator } from "../../../src/core/statistics/price-map-calculator";
import { ValuationCalculator } from "../../../src/core/statistics/valuation-calculator";
import { DrillDownFilterFactory } from "../../../src/core/statistics/drill-down-filter-factory";
import { DrillDownFilter, DrillDownSource } from "../../../src/core/statistics/drill-down-filter";
import {
  isActiveMarketProperty,
  StatisticsDateRange,
  StatisticsFilter,
  VerifiedMode
} from "../../../src/core/statistics/statistics-filter";

describe("UnverifiedDrillDownIntegrationTest", () => {
  const now = 1_700_000_000_000; // 2023-11-15T05:13:20Z (Asia/Ho_Chi_Minh: 2023-11-15 12:13:20)

  function createTestProperty(params: {
    id: string;
    area?: string;
    propertyType?: string;
    price?: number;
    areaSize?: number | null;
    status?: string;
    isVerified?: boolean;
    isDeleted?: boolean;
    isDraft?: boolean;
    createdAt?: number;
    latitude?: number | null;
    longitude?: number | null;
    title?: string | null;
  }): Property {
    const createdAt = params.createdAt ?? now;
    return createDefaultProperty({
      id: params.id,
      title: params.title ?? `BĐS ${params.id}`,
      area: params.area ?? "Lê Chân",
      latitude: params.latitude ?? null,
      longitude: params.longitude ?? null,
      description: "",
      areaSize: params.areaSize !== undefined ? params.areaSize : 50.0,
      price: params.price ?? 2.5,
      status: params.status ?? "Đang bán",
      propertyType: params.propertyType ?? "Nhà ngõ",
      isDraft: params.isDraft ?? false,
      createdAt,
      updatedAt: createdAt,
      isVerified: params.isVerified ?? false,
      isDeleted: params.isDeleted ?? false
    });
  }

  function filterProperties(
    properties: Property[],
    drillDownFilter: DrillDownFilter,
    nowMs: number
  ): Property[] {
    return properties.filter((p) =>
      drillDownFilter.matches({
        property: p,
        now: nowMs
      })
    );
  }

  it("testVerifiedModeContract_alwaysFixedToUnverifiedOnly", () => {
    // Factory MUST strictly set verifiedMode to UNVERIFIED_ONLY, ignoring filter's verifiedMode
    const filterVerifiedOnly = new StatisticsFilter({ verifiedMode: VerifiedMode.VERIFIED_ONLY });
    const drillDown1 = DrillDownFilterFactory.createUnverifiedFilter(filterVerifiedOnly, now);
    expect(drillDown1.verifiedMode).toBe(VerifiedMode.UNVERIFIED_ONLY);

    const filterAll = new StatisticsFilter({ verifiedMode: VerifiedMode.ALL });
    const drillDown2 = DrillDownFilterFactory.createUnverifiedFilter(filterAll, now);
    expect(drillDown2.verifiedMode).toBe(VerifiedMode.UNVERIFIED_ONLY);
  });

  it("testIntegration_matchingCountAndIdSetBetweenFactoryAndDrillDown", () => {
    const window = StatisticsDateRange.resolveDaysWindow(now, 7);

    const valid1 = createTestProperty({
      id: "valid1",
      title: "Tin chờ 1",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      createdAt: window.startInclusive + 1000
    });
    const valid2 = createTestProperty({
      id: "valid2",
      title: "Tin chờ 2",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 3.0,
      areaSize: 70.0,
      isVerified: false,
      createdAt: window.startInclusive + 5000
    });
    const deleted = createTestProperty({
      id: "deleted",
      title: "Tin chờ đã xóa",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      isDeleted: true,
      createdAt: window.startInclusive + 1000
    });
    const draft = createTestProperty({
      id: "draft",
      title: "Tin chờ nháp",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      isDraft: true,
      createdAt: window.startInclusive + 1000
    });
    const verified = createTestProperty({
      id: "verified",
      title: "Tin đã duyệt",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: true,
      createdAt: window.startInclusive + 1000
    });
    const wrongArea = createTestProperty({
      id: "wrongArea",
      title: "Tin ngoài quận",
      area: "Ngô Quyền",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      createdAt: window.startInclusive + 1000
    });
    const outsideDateBefore = createTestProperty({
      id: "outsideDateBefore",
      title: "Tin tạo trước cửa sổ",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      createdAt: window.startInclusive - 1000
    });
    const outsideDateAtEnd = createTestProperty({
      id: "outsideDateAtEnd",
      title: "Tin đúng mốc endExclusive",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      createdAt: window.endExclusive
    });
    const exactStart = createTestProperty({
      id: "exactStart",
      title: "Tin đúng mốc startInclusive",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 60.0,
      isVerified: false,
      createdAt: window.startInclusive
    });

    const allProperties = [
      valid1,
      valid2,
      deleted,
      draft,
      verified,
      wrongArea,
      outsideDateBefore,
      outsideDateAtEnd,
      exactStart
    ];

    const statsFilter = new StatisticsFilter({
      dateRange: StatisticsDateRange.Last7Days,
      area: "Lê Chân",
      propertyType: "Nhà ngõ"
    });

    const drillDownFilter = DrillDownFilterFactory.createUnverifiedFilter(
      statsFilter,
      now,
      DrillDownSource.INVENTORY
    );

    const expectedMatching = [valid1, valid2, exactStart];
    const countFromFactory = DrillDownFilterFactory.countMatching(allProperties, drillDownFilter, now);
    const actualDrillDownList = filterProperties(allProperties, drillDownFilter, now);

    expect(countFromFactory).toBe(expectedMatching.length);
    expect(actualDrillDownList.length).toBe(countFromFactory);
    expect(new Set(actualDrillDownList.map((it) => it.id))).toEqual(
      new Set(expectedMatching.map((it) => it.id))
    );
  });

  it("testOverviewAndActionCenterFilters_yieldSameIdSet", () => {
    const window = StatisticsDateRange.resolveDaysWindow(now, 7);
    const prop = createTestProperty({
      id: "p1",
      title: "Tin chờ",
      area: "Hải An",
      propertyType: "Đất",
      price: 1.8,
      areaSize: 80.0,
      isVerified: false,
      createdAt: window.startInclusive + 2000
    });
    const properties = [prop];
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });

    const overviewFilter = DrillDownFilterFactory.createUnverifiedFilter(filter, now, DrillDownSource.INVENTORY);
    const actionCenterFilter = DrillDownFilterFactory.createUnverifiedFilter(filter, now, DrillDownSource.ACTION_CENTER);

    expect(overviewFilter.source).toBe(DrillDownSource.INVENTORY);
    expect(actionCenterFilter.source).toBe(DrillDownSource.ACTION_CENTER);

    const listFromOverview = filterProperties(properties, overviewFilter, now);
    const listFromActionCenter = filterProperties(properties, actionCenterFilter, now);

    expect(new Set(listFromOverview.map((it) => it.id))).toEqual(
      new Set(listFromActionCenter.map((it) => it.id))
    );
    expect(listFromOverview.length).toBe(1);
  });

  it("testNumericFilters_zeroAndNullHandlingFailClosed", () => {
    const window = StatisticsDateRange.resolveDaysWindow(now, 7);
    const propZeroPrice = createTestProperty({
      id: "zeroPrice",
      title: "Tin thiếu giá (price = 0.0)",
      area: "Lê Chân",
      propertyType: "Nhà",
      price: 0.0,
      areaSize: 50.0,
      isVerified: false,
      createdAt: window.startInclusive + 1000
    });
    const propNullArea = createTestProperty({
      id: "nullArea",
      title: "Tin thiếu diện tích (areaSize = null)",
      area: "Lê Chân",
      propertyType: "Nhà",
      price: 3.0,
      areaSize: null,
      isVerified: false,
      createdAt: window.startInclusive + 1000
    });
    const properties = [propZeroPrice, propNullArea];

    // Case A: No numeric filter => both items are preserved
    const noNumericFilter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const drillDownNoNumeric = DrillDownFilterFactory.createUnverifiedFilter(noNumericFilter, now);
    const listNoNumeric = filterProperties(properties, drillDownNoNumeric, now);
    expect(listNoNumeric.length).toBe(2);
    expect(DrillDownFilterFactory.countMatching(properties, drillDownNoNumeric, now)).toBe(2);

    // Case B: Has priceMax => price 0.0 MUST be rejected (fail-closed)
    const priceFilter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days, priceMax: 5.0 });
    const drillDownPrice = DrillDownFilterFactory.createUnverifiedFilter(priceFilter, now);
    const listPrice = filterProperties(properties, drillDownPrice, now);
    expect(listPrice.some((it) => it.id === "zeroPrice")).toBe(false);
    expect(DrillDownFilterFactory.countMatching(properties, drillDownPrice, now)).toBe(listPrice.length);

    // Case C: Has areaSizeMax => areaSize null MUST be rejected (fail-closed)
    const areaFilter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days, areaSizeMax: 100.0 });
    const drillDownArea = DrillDownFilterFactory.createUnverifiedFilter(areaFilter, now);
    const listArea = filterProperties(properties, drillDownArea, now);
    expect(listArea.some((it) => it.id === "nullArea")).toBe(false);
    expect(DrillDownFilterFactory.countMatching(properties, drillDownArea, now)).toBe(listArea.length);
  });

  it("testStatusHandling_exactPhysicalMatchingAndFailClosed", () => {
    const window = StatisticsDateRange.resolveDaysWindow(now, 7);
    const forSaleProp = createTestProperty({
      id: "forSale",
      area: "Lê Chân",
      propertyType: "Nhà",
      price: 2.0,
      areaSize: 50.0,
      status: "Đang bán",
      isVerified: false,
      createdAt: window.startInclusive + 1000
    });
    const properties = [forSaleProp];

    // 1. Physical Vietnamese value "Đang bán"
    const filter1 = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days, status: "Đang bán" });
    const dd1 = DrillDownFilterFactory.createUnverifiedFilter(filter1, now);
    expect(dd1.targetStatus).toBe(PropertyStatus.FOR_SALE);
    expect(dd1.isFailClosed).toBe(false);
    expect(DrillDownFilterFactory.countMatching(properties, dd1, now)).toBe(1);
    expect(filterProperties(properties, dd1, now).length).toBe(1);

    // 2. Enum name "FOR_SALE"
    const filter2 = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days, status: "FOR_SALE" });
    const dd2 = DrillDownFilterFactory.createUnverifiedFilter(filter2, now);
    expect(dd2.targetStatus).toBe(PropertyStatus.FOR_SALE);
    expect(dd2.isFailClosed).toBe(false);
    expect(DrillDownFilterFactory.countMatching(properties, dd2, now)).toBe(1);

    // 3. Unmapped / Unknown status => fail-closed
    const filterUnknown = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days, status: "TRANG_THAI_KHONG_TON_TAI" });
    const ddUnknown = DrillDownFilterFactory.createUnverifiedFilter(filterUnknown, now);
    expect(ddUnknown.isFailClosed).toBe(true);
    expect(DrillDownFilterFactory.countMatching(properties, ddUnknown, now)).toBe(0);
    expect(filterProperties(properties, ddUnknown, now).length).toBe(0);
  });

  it("testMarketIsolationAcrossAllFourCalculators", () => {
    const verified1 = createTestProperty({
      id: "v1",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.0,
      areaSize: 50.0,
      status: "Đang bán",
      isVerified: true,
      createdAt: now - 1000,
      latitude: 20.85,
      longitude: 106.68
    });
    const verified2 = createTestProperty({
      id: "v2",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.5,
      areaSize: 50.0,
      status: "Đang bán",
      isVerified: true,
      createdAt: now - 2000,
      latitude: 20.851,
      longitude: 106.681
    });
    const verified3 = createTestProperty({
      id: "v3",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 3.0,
      areaSize: 50.0,
      status: "Đang bán",
      isVerified: true,
      createdAt: now - 3000,
      latitude: 20.852,
      longitude: 106.682
    });
    const verifiedSold = createTestProperty({
      id: "vSold",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 2.2,
      areaSize: 50.0,
      status: "Đã bán",
      isVerified: true,
      createdAt: now - 4000,
      latitude: 20.853,
      longitude: 106.683
    });
    const baseVerified = [verified1, verified2, verified3, verifiedSold];

    const unverifiedExtreme1 = createTestProperty({
      id: "unv1",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 0.01, // Extreme cheap
      areaSize: 50.0,
      status: "Đang bán",
      isVerified: false,
      createdAt: now - 1000,
      latitude: 20.85,
      longitude: 106.68
    });
    const unverifiedExtreme2 = createTestProperty({
      id: "unv2",
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      price: 999.0, // Extreme expensive
      areaSize: 10.0,
      status: "Đang bán",
      isVerified: false,
      createdAt: now - 1000,
      latitude: 20.85,
      longitude: 106.68
    });
    const combined = [...baseVerified, unverifiedExtreme1, unverifiedExtreme2];

    const filter = new StatisticsFilter();
    const activeMarketCount = combined.filter((it) => isActiveMarketProperty(it)).length;

    // 1. PriceTableCalculator: unverified properties are fully evaluated
    const ptCombined = PriceTableCalculator.calculate(combined);
    expect(ptCombined.totalPropertiesEvaluated).toBe(activeMarketCount);

    // 2. ValuationCalculator: unverified properties are evaluated as targets AND benchmarks
    const valCombined = ValuationCalculator.calculate(combined, combined);
    expect(valCombined.items.length).toBe(activeMarketCount);

    // 3. PriceMapCalculator: unverified properties are plotted
    const perfCombined = PerformanceCalculator.calculate(combined, filter, now);
    const pmCombined = PriceMapCalculator.calculate(combined, filter, ptCombined, perfCombined, now);
    expect(pmCombined.plottedDotsCount).toBe(activeMarketCount);

    // 4. Core Invariance Test across calculators:
    // Flipping isVerified on properties produces 100% identical mathematical market results
    const allVerified = combined.map((it) => ({ ...it, isVerified: true }));
    const allUnverified = combined.map((it) => ({ ...it, isVerified: false }));

    const ptAllV = PriceTableCalculator.calculate(allVerified);
    const ptAllU = PriceTableCalculator.calculate(allUnverified);
    expect(ptAllV.overallMedianPricePerM2).toBe(ptAllU.overallMedianPricePerM2);
    expect(ptAllV.totalPropertiesEvaluated).toBe(ptAllU.totalPropertiesEvaluated);

    const valAllV = ValuationCalculator.calculate(allVerified, allVerified);
    const valAllU = ValuationCalculator.calculate(allUnverified, allUnverified);
    expect(valAllV.items.length).toBe(valAllU.items.length);
    for (let i = 0; i < valAllV.items.length; i++) {
      expect(valAllV.items[i].comparatorSampleCount).toBe(valAllU.items[i].comparatorSampleCount);
      expect(valAllV.items[i].benchmarkMedianPricePerM2).toBe(valAllU.items[i].benchmarkMedianPricePerM2);
      expect(valAllV.items[i].deviationPercent).toBe(valAllU.items[i].deviationPercent);
    }

    const perfAllV = PerformanceCalculator.calculate(allVerified, filter, now);
    const perfAllU = PerformanceCalculator.calculate(allUnverified, filter, now);
    expect(perfAllV.summary.totalLiquidityDenominator).toBe(perfAllU.summary.totalLiquidityDenominator);
    expect(perfAllV.summary.totalForSaleCreatedInWindow).toBe(perfAllU.summary.totalForSaleCreatedInWindow);
    expect(perfAllV.summary.totalSoldCreatedInWindow).toBe(perfAllU.summary.totalSoldCreatedInWindow);

    const pmAllV = PriceMapCalculator.calculate(allVerified, filter, ptAllV, perfAllV, now);
    const pmAllU = PriceMapCalculator.calculate(allUnverified, filter, ptAllU, perfAllU, now);
    expect(pmAllV.plottedDotsCount).toBe(pmAllU.plottedDotsCount);
    expect(pmAllV.areaClusters.length).toBe(pmAllU.areaClusters.length);
  });
});
