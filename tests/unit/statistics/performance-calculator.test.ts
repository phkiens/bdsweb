import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { ConfidenceLevel } from "../../../src/core/statistics/confidence-level";
import { PerformanceCalculator } from "../../../src/core/statistics/performance-calculator";
import {
  PropertyStatusConstants,
  StatisticsDateRange,
  StatisticsFilter
} from "../../../src/core/statistics/statistics-filter";

describe("PerformanceCalculatorTest", () => {

  // Fixed now: 2026-09-12T12:00:00+07:00
  // In UTC: 2026-09-12 05:00:00 UTC
  const fixedNow = Date.UTC(2026, 8, 12, 5, 0, 0);

  function daysAgo(days: number): number {
    const todayUtc = Date.UTC(2026, 8, 12);
    // 10:00:00+07:00 is (10 - 7) = 3:00 UTC
    return todayUtc - days * 86_400_000 + 3 * 3600 * 1000;
  }

  function createProp(partial?: Partial<Property>): Property {
    return createDefaultProperty({
      id: "p1",
      area: "Hải An",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: 60.0,
      price: 3.0,
      description: "Mô tả",
      status: PropertyStatusConstants.FOR_SALE,
      propertyType: "Nhà phố",
      isVerified: true,
      isDraft: false,
      isDeleted: false,
      createdAt: daysAgo(10),
      ...partial
    });
  }

  it("testAllTwelvePriceBoundariesAndFixedPriceTiers", () => {
    const now = fixedNow;
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });

    const p0 = createProp({ id: "p0", price: 0.0 });
    const p1 = createProp({ id: "p1", price: 1.999 });
    const p2 = createProp({ id: "p2", price: 2.0 });
    const p3 = createProp({ id: "p3", price: 2.999 });
    const p4 = createProp({ id: "p4", price: 3.0 });
    const p5 = createProp({ id: "p5", price: 4.999 });
    const p6 = createProp({ id: "p6", price: 5.0 });
    const p7 = createProp({ id: "p7", price: 6.999 });
    const p8 = createProp({ id: "p8", price: 7.0 });
    const p9 = createProp({ id: "p9", price: 15.0 });
    const pNeg = createProp({ id: "pNeg", price: -1.0 });
    const pNaN = createProp({ id: "pNaN", price: NaN });
    const pInf = createProp({ id: "pInf", price: Infinity });

    const result = PerformanceCalculator.calculate(
      [p0, p1, p2, p3, p4, p5, p6, p7, p8, p9, pNeg, pNaN, pInf],
      filter,
      now
    );

    // Summary contains all 13 properties (since liquidity does not require valid price)
    expect(result.summary.totalLiquidityDenominator).toBe(13);

    // byPriceTier must contain exactly 5 fixed rows
    expect(result.byPriceTier).toHaveLength(5);
    const tierUnder2 = result.byPriceTier[0];
    const tier2To3 = result.byPriceTier[1];
    const tier3To5 = result.byPriceTier[2];
    const tier5To7 = result.byPriceTier[3];
    const tier7Plus = result.byPriceTier[4];

    expect(tierUnder2.displayName).toBe("< 2 tỷ");
    expect(tierUnder2.liquidityDenominator).toBe(2); // p0 and p1

    expect(tier2To3.displayName).toBe("2–3 tỷ");
    expect(tier2To3.liquidityDenominator).toBe(2); // p2 and p3

    expect(tier3To5.displayName).toBe("3–5 tỷ");
    expect(tier3To5.liquidityDenominator).toBe(2); // p4 and p5

    expect(tier5To7.displayName).toBe("5–7 tỷ");
    expect(tier5To7.liquidityDenominator).toBe(2); // p6 and p7

    expect(tier7Plus.displayName).toBe("≥ 7 tỷ");
    expect(tier7Plus.liquidityDenominator).toBe(2); // p8 and p9

    // Invalid prices (-1.0, NaN, Inf) are excluded from price buckets
    const totalInBuckets = result.byPriceTier.reduce(
      (sum, it) => sum + it.liquidityDenominator,
      0
    );
    expect(totalInBuckets).toBe(10);
    expect(totalInBuckets <= result.summary.totalLiquidityDenominator).toBe(true);

    // All 5 price tiers must have drillDownFilter == null per Data Contract v1.2.2
    for (const tier of result.byPriceTier) {
      expect(tier.drillDownFilter).toBeNull();
    }
  });

  it("testEmptyPriceTierHasNullRatioAndLowConfidence", () => {
    const now = fixedNow;
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });
    // All properties are in >= 7 tỷ
    const props = [
      createProp({ id: "p1", price: 8.0 }),
      createProp({ id: "p2", price: 10.0 })
    ];

    const result = PerformanceCalculator.calculate(props, filter, now);
    expect(result.byPriceTier).toHaveLength(5);

    // Bucket < 2 tỷ has 0 samples
    const emptyTier = result.byPriceTier[0];
    expect(emptyTier.liquidityDenominator).toBe(0);
    expect(emptyTier.soldRatioProxy).toBeNull();
    expect(emptyTier.displaySoldRatioPercent).toBeNull();
    expect(emptyTier.confidence).toEqual(ConfidenceLevel.LOW);
    expect(emptyTier.drillDownFilter).toBeNull();
  });

  it("testDateWindowsAndBoundaries", () => {
    const now = fixedNow;
    // DateRange: Last7Days
    const filter7d = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const window7d = filter7d.dateRange.resolveWindow(now)!;

    // Property exactly at startInclusive -> included
    const pAtStart = createProp({ id: "pAtStart", createdAt: window7d.startInclusive });
    // Property inside window
    const pInside = createProp({ id: "pInside", createdAt: window7d.startInclusive + 10_000 });
    // Property exactly at endExclusive -> excluded
    const pAtEnd = createProp({ id: "pAtEnd", createdAt: window7d.endExclusive });
    // Property before window
    const pBefore = createProp({ id: "pBefore", createdAt: window7d.startInclusive - 1_000 });

    const result = PerformanceCalculator.calculate(
      [pAtStart, pInside, pAtEnd, pBefore],
      filter7d,
      now
    );
    expect(result.summary.totalLiquidityDenominator).toBe(2);

    // AllTime rejects createdAt <= 0 and future date
    const filterAllTime = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });
    const pZeroCreated = createProp({ id: "pZero", createdAt: 0 });
    const pNegCreated = createProp({ id: "pNeg", createdAt: -100 });
    const pFutureCreated = createProp({ id: "pFuture", createdAt: fixedNow + 86_400_000 * 2 }); // 2 days in future
    const pValidAllTime = createProp({ id: "pValid", createdAt: daysAgo(50) });

    const resultAllTime = PerformanceCalculator.calculate(
      [pZeroCreated, pNegCreated, pFutureCreated, pValidAllTime],
      filterAllTime,
      now
    );
    expect(resultAllTime.summary.totalLiquidityDenominator).toBe(1);
  });

  it("testSentinelAndBlankHandlingInByAreaAndByType", () => {
    const now = fixedNow;
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });

    const validArea = createProp({ id: "v1", area: "Hải An", propertyType: "Nhà phố" });
    const blankArea = createProp({ id: "b1", area: "   ", propertyType: "Nhà phố" });
    const sentinelArea1 = createProp({ id: "s1", area: "chưa xác định", propertyType: "Nhà phố" });
    const sentinelArea2 = createProp({ id: "s2", area: "chua_ro", propertyType: "Nhà phố" });
    const sentinelArea3 = createProp({ id: "s3", area: "null", propertyType: "Nhà phố" });

    const sentinelType = createProp({ id: "st1", area: "Hải An", propertyType: "chua_ro" });
    const blankType = createProp({ id: "bt1", area: "Hải An", propertyType: "" });

    const allProps = [
      validArea,
      blankArea,
      sentinelArea1,
      sentinelArea2,
      sentinelArea3,
      sentinelType,
      blankType
    ];
    const result = PerformanceCalculator.calculate(allProps, filter, now);

    // All 7 are in summary
    expect(result.summary.totalLiquidityDenominator).toBe(7);

    // byArea only has "Hải An" (3 properties: v1, sentinelType, blankType)
    expect(result.byArea).toHaveLength(1);
    expect(result.byArea[0].displayName).toBe("Hải An");
    expect(result.byArea[0].liquidityDenominator).toBe(3);
    expect(
      result.byArea.reduce((s, it) => s + it.liquidityDenominator, 0) <=
        result.summary.totalLiquidityDenominator
    ).toBe(true);

    // byPropertyType only has "Nhà Phố" (5 properties: v1, b1, s1, s2, s3)
    expect(result.byPropertyType).toHaveLength(1);
    expect(result.byPropertyType[0].displayName).toBe("Nhà Phố");
    expect(result.byPropertyType[0].liquidityDenominator).toBe(5);
    expect(
      result.byPropertyType.reduce((s, it) => s + it.liquidityDenominator, 0) <=
        result.summary.totalLiquidityDenominator
    ).toBe(true);

    // Area and PropertyType rows must have drillDownFilter == null per Data Contract v1.2.2
    expect(result.byArea[0].drillDownFilter).toBeNull();
    expect(result.byPropertyType[0].drillDownFilter).toBeNull();
  });

  it("testLiquidityMathAndSampleConfidence", () => {
    const now = fixedNow;
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });

    // 2 sold, 8 for sale -> 2 / 10 = 0.2 (20%), count 10 -> GOOD
    const props10: Property[] = [
      ...Array.from({ length: 8 }, (_, i) =>
        createProp({ id: `fs${i + 1}`, status: PropertyStatusConstants.FOR_SALE })
      ),
      ...Array.from({ length: 2 }, (_, i) =>
        createProp({ id: `sold${i + 1}`, status: PropertyStatusConstants.SOLD })
      )
    ];
    const result10 = PerformanceCalculator.calculate(props10, filter, now);
    expect(result10.summary.totalLiquidityDenominator).toBe(10);
    expect(result10.summary.totalForSaleCreatedInWindow).toBe(8);
    expect(result10.summary.totalSoldCreatedInWindow).toBe(2);
    expect(result10.summary.overallSoldRatioProxy!).toBeCloseTo(0.2, 4);
    expect(result10.summary.displayOverallSoldRatioPercent!).toBeCloseTo(20.0, 4);
    expect(result10.summary.overallConfidence).toEqual(ConfidenceLevel.GOOD);

    // 0 sold, 6 for sale -> 0 / 6 = 0.0 (0%), count 6 -> MEDIUM
    const props6: Property[] = Array.from({ length: 6 }, (_, i) =>
      createProp({ id: `fs${i + 1}`, status: PropertyStatusConstants.FOR_SALE })
    );
    const result6 = PerformanceCalculator.calculate(props6, filter, now);
    expect(result6.summary.totalLiquidityDenominator).toBe(6);
    expect(result6.summary.overallSoldRatioProxy!).toBeCloseTo(0.0, 4);
    expect(result6.summary.displayOverallSoldRatioPercent!).toBeCloseTo(0.0, 4);
    expect(result6.summary.overallConfidence).toEqual(ConfidenceLevel.MEDIUM);

    // 0 sold, 0 for sale -> denominator 0 -> null ratio, LOW confidence
    const result0 = PerformanceCalculator.calculate([], filter, now);
    expect(result0.summary.totalLiquidityDenominator).toBe(0);
    expect(result0.summary.overallSoldRatioProxy).toBeNull();
    expect(result0.summary.displayOverallSoldRatioPercent).toBeNull();
    expect(result0.summary.overallConfidence).toEqual(ConfidenceLevel.LOW);
  });

  it("testExclusionOfDraftDeletedAndUnknownStatus", () => {
    const now = fixedNow;
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });

    const validForSale = createProp({ id: "v1", status: PropertyStatusConstants.FOR_SALE });
    const validSold = createProp({ id: "v2", status: PropertyStatusConstants.SOLD });
    const unverified = createProp({ id: "uv", isVerified: false }); // Default FOR_SALE, included!
    const draft = createProp({ id: "dr", isDraft: true }); // Excluded
    const deleted = createProp({ id: "del", isDeleted: true }); // Excluded
    const pendingSurvey = createProp({ id: "ps", status: PropertyStatusConstants.PENDING_SURVEY }); // Active market, included!
    const unknownStatus = createProp({ id: "unk", status: "Chưa xác định status" }); // Excluded

    const all = [
      validForSale,
      validSold,
      unverified,
      draft,
      deleted,
      pendingSurvey,
      unknownStatus
    ];
    const result = PerformanceCalculator.calculate(all, filter, now);

    // Denominator = 3 active (validForSale, unverified, pendingSurvey) + 1 sold (validSold) = 4
    expect(result.summary.totalLiquidityDenominator).toBe(4);
    expect(result.summary.totalForSaleCreatedInWindow).toBe(3);
    expect(result.summary.totalSoldCreatedInWindow).toBe(1);
  });

  it("testPermutationInvariance", () => {
    const now = fixedNow;
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });

    const props: Property[] = Array.from({ length: 30 }, (_, i) => {
      const idx = i + 1;
      const status =
        idx % 3 === 0
          ? PropertyStatusConstants.SOLD
          : PropertyStatusConstants.FOR_SALE;
      const area = idx % 2 === 0 ? "Hải An" : "Lê Chân";
      const type = idx % 4 === 0 ? "Đất" : "Nhà phố";
      const price = 1.0 + (idx % 10);
      return createProp({
        id: `p${idx}`,
        status,
        area,
        propertyType: type,
        price,
        createdAt: daysAgo(idx)
      });
    });

    const r1 = PerformanceCalculator.calculate(props, filter, now);
    const shuffled = [...props].sort(() => 0.5 - Math.random());
    const r2 = PerformanceCalculator.calculate(shuffled, filter, now);

    expect(r1.summary).toEqual(r2.summary);
    expect(r1.byArea).toEqual(r2.byArea);
    expect(r1.byPropertyType).toEqual(r2.byPropertyType);
    expect(r1.byPriceTier).toEqual(r2.byPriceTier);
  });
});
