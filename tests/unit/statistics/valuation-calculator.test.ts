import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { ConfidenceLevel, sampleCountToConfidence } from "../../../src/core/statistics/confidence-level";
import {
  classifyValuationLabel,
  ValuationCalculator,
  ValuationLabel
} from "../../../src/core/statistics/valuation-calculator";
import { PropertyStatusConstants } from "../../../src/core/statistics/statistics-filter";

describe("ValuationCalculatorTest", () => {
  function createProp(partial?: Partial<Property>): Property {
    return createDefaultProperty({
      id: "p1",
      area: "Ngô Quyền",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: 100.0,
      price: 3.0,
      description: "Mô tả",
      status: PropertyStatusConstants.FOR_SALE,
      propertyType: "Nhà phố",
      isVerified: true,
      isDraft: false,
      isDeleted: false,
      ...partial
    });
  }

  it("testLeaveOneOutExclusionById", () => {
    // Create 6 properties: target p0 (price 1.0) and comparators p1..p5 (price 2.0, 2.0, 4.0, 4.0, 4.0)
    // LOO for p0 leaves 5 comparators: [0.02, 0.02, 0.04, 0.04, 0.04] -> median = 0.04 (40 tr/m²)
    // Target p0 unit price = 1.0 / 100 = 0.01 (10 tr/m²)
    const p0 = createProp({ id: "p0", price: 1.0, areaSize: 100.0 });
    const p1 = createProp({ id: "p1", price: 2.0, areaSize: 100.0 });
    const p2 = createProp({ id: "p2", price: 2.0, areaSize: 100.0 }); // same price as p1
    const p3 = createProp({ id: "p3", price: 4.0, areaSize: 100.0 });
    const p4 = createProp({ id: "p4", price: 4.0, areaSize: 100.0 });
    const p5 = createProp({ id: "p5", price: 4.0, areaSize: 100.0 });

    const result = ValuationCalculator.calculate([p0, p1, p2, p3, p4, p5], [p0, p1, p2, p3, p4, p5]);
    const itemP0 = result.items.find((it) => it.property.id === "p0");
    expect(itemP0).toBeDefined();

    expect(itemP0!.comparatorSampleCount).toBe(5);
    expect(itemP0!.benchmarkMedianPricePerM2!).toBeCloseTo(0.04, 4);
    expect(itemP0!.displayBenchmarkMedianPricePerM2!).toBeCloseTo(40.0, 4);
    expect(itemP0!.deviationPercent!).toBeCloseTo(-75.0, 4);
    expect(itemP0!.valuationLabel).toEqual(ValuationLabel.DEEP_DISCOUNT);

    // Verify that duplicate price properties (p1 and p2) are preserved:
    const itemP1 = result.items.find((it) => it.property.id === "p1");
    expect(itemP1).toBeDefined();
    expect(itemP1!.comparatorSampleCount).toBe(5);
  });

  it("testConfidenceGateAndInvariantReason", () => {
    // Group of exactly 5 properties: each has LOO count 4 (< 5) -> insufficient data
    const props5 = Array.from({ length: 5 }, (_, i) =>
      createProp({ id: `p${i + 1}`, price: 2.0 + (i + 1), areaSize: 100.0 })
    );
    const result5 = ValuationCalculator.calculate(props5, props5);
    expect(result5.totalEligibleProperties).toBe(5);
    expect(result5.evaluatedCount).toBe(0);
    expect(result5.insufficientDataCount).toBe(5);

    for (const item of result5.items) {
      expect(item.comparatorSampleCount).toBe(4);
      expect(item.confidence).toEqual(ConfidenceLevel.LOW);
      expect(item.benchmarkMedianPricePerM2).toBeNull();
      expect(item.displayBenchmarkMedianPricePerM2).toBeNull();
      expect(item.deviationPercent).toBeNull();
      expect(item.valuationLabel).toBeNull();
      expect(item.reason).toBe("Chưa đủ dữ liệu so sánh (< 5 mẫu)");
    }

    // Group of exactly 6 properties: each has LOO count 5 (>= 5) -> sufficient data
    const props6 = Array.from({ length: 6 }, (_, i) =>
      createProp({ id: `q${i + 1}`, price: 2.0 + (i + 1), areaSize: 100.0 })
    );
    const result6 = ValuationCalculator.calculate(props6, props6);
    expect(result6.totalEligibleProperties).toBe(6);
    expect(result6.evaluatedCount).toBe(6);
    expect(result6.insufficientDataCount).toBe(0);

    for (const item of result6.items) {
      expect(item.comparatorSampleCount).toBe(5);
      expect(item.confidence).toEqual(ConfidenceLevel.MEDIUM);
      expect(item.benchmarkMedianPricePerM2).not.toBeNull();
      expect(item.displayBenchmarkMedianPricePerM2).not.toBeNull();
      expect(item.deviationPercent).not.toBeNull();
      expect(item.valuationLabel).not.toBeNull();
      expect(item.reason).toBeNull();
    }
  });

  it("testAllTenValuationLabelBoundaries", () => {
    expect(classifyValuationLabel(-15.0)).toEqual(ValuationLabel.DEEP_DISCOUNT);
    expect(classifyValuationLabel(-14.9999)).toEqual(ValuationLabel.MODERATE_DISCOUNT);
    expect(classifyValuationLabel(-5.0)).toEqual(ValuationLabel.MODERATE_DISCOUNT);
    expect(classifyValuationLabel(-4.9999)).toEqual(ValuationLabel.FAIR_MARKET);
    expect(classifyValuationLabel(0.0)).toEqual(ValuationLabel.FAIR_MARKET);
    expect(classifyValuationLabel(4.9999)).toEqual(ValuationLabel.FAIR_MARKET);
    expect(classifyValuationLabel(5.0)).toEqual(ValuationLabel.SLIGHTLY_HIGH);
    expect(classifyValuationLabel(14.9999)).toEqual(ValuationLabel.SLIGHTLY_HIGH);
    expect(classifyValuationLabel(15.0)).toEqual(ValuationLabel.HIGH);
    expect(classifyValuationLabel(20.0)).toEqual(ValuationLabel.HIGH);
  });

  it("testDeterministicSorting", () => {
    // Comparators to establish median 10.0 (price 10.0, area 1.0)
    const comparators = Array.from({ length: 5 }, (_, i) =>
      createProp({ id: `comp${i + 1}`, price: 10.0, areaSize: 1.0 })
    );
    const t1 = createProp({ id: "t1", price: 7.0, areaSize: 1.0 });
    const t2 = createProp({ id: "t2", price: 8.0, areaSize: 1.0 });
    const t3 = createProp({ id: "t3", price: 8.0, areaSize: 1.0 });
    const t4 = createProp({ id: "t4", price: 10.0, areaSize: 1.0 });

    // Insufficient data items in a different area (only 2 properties)
    const ins1 = createProp({ id: "ins1", area: "Đồ Sơn", price: 3.0, areaSize: 1.0 });
    const ins2 = createProp({ id: "ins2", area: "Đồ Sơn", price: 2.0, areaSize: 1.0 });

    const all = [...comparators, t4, t2, t1, t3, ins1, ins2];
    const result = ValuationCalculator.calculate(all, all);

    const items = result.items;
    const evaluated = items.filter((it) => it.deviationPercent != null);
    const insufficient = items.filter((it) => it.deviationPercent == null);

    expect(insufficient).toHaveLength(2);
    // Insufficient sorted by price asc -> id asc
    expect(insufficient[0].property.id).toBe("ins2"); // price 2.0
    expect(insufficient[1].property.id).toBe("ins1"); // price 3.0

    // Evaluated items sorted by dev asc -> price asc -> id asc
    expect(evaluated[0].property.id).toBe("t1"); // -30%
    expect(evaluated[1].property.id).toBe("t2"); // -20%, price 8.0, id t2
    expect(evaluated[2].property.id).toBe("t3"); // -20%, price 8.0, id t3
  });

  it("testDataInvariants", () => {
    const props = Array.from({ length: 15 }, (_, i) => {
      const idx = i + 1;
      const area = idx <= 10 ? "Hải An" : "Khu Vắng";
      return createProp({ id: `p${idx}`, area, price: 2.0 + idx, areaSize: 50.0 });
    });
    const result = ValuationCalculator.calculate(props, props);

    expect(result.totalEligibleProperties).toBe(props.length);
    expect(result.items.length).toBe(result.totalEligibleProperties);
    expect(result.totalEligibleProperties).toBe(
      result.evaluatedCount + result.insufficientDataCount
    );
  });

  it("testParameterDefenses", () => {
    expect(() => sampleCountToConfidence(-1)).toThrow();

    expect(() => ValuationCalculator.findDeals([], [], -1.0)).toThrow();
    expect(() => ValuationCalculator.findDeals([], [], NaN)).toThrow();
    expect(() => ValuationCalculator.findDeals([], [], Infinity)).toThrow();

    expect(() => classifyValuationLabel(NaN)).toThrow();
    expect(() => classifyValuationLabel(Infinity)).toThrow();
    expect(() => classifyValuationLabel(-Infinity)).toThrow();
  });

  it("testFindDealsHelper", () => {
    // Base median 10.0 (price 10.0, area 1.0)
    const comparators = Array.from({ length: 6 }, (_, i) =>
      createProp({ id: `comp${i + 1}`, price: 10.0, areaSize: 1.0 })
    );
    // Deal: price 8.0 -> deviation = -20% (<= -15%)
    const deal = createProp({ id: "deal1", price: 8.0, areaSize: 1.0 });
    // Not a deal: price 9.0 -> deviation = -10% (> -15%)
    const notDeal = createProp({ id: "notDeal", price: 9.0, areaSize: 1.0 });

    const allProps = [...comparators, deal, notDeal];
    const deals = ValuationCalculator.findDeals(allProps, allProps, 15.0);
    expect(deals).toHaveLength(1);
    expect(deals[0].property.id).toBe("deal1");
  });

  it("testPermutationInvariance", () => {
    const props = Array.from({ length: 25 }, (_, i) => {
      const idx = i + 1;
      const area = idx % 2 === 0 ? "Hải An" : "Lê Chân";
      return createProp({
        id: `p${idx}`,
        area,
        price: 1.5 + (idx % 8),
        areaSize: 50.0 + (idx % 15)
      });
    });

    const resultOriginal = ValuationCalculator.calculate(props, props);
    const shuffled = [...props].sort(() => 0.5 - Math.random());
    const resultShuffled = ValuationCalculator.calculate(shuffled, shuffled);

    expect(resultOriginal.totalEligibleProperties).toBe(resultShuffled.totalEligibleProperties);
    expect(resultOriginal.evaluatedCount).toBe(resultShuffled.evaluatedCount);
    expect(resultOriginal.insufficientDataCount).toBe(resultShuffled.insufficientDataCount);

    for (let i = 0; i < resultOriginal.items.length; i++) {
      const item1 = resultOriginal.items[i];
      const item2 = resultShuffled.items[i];

      expect(item1.property.id).toBe(item2.property.id);
      expect(item1.areaDisplayName).toBe(item2.areaDisplayName);
      expect(item1.propertyTypeDisplayName).toBe(item2.propertyTypeDisplayName);
      expect(item1.comparatorSampleCount).toBe(item2.comparatorSampleCount);
      expect(item1.confidence).toEqual(item2.confidence);
      expect(item1.reason).toBe(item2.reason);
      expect(item1.valuationLabel).toEqual(item2.valuationLabel);
      if (item1.deviationPercent != null) {
        expect(item1.deviationPercent!).toBeCloseTo(item2.deviationPercent!, 4);
        expect(item1.benchmarkMedianPricePerM2!).toBeCloseTo(item2.benchmarkMedianPricePerM2!, 4);
      } else {
        expect(item2.deviationPercent).toBeNull();
        expect(item2.benchmarkMedianPricePerM2).toBeNull();
      }
    }
  });

  it("testLeaveOneOutAppliesEquallyToVerifiedAndUnverified", () => {
    // 5 verified properties + 1 unverified property in the same area & type
    const verifiedProps = Array.from({ length: 5 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `v${idx}`, price: 2.0 + idx, areaSize: 100.0, isVerified: true });
    });
    const unverifiedProp = createProp({ id: "unv1", price: 2.0, areaSize: 100.0, isVerified: false });
    const all = [...verifiedProps, unverifiedProp];

    const result = ValuationCalculator.calculate(all, all);

    const itemUnv = result.items.find((it) => it.property.id === "unv1");
    expect(itemUnv).toBeDefined();
    expect(itemUnv!.comparatorSampleCount).toBe(5);
    expect(itemUnv!.benchmarkMedianPricePerM2).not.toBeNull();
    expect(itemUnv!.deviationPercent).not.toBeNull();
    expect(itemUnv!.valuationLabel).not.toBeNull();
    expect(itemUnv!.reason).toBeNull();

    for (let i = 1; i <= 5; i++) {
      const itemV = result.items.find((it) => it.property.id === `v${i}`);
      expect(itemV).toBeDefined();
      expect(itemV!.comparatorSampleCount).toBe(5);
      expect(itemV!.benchmarkMedianPricePerM2).not.toBeNull();
      expect(itemV!.deviationPercent).not.toBeNull();
      expect(itemV!.valuationLabel).not.toBeNull();
      expect(itemV!.reason).toBeNull();
    }
  });

  it("testBenchmarkIncludesUnverifiedPropertiesAndAffectsMedian", () => {
    const verifiedProps = Array.from({ length: 5 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `v${idx}`, price: 10.0 + idx, areaSize: 100.0, isVerified: true });
    });
    // 1 unverified property with a high price
    const unvHigh = createProp({ id: "unvHigh", price: 50.0, areaSize: 100.0, isVerified: false });

    const resultWithUnv = ValuationCalculator.calculate(
      verifiedProps,
      [...verifiedProps, unvHigh]
    );

    // For v1: comparators are v2..v5 (12, 13, 14, 15) + unvHigh (50) -> 5 comparators, median is 14.0
    const itemV1 = resultWithUnv.items.find((it) => it.property.id === "v1");
    expect(itemV1).toBeDefined();
    expect(itemV1!.comparatorSampleCount).toBe(5);
    expect(itemV1!.benchmarkMedianPricePerM2!).toBeCloseTo(14.0 / 100.0, 6);
  });

  it("testIsVerifiedInvarianceInValuation", () => {
    const propsVerified = Array.from({ length: 8 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `p${idx}`, price: 5.0 + idx, areaSize: 100.0, isVerified: true });
    });
    const propsUnverified = propsVerified.map((p) => ({ ...p, isVerified: false }));

    const resultVerified = ValuationCalculator.calculate(propsVerified, propsVerified);
    const resultUnverified = ValuationCalculator.calculate(propsUnverified, propsUnverified);

    expect(resultVerified.items.length).toBe(resultUnverified.items.length);
    for (let i = 0; i < resultVerified.items.length; i++) {
      const item1 = resultVerified.items[i];
      const item2 = resultUnverified.items[i];
      expect(item1.comparatorSampleCount).toBe(item2.comparatorSampleCount);
      expect(item1.benchmarkMedianPricePerM2!).toBeCloseTo(item2.benchmarkMedianPricePerM2!, 6);
      expect(item1.displayBenchmarkMedianPricePerM2!).toBeCloseTo(item2.displayBenchmarkMedianPricePerM2!, 6);
      expect(item1.deviationPercent!).toBeCloseTo(item2.deviationPercent!, 6);
      expect(item1.valuationLabel).toEqual(item2.valuationLabel);
    }
  });

  it("testHouseAndLandNeverMixBenchmark", () => {
    const houses = Array.from({ length: 6 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `house${idx}`, area: "Lê Chân", propertyType: "Nhà ngõ", price: 5.0, areaSize: 100.0 });
    });
    const lands = Array.from({ length: 6 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `land${idx}`, area: "Lê Chân", propertyType: "Đất thổ cư", price: 2.0, areaSize: 100.0 });
    });

    const result = ValuationCalculator.calculate([...houses, ...lands], [...houses, ...lands]);

    // For each house, benchmark must be 50 tr/m2 (0.05), comparator count = 5
    for (const h of houses) {
      const item = result.items.find((it) => it.property.id === h.id);
      expect(item).toBeDefined();
      expect(item!.comparatorSampleCount).toBe(5);
      expect(item!.benchmarkMedianPricePerM2!).toBeCloseTo(0.05, 4);
      expect(item!.displayBenchmarkMedianPricePerM2!).toBeCloseTo(50.0, 4);
    }
    // For each land, benchmark must be 20 tr/m2 (0.02), comparator count = 5
    for (const l of lands) {
      const item = result.items.find((it) => it.property.id === l.id);
      expect(item).toBeDefined();
      expect(item!.comparatorSampleCount).toBe(5);
      expect(item!.benchmarkMedianPricePerM2!).toBeCloseTo(0.02, 4);
      expect(item!.displayBenchmarkMedianPricePerM2!).toBeCloseTo(20.0, 4);
    }
  });

  it("testUnverifiedMissingPriceOrArea_excludedFromEvaluation", () => {
    const validProps = Array.from({ length: 6 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `v${idx}`, price: 3.0, areaSize: 100.0, isVerified: true });
    });
    const unvNoPrice = createProp({ id: "unvNoPrice", price: 0.0, areaSize: 100.0, isVerified: false });
    const unvNoArea = createProp({ id: "unvNoArea", price: 3.0, areaSize: null, isVerified: false });
    const unvZeroArea = createProp({ id: "unvZeroArea", price: 3.0, areaSize: 0.0, isVerified: false });
    const unvDeleted = createProp({ id: "unvDeleted", price: 3.0, areaSize: 100.0, isVerified: false, isDeleted: true });
    const unvDraft = createProp({ id: "unvDraft", price: 3.0, areaSize: 100.0, isVerified: false, isDraft: true });
    const unvSold = createProp({ id: "unvSold", price: 3.0, areaSize: 100.0, isVerified: false, status: PropertyStatusConstants.SOLD });

    const targets = [...validProps, unvNoPrice, unvNoArea, unvZeroArea, unvDeleted, unvDraft, unvSold];
    const result = ValuationCalculator.calculate(targets, validProps);

    expect(result.totalEligibleProperties).toBe(6);
    expect(result.items.length).toBe(6);
    expect(result.items.some((it) => it.property.id.startsWith("unv"))).toBe(false);
  });

  it("testTargetFilterDoesNotAffectBenchmark", () => {
    // 6 benchmark properties in segment
    const allSegment = Array.from({ length: 6 }, (_, i) => {
      const idx = i + 1;
      return createProp({ id: `p${idx}`, price: 10.0 + idx, areaSize: 100.0, isVerified: true });
    });
    // Target is filtered to only 1 property (p1)
    const targetSingle = [allSegment[0]];

    const result = ValuationCalculator.calculate(targetSingle, allSegment);

    expect(result.items).toHaveLength(1);
    const item = result.items[0];
    // Comparators should still be 5 (from the full benchmark pool minus p1)
    expect(item.comparatorSampleCount).toBe(5);
    expect(item.benchmarkMedianPricePerM2).not.toBeNull();
    expect(item.deviationPercent).not.toBeNull();
  });
});
