import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { ConfidenceLevel } from "../../../src/core/statistics/confidence-level";
import {
  PropertyStatusConstants,
  StatisticsFilter,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "../../../src/core/statistics/statistics-filter";
import {
  OpportunityQuadrant,
  RadarAreaSummary,
  RadarOpportunityResult,
} from "../../../src/core/statistics/radar/radar-models";
import { MarketSortMode } from "../../../src/core/statistics/market-noteworthy-property";
import { MarketNoteworthyPropertyMapper } from "../../../src/core/statistics/market-noteworthy-property-mapper";

describe("MarketNoteworthyPropertyMapperTest", () => {
  const fixedNow = 1_700_000_000_000;

  function createSummary(params: {
    area: string;
    propertyType: string;
    targetMedianPricePerM2?: number; // 0.05 tỷ/m² = 50 tr/m²
    opportunityScore?: number;
    soldRatioProxy?: number;
    quadrant?: OpportunityQuadrant;
  }): RadarAreaSummary {
    const area = params.area;
    const propertyType = params.propertyType;
    const aKey = toCanonicalAreaKey(area);
    const tKey = toCanonicalPropertyTypeKey(propertyType);
    return {
      key: { areaKey: aKey, propertyTypeKey: tKey },
      areaDisplayName: area,
      propertyTypeDisplayName: propertyType,
      activeCount: 10,
      newInWindow: 2,
      targetPriceSampleCount: 10,
      targetMedianPricePerM2: params.targetMedianPricePerM2 ?? 0.05,
      comparatorAreaCount: 3,
      benchmarkPriceSampleCount: 15,
      benchmarkMedianPricePerM2: 0.052,
      priceDeviationPercent: -3.8,
      forSaleCreatedInWindow: 10,
      soldCreatedInWindow: 4,
      liquidityDenominator: 14,
      soldRatioProxy: params.soldRatioProxy ?? 0.4,
      activeAgeSampleCount: 10,
      medianAgeDays: 21.0,
      confidencePrice: ConfidenceLevel.GOOD,
      confidenceLiquidity: ConfidenceLevel.GOOD,
      confidenceAge: ConfidenceLevel.GOOD,
      overallConfidence: ConfidenceLevel.GOOD,
      eligible: true,
      scoreBreakdown: null,
      opportunityScore: params.opportunityScore ?? 80.0,
      quadrant: params.quadrant ?? OpportunityQuadrant.GOLDEN_OPPORTUNITY
    };
  }

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
    return createDefaultProperty({
      id: params.id,
      title: `BĐS ${params.id}`,
      area: params.area ?? "Lê Chân",
      latitude: null,
      longitude: null,
      description: "",
      propertyType: params.propertyType ?? "Nhà ngõ",
      price: params.price ?? 2.0,
      areaSize: params.areaSize !== undefined ? params.areaSize : 50.0,
      status: params.status ?? PropertyStatusConstants.FOR_SALE,
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false,
      createdAt: params.createdAt ?? fixedNow - 1000,
      updatedAt: params.createdAt ?? fixedNow - 1000
    });
  }

  it("testMap_computesUnitPriceAndSegmentDeviationCorrectly", () => {
    // Segment has targetMedianPricePerM2 = 0.05 tỷ/m² (50 tr/m²)
    const seg = createSummary({ area: "Lê Chân", propertyType: "Nhà ngõ", targetMedianPricePerM2: 0.05 });
    const radar: RadarOpportunityResult = {
      type: "SUCCESS",
      segments: [seg],
      eligibleSegments: [seg],
      topOpportunities: [seg],
      liquidityP50: 0.4,
      liquidityIndeterminate: false
    };

    // Property has price = 2.0 tỷ, areaSize = 50 m² => 0.04 tỷ/m² (40 tr/m²)
    // Deviation vs segment median (0.05): (0.04 - 0.05) / 0.05 = -20.0%
    const prop = createProperty({ id: "p1", area: "Lê Chân", propertyType: "Nhà ngõ", price: 2.0, areaSize: 50.0 });

    const result = MarketNoteworthyPropertyMapper.map(
      [prop],
      radar,
      new StatisticsFilter(),
      fixedNow
    );

    expect(result.length).toBe(1);
    const item = result[0];
    expect(item.propertyPricePerM2).toBeCloseTo(0.04, 6);
    expect(item.displayPricePerM2).toBeCloseTo(40.0, 6);
    expect(item.targetMedianPricePerM2).toBeCloseTo(0.05, 6);
    expect(item.displayTargetMedianPricePerM2).toBeCloseTo(50.0, 6);
    expect(item.deviationPercent).toBeCloseTo(-20.0, 6);
  });

  it("testMap_filtersOutIneligibleProperties", () => {
    const seg = createSummary({ area: "Lê Chân", propertyType: "Nhà ngõ" });
    const radar: RadarOpportunityResult = {
      type: "SUCCESS",
      segments: [seg],
      eligibleSegments: [seg],
      topOpportunities: [seg],
      liquidityP50: 0.4,
      liquidityIndeterminate: false
    };

    const pValid = createProperty({ id: "pValid", area: "Lê Chân", propertyType: "Nhà ngõ" });
    const pDeleted = createProperty({ id: "pDeleted", area: "Lê Chân", propertyType: "Nhà ngõ", isDeleted: true });
    const pDraft = createProperty({ id: "pDraft", area: "Lê Chân", propertyType: "Nhà ngõ", isDraft: true });
    const pSold = createProperty({ id: "pSold", area: "Lê Chân", propertyType: "Nhà ngõ", status: PropertyStatusConstants.SOLD });
    const pZeroPrice = createProperty({ id: "pZeroPrice", area: "Lê Chân", propertyType: "Nhà ngõ", price: 0.0 });
    const pNullArea = createProperty({ id: "pNullArea", area: "Lê Chân", propertyType: "Nhà ngõ", areaSize: null });
    const pSentinelArea = createProperty({ id: "pSentinelArea", area: "chưa xác định", propertyType: "Nhà ngõ" });
    const pNoSegment = createProperty({ id: "pNoSegment", area: "Khu vực lạ", propertyType: "Nhà ngõ" });

    const result = MarketNoteworthyPropertyMapper.map(
      [pValid, pDeleted, pDraft, pSold, pZeroPrice, pNullArea, pSentinelArea, pNoSegment],
      radar,
      new StatisticsFilter(),
      fixedNow
    );

    expect(result.length).toBe(1);
    expect(result[0].property.id).toBe("pValid");
  });

  it("testMap_preservesUnverifiedPropertiesWithEqualRankingEligibility", () => {
    const seg = createSummary({ area: "Lê Chân", propertyType: "Nhà ngõ" });
    const radar: RadarOpportunityResult = {
      type: "SUCCESS",
      segments: [seg],
      eligibleSegments: [seg],
      topOpportunities: [seg],
      liquidityP50: 0.4,
      liquidityIndeterminate: false
    };

    const pVerified = createProperty({ id: "p1", area: "Lê Chân", propertyType: "Nhà ngõ", isVerified: true });
    const pUnverified = createProperty({ id: "p2", area: "Lê Chân", propertyType: "Nhà ngõ", isVerified: false });

    const result = MarketNoteworthyPropertyMapper.map(
      [pVerified, pUnverified],
      radar,
      new StatisticsFilter(),
      fixedNow
    );

    expect(result.length).toBe(2);
    expect(result.some((it) => it.property.id === "p1" && it.property.isVerified)).toBe(true);
    expect(result.some((it) => it.property.id === "p2" && !it.property.isVerified)).toBe(true);
  });

  it("testSort_priorityMode_goldenFirstThenScoreThenDeviationThenCreatedThenId", () => {
    const segGolden = createSummary({ area: "Khu 1", propertyType: "Nhà ngõ", quadrant: OpportunityQuadrant.GOLDEN_OPPORTUNITY, opportunityScore: 80.0, targetMedianPricePerM2: 0.05 });
    const segHot = createSummary({ area: "Khu 2", propertyType: "Nhà ngõ", quadrant: OpportunityQuadrant.HOT_MARKET, opportunityScore: 90.0, targetMedianPricePerM2: 0.05 });
    const radar: RadarOpportunityResult = {
      type: "SUCCESS",
      segments: [segGolden, segHot],
      eligibleSegments: [segGolden, segHot],
      topOpportunities: [segGolden, segHot],
      liquidityP50: 0.4,
      liquidityIndeterminate: false
    };

    // p1: Hot market (opportunityScore = 90)
    const p1 = createProperty({ id: "p1", area: "Khu 2", propertyType: "Nhà ngõ", price: 2.0, areaSize: 50.0, createdAt: 1000 });
    // p2: Golden market (opportunityScore = 80, deviation = 0.04 vs 0.05 => -20%)
    const p2 = createProperty({ id: "p2", area: "Khu 1", propertyType: "Nhà ngõ", price: 2.0, areaSize: 50.0, createdAt: 1000 });
    // p3: Golden market (opportunityScore = 80, deviation = 0.045 vs 0.05 => -10%)
    const p3 = createProperty({ id: "p3", area: "Khu 1", propertyType: "Nhà ngõ", price: 2.25, areaSize: 50.0, createdAt: 1000 });

    const mapped = MarketNoteworthyPropertyMapper.map([p1, p2, p3], radar, new StatisticsFilter(), fixedNow);
    const sorted = MarketNoteworthyPropertyMapper.sort(mapped, MarketSortMode.PRIORITY);

    // p2 and p3 (Golden) come before p1 (Hot)
    // Between p2 and p3: same opportunityScore (80.0), p2 has lower deviationPercent (-20% vs -10%) => p2 first
    expect(sorted.length).toBe(3);
    expect(sorted[0].property.id).toBe("p2");
    expect(sorted[1].property.id).toBe("p3");
    expect(sorted[2].property.id).toBe("p1");
  });

  it("testSort_liquidityMode_soldRatioThenCreatedThenScoreThenId", () => {
    const segHighLiq = createSummary({ area: "Khu 1", propertyType: "Nhà ngõ", soldRatioProxy: 0.6, opportunityScore: 70.0 });
    const segLowLiq = createSummary({ area: "Khu 2", propertyType: "Nhà ngõ", soldRatioProxy: 0.3, opportunityScore: 85.0 });
    const radar: RadarOpportunityResult = {
      type: "SUCCESS",
      segments: [segHighLiq, segLowLiq],
      eligibleSegments: [segHighLiq, segLowLiq],
      topOpportunities: [segHighLiq, segLowLiq],
      liquidityP50: 0.4,
      liquidityIndeterminate: false
    };

    const pLowLiq = createProperty({ id: "pLow", area: "Khu 2", propertyType: "Nhà ngõ", createdAt: 2000 });
    const pHighLiqOld = createProperty({ id: "pHighOld", area: "Khu 1", propertyType: "Nhà ngõ", createdAt: 1000 });
    const pHighLiqNew = createProperty({ id: "pHighNew", area: "Khu 1", propertyType: "Nhà ngõ", createdAt: 3000 });

    const mapped = MarketNoteworthyPropertyMapper.map([pLowLiq, pHighLiqOld, pHighLiqNew], radar, new StatisticsFilter(), fixedNow);
    const sorted = MarketNoteworthyPropertyMapper.sort(mapped, MarketSortMode.LIQUIDITY);

    expect(sorted.length).toBe(3);
    // High liq first (pHighLiqNew with createdAt=3000 before pHighLiqOld with createdAt=1000), then Low liq
    expect(sorted[0].property.id).toBe("pHighNew");
    expect(sorted[1].property.id).toBe("pHighOld");
    expect(sorted[2].property.id).toBe("pLow");
  });

  it("testSort_priceLowMode_unitPriceThenDeviationThenCreatedThenId", () => {
    const seg = createSummary({ area: "Khu 1", propertyType: "Nhà ngõ", targetMedianPricePerM2: 0.05 });
    const radar: RadarOpportunityResult = {
      type: "SUCCESS",
      segments: [seg],
      eligibleSegments: [seg],
      topOpportunities: [seg],
      liquidityP50: 0.4,
      liquidityIndeterminate: false
    };

    // p1: 1.5 tỷ / 50m² = 30 tr/m²
    const p1 = createProperty({ id: "p1", area: "Khu 1", propertyType: "Nhà ngõ", price: 1.5, areaSize: 50.0, createdAt: 1000 });
    // p2: 2.5 tỷ / 50m² = 50 tr/m²
    const p2 = createProperty({ id: "p2", area: "Khu 1", propertyType: "Nhà ngõ", price: 2.5, areaSize: 50.0, createdAt: 2000 });
    // p3: 2.0 tỷ / 50m² = 40 tr/m²
    const p3 = createProperty({ id: "p3", area: "Khu 1", propertyType: "Nhà ngõ", price: 2.0, areaSize: 50.0, createdAt: 1500 });

    const mapped = MarketNoteworthyPropertyMapper.map([p1, p2, p3], radar, new StatisticsFilter(), fixedNow);
    const sorted = MarketNoteworthyPropertyMapper.sort(mapped, MarketSortMode.PRICE_LOW);

    expect(sorted.length).toBe(3);
    expect(sorted[0].property.id).toBe("p1"); // 30 tr/m²
    expect(sorted[1].property.id).toBe("p3"); // 40 tr/m²
    expect(sorted[2].property.id).toBe("p2"); // 50 tr/m²
  });
});
