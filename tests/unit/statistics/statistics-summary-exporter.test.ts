import { describe, it, expect } from "vitest";
import { ConfidenceLevel } from "../../../src/core/statistics/confidence-level";
import {
  createDefaultHeadlineKpiState,
  StatisticsUiState
} from "../../../src/core/statistics/statistics-model";
import { StatisticsSummaryExporter } from "../../../src/core/statistics/statistics-summary-exporter";
import {
  ActionPriority
} from "../../../src/core/statistics/action-center-calculator";
import { IssueSeverity, IssueType } from "../../../src/core/statistics/issue-type";
import {
  DrillDownFilter,
  DrillDownSource
} from "../../../src/core/statistics/drill-down-filter";
import {
} from "../../../src/core/statistics/inventory-calculator";
import {
} from "../../../src/core/statistics/owner-performance-calculator";
import {
} from "../../../src/core/statistics/performance-calculator";
import {
} from "../../../src/core/statistics/price-table-calculator";
import {
  HeatTier,
  InventoryTier,
  LiquidityTier,
} from "../../../src/core/statistics/price-map-calculator";
import {
  OpportunityQuadrant,
} from "../../../src/core/statistics/radar/radar-models";
import { StatisticsFilter } from "../../../src/core/statistics/statistics-filter";

describe("StatisticsSummaryExporterTest", () => {
  function createTestUiState(): StatisticsUiState {
    const now = 1_700_000_000_000;
    return {
      isLoading: false,
      selectedTabIndex: 0,
      filter: new StatisticsFilter(),
      properties: [],
      propertiesWithOwner: [],
      headlineKpiState: createDefaultHeadlineKpiState(),
      inventoryData: {
        totalInventory: 10,
        verifiedCount: 8,
        unverifiedCount: 2,
        activeCount: 7,
        soldCount: 1,
        pendingSurveyCount: 2,
        unknownStatusCount: 0,
        draftExcludedCount: 0,
        newInWindow: 0,
        forSaleCreatedInWindow: 0,
        soldCreatedInWindow: 0,
        soldRatioProxy: null,
        medianAgeDays: null,
        ratioOver60Days: null,
        ratioOver90Days: null,
        invalidDateCount: 0,
        futureDateCount: 0,
        longestAgingProperties: [],
        agingBuckets: {
          days0to7: 3,
          days8to30: 2,
          days31to60: 2,
          days61to90: 0,
          daysOver90: 3,
          total: 10
        }
      },
      performanceResult: {
        summary: {
          totalForSaleCreatedInWindow: 7,
          totalSoldCreatedInWindow: 1,
          totalLiquidityDenominator: 8,
          overallSoldRatioProxy: 0.125,
          displayOverallSoldRatioPercent: 12.5,
          overallConfidence: ConfidenceLevel.MEDIUM
        },
        byArea: [
          {
            segmentKey: "le chan",
            displayName: "Lê Chân",
            forSaleCreatedInWindow: 5,
            soldCreatedInWindow: 1,
            liquidityDenominator: 6,
            soldRatioProxy: 0.167,
            displaySoldRatioPercent: 16.7,
            confidence: ConfidenceLevel.MEDIUM,
            drillDownFilter: null
          }
        ],
        byPropertyType: [],
        byPriceTier: []
      },
      ownerPerformanceResult: {
        totalOwnersEvaluated: 1,
        totalSingleOwnerProperties: 3,
        totalExcludedMultiOwnerProperties: 0,
        totalExcludedNoOwnerProperties: 0,
        totalExcludedCorruptOwnerProperties: 0,
        items: [
          {
            ownerId: "o1",
            ownerName: "Nguyễn Văn A",
            totalPropertiesListed: 3,
            soldPropertiesCount: 1,
            activePropertiesCount: 2,
            activeAgingMedianDays: 25.0,
            stalePropertiesCount: 0,
            soldRatioProxy: 0.333,
            displaySoldRatioPercent: 33.3,
            confidence: ConfidenceLevel.MEDIUM,
            drillDownFilter: new DrillDownFilter({
              source: DrillDownSource.OWNER_PERFORMANCE,
              contextLabel: "Chủ nhà: Nguyễn Văn A",
              targetOwnerId: "o1"
            })
          }
        ]
      },
      priceTableResult: {
        totalRows: 1,
        totalPropertiesEvaluated: 5,
        rows: [
          {
            areaKey: "le chan",
            propertyTypeKey: "nha ngo",
            areaDisplayName: "Lê Chân",
            propertyTypeDisplayName: "Nhà ngõ",
            sampleCount: 5,
            medianPrice: 2.5,
            medianPricePerM2: 0.05,
            displayMedianPricePerM2: 50.0,
            p25PricePerM2: 0.045,
            p75PricePerM2: 0.055,
            minPricePerM2: 0.04,
            maxPricePerM2: 0.06,
            confidence: ConfidenceLevel.MEDIUM,
            drillDownFilter: new DrillDownFilter({
              source: DrillDownSource.AGING_BUCKET,
              contextLabel: "Lê Chân - Nhà ngõ",
              targetArea: "Lê Chân",
              targetPropertyType: "Nhà ngõ"
            })
          }
        ]
      },
      priceMapResult: {
        totalBaseFilteredProperties: 5,
        plottedDotsCount: 5,
        excludedMissingGpsCount: 0,
        excludedInvalidPriceCount: 0,
        boundingCenterLat: 20.85,
        boundingCenterLng: 106.68,
        dotPoints: [],
        areaClusters: [
          {
            areaKey: "le chan",
            areaDisplayName: "Lê Chân",
            propertyTypeKey: "nha ngo",
            propertyTypeDisplayName: "Nhà ngõ",
            centroidLat: 20.85,
            centroidLng: 106.68,
            validGpsPointsCount: 5,
            benchmarkSampleCount: 5,
            medianPricePerM2: 50.0,
            confidence: ConfidenceLevel.MEDIUM,
            heatTier: HeatTier.MEDIUM,
            normalizedIntensity: 0.5,
            inventoryCount: 5,
            inventoryTier: InventoryTier.MODERATE,
            soldRatioProxy: 0.167,
            liquidityTier: LiquidityTier.LOW,
            drillDownFilter: null
          }
        ]
      },
      dataQualitySummary: {
        totalIssues: 2,
        issuesByType: { [IssueType.MISSING_PRICE.name]: 2 },
        issuesBySeverity: { [IssueSeverity.CRITICAL.name]: 2 },
        issues: []
      },
      actionItems: [
        {
          key: "issue_no_price",
          title: "BĐS chưa có giá chào",
          priority: ActionPriority.HIGH,
          count: 2,
          drillDownFilter: new DrillDownFilter({
            source: DrillDownSource.ACTION_CENTER,
            contextLabel: "BĐS chưa có giá chào",
            targetIssueType: IssueType.MISSING_PRICE
          })
        }
      ],
      radarOpportunityResult: {
        type: "SUCCESS",
        segments: [],
        eligibleSegments: [],
        topOpportunities: [
          {
            key: { areaKey: "le chan", propertyTypeKey: "nha ngo" },
            areaDisplayName: "Lê Chân",
            propertyTypeDisplayName: "Nhà ngõ",
            activeCount: 5,
            newInWindow: 2,
            targetPriceSampleCount: 5,
            targetMedianPricePerM2: 0.05,
            comparatorAreaCount: 3,
            benchmarkPriceSampleCount: 15,
            benchmarkMedianPricePerM2: 0.052,
            priceDeviationPercent: -3.8,
            forSaleCreatedInWindow: 5,
            soldCreatedInWindow: 1,
            liquidityDenominator: 6,
            soldRatioProxy: 0.167,
            activeAgeSampleCount: 5,
            medianAgeDays: 25.0,
            confidencePrice: ConfidenceLevel.MEDIUM,
            confidenceLiquidity: ConfidenceLevel.MEDIUM,
            confidenceAge: ConfidenceLevel.MEDIUM,
            overallConfidence: ConfidenceLevel.MEDIUM,
            eligible: true,
            scoreBreakdown: null,
            opportunityScore: 78.5,
            quadrant: OpportunityQuadrant.GOLDEN_OPPORTUNITY
          }
        ],
        liquidityP50: 0.167,
        liquidityIndeterminate: false
      },
      marketProperties: [],
      errorMessage: null,
      snapshotTimeMillis: now,
      unverifiedPendingCount: 0,
      unverifiedPendingFilter: null
    };
  }

  it("testExportText_containsAllSectionsInOrder", () => {
    const state = createTestUiState();
    const text = StatisticsSummaryExporter.export(state, 1_700_000_000_000);

    const idx1 = text.indexOf("PHẦN 1: TỔNG QUAN THỊ TRƯỜNG");
    const idx2 = text.indexOf("PHẦN 2: PHÂN KHÚC & NGUỒN HÀNG");
    const idx3 = text.indexOf("PHẦN 3: BẢN ĐỒ GIÁ & PHÂN BỔ KHÔNG GIAN");
    const idx4 = text.indexOf("CẦN XỬ LÝ & CHẤT LƯỢNG DỮ LIỆU");

    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx2).toBeGreaterThanOrEqual(0);
    expect(idx3).toBeGreaterThanOrEqual(0);
    expect(idx4).toBeGreaterThanOrEqual(0);

    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);
    expect(idx3).toBeLessThan(idx4);
    expect(text.includes("SĂN HÀNG")).toBe(false);
  });

  it("testExportText_medianPriceAndIssueCountVerification", () => {
    const state = createTestUiState();
    const text = StatisticsSummaryExporter.export(state, 1_700_000_000_000);

    const stateWithMedian: StatisticsUiState = {
      ...state,
      priceTableResult: {
        ...state.priceTableResult!,
        overallMedianPricePerM2: 0.05
      }
    };
    const textWithMedian = StatisticsSummaryExporter.export(stateWithMedian, 1_700_000_000_000);
    expect(
      textWithMedian.includes("50 tr/m²") ||
      textWithMedian.includes("50,0 tr/m²") ||
      textWithMedian.includes("50.0 tr/m²")
    ).toBe(true);

    expect(text.includes("1 mục cần xử lý")).toBe(true);
  });

  it("testExportText_unverifiedPendingReflectsStateNotInventoryData", () => {
    const baseState = createTestUiState();
    // inv.unverifiedCount is 2, but unverifiedPendingCount is 5
    const stateWith5Pending: StatisticsUiState = {
      ...baseState,
      unverifiedPendingCount: 5
    };
    const textWith5 = StatisticsSummaryExporter.export(stateWith5Pending, 1_700_000_000_000);
    expect(textWith5.includes("Chờ xác minh: 5 căn")).toBe(true);
    expect(textWith5.includes("Chờ xác minh: 2 căn")).toBe(false);

    // When unverifiedPendingCount === 0, row should be completely omitted
    const stateWith0Pending: StatisticsUiState = {
      ...baseState,
      unverifiedPendingCount: 0
    };
    const textWith0 = StatisticsSummaryExporter.export(stateWith0Pending, 1_700_000_000_000);
    expect(textWith0.includes("Chờ xác minh")).toBe(false);
  });

  it("testExportText_includesEstimatedTagForLiquidity", () => {
    const state = createTestUiState();
    const text = StatisticsSummaryExporter.export(state, 1_700_000_000_000);

    expect(text.includes("[Ước tính]")).toBe(true);
  });

  it("testExportText_handlesEmptyDataGracefully", () => {
    const emptyState: StatisticsUiState = {
      isLoading: false,
      selectedTabIndex: 0,
      filter: new StatisticsFilter(),
      properties: [],
      propertiesWithOwner: [],
      inventoryData: null,
      headlineKpiState: createDefaultHeadlineKpiState(),
      performanceResult: null,
      ownerPerformanceResult: null,
      priceTableResult: null,
      priceMapResult: null,
      marketProperties: [],
      dataQualitySummary: null,
      actionItems: [],
      radarOpportunityResult: null,
      errorMessage: null,
      snapshotTimeMillis: 1_700_000_000_000,
      unverifiedPendingCount: 0,
      unverifiedPendingFilter: null
    };
    const text = StatisticsSummaryExporter.export(emptyState, 1_700_000_000_000);

    expect(text.includes("Không đủ dữ liệu") || text.includes("Chưa có cơ hội")).toBe(true);
  });

  it("testExportText_deterministicWithSnapshotTime", () => {
    const state = createTestUiState();

    const textDefault = StatisticsSummaryExporter.export(state);
    const textExplicit = StatisticsSummaryExporter.export(state, state.snapshotTimeMillis);

    expect(textDefault).toBe(textExplicit);

    // 1_700_000_000_000 in Asia/Ho_Chi_Minh is 2023-11-15 05:13
    expect(textDefault.includes("Thời điểm xuất: 15/11/2023 05:13")).toBe(true);

    const textSecondInvocation = StatisticsSummaryExporter.export(state);
    expect(textDefault).toBe(textSecondInvocation);
  });

  it("testExportText_throwsWhenSnapshotTimeIsZero", () => {
    const state = { ...createTestUiState(), snapshotTimeMillis: 0 };
    expect(() => StatisticsSummaryExporter.export(state)).toThrow();
  });

  it("testExportText_throwsWhenSnapshotTimeIsNegative", () => {
    const state = { ...createTestUiState(), snapshotTimeMillis: -100 };
    expect(() => StatisticsSummaryExporter.export(state, -100)).toThrow();
  });

  it("testExportText_neverProducesEpoch1970", () => {
    const state = { ...createTestUiState(), snapshotTimeMillis: 0 };
    try {
      const text = StatisticsSummaryExporter.export(state);
      expect(text.includes("01/01/1970")).toBe(false);
    } catch {
      expect(true).toBe(true);
    }
  });

  it("testExportText_livestreamMode_masksOwnerNamesWithRankAliases", () => {
    const state = createTestUiState();
    const text = StatisticsSummaryExporter.export(
      state,
      1_700_000_000_000,
      true
    );

    // Real owner name must NOT appear
    expect(text.includes("Nguyễn Văn A")).toBe(false);

    // Rank alias must appear in owner performance section
    expect(text.includes("Chủ nhà #1")).toBe(true);
    expect(text.includes("  #1: Chủ nhà #1 | Tổng BĐS: 3 | Đã bán: 1 | Tỷ lệ bán [Ước tính]: 33,3%")).toBe(true);
  });

  it("testExportText_normalMode_retainsRealOwnerName_andIsByteForByteIdentical", () => {
    const state = createTestUiState();
    const textDefault = StatisticsSummaryExporter.export(state, 1_700_000_000_000);
    const textExplicitFalse = StatisticsSummaryExporter.export(
      state,
      1_700_000_000_000,
      false
    );

    expect(textDefault).toBe(textExplicitFalse);
    expect(textDefault.includes("Nguyễn Văn A")).toBe(true);
    expect(textDefault.includes("Chủ nhà #1")).toBe(false);
  });

  it("testOwnerPerformance_drillDownFilter_preservesTargetOwnerId_whenContextLabelMasked", () => {
    const originalFilter = new DrillDownFilter({
      source: DrillDownSource.OWNER_PERFORMANCE,
      contextLabel: "Chủ nhà: Nguyễn Văn A",
      targetOwnerId: "owner-999"
    });

    const isLivestream = true;
    const alias = "Chủ nhà #1";
    const updatedFilter = isLivestream ? originalFilter.copy({ contextLabel: alias }) : originalFilter;

    expect(updatedFilter.targetOwnerId).toBe("owner-999");
    expect(updatedFilter.contextLabel).toBe("Chủ nhà #1");
    expect(updatedFilter.source).toBe(DrillDownSource.OWNER_PERFORMANCE);
  });
});
