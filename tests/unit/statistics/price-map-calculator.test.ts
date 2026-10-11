import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import { ConfidenceLevel } from "../../../src/core/statistics/confidence-level";
import {
  StatisticsDateRange,
  StatisticsFilter,
  VerifiedMode
} from "../../../src/core/statistics/statistics-filter";
import {
  AreaPriceRow,
  PriceTableResult
} from "../../../src/core/statistics/price-table-calculator";
import {
  PerformanceResult,
  SegmentLiquidityRow
} from "../../../src/core/statistics/performance-calculator";
import {
  DrillDownFilter,
  DrillDownSource
} from "../../../src/core/statistics/drill-down-filter";
import {
  HeatTier,
  InventoryTier,
  LiquidityTier,
  PriceDotTier,
  PriceMapCalculator
} from "../../../src/core/statistics/price-map-calculator";

describe("PriceMapCalculatorTest", () => {
  // 2026-09-12T12:00:00+07:00 -> epoch ms: 1789275600000
  const testNow = 1789275600000;

  function createProperty(params: {
    id: string;
    title?: string;
    price?: number;
    areaSize?: number | null;
    area?: string;
    propertyType?: string;
    status?: string;
    isVerified?: boolean;
    isDraft?: boolean;
    isDeleted?: boolean;
    latitude?: number | null;
    longitude?: number | null;
    createdAt?: number;
  }): Property {
    const createdAt = params.createdAt ?? testNow - 86400000; // 1 day ago
    return createDefaultProperty({
      id: params.id,
      title: params.title ?? `BĐS ${params.id}`,
      price: params.price ?? 3.0,
      areaSize: params.areaSize !== undefined ? params.areaSize : 100.0,
      area: params.area ?? "Quận 1",
      propertyType: params.propertyType ?? "Nhà riêng",
      description: `Mô tả ${params.id}`,
      status: params.status ?? PropertyStatus.FOR_SALE,
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false,
      latitude: params.latitude !== undefined ? params.latitude : 10.7769,
      longitude: params.longitude !== undefined ? params.longitude : 106.7009,
      createdAt,
      updatedAt: createdAt
    });
  }

  function createAreaPriceRow(params: {
    areaKey: string;
    propertyTypeKey: string;
    areaDisplayName?: string;
    propertyTypeDisplayName?: string;
    sampleCount?: number;
    medianPrice?: number;
    medianPricePerM2?: number;
    displayMedianPricePerM2?: number;
    p25PricePerM2?: number;
    p75PricePerM2?: number;
    confidence?: ConfidenceLevel;
  }): AreaPriceRow {
    const areaKey = params.areaKey;
    const propertyTypeKey = params.propertyTypeKey;
    const p25PricePerM2 = params.p25PricePerM2 ?? 0.025;
    const p75PricePerM2 = params.p75PricePerM2 ?? 0.035;

    return {
      areaKey,
      propertyTypeKey,
      areaDisplayName: params.areaDisplayName ?? areaKey,
      propertyTypeDisplayName: params.propertyTypeDisplayName ?? propertyTypeKey,
      sampleCount: params.sampleCount ?? 10,
      medianPrice: params.medianPrice ?? 3.0,
      medianPricePerM2: params.medianPricePerM2 ?? 0.03, // 30 tr/m² in Tỷ VNĐ
      displayMedianPricePerM2: params.displayMedianPricePerM2 ?? 30.0, // 30 tr/m²
      p25PricePerM2,
      p75PricePerM2,
      minPricePerM2: p25PricePerM2 - 0.005,
      maxPricePerM2: p75PricePerM2 + 0.005,
      confidence: params.confidence ?? ConfidenceLevel.GOOD,
      drillDownFilter: new DrillDownFilter({
        source: DrillDownSource.DEAL_FINDER,
        contextLabel: "Test Drilldown",
        targetArea: areaKey,
        targetPropertyType: propertyTypeKey,
        targetStatus: PropertyStatus.FOR_SALE,
        verifiedMode: VerifiedMode.VERIFIED_ONLY,
        excludeDraft: true
      })
    };
  }

  function createSegmentLiquidityRow(params: {
    segmentKey: string;
    displayName?: string;
    soldRatioProxy: number | null;
    forSaleCount?: number;
    soldCount?: number;
    confidence?: ConfidenceLevel;
  }): SegmentLiquidityRow {
    const forSaleCount = params.forSaleCount ?? 10;
    const soldCount = params.soldCount ?? 5;
    return {
      segmentKey: params.segmentKey,
      displayName: params.displayName ?? params.segmentKey,
      forSaleCreatedInWindow: forSaleCount,
      soldCreatedInWindow: soldCount,
      liquidityDenominator: forSaleCount + soldCount,
      soldRatioProxy: params.soldRatioProxy,
      displaySoldRatioPercent:
        params.soldRatioProxy != null ? params.soldRatioProxy * 100.0 : null,
      confidence: params.confidence ?? ConfidenceLevel.GOOD,
      drillDownFilter: null
    };
  }

  function createPerformanceResult(
    byArea: SegmentLiquidityRow[] = []
  ): PerformanceResult {
    return {
      summary: {
        totalForSaleCreatedInWindow: 10,
        totalSoldCreatedInWindow: 5,
        totalLiquidityDenominator: 15,
        overallSoldRatioProxy: 0.333,
        displayOverallSoldRatioPercent: 33.3,
        overallConfidence: ConfidenceLevel.GOOD
      },
      byArea,
      byPropertyType: [],
      byPriceTier: []
    };
  }

  it("test1_filterDateBoundaryAndOwnerIdFailClosed", () => {
    const filterLast7Days = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const propInsideWindow = createProperty({
      id: "p1",
      createdAt: testNow - 2 * 86400000 // 2 days ago
    });
    const propOutsideWindow = createProperty({
      id: "p2",
      createdAt: testNow - 10 * 86400000 // 10 days ago
    });

    const priceTable: PriceTableResult = { totalRows: 0, totalPropertiesEvaluated: 0, rows: [] };
    const result = PriceMapCalculator.calculate(
      [propInsideWindow, propOutsideWindow],
      filterLast7Days,
      priceTable,
      undefined,
      testNow
    );

    // p2 is outside date window => only p1 is in baseFilteredProperties
    expect(result.totalBaseFilteredProperties).toBe(1);
    expect(result.plottedDotsCount).toBe(1);
    expect(result.dotPoints[0].propertyId).toBe("p1");

    // Test ownerId fail-closed: should return empty result
    const filterWithOwner = new StatisticsFilter({ ownerId: "owner_123" });
    const failClosedResult = PriceMapCalculator.calculate(
      [propInsideWindow],
      filterWithOwner,
      priceTable,
      undefined,
      testNow
    );
    expect(failClosedResult.totalBaseFilteredProperties).toBe(0);
    expect(failClosedResult.plottedDotsCount).toBe(0);
    expect(failClosedResult.dotPoints.length).toBe(0);
    expect(failClosedResult.areaClusters.length).toBe(0);
  });

  it("test2_nonOverlappingExclusionPipelineAndInvariant", () => {
    const invalidPrice1 = createProperty({ id: "inv_p1", price: 0.0 }); // price <= 0.0
    const invalidPrice2 = createProperty({ id: "inv_p2", areaSize: -50.0 }); // areaSize <= 0.0
    const missingGps1 = createProperty({ id: "mis_gps1", latitude: 0.0, longitude: 0.0 }); // Null Island
    const missingGps2 = createProperty({ id: "mis_gps2", latitude: null, longitude: 106.7 });
    const valid1 = createProperty({ id: "val_1", price: 2.0, areaSize: 50.0, latitude: 10.7, longitude: 106.7 });
    const valid2 = createProperty({ id: "val_2", price: 3.0, areaSize: 60.0, latitude: 10.8, longitude: 106.8 });
    const valid3 = createProperty({ id: "val_3", price: 4.0, areaSize: 80.0, latitude: 10.9, longitude: 106.9 });

    const properties = [invalidPrice1, invalidPrice2, missingGps1, missingGps2, valid1, valid2, valid3];
    const priceTable: PriceTableResult = { totalRows: 0, totalPropertiesEvaluated: 0, rows: [] };

    const result = PriceMapCalculator.calculate(
      properties,
      new StatisticsFilter(),
      priceTable,
      undefined,
      testNow
    );

    expect(result.totalBaseFilteredProperties).toBe(7);
    expect(result.excludedInvalidPriceCount).toBe(2);
    expect(result.excludedMissingGpsCount).toBe(2);
    expect(result.plottedDotsCount).toBe(3);
    expect(result.dotPoints.length).toBe(3);

    // Strict non-overlapping invariant
    expect(result.totalBaseFilteredProperties).toBe(
      result.excludedInvalidPriceCount + result.excludedMissingGpsCount + result.plottedDotsCount
    );
  });

  it("test3_benchmarkMatchingAndFailClosed", () => {
    // Price/m2 = 3 tỷ * 1000 / 100 m2 = 30 tr/m2
    const prop = createProperty({
      id: "p1",
      price: 3.0,
      areaSize: 100.0,
      area: "Quận 1",
      propertyType: "Nhà riêng"
    });

    // 1. Normal match with sampleCount >= 5
    const benchmarkRow = createAreaPriceRow({
      areaKey: "quận 1",
      propertyTypeKey: "nhà riêng",
      displayMedianPricePerM2: 30.0,
      sampleCount: 10
    });
    const priceTableNormal: PriceTableResult = {
      totalRows: 1,
      totalPropertiesEvaluated: 10,
      rows: [benchmarkRow]
    };
    const resultNormal = PriceMapCalculator.calculate(
      [prop],
      new StatisticsFilter(),
      priceTableNormal,
      undefined,
      testNow
    );
    const dotNormal = resultNormal.dotPoints[0];
    expect(dotNormal.dotTier).toBe(PriceDotTier.NEAR_BENCHMARK);
    expect(dotNormal.deviationPercent).toBeCloseTo(0.0, 3);

    // 2. Duplicate key in PriceTableResult => fail-closed to NO_BENCHMARK
    const dupRow1 = createAreaPriceRow({ areaKey: "quận 1", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 30.0 });
    const dupRow2 = createAreaPriceRow({ areaKey: "quận 1", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 32.0 });
    const priceTableDup: PriceTableResult = {
      totalRows: 2,
      totalPropertiesEvaluated: 20,
      rows: [dupRow1, dupRow2]
    };
    const resultDup = PriceMapCalculator.calculate(
      [prop],
      new StatisticsFilter(),
      priceTableDup,
      undefined,
      testNow
    );
    expect(resultDup.dotPoints[0].dotTier).toBe(PriceDotTier.NO_BENCHMARK);
    expect(resultDup.dotPoints[0].deviationPercent).toBeNull();

    // 3. benchmarkMedian <= 0.0 => fail-closed to NO_BENCHMARK
    const invalidMedianRow = createAreaPriceRow({ areaKey: "quận 1", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 0.0 });
    const priceTableInvalid: PriceTableResult = {
      totalRows: 1,
      totalPropertiesEvaluated: 10,
      rows: [invalidMedianRow]
    };
    const resultInvalid = PriceMapCalculator.calculate(
      [prop],
      new StatisticsFilter(),
      priceTableInvalid,
      undefined,
      testNow
    );
    expect(resultInvalid.dotPoints[0].dotTier).toBe(PriceDotTier.NO_BENCHMARK);

    // 4. sampleCount < 5 => fail-closed to NO_BENCHMARK
    const lowSampleRow = createAreaPriceRow({
      areaKey: "quận 1",
      propertyTypeKey: "nhà riêng",
      sampleCount: 4,
      confidence: ConfidenceLevel.LOW
    });
    const priceTableLowSample: PriceTableResult = {
      totalRows: 1,
      totalPropertiesEvaluated: 4,
      rows: [lowSampleRow]
    };
    const resultLowSample = PriceMapCalculator.calculate(
      [prop],
      new StatisticsFilter(),
      priceTableLowSample,
      undefined,
      testNow
    );
    expect(resultLowSample.dotPoints[0].dotTier).toBe(PriceDotTier.NO_BENCHMARK);

    // 5. Tier boundaries: below (-6%), near (0%), above (+8%)
    const propBelow = createProperty({ id: "p_below", price: 2.82, areaSize: 100.0 }); // 28.2 tr/m2 vs 30.0 => -6.0%
    const propAbove = createProperty({ id: "p_above", price: 3.24, areaSize: 100.0 }); // 32.4 tr/m2 vs 30.0 => +8.0%
    const resultTiers = PriceMapCalculator.calculate(
      [propBelow, propAbove],
      new StatisticsFilter(),
      priceTableNormal,
      undefined,
      testNow
    );
    const mapByTitle = new Map(resultTiers.dotPoints.map((p) => [p.propertyId, p]));
    expect(mapByTitle.get("p_below")!.dotTier).toBe(PriceDotTier.BELOW_BENCHMARK);
    expect(mapByTitle.get("p_above")!.dotTier).toBe(PriceDotTier.ABOVE_BENCHMARK);
  });

  it("test4_iqrOutlierDetection", () => {
    // Benchmark: P25 = 0.025, P75 = 0.035 => IQR = 0.010 => Upper fence = 0.035 + 1.5*0.010 = 0.050 (50 tr/m2)
    const benchmarkRow = createAreaPriceRow({
      areaKey: "quận 1",
      propertyTypeKey: "nhà riêng",
      p25PricePerM2: 0.025,
      p75PricePerM2: 0.035
    });
    const priceTable: PriceTableResult = {
      totalRows: 1,
      totalPropertiesEvaluated: 10,
      rows: [benchmarkRow]
    };

    const normalProp = createProperty({ id: "p_normal", price: 4.0, areaSize: 100.0 }); // 40 tr/m2 (inside fence)
    const outlierProp = createProperty({ id: "p_outlier", price: 6.0, areaSize: 100.0 }); // 60 tr/m2 (outside upper fence 50)

    const result = PriceMapCalculator.calculate(
      [normalProp, outlierProp],
      new StatisticsFilter(),
      priceTable,
      undefined,
      testNow
    );
    const map = new Map(result.dotPoints.map((p) => [p.propertyId, p]));
    expect(map.get("p_normal")!.isOutlier).toBe(false);
    expect(map.get("p_outlier")!.isOutlier).toBe(true);
  });

  it("test5_heatTierNormalizationAndEdgeCases", () => {
    const row1 = createAreaPriceRow({ areaKey: "area_1", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 20.0 });
    const row2 = createAreaPriceRow({ areaKey: "area_2", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 40.0 });
    const row3 = createAreaPriceRow({ areaKey: "area_3", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 60.0 });
    const row4 = createAreaPriceRow({ areaKey: "area_4", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 80.0 });
    const row5 = createAreaPriceRow({ areaKey: "area_5", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 100.0 });

    const priceTable: PriceTableResult = {
      totalRows: 5,
      totalPropertiesEvaluated: 50,
      rows: [row1, row2, row3, row4, row5]
    };
    const result = PriceMapCalculator.calculate(
      [],
      new StatisticsFilter(),
      priceTable,
      undefined,
      testNow
    );

    const clusterMap = new Map(result.areaClusters.map((c) => [c.areaKey, c]));
    // min = 20, max = 100
    // area_1: (20-20)/80 = 0.0 => LOWEST (< 0.20)
    expect(clusterMap.get("area_1")!.heatTier).toBe(HeatTier.LOWEST);
    expect(clusterMap.get("area_1")!.normalizedIntensity).toBeCloseTo(0.0, 3);

    // area_2: (40-20)/80 = 0.25 => LOW ([0.20, 0.40))
    expect(clusterMap.get("area_2")!.heatTier).toBe(HeatTier.LOW);

    // area_3: (60-20)/80 = 0.50 => MEDIUM ([0.40, 0.60))
    expect(clusterMap.get("area_3")!.heatTier).toBe(HeatTier.MEDIUM);

    // area_4: (80-20)/80 = 0.75 => HIGH ([0.60, 0.80))
    expect(clusterMap.get("area_4")!.heatTier).toBe(HeatTier.HIGH);

    // area_5: (100-20)/80 = 1.0 => HIGHEST (>= 0.80)
    expect(clusterMap.get("area_5")!.heatTier).toBe(HeatTier.HIGHEST);

    // Edge case: Exactly 1 cluster with benchmark => intensity = 0.5, tier = MEDIUM
    const singleTable: PriceTableResult = {
      totalRows: 1,
      totalPropertiesEvaluated: 10,
      rows: [row1]
    };
    const singleResult = PriceMapCalculator.calculate(
      [],
      new StatisticsFilter(),
      singleTable,
      undefined,
      testNow
    );
    const singleCluster = singleResult.areaClusters[0];
    expect(singleCluster.heatTier).toBe(HeatTier.MEDIUM);
    expect(singleCluster.normalizedIntensity).toBeCloseTo(0.5, 3);
  });

  it("test6_clusterWithoutBenchmarkHasNoDataPriceHeat", () => {
    // Property exists in baseFilteredProperties in "Bình Chánh"
    const prop = createProperty({ id: "p1", area: "Bình Chánh", propertyType: "Đất nền" });

    // Price table has NO benchmark for "Bình Chánh"
    const priceTable: PriceTableResult = { totalRows: 0, totalPropertiesEvaluated: 0, rows: [] };

    const result = PriceMapCalculator.calculate(
      [prop],
      new StatisticsFilter(),
      priceTable,
      undefined,
      testNow
    );

    expect(result.areaClusters.length).toBe(1);
    const cluster = result.areaClusters[0];
    expect(cluster.areaKey).toBe("bình chánh");
    expect(cluster.propertyTypeKey).toBe("đất nền");
    expect(cluster.inventoryCount).toBe(1);
    expect(cluster.inventoryTier).toBe(InventoryTier.SPARSE);

    // Benchmark heat state MUST be null (no 0.0 fallback)
    expect(cluster.medianPricePerM2).toBeNull();
    expect(cluster.confidence).toBeNull();
    expect(cluster.heatTier).toBeNull();
    expect(cluster.normalizedIntensity).toBeNull();
  });

  it("test7_inventoryCountIncludesCorruptPriceAndMissingGps", () => {
    const corruptPrice = createProperty({
      id: "p_corrupt",
      price: 0.0,
      latitude: null,
      longitude: null,
      area: "Tân Bình",
      propertyType: "Nhà riêng"
    });
    const missingGps = createProperty({
      id: "p_no_gps",
      price: 3.0,
      latitude: null,
      longitude: null,
      area: "Tân Bình",
      propertyType: "Nhà riêng"
    });

    const priceTable: PriceTableResult = { totalRows: 0, totalPropertiesEvaluated: 0, rows: [] };
    const result = PriceMapCalculator.calculate(
      [corruptPrice, missingGps],
      new StatisticsFilter(),
      priceTable,
      undefined,
      testNow
    );

    // Base population has 2 properties
    expect(result.totalBaseFilteredProperties).toBe(2);
    expect(result.excludedInvalidPriceCount).toBe(1);
    expect(result.excludedMissingGpsCount).toBe(1);
    expect(result.plottedDotsCount).toBe(0);

    // Cluster is created from baseFilteredProperties with inventoryCount = 2
    expect(result.areaClusters.length).toBe(1);
    const cluster = result.areaClusters[0];
    expect(cluster.inventoryCount).toBe(2);
    expect(cluster.inventoryTier).toBe(InventoryTier.SPARSE);
    expect(cluster.validGpsPointsCount).toBe(0);
    expect(cluster.centroidLat).toBeNull();
    expect(cluster.centroidLng).toBeNull();
  });

  it("test8_areaLevelLiquiditySharedAcrossPropertyTypes", () => {
    const propNha = createProperty({ id: "p1", area: "Thủ Đức", propertyType: "Nhà riêng" });
    const propDat = createProperty({ id: "p2", area: "Thủ Đức", propertyType: "Đất nền" });

    const perfResult = createPerformanceResult([
      createSegmentLiquidityRow({ segmentKey: "thủ đức", displayName: "Thủ Đức", soldRatioProxy: 0.35 })
    ]);

    const priceTable: PriceTableResult = { totalRows: 0, totalPropertiesEvaluated: 0, rows: [] };
    const result = PriceMapCalculator.calculate(
      [propNha, propDat],
      new StatisticsFilter(),
      priceTable,
      perfResult,
      testNow
    );

    const clusters = new Map(result.areaClusters.map((c) => [c.propertyTypeKey, c]));
    const clusterNha = clusters.get("nhà riêng")!;
    const clusterDat = clusters.get("đất nền")!;

    // Both clusters in "Thủ Đức" share the same area-level liquidity ratio 0.35
    expect(clusterNha.soldRatioProxy).toBeCloseTo(0.35, 3);
    expect(clusterNha.liquidityTier).toBe(LiquidityTier.MEDIUM);

    expect(clusterDat.soldRatioProxy).toBeCloseTo(0.35, 3);
    expect(clusterDat.liquidityTier).toBe(LiquidityTier.MEDIUM);
  });

  it("test9_liquidityFailClosedOnDuplicateOrInvalidRatio", () => {
    const prop = createProperty({ id: "p1", area: "Gò Vấp", propertyType: "Nhà riêng" });
    const priceTable: PriceTableResult = { totalRows: 0, totalPropertiesEvaluated: 0, rows: [] };

    // 1. Duplicate segmentKey in byArea => fail-closed to null and NO_DATA
    const perfDup = createPerformanceResult([
      createSegmentLiquidityRow({ segmentKey: "gò vấp", displayName: "Gò Vấp", soldRatioProxy: 0.3 }),
      createSegmentLiquidityRow({ segmentKey: "gò vấp", displayName: "Gò Vấp", soldRatioProxy: 0.4 })
    ]);
    const resultDup = PriceMapCalculator.calculate(
      [prop],
      new StatisticsFilter(),
      priceTable,
      perfDup,
      testNow
    );
    expect(resultDup.areaClusters[0].soldRatioProxy).toBeNull();
    expect(resultDup.areaClusters[0].liquidityTier).toBe(LiquidityTier.NO_DATA);

    // 2. Invalid ratio: negative (-0.1), > 1.0 (1.0001), NaN, Infinity
    const invalidRatios = [-0.1, 1.0001, Number.NaN, Infinity, -Infinity];
    for (const badRatio of invalidRatios) {
      const perfBad = createPerformanceResult([
        createSegmentLiquidityRow({ segmentKey: "gò vấp", displayName: "Gò Vấp", soldRatioProxy: badRatio })
      ]);
      const resultBad = PriceMapCalculator.calculate(
        [prop],
        new StatisticsFilter(),
        priceTable,
        perfBad,
        testNow
      );
      expect(resultBad.areaClusters[0].soldRatioProxy).toBeNull();
      expect(resultBad.areaClusters[0].liquidityTier).toBe(LiquidityTier.NO_DATA);
    }

    // 3. ClassifyLiquidityTier boundaries
    expect(PriceMapCalculator.classifyLiquidityTier(0.0)).toBe(LiquidityTier.LOW);
    expect(PriceMapCalculator.classifyLiquidityTier(0.1999)).toBe(LiquidityTier.LOW);
    expect(PriceMapCalculator.classifyLiquidityTier(0.2)).toBe(LiquidityTier.MEDIUM);
    expect(PriceMapCalculator.classifyLiquidityTier(0.3999)).toBe(LiquidityTier.MEDIUM);
    expect(PriceMapCalculator.classifyLiquidityTier(0.4)).toBe(LiquidityTier.HIGH);
    expect(PriceMapCalculator.classifyLiquidityTier(1.0)).toBe(LiquidityTier.HIGH);
    expect(PriceMapCalculator.classifyLiquidityTier(null)).toBe(LiquidityTier.NO_DATA);
  });

  it("test10_inventoryTierBoundariesAndDrillDownNullAndPermutationInvariance", () => {
    // Inventory tier boundaries
    expect(PriceMapCalculator.classifyInventoryTier(0)).toBe(InventoryTier.EMPTY);
    expect(PriceMapCalculator.classifyInventoryTier(1)).toBe(InventoryTier.SPARSE);
    expect(PriceMapCalculator.classifyInventoryTier(4)).toBe(InventoryTier.SPARSE);
    expect(PriceMapCalculator.classifyInventoryTier(5)).toBe(InventoryTier.MODERATE);
    expect(PriceMapCalculator.classifyInventoryTier(14)).toBe(InventoryTier.MODERATE);
    expect(PriceMapCalculator.classifyInventoryTier(15)).toBe(InventoryTier.DENSE);
    expect(PriceMapCalculator.classifyInventoryTier(100)).toBe(InventoryTier.DENSE);

    // Invariant: all drillDownFilter === null
    const p1 = createProperty({ id: "p1", area: "quận 1", propertyType: "nhà riêng", price: 3.0, areaSize: 100.0 });
    const p2 = createProperty({ id: "p2", area: "Quận 1", propertyType: "Nhà Riêng", price: 4.0, areaSize: 100.0 });
    const p3 = createProperty({ id: "p3", area: " QUẬN 1 ", propertyType: " NHÀ RIÊNG ", price: 5.0, areaSize: 100.0 });
    const p4 = createProperty({ id: "p4", area: "Quận 2", propertyType: "Đất nền", price: 6.0, areaSize: 100.0 });
    const row1 = createAreaPriceRow({ areaKey: "quận 1", propertyTypeKey: "nhà riêng", displayMedianPricePerM2: 40.0, sampleCount: 10 });
    const row2 = createAreaPriceRow({ areaKey: "quận 2", propertyTypeKey: "đất nền", displayMedianPricePerM2: 60.0, sampleCount: 8 });
    const priceTable1: PriceTableResult = { totalRows: 2, totalPropertiesEvaluated: 18, rows: [row1, row2] };
    const priceTable2: PriceTableResult = { totalRows: 2, totalPropertiesEvaluated: 18, rows: [row2, row1] };

    const result1 = PriceMapCalculator.calculate(
      [p1, p2, p3, p4],
      new StatisticsFilter(),
      priceTable1,
      undefined,
      testNow
    );
    expect(result1.dotPoints.every((p) => p.drillDownFilter === null)).toBe(true);
    expect(result1.areaClusters.every((c) => c.drillDownFilter === null)).toBe(true);

    // Permutation Invariance: permute both properties and priceTableResult.rows
    const result2 = PriceMapCalculator.calculate(
      [p4, p3, p2, p1],
      new StatisticsFilter(),
      priceTable2,
      undefined,
      testNow
    );
    expect(result1).toEqual(result2);
  });
});
