import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  StatisticsDateRange,
  StatisticsFilter
} from "../../../src/core/statistics/statistics-filter";
import { RadarConfig } from "../../../src/core/statistics/radar/radar-config";
import {
  OpportunityQuadrant,
  RadarAreaSummary,
} from "../../../src/core/statistics/radar/radar-models";
import { RadarCalculator } from "../../../src/core/statistics/radar/radar-calculator";

describe("RadarCalculatorTest", () => {
  // Fixed reference time: 2026-09-12T12:00:00+07:00 (1789275600000)
  const testNow = 1789275600000;

  function createProperty(params: {
    id: string;
    area?: string;
    propertyType?: string;
    price?: number;
    areaSize?: number | null;
    status?: string;
    isVerified?: boolean;
    isDraft?: boolean;
    isDeleted?: boolean;
    createdAt?: number;
  }): Property {
    const createdAt = params.createdAt ?? testNow - 86400000 * 5; // 5 days ago
    return createDefaultProperty({
      id: params.id,
      area: params.area ?? "Khu A",
      propertyType: params.propertyType ?? "Nhà riêng",
      price: params.price ?? 3.0,
      areaSize: params.areaSize !== undefined ? params.areaSize : 100.0,
      status: params.status ?? PropertyStatus.FOR_SALE,
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false,
      createdAt,
      updatedAt: createdAt,
      description: `Property ${params.id}`,
      latitude: 10.7769,
      longitude: 106.7009
    });
  }

  // Helper to generate N benchmark properties in a specific comparator area
  function createBenchmarkAreaProperties(
    area: string,
    count: number,
    propertyType: string = "Nhà riêng",
    price: number = 4.0,
    areaSize: number = 100.0
  ): Property[] {
    const list: Property[] = [];
    for (let i = 1; i <= count; i++) {
      list.push(
        createProperty({
          id: `${area}_${i}`,
          area,
          propertyType,
          price,
          areaSize,
          status: PropertyStatus.FOR_SALE
        })
      );
    }
    return list;
  }

  // 1. Population loại deleted, unverified, draft; activeCount vẫn giữ FOR_SALE thiếu giá
  it("testPopulationFilteringAndActiveCountWithInvalidPrice", () => {
    const properties: Property[] = [];
    // 5 valid verified target properties with price
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `target_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }
    // 1 unverified target property with price: NOW INCLUDED in Radar
    properties.push(createProperty({ id: "target_unverified", area: "Khu A", price: 3.0, areaSize: 100.0, isVerified: false }));
    // 2 valid target properties with corrupt/missing price (should count in activeCount)
    properties.push(createProperty({ id: "target_no_price", area: "Khu A", price: 0.0, areaSize: 100.0 }));
    properties.push(createProperty({ id: "target_no_area", area: "Khu A", price: 3.0, areaSize: null }));

    // Excluded: deleted, draft
    properties.push(createProperty({ id: "target_deleted", area: "Khu A", isDeleted: true }));
    properties.push(createProperty({ id: "target_draft", area: "Khu A", isDraft: true }));

    // Provide 2 comparator areas with 5 samples each so structural benchmark gate passes
    properties.push(...createBenchmarkAreaProperties("Khu B", 5));
    properties.push(...createBenchmarkAreaProperties("Khu C", 5));

    const result = RadarCalculator.calculate(
      properties,
      new StatisticsFilter(),
      undefined,
      testNow
    );

    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const segA = result.segments.find((it) => it.key.areaKey === "khu a");
      expect(segA).toBeDefined();
      // 6 valid price (5 verified + 1 unverified) + 2 missing/corrupt price = 8 total active
      expect(segA!.activeCount).toBe(8);
      // targetPriceSampleCount must be 6
      expect(segA!.targetPriceSampleCount).toBe(6);
    }
  });

  // 2. Canonical area/type gom đúng casing, khoảng trắng và biến thể loại hình cũ; sentinel bị loại
  it("testCanonicalAreaAndTypeGroupingAndSentinels", () => {
    const properties = [
      createProperty({ id: "p1", area: "  quận 1  ", propertyType: "Nhà riêng" }),
      createProperty({ id: "p2", area: "Quận 1", propertyType: "nhà riêng" }),
      createProperty({ id: "p3", area: "QUẬN 1", propertyType: "NHÀ RIÊNG" }),
      // Sentinels should be rejected
      createProperty({ id: "p_sentinel1", area: "chưa xác định", propertyType: "Nhà riêng" }),
      createProperty({ id: "p_sentinel2", area: "Khu B", propertyType: "chua_ro" }),
      createProperty({ id: "p_sentinel3", area: "null", propertyType: "Nhà riêng" }),
      createProperty({ id: "p_blank", area: "", propertyType: "Nhà riêng" })
    ];

    const result = RadarCalculator.calculate(
      properties,
      new StatisticsFilter(),
      undefined,
      testNow
    );

    // Only 1 segment should exist from p1, p2, p3 (which has no comparators, so InsufficientBenchmark)
    expect(result.type).toBe("INSUFFICIENT_BENCHMARK");
  });

  // 3. Benchmark chỉ cùng type, khác area; comparator area < 5 bị loại khỏi pool
  it("testBenchmarkPoolFiltersByPropertyTypeAndExcludesTargetAreaAndSmallSampleAreas", () => {
    const properties: Property[] = [];
    // Target segment: Khu A, type Nhà riêng (5 props)
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `a_${i}`, area: "Khu A", propertyType: "Nhà riêng", price: 3.0, areaSize: 100.0 }));
    }
    // Comparator Area B: 5 props of Nhà riêng => qualified (>= 5)
    properties.push(...createBenchmarkAreaProperties("Khu B", 5, "Nhà riêng", 4.0));
    // Comparator Area C: 5 props of Nhà riêng => qualified (>= 5)
    properties.push(...createBenchmarkAreaProperties("Khu C", 5, "Nhà riêng", 4.0));
    // Comparator Area D: 4 props of Nhà riêng => disqualified (< 5)
    properties.push(...createBenchmarkAreaProperties("Khu D", 4, "Nhà riêng", 4.0));
    // Comparator Area E: 10 props of Đất => disqualified (different type)
    properties.push(...createBenchmarkAreaProperties("Khu E", 10, "Đất", 4.0));

    const result = RadarCalculator.calculate(
      properties,
      new StatisticsFilter(),
      undefined,
      testNow
    );

    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const segA = result.segments.find((it) => it.key.areaKey === "khu a");
      expect(segA).toBeDefined();
      expect(segA!.comparatorAreaCount).toBe(2); // Only Khu B and Khu C
      expect(segA!.benchmarkPriceSampleCount).toBe(10); // 5 + 5
    }
  });

  // 4. Structural gate tại 1/2 comparator areas và target/benchmark sample tại 4/5/9/10
  it("testStructuralGateAndSampleCountGates", () => {
    // Case A: only 1 comparator area >= 5 => structural gate fails => InsufficientBenchmark
    const props1: Property[] = [];
    for (let i = 1; i <= 5; i++) {
      props1.push(createProperty({ id: `a_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }
    props1.push(...createBenchmarkAreaProperties("Khu B", 5));

    const result1 = RadarCalculator.calculate(props1, new StatisticsFilter(), undefined, testNow);
    expect(result1.type).toBe("INSUFFICIENT_BENCHMARK");

    // Case B: 2 comparator areas, but target has only 4 samples => Ineligible due to target samples < 5
    const props2: Property[] = [];
    for (let i = 1; i <= 4; i++) {
      props2.push(createProperty({ id: `a_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }
    props2.push(...createBenchmarkAreaProperties("Khu B", 5));
    props2.push(...createBenchmarkAreaProperties("Khu C", 5));

    const result2 = RadarCalculator.calculate(props2, new StatisticsFilter(), undefined, testNow);
    expect(result2.type).toBe("SUCCESS");
    if (result2.type === "SUCCESS") {
      const segA2 = result2.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segA2.eligible).toBe(false);
      expect(segA2.confidencePrice.name).toBe("LOW");
      expect(segA2.opportunityScore).toBeNull();
      expect(segA2.quadrant).toBe(OpportunityQuadrant.INSUFFICIENT_DATA);
    }
  });

  // 5. Benchmark median là pooled property median, không median-of-medians; chọn area filter không thay benchmark
  it("testBenchmarkMedianIsPooledPropertyMedianAndAreaFilterInvariance", () => {
    const properties: Property[] = [];
    // Target: Khu A (5 props)
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `a_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }

    // Area B: 5 properties with price/m² = 0.020 (price = 2.0, size = 100) => median B = 0.020
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `b_${i}`, area: "Khu B", price: 2.0, areaSize: 100.0 }));
    }

    // Area C: 10 properties with price/m² = 0.050 (price = 5.0, size = 100) => median C = 0.050
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `c_${i}`, area: "Khu C", price: 5.0, areaSize: 100.0 }));
    }

    // Pooled values: 5 of 0.020, 10 of 0.050 => 15 values total:
    // Index 0..4 = 0.020, Index 5..14 = 0.050 => R-7 median is 0.050!
    const resultNoFilter = RadarCalculator.calculate(properties, new StatisticsFilter(), undefined, testNow);
    expect(resultNoFilter.type).toBe("SUCCESS");
    if (resultNoFilter.type === "SUCCESS") {
      const segA = resultNoFilter.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segA.benchmarkMedianPricePerM2).toBeCloseTo(0.05, 9);
    }

    // Invariance when area filter is applied
    const filterWithArea = new StatisticsFilter({ area: "Khu A" });
    const resultWithFilter = RadarCalculator.calculate(properties, filterWithArea, undefined, testNow);
    expect(resultWithFilter.type).toBe("SUCCESS");
    if (resultWithFilter.type === "SUCCESS") {
      const segAFiltered = resultWithFilter.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segAFiltered.benchmarkMedianPricePerM2).toBeCloseTo(0.05, 9);
    }
  });

  // 6. Công thức deviation và price score với giá trị biên
  it("testPriceDeviationAndPriceScoreFormulasWithBoundaries", () => {
    const properties: Property[] = [];
    // Target Khu A: pricePerM2 = 0.030
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `a_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }
    // Benchmark areas: pricePerM2 = 0.040
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `b_${i}`, area: "Khu B", price: 4.0, areaSize: 100.0 }));
      properties.push(createProperty({ id: `c_${i}`, area: "Khu C", price: 4.0, areaSize: 100.0 }));
    }

    const result = RadarCalculator.calculate(properties, new StatisticsFilter(), undefined, testNow);
    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const segA = result.segments.find((it) => it.key.areaKey === "khu a")!;
      // deviation = ((0.030 - 0.040) / 0.040) * 100 = -25.0%
      expect(segA.priceDeviationPercent).toBeCloseTo(-25.0, 6);
      // priceScore = 50 - (-25)*2 = 100.0 (coerced in [0, 100])
      expect(segA.scoreBreakdown!.priceScore).toBeCloseTo(100.0, 6);
    }
  });

  // 7. Liquidity: half-open window, FOR_SALE/SOLD, denominator 0 => null, không fallback, AllTime loại ngày lỗi/tương lai
  it("testLiquidityDateWindowAndFallbackBehavior", () => {
    const filter7d = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const properties: Property[] = [];

    // Target Khu A: 5 FOR_SALE created 2 days ago (in 7d window)
    for (let i = 1; i <= 5; i++) {
      properties.push(
        createProperty({
          id: `a_fs_${i}`,
          area: "Khu A",
          status: PropertyStatus.FOR_SALE,
          createdAt: testNow - 86400000 * 2
        })
      );
    }
    // 5 SOLD created 3 days ago (in 7d window)
    for (let i = 1; i <= 5; i++) {
      properties.push(
        createProperty({
          id: `a_sold_${i}`,
          area: "Khu A",
          status: PropertyStatus.SOLD,
          createdAt: testNow - 86400000 * 3
        })
      );
    }
    // 1 SOLD created 10 days ago (outside 7d window, should not be in liquidity)
    properties.push(
      createProperty({
        id: "a_old_sold",
        area: "Khu A",
        status: PropertyStatus.SOLD,
        createdAt: testNow - 86400000 * 10
      })
    );

    // Add 2 comparator areas
    properties.push(...createBenchmarkAreaProperties("Khu B", 5));
    properties.push(...createBenchmarkAreaProperties("Khu C", 5));

    const result = RadarCalculator.calculate(properties, filter7d, undefined, testNow);
    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const segA = result.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segA.forSaleCreatedInWindow).toBe(5);
      expect(segA.soldCreatedInWindow).toBe(5);
      expect(segA.liquidityDenominator).toBe(10);
      expect(segA.soldRatioProxy).toBeCloseTo(0.5, 6);
    }

    // Case denominator = 0 in date window (window in last 1 hour, where no properties were created)
    const filter1h = new StatisticsFilter({
      dateRange: StatisticsDateRange.Custom(testNow - 3600000, testNow)
    });
    const result1h = RadarCalculator.calculate(properties, filter1h, undefined, testNow);
    expect(result1h.type).toBe("SUCCESS");
    if (result1h.type === "SUCCESS") {
      const segA1h = result1h.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segA1h.liquidityDenominator).toBe(0);
      expect(segA1h.soldRatioProxy).toBeNull();
      expect(segA1h.eligible).toBe(false);
    }
  });

  // 8. Aging theo LocalDate Asia/Ho_Chi_Minh, hôm nay = 0, ngày lỗi/tương lai bị loại, median chẵn/lẻ
  it("testAgingCalculationWithZoneAndMedian", () => {
    const properties: Property[] = [];
    // Khu A:
    // Created 1 hour ago (same day in VN) => age = 0
    properties.push(createProperty({ id: "a_today", area: "Khu A", createdAt: testNow - 3600000 }));
    // Created 10 days ago => age = 10
    properties.push(createProperty({ id: "a_10d", area: "Khu A", createdAt: testNow - 86400000 * 10 }));
    // Created 20 days ago => age = 20
    properties.push(createProperty({ id: "a_20d", area: "Khu A", createdAt: testNow - 86400000 * 20 }));
    // Created 30 days ago => age = 30
    properties.push(createProperty({ id: "a_30d", area: "Khu A", createdAt: testNow - 86400000 * 30 }));
    // Created 40 days ago => age = 40
    properties.push(createProperty({ id: "a_40d", area: "Khu A", createdAt: testNow - 86400000 * 40 }));
    // Invalid: future date => excluded
    properties.push(createProperty({ id: "a_future", area: "Khu A", createdAt: testNow + 86400000 * 2 }));
    // Invalid: createdAt <= 0 => excluded
    properties.push(createProperty({ id: "a_corrupt_date", area: "Khu A", createdAt: 0 }));

    // Comparators
    properties.push(...createBenchmarkAreaProperties("Khu B", 5));
    properties.push(...createBenchmarkAreaProperties("Khu C", 5));

    const result = RadarCalculator.calculate(properties, new StatisticsFilter(), undefined, testNow);
    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const segA = result.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segA.activeAgeSampleCount).toBe(5);
      // Ages: 0, 10, 20, 30, 40 => median is 20.0
      expect(segA.medianAgeDays).toBeCloseTo(20.0, 6);
    }
  });

  // 9. Supply score tại activeCount 0, 1, 4, 5, 25, 26, 60+, sàn 30
  it("testSupplyScorePiecewiseFunction", () => {
    function computeSupplyScore(count: number): number {
      if (count < 5) {
        return count * 15.0;
      } else if (count <= 25) {
        return 100.0;
      } else {
        return Math.min(100.0, Math.max(30.0, 100.0 - (count - 25) * 2.0));
      }
    }

    expect(computeSupplyScore(0)).toBeCloseTo(0.0, 9);
    expect(computeSupplyScore(1)).toBeCloseTo(15.0, 9);
    expect(computeSupplyScore(4)).toBeCloseTo(60.0, 9);
    expect(computeSupplyScore(5)).toBeCloseTo(100.0, 9);
    expect(computeSupplyScore(25)).toBeCloseTo(100.0, 9);
    expect(computeSupplyScore(26)).toBeCloseTo(98.0, 9);
    expect(computeSupplyScore(60)).toBeCloseTo(30.0, 9);
    expect(computeSupplyScore(100)).toBeCloseTo(30.0, 9);
  });

  // 10. Confidence bottleneck và eligible/ineligible; ineligible score/breakdown null
  it("testConfidenceBottleneckAndIneligibility", () => {
    const propsFewAge: Property[] = [];
    for (let i = 1; i <= 4; i++) {
      propsFewAge.push(createProperty({ id: `few_age_${i}`, area: "Khu A" }));
    }
    propsFewAge.push(...createBenchmarkAreaProperties("Khu B", 5));
    propsFewAge.push(...createBenchmarkAreaProperties("Khu C", 5));

    const result = RadarCalculator.calculate(propsFewAge, new StatisticsFilter(), undefined, testNow);
    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const seg = result.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(seg.eligible).toBe(false);
      expect(seg.scoreBreakdown).toBeNull();
      expect(seg.opportunityScore).toBeNull();
      expect(seg.quadrant).toBe(OpportunityQuadrant.INSUFFICIENT_DATA);
    }
  });

  // 11. Opportunity score weights, range [0, 100], không làm tròn sớm
  it("testOpportunityScoreWeightedSumAndPrecision", () => {
    const properties: Property[] = [];
    // Khu A: 10 properties, price 3.0, size 100 => pricePerM2 = 0.030
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `a_fs_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }
    // Khu A: 10 SOLD => ratio = 10 / 20 = 0.50 => liquidityScore = 50.0
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `a_sold_${i}`, area: "Khu A", status: PropertyStatus.SOLD }));
    }

    // Comparators B and C: price 4.0, size 100 => benchmark 0.040
    properties.push(...createBenchmarkAreaProperties("Khu B", 10, "Nhà riêng", 4.0));
    properties.push(...createBenchmarkAreaProperties("Khu C", 10, "Nhà riêng", 4.0));

    const result = RadarCalculator.calculate(properties, new StatisticsFilter(), undefined, testNow);
    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      const segA = result.segments.find((it) => it.key.areaKey === "khu a")!;
      expect(segA.eligible).toBe(true);
      expect(segA.opportunityScore).not.toBeNull();
      expect(segA.opportunityScore!).toBeGreaterThanOrEqual(0.0);
      expect(segA.opportunityScore!).toBeLessThanOrEqual(100.0);
    }
  });

  // 12. P50 chỉ từ eligible; ngưỡng ratio == P50 thuộc high; equal-ratio => indeterminate
  it("testLiquidityP50FromEligibleOnlyAndIndeterminateCase", () => {
    // Equal ratio case: Khu A, Khu B, Khu C all have 50% sold ratio
    const properties: Property[] = [];
    // Area A: 5 FS, 5 SOLD => ratio 0.5
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `a_fs_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
      properties.push(createProperty({ id: `a_sold_${i}`, area: "Khu A", status: PropertyStatus.SOLD }));
    }
    // Area B: 5 FS, 5 SOLD => ratio 0.5
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `b_fs_${i}`, area: "Khu B", price: 3.0, areaSize: 100.0 }));
      properties.push(createProperty({ id: `b_sold_${i}`, area: "Khu B", status: PropertyStatus.SOLD }));
    }
    // Area C: 5 FS, 5 SOLD => ratio 0.5
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `c_fs_${i}`, area: "Khu C", price: 3.0, areaSize: 100.0 }));
      properties.push(createProperty({ id: `c_sold_${i}`, area: "Khu C", status: PropertyStatus.SOLD }));
    }

    const result = RadarCalculator.calculate(properties, new StatisticsFilter(), undefined, testNow);
    expect(result.type).toBe("SUCCESS");
    if (result.type === "SUCCESS") {
      expect(result.liquidityIndeterminate).toBe(true);
      expect(result.segments[0].quadrant).toBe(OpportunityQuadrant.INDETERMINATE_LIQUIDITY);
    }
  });

  // 13. Quadrant đủ bốn góc, vùng fair, insufficient và indeterminate
  it("testOpportunityQuadrantMapping", () => {
    const config = new RadarConfig();
    const p50 = 0.4;
    function classify(dev: number, ratio: number): OpportunityQuadrant {
      const isHighLiquidity = ratio >= p50;
      const isLowPrice = dev <= config.lowPriceThresholdPercent;
      const isHighPrice = dev >= config.highPriceThresholdPercent;
      if (!isLowPrice && !isHighPrice) {
        return OpportunityQuadrant.FAIR_MARKET;
      } else if (isLowPrice && isHighLiquidity) {
        return OpportunityQuadrant.GOLDEN_OPPORTUNITY;
      } else if (isLowPrice && !isHighLiquidity) {
        return OpportunityQuadrant.CHEAP_BUT_SLOW;
      } else if (isHighPrice && isHighLiquidity) {
        return OpportunityQuadrant.HOT_MARKET;
      } else {
        return OpportunityQuadrant.HOLDING_RISK;
      }
    }

    expect(classify(-10.0, 0.5)).toBe(OpportunityQuadrant.GOLDEN_OPPORTUNITY);
    expect(classify(-10.0, 0.3)).toBe(OpportunityQuadrant.CHEAP_BUT_SLOW);
    expect(classify(15.0, 0.5)).toBe(OpportunityQuadrant.HOT_MARKET);
    expect(classify(15.0, 0.3)).toBe(OpportunityQuadrant.HOLDING_RISK);
    expect(classify(0.0, 0.5)).toBe(OpportunityQuadrant.FAIR_MARKET);
    expect(classify(5.0, 0.2)).toBe(OpportunityQuadrant.FAIR_MARKET);
  });

  // 14. Result states: EmptyInventory, InsufficientBenchmark, Success hỗn hợp
  it("testResultStatesEmptyInventoryInsufficientBenchmarkAndMixedSuccess", () => {
    // 1. EmptyInventory
    const emptyResult = RadarCalculator.calculate([], new StatisticsFilter(), undefined, testNow);
    expect(emptyResult.type).toBe("EMPTY_INVENTORY");

    // 2. InsufficientBenchmark (only 1 area has inventory)
    const singleAreaProps: Property[] = [];
    for (let i = 1; i <= 10; i++) {
      singleAreaProps.push(createProperty({ id: `a_${i}`, area: "Khu A" }));
    }
    const noCompResult = RadarCalculator.calculate(singleAreaProps, new StatisticsFilter(), undefined, testNow);
    expect(noCompResult.type).toBe("INSUFFICIENT_BENCHMARK");

    // 3. Success mixed (Area A eligible, Area B has only 2 samples so ineligible, Area C and D have 5 samples)
    const mixedProps: Property[] = [];
    for (let i = 1; i <= 10; i++) {
      mixedProps.push(createProperty({ id: `a_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
    }
    for (let i = 1; i <= 2; i++) {
      mixedProps.push(createProperty({ id: `b_${i}`, area: "Khu B", price: 3.0, areaSize: 100.0 }));
    }
    for (let i = 1; i <= 5; i++) {
      mixedProps.push(createProperty({ id: `c_${i}`, area: "Khu C", price: 4.0, areaSize: 100.0 }));
      mixedProps.push(createProperty({ id: `d_${i}`, area: "Khu D", price: 4.0, areaSize: 100.0 }));
    }

    const mixedResult = RadarCalculator.calculate(mixedProps, new StatisticsFilter(), undefined, testNow);
    expect(mixedResult.type).toBe("SUCCESS");
    if (mixedResult.type === "SUCCESS") {
      const segA = mixedResult.segments.find((it) => it.key.areaKey === "khu a")!;
      const segB = mixedResult.segments.find((it) => it.key.areaKey === "khu b")!;
      expect(segA.eligible).toBe(true);
      expect(segB.eligible).toBe(false);
    }
  });

  // 15. Sorting deterministic, Top 3 loại LOW/ineligible và permutation invariance
  it("testDeterministicSortingAndTopOpportunities", () => {
    const properties: Property[] = [];
    // Area A: high score
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `a_fs_${i}`, area: "Khu A", price: 2.0, areaSize: 100.0 }));
      properties.push(createProperty({ id: `a_s_${i}`, area: "Khu A", status: PropertyStatus.SOLD }));
    }

    // Area B: medium score
    for (let i = 1; i <= 10; i++) {
      properties.push(createProperty({ id: `b_fs_${i}`, area: "Khu B", price: 3.0, areaSize: 100.0 }));
    }
    for (let i = 1; i <= 5; i++) {
      properties.push(createProperty({ id: `b_s_${i}`, area: "Khu B", status: PropertyStatus.SOLD }));
    }

    // Area C: benchmark provider
    properties.push(...createBenchmarkAreaProperties("Khu C", 10, "Nhà riêng", 4.0));

    // Ineligible area: only 2 samples
    for (let i = 1; i <= 2; i++) {
      properties.push(createProperty({ id: `inelig_${i}`, area: "Khu D", price: 1.0, areaSize: 100.0 }));
    }

    const result1 = RadarCalculator.calculate(properties, new StatisticsFilter(), undefined, testNow);
    const result2 = RadarCalculator.calculate([...properties].reverse(), new StatisticsFilter(), undefined, testNow);

    expect(result1.type).toBe("SUCCESS");
    expect(result2.type).toBe("SUCCESS");

    if (result1.type === "SUCCESS" && result2.type === "SUCCESS") {
      expect(result1.segments.map((it) => it.key)).toEqual(result2.segments.map((it) => it.key));
      expect(result1.topOpportunities.map((it) => it.key)).toEqual(result2.topOpportunities.map((it) => it.key));
      expect(result1.topOpportunities.every((it) => it.eligible)).toBe(true);
      expect(result1.topOpportunities.length).toBeLessThanOrEqual(3);
    }
  });

  // 16. Invalid config: NaN/infinite/negative, sai tổng weight, gate sai
  it("testInvalidConfigRejections", () => {
    // Negative minimumSample
    expect(() => new RadarConfig({ minimumSample: 0 })).toThrow();
    // goodSample < minimumSample
    expect(() => new RadarConfig({ minimumSample: 10, goodSample: 5 })).toThrow();
    // minimumComparatorAreas < 2
    expect(() => new RadarConfig({ minimumComparatorAreas: 1 })).toThrow();
    // lowPrice >= highPrice
    expect(() => new RadarConfig({ lowPriceThresholdPercent: 10.0, highPriceThresholdPercent: 5.0 })).toThrow();
    // NaN weight
    expect(() => new RadarConfig({ priceWeight: Number.NaN })).toThrow();
    // Weights not summing to 1.0
    expect(() => new RadarConfig({ priceWeight: 0.5, liquidityWeight: 0.6 })).toThrow();
  });

  // 17. now <= 0, ownerId non-blank và unsupported status fail-closed
  it("testFailClosedOnNowOwnerIdAndUnsupportedStatus", () => {
    const sampleProps = [createProperty({ id: "p1" })];

    // now <= 0
    expect(() => RadarCalculator.calculate(sampleProps, new StatisticsFilter(), undefined, 0)).toThrow();
    expect(() => RadarCalculator.calculate(sampleProps, new StatisticsFilter(), undefined, -100)).toThrow();

    // ownerId non-blank => InvalidFilter
    const filterWithOwner = new StatisticsFilter({ ownerId: "owner-999" });
    const resultOwner = RadarCalculator.calculate(sampleProps, filterWithOwner, undefined, testNow);
    expect(resultOwner.type).toBe("INVALID_FILTER");

    // Unsupported status: SOLD => InvalidFilter
    const filterSold = new StatisticsFilter({ status: PropertyStatus.SOLD });
    const resultSold = RadarCalculator.calculate(sampleProps, filterSold, undefined, testNow);
    expect(resultSold.type).toBe("INVALID_FILTER");
  });

  // 18. Input không bị mutate và mọi count/ratio/score invariant đúng
  it("testInputImmutabilityAndInvariants", () => {
    const originalList: Property[] = [];
    for (let i = 1; i <= 5; i++) {
      originalList.push(createProperty({ id: `p_${i}`, area: "Khu A" }));
    }
    const copyList = [...originalList];

    RadarCalculator.calculate(originalList, new StatisticsFilter(), undefined, testNow);

    expect(originalList).toEqual(copyList);
  });

  // 19. Custom sample threshold config: minimumSample = 3, goodSample = 6
  it("testCustomSampleThresholdConfigWithExactBoundaries", () => {
    const customConfig = new RadarConfig({
      minimumSample: 3,
      goodSample: 6,
      minimumComparatorAreas: 2
    });

    function runWithTargetCount(targetCount: number): RadarAreaSummary {
      const properties: Property[] = [];
      // target properties in Khu A with price 3.0, size 100
      // and 50% sold ratio so liquidity has denominator = 2 * targetCount >= targetCount
      for (let i = 1; i <= targetCount; i++) {
        properties.push(createProperty({ id: `a_fs_${i}`, area: "Khu A", price: 3.0, areaSize: 100.0 }));
        properties.push(createProperty({ id: `a_sold_${i}`, area: "Khu A", status: PropertyStatus.SOLD }));
      }
      // 2 comparator areas with 6 samples each (meets custom minimumSample=3 and goodSample=6)
      properties.push(...createBenchmarkAreaProperties("Khu B", 6, "Nhà riêng", 4.0));
      properties.push(...createBenchmarkAreaProperties("Khu C", 6, "Nhà riêng", 4.0));

      const result = RadarCalculator.calculate(
        properties,
        new StatisticsFilter(),
        customConfig,
        testNow
      );
      expect(result.type).toBe("SUCCESS");
      return (result as any).segments.find((it: any) => it.key.areaKey === "khu a");
    }

    // Boundary 2: count = 2 < minimumSample(3) => LOW confidence, ineligible
    const summary2 = runWithTargetCount(2);
    expect(summary2.confidencePrice.name).toBe("LOW");
    expect(summary2.overallConfidence.name).toBe("LOW");
    expect(summary2.eligible).toBe(false);
    expect(summary2.opportunityScore).toBeNull();
    expect(summary2.quadrant).toBe(OpportunityQuadrant.INSUFFICIENT_DATA);

    // Boundary 3: count = 3 == minimumSample(3) => MEDIUM confidence, eligible!
    const summary3 = runWithTargetCount(3);
    expect(summary3.confidencePrice.name).toBe("MEDIUM");
    expect(summary3.overallConfidence.name).toBe("MEDIUM");
    expect(summary3.eligible).toBe(true);
    expect(summary3.opportunityScore).not.toBeNull();
    expect(summary3.scoreBreakdown!.confidenceScore).toBeCloseTo(60.0, 9);

    // Boundary 5: count = 5 (< goodSample 6, >= minimumSample 3) => MEDIUM confidence, eligible!
    const summary5 = runWithTargetCount(5);
    expect(summary5.confidencePrice.name).toBe("MEDIUM");
    expect(summary5.overallConfidence.name).toBe("MEDIUM");
    expect(summary5.eligible).toBe(true);
    expect(summary5.opportunityScore).not.toBeNull();
    expect(summary5.scoreBreakdown!.confidenceScore).toBeCloseTo(60.0, 9);

    // Boundary 6: count = 6 == goodSample(6) => GOOD confidence, eligible!
    const summary6 = runWithTargetCount(6);
    expect(summary6.confidencePrice.name).toBe("GOOD");
    expect(summary6.overallConfidence.name).toBe("GOOD");
    expect(summary6.eligible).toBe(true);
    expect(summary6.opportunityScore).not.toBeNull();
    expect(summary6.scoreBreakdown!.confidenceScore).toBeCloseTo(100.0, 9);
  });
});
