import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  PropertyStatusConstants,
  StatisticsDateRange,
  StatisticsFilter,
  VerifiedMode
} from "../../../src/core/statistics/statistics-filter";
import {
  DrillDownEvaluationContext,
} from "../../../src/core/statistics/drill-down-filter";
import { DrillDownFilterFactory } from "../../../src/core/statistics/drill-down-filter-factory";
import { StatisticsModel } from "../../../src/core/statistics/statistics-model";

describe("HeadlineKpiTest", () => {
  const now = 1_700_000_000_000; // 2023-11-15T05:13:20Z (12:13:20 VN)

  function createProperty(params: {
    id: string;
    area?: string;
    propertyType?: string;
    status?: string;
    price?: number;
    areaSize?: number | null;
    isVerified?: boolean;
    isDraft?: boolean;
    isDeleted?: boolean;
    createdAt?: number;
    soldAt?: number | null;
  }): Property {
    const createdAt = params.createdAt ?? now;
    return createDefaultProperty({
      id: params.id,
      title: `BĐS ${params.id}`,
      price: params.price ?? 2.0,
      area: params.area ?? "Lê Chân",
      latitude: null,
      longitude: null,
      description: "",
      areaSize: params.areaSize !== undefined ? params.areaSize : 50.0,
      propertyType: params.propertyType ?? "Nhà ngõ",
      status: params.status ?? PropertyStatusConstants.FOR_SALE,
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false,
      createdAt,
      updatedAt: createdAt,
      soldAt: params.soldAt ?? null
    });
  }

  // =========================================================================
  // 1. DrillDownFilterFactory Tests
  // =========================================================================

  it("testCreateForSaleKpiFilter_strictlyForSale_excludesPendingSurvey", () => {
    const filter = new StatisticsFilter();
    const drillDown = DrillDownFilterFactory.createForSaleKpiFilter(filter, now);

    expect(drillDown.targetStatus).toBe(PropertyStatus.FOR_SALE);
    expect(drillDown.excludeDraft).toBe(true);
    expect(drillDown.targetOwnerId).toBeNull();
    expect(drillDown.createdAtFrom).toBeNull();
    expect(drillDown.createdAtTo).toBeNull();

    const forSaleProp = createProperty({ id: "p1", status: PropertyStatusConstants.FOR_SALE });
    const pendingProp = createProperty({ id: "p2", status: PropertyStatusConstants.PENDING_SURVEY });
    const soldProp = createProperty({ id: "p3", status: PropertyStatusConstants.SOLD });

    const context1: DrillDownEvaluationContext = { property: forSaleProp, now };
    const context2: DrillDownEvaluationContext = { property: pendingProp, now };
    const context3: DrillDownEvaluationContext = { property: soldProp, now };

    expect(drillDown.matches(context1)).toBe(true);
    expect(drillDown.matches(context2)).toBe(false);
    expect(drillDown.matches(context3)).toBe(false);
  });

  it("testCreateForSaleKpiFilter_overridesStatusFilter", () => {
    const filterWithStatus = new StatisticsFilter({ status: "Chờ khảo sát" });
    const drillDown = DrillDownFilterFactory.createForSaleKpiFilter(filterWithStatus, now);

    expect(drillDown.targetStatus).toBe(PropertyStatus.FOR_SALE);
    expect(drillDown.isFailClosed).toBe(false);
  });

  it("testCreateForSaleKpiFilter_preservesAllDimensions_targetOwnerIdNull", () => {
    const filter = new StatisticsFilter({
      verifiedMode: VerifiedMode.VERIFIED_ONLY,
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      priceMin: 2.0,
      priceMax: 5.0,
      areaSizeMin: 30.0,
      areaSizeMax: 80.0
    });
    const drillDown = DrillDownFilterFactory.createForSaleKpiFilter(filter, now);

    expect(drillDown.verifiedMode).toBe(VerifiedMode.VERIFIED_ONLY);
    expect(drillDown.targetArea).toBe("Lê Chân");
    expect(drillDown.targetPropertyType).toBe("Nhà ngõ");
    expect(drillDown.priceMin).toBe(2.0);
    expect(drillDown.priceMax).toBe(5.0);
    expect(drillDown.areaSizeMin).toBe(30.0);
    expect(drillDown.areaSizeMax).toBe(80.0);
    expect(drillDown.targetOwnerId).toBeNull();
  });

  it("testCreateSoldKpiFilter_allTimeIsUnbounded", () => {
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });
    const drillDown = DrillDownFilterFactory.createSoldKpiFilter(filter, now);

    expect(drillDown.targetStatus).toBe(PropertyStatus.SOLD);
    expect(drillDown.soldAtFrom).toBeNull();
    expect(drillDown.soldAtTo).toBeNull();
    expect(drillDown.createdAtFrom).toBeNull();
    expect(drillDown.createdAtTo).toBeNull();
    expect(drillDown.contextLabel).toBe("BĐS đã bán");
    expect(drillDown.targetOwnerId).toBeNull();
  });

  it("testCreateSoldKpiFilter_preservesCustomWindowsAndLabels", () => {
    const filter30 = new StatisticsFilter({ dateRange: StatisticsDateRange.Last30Days });
    const drillDown30 = DrillDownFilterFactory.createSoldKpiFilter(filter30, now);
    const expected30Days = StatisticsDateRange.Last30Days.resolveWindow(now)!;
    expect(drillDown30.soldAtFrom).toBe(expected30Days.startInclusive);
    expect(drillDown30.soldAtTo).toBe(expected30Days.endExclusive);
    expect(drillDown30.createdAtFrom).toBeNull();
    expect(drillDown30.createdAtTo).toBeNull();
    expect(drillDown30.contextLabel).toBe("BĐS đã bán · bán trong 30 ngày");

    const filter90 = new StatisticsFilter({ dateRange: StatisticsDateRange.Last90Days });
    const drillDown90 = DrillDownFilterFactory.createSoldKpiFilter(filter90, now);
    expect(drillDown90.contextLabel).toBe("BĐS đã bán · bán trong 90 ngày");

    const customWindow = StatisticsDateRange.Custom(1000, 2000);
    const filterCustom = new StatisticsFilter({ dateRange: customWindow });
    const drillDownCustom = DrillDownFilterFactory.createSoldKpiFilter(filterCustom, now);
    expect(drillDownCustom.soldAtFrom).toBe(1000);
    expect(drillDownCustom.soldAtTo).toBe(2000);
    expect(drillDownCustom.createdAtFrom).toBeNull();
    expect(drillDownCustom.createdAtTo).toBeNull();
    expect(drillDownCustom.contextLabel).toBe("BĐS đã bán · bán trong kỳ");
  });

  it("testSoldKpi_oldSoldIncludedInAllTime_excludedIn7Days", () => {
    const window7Days = StatisticsDateRange.Last7Days.resolveWindow(now)!;
    const oldSoldProp = createProperty({
      id: "s_old",
      status: PropertyStatusConstants.SOLD,
      soldAt: window7Days.startInclusive - 100_000
    });
    const recentSoldProp = createProperty({
      id: "s_recent",
      status: PropertyStatusConstants.SOLD,
      soldAt: window7Days.startInclusive + 10_000
    });
    const legacySoldProp = createProperty({
      id: "s_legacy",
      status: PropertyStatusConstants.SOLD,
      soldAt: null
    });

    const allTimeFilter = DrillDownFilterFactory.createSoldKpiFilter(
      new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime }),
      now
    );
    const sevenDaysFilter = DrillDownFilterFactory.createSoldKpiFilter(
      new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days }),
      now
    );

    // AllTime matches all sold properties regardless of soldAt
    expect(allTimeFilter.matches({ property: oldSoldProp, now })).toBe(true);
    expect(allTimeFilter.matches({ property: recentSoldProp, now })).toBe(true);
    expect(allTimeFilter.matches({ property: legacySoldProp, now })).toBe(true);

    // 7 days matches only recent soldAt; legacy soldAt=null fails closed
    expect(sevenDaysFilter.matches({ property: oldSoldProp, now })).toBe(false);
    expect(sevenDaysFilter.matches({ property: recentSoldProp, now })).toBe(true);
    expect(sevenDaysFilter.matches({ property: legacySoldProp, now })).toBe(false);
  });

  it("testCreateSoldKpiFilter_halfOpenBoundary", () => {
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const drillDown = DrillDownFilterFactory.createSoldKpiFilter(filter, now);
    const window = StatisticsDateRange.Last7Days.resolveWindow(now)!;

    const atStart = createProperty({ id: "p1", status: PropertyStatusConstants.SOLD, soldAt: window.startInclusive });
    const atEnd = createProperty({ id: "p2", status: PropertyStatusConstants.SOLD, soldAt: window.endExclusive });
    const inside = createProperty({ id: "p3", status: PropertyStatusConstants.SOLD, soldAt: window.endExclusive - 1 });
    const beforeStart = createProperty({ id: "p4", status: PropertyStatusConstants.SOLD, soldAt: window.startInclusive - 1 });
    const legacy = createProperty({ id: "p5", status: PropertyStatusConstants.SOLD, soldAt: null });

    expect(drillDown.matches({ property: atStart, now })).toBe(true);
    expect(drillDown.matches({ property: inside, now })).toBe(true);
    expect(drillDown.matches({ property: atEnd, now })).toBe(false);
    expect(drillDown.matches({ property: beforeStart, now })).toBe(false);
    expect(drillDown.matches({ property: legacy, now })).toBe(false);
  });

  it("testDraftsAndDeletedRowsExcludedFromBothKpiPredicates", () => {
    const forSaleFilter = DrillDownFilterFactory.createForSaleKpiFilter(new StatisticsFilter(), now);
    const soldFilter = DrillDownFilterFactory.createSoldKpiFilter(new StatisticsFilter(), now);

    const draftForSale = createProperty({ id: "d1", status: PropertyStatusConstants.FOR_SALE, isDraft: true });
    const deletedForSale = createProperty({ id: "d2", status: PropertyStatusConstants.FOR_SALE, isDeleted: true });
    const draftSold = createProperty({ id: "d3", status: PropertyStatusConstants.SOLD, isDraft: true });
    const deletedSold = createProperty({ id: "d4", status: PropertyStatusConstants.SOLD, isDeleted: true });

    expect(forSaleFilter.matches({ property: draftForSale, now })).toBe(false);
    expect(forSaleFilter.matches({ property: deletedForSale, now })).toBe(false);
    expect(soldFilter.matches({ property: draftSold, now })).toBe(false);
    expect(soldFilter.matches({ property: deletedSold, now })).toBe(false);
  });

  // =========================================================================
  // 2. ViewModel Calculation & Mathematical Identity Tests
  // =========================================================================

  it("testViewModel_headlineKpiCountsMatchExactDispatchedFilters", () => {
    const window7Days = StatisticsDateRange.Last7Days.resolveWindow(now)!;
    const props = [
      // 3 For sale properties
      createProperty({ id: "fs1", status: PropertyStatusConstants.FOR_SALE }),
      createProperty({ id: "fs2", status: PropertyStatusConstants.FOR_SALE }),
      createProperty({ id: "fs3", status: PropertyStatusConstants.FOR_SALE }),
      // 2 Pending survey properties (must NOT be in forSaleCount, but ARE in activeCount)
      createProperty({ id: "ps1", status: PropertyStatusConstants.PENDING_SURVEY }),
      createProperty({ id: "ps2", status: PropertyStatusConstants.PENDING_SURVEY }),
      // 2 Sold created inside 7-day window
      createProperty({ id: "s1", status: PropertyStatusConstants.SOLD, soldAt: window7Days.startInclusive + 10_000 }),
      createProperty({ id: "s2", status: PropertyStatusConstants.SOLD, soldAt: window7Days.startInclusive + 20_000 }),
      // 1 Sold created outside 7-day window
      createProperty({ id: "s_old", status: PropertyStatusConstants.SOLD, soldAt: window7Days.startInclusive - 50_000 }),
      // 1 Draft (excluded)
      createProperty({ id: "dr1", status: PropertyStatusConstants.FOR_SALE, isDraft: true }),
      // 1 Deleted (excluded)
      createProperty({ id: "del1", status: PropertyStatusConstants.FOR_SALE, isDeleted: true })
    ];

    const state = StatisticsModel.calculateSnapshot({
      allProperties: props,
      now
    });
    const kpi = state.headlineKpiState;

    expect(kpi.forSaleFilter).not.toBeNull();
    expect(kpi.soldFilter).not.toBeNull();

    // Mathematical identity test (AllTime / default):
    const expectedForSaleCount = DrillDownFilterFactory.countMatching(props, kpi.forSaleFilter!, now);
    const expectedSoldCount = DrillDownFilterFactory.countMatching(props, kpi.soldFilter!, now);

    expect(kpi.forSaleCount).toBe(3);
    expect(kpi.forSaleCount).toBe(expectedForSaleCount);

    expect(kpi.soldCount).toBe(3);
    expect(kpi.soldCount).toBe(expectedSoldCount);
    expect(kpi.soldTitle).toBe("Đã bán");
    expect(kpi.soldSubtitle).toBe("tổng số tin đã bán");

    // Verify activeCount includes pending survey (3 + 2 = 5) while forSaleCount strictly has 3
    expect(state.inventoryData?.activeCount).toBe(5);
    expect(kpi.forSaleCount).toBe(3);
    expect(kpi.forSaleCount).toBeLessThan(state.inventoryData?.activeCount ?? 0);

    // When switching to 7 days:
    const state7Days = StatisticsModel.calculateSnapshot({
      allProperties: props,
      filter: new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days }),
      now
    });
    const kpi7Days = state7Days.headlineKpiState;
    const expected7DaysSoldCount = DrillDownFilterFactory.countMatching(props, kpi7Days.soldFilter!, now);
    expect(kpi7Days.soldCount).toBe(2);
    expect(kpi7Days.soldCount).toBe(expected7DaysSoldCount);
    expect(kpi7Days.soldTitle).toBe("Đã bán · 7 ngày");
    expect(kpi7Days.soldSubtitle).toBe("bán trong 7 ngày");
  });

  it("testViewModel_unsupportedOwnerFilter_resetsHeadlineKpiStateFailClosed", () => {
    const props = [createProperty({ id: "fs1", status: PropertyStatusConstants.FOR_SALE })];

    const stateNormal = StatisticsModel.calculateSnapshot({
      allProperties: props,
      now
    });
    expect(stateNormal.headlineKpiState.forSaleCount).not.toBe(0);

    // Set ownerId in filter
    const stateOwner = StatisticsModel.calculateSnapshot({
      allProperties: props,
      filter: new StatisticsFilter({ ownerId: "owner-xyz" }),
      now
    });

    expect(stateOwner.errorMessage).not.toBeNull();
    expect(stateOwner.errorMessage!.includes("không hỗ trợ tiêu chí chủ nhà")).toBe(true);
    expect(stateOwner.headlineKpiState.forSaleCount).toBe(0);
    expect(stateOwner.headlineKpiState.soldCount).toBe(0);
  });

  // Compose UI tests skipped per spec: "Ca chỉ kiểm giao diện Compose/screenshot: bỏ qua (không tạo)."
  it.skip("testOverviewTab_rendersTwoEqualWidthCardsAndMedianBelow — Compose UI test", () => {});
  it.skip("testOverviewTab_emptyStateRule_fullEmptyWhenAllThreeAreZero — Compose UI test", () => {});
  it.skip("testOverviewTab_emptyStateRule_notEmptyWhenSpecializedKpiNonZero — Compose UI test", () => {});
});
