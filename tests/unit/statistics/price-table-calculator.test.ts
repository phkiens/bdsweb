import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { ConfidenceLevel } from "../../../src/core/statistics/confidence-level";
import {
  PriceTableCalculator,
  PriceTableResult
} from "../../../src/core/statistics/price-table-calculator";
import { PropertyStatusConstants } from "../../../src/core/statistics/statistics-filter";

describe("PriceTableCalculatorTest", () => {
  function createProp(params: {
    id: string;
    area?: string;
    propertyType?: string;
    price?: number;
    areaSize?: number | null;
    status?: string;
    isVerified?: boolean;
    isDraft?: boolean;
    isDeleted?: boolean;
  }): Property {
    return createDefaultProperty({
      id: params.id,
      area: params.area ?? "Hải An",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: params.areaSize !== undefined ? params.areaSize : 60.0,
      price: params.price !== undefined ? params.price : 3.0,
      description: `Mô tả ${params.id}`,
      status: params.status ?? PropertyStatusConstants.FOR_SALE,
      propertyType: params.propertyType ?? "Nhà phố",
      isVerified: params.isVerified ?? true,
      isDraft: params.isDraft ?? false,
      isDeleted: params.isDeleted ?? false
    });
  }

  it("testR7PercentileCalculations", () => {
    // Create 5 properties in Hải An, Nhà phố with known prices and areaSize = 100m²
    // unit prices: 10/100=0.1, 20/100=0.2, 30/100=0.3, 40/100=0.4, 50/100=0.5 (Tỷ/m²)
    const props = [
      createProp({ id: "p1", price: 10.0, areaSize: 100.0 }),
      createProp({ id: "p2", price: 20.0, areaSize: 100.0 }),
      createProp({ id: "p3", price: 30.0, areaSize: 100.0 }),
      createProp({ id: "p4", price: 40.0, areaSize: 100.0 }),
      createProp({ id: "p5", price: 50.0, areaSize: 100.0 })
    ];

    const result = PriceTableCalculator.calculate(props);
    expect(result.totalRows).toBe(1);
    expect(result.totalPropertiesEvaluated).toBe(5);

    const row = result.rows[0];
    expect(row.sampleCount).toBe(5);
    expect(row.medianPrice).toBeCloseTo(30.0, 3);
    expect(row.medianPricePerM2).toBeCloseTo(0.3, 3);
    expect(row.displayMedianPricePerM2).toBeCloseTo(300.0, 3);
    expect(row.p25PricePerM2).toBeCloseTo(0.2, 3);
    expect(row.p75PricePerM2).toBeCloseTo(0.4, 3);
    expect(row.minPricePerM2).toBeCloseTo(0.1, 3);
    expect(row.maxPricePerM2).toBeCloseTo(0.5, 3);
    expect(row.confidence).toBe(ConfidenceLevel.MEDIUM);
  });

  it("testCanonicalGroupingAndVietnameseDiacritics", () => {
    // Variants of "Hải An" and "Đất"
    const props = [
      createProp({ id: "p1", area: "hải an", propertyType: "đất", price: 2.0, areaSize: 50.0 }),
      createProp({ id: "p2", area: "HẢI AN", propertyType: "dat", price: 3.0, areaSize: 50.0 }),
      createProp({ id: "p3", area: "  Hải   An  ", propertyType: "Đất", price: 4.0, areaSize: 50.0 })
    ];

    const result = PriceTableCalculator.calculate(props);
    expect(result.totalRows).toBe(1);
    const row = result.rows[0];
    expect(row.areaDisplayName).toBe("Hải An");
    expect(row.propertyTypeDisplayName).toBe("Đất");
    expect(row.sampleCount).toBe(3);
  });

  it("testFrozenPopulationFiltering", () => {
    const valid = createProp({ id: "valid", area: "Lê Chân", propertyType: "Chung cư", price: 2.0, areaSize: 50.0 });
    const deleted = createProp({ id: "deleted", isDeleted: true });
    const unverified = createProp({ id: "unverified", isVerified: false });
    const draft = createProp({ id: "draft", isDraft: true });
    const sold = createProp({ id: "sold", status: "Đã bán" });
    const survey = createProp({ id: "survey", status: "Chờ khảo sát" });
    const unknownStatus = createProp({ id: "unknownStatus", status: "Khác lạ" });
    const zeroPrice = createProp({ id: "zeroPrice", price: 0.0 });
    const negPrice = createProp({ id: "negPrice", price: -1.0 });
    const zeroArea = createProp({ id: "zeroArea", areaSize: 0.0 });
    const nullArea = createProp({ id: "nullArea", areaSize: null });
    const nanPrice = createProp({ id: "nanPrice", price: Number.NaN });
    const infArea = createProp({ id: "infArea", areaSize: Number.POSITIVE_INFINITY });
    const sentinelArea1 = createProp({ id: "sentinel1", area: "chưa xác định" });
    const sentinelArea2 = createProp({ id: "sentinel2", area: "chua_ro" });
    const sentinelArea3 = createProp({ id: "sentinel3", area: "null" });
    const blankArea = createProp({ id: "blankArea", area: "   " });
    const sentinelType = createProp({ id: "sentinelType", propertyType: "chua_ro" });

    const all = [
      valid, deleted, unverified, draft, sold, survey, unknownStatus,
      zeroPrice, negPrice, zeroArea, nullArea, nanPrice, infArea,
      sentinelArea1, sentinelArea2, sentinelArea3, blankArea, sentinelType
    ];

    const result = PriceTableCalculator.calculate(all);
    expect(result.totalRows).toBe(2); // Lê Chân - Chung cư, and Hải An - Nhà phố
    expect(result.totalPropertiesEvaluated).toBe(3); // valid, unverified, survey are all evaluated
    const haiAnRow = result.rows.find(it => it.areaKey === "hải an");
    expect(haiAnRow).toBeDefined();
    expect(haiAnRow!.sampleCount).toBe(2); // unverified + survey
    const leChanRow = result.rows.find(it => it.areaKey === "lê chân");
    expect(leChanRow).toBeDefined();
    expect(leChanRow!.sampleCount).toBe(1); // valid
  });

  it("testConfidenceLevelGating", () => {
    function makeProps(count: Int, area: string): Property[] {
      const list: Property[] = [];
      for (let i = 1; i <= count; i++) {
        list.push(createProp({ id: `${area}-${i}`, area, price: 2.0 + i, areaSize: 50.0 }));
      }
      return list;
    }

    // 4 samples -> LOW
    const result4 = PriceTableCalculator.calculate(makeProps(4, "Khu 4"));
    expect(result4.rows[0].confidence).toBe(ConfidenceLevel.LOW);

    // 5 samples -> MEDIUM
    const result5 = PriceTableCalculator.calculate(makeProps(5, "Khu 5"));
    expect(result5.rows[0].confidence).toBe(ConfidenceLevel.MEDIUM);

    // 9 samples -> MEDIUM
    const result9 = PriceTableCalculator.calculate(makeProps(9, "Khu 9"));
    expect(result9.rows[0].confidence).toBe(ConfidenceLevel.MEDIUM);

    // 10 samples -> GOOD
    const result10 = PriceTableCalculator.calculate(makeProps(10, "Khu 10"));
    expect(result10.rows[0].confidence).toBe(ConfidenceLevel.GOOD);
  });

  it("testDataInvariants", () => {
    const props = [
      createProp({ id: "p1", area: "Ngô Quyền", propertyType: "Nhà phố", price: 3.0, areaSize: 60.0 }),
      createProp({ id: "p2", area: "Ngô Quyền", propertyType: "Nhà phố", price: 4.0, areaSize: 70.0 }),
      createProp({ id: "p3", area: "Hồng Bàng", propertyType: "Đất", price: 2.0, areaSize: 100.0 })
    ];
    const result = PriceTableCalculator.calculate(props);

    expect(result.rows.length).toBe(result.totalRows);
    expect(result.rows.reduce((sum, r) => sum + r.sampleCount, 0)).toBe(result.totalPropertiesEvaluated);
  });

  it("testBusinessSegmentDrillDownAndDivergence", () => {
    const valid1 = createProp({ id: "v1", area: "Hải An", propertyType: "Nhà phố", price: 3.0, areaSize: 60.0 });
    const valid2 = createProp({ id: "v2", area: "Hải An", propertyType: "Nhà phố", price: 4.0, areaSize: 70.0 });
    // Divergent property: in the same business segment ("Hải An", "Nhà phố", for sale, verified, non-draft)
    // but has invalid price (0.0)
    const invalidPrice = createProp({ id: "inv_price", area: "Hải An", propertyType: "Nhà phố", price: 0.0, areaSize: 60.0 });
    // Divergent property: in the same business segment but areaSize is null
    const nullArea = createProp({ id: "inv_area", area: "Hải An", propertyType: "Nhà phố", price: 3.5, areaSize: null });

    const input = [valid1, valid2, invalidPrice, nullArea];
    const result = PriceTableCalculator.calculate(input);

    expect(result.totalRows).toBe(1);
    const row = result.rows[0];
    // Invariant: sampleCount ONLY counts valid price and area
    expect(row.sampleCount).toBe(2);

    // All sample population properties match drill-down filter
    expect(row.drillDownFilter.matches({ property: valid1 })).toBe(true);
    expect(row.drillDownFilter.matches({ property: valid2 })).toBe(true);

    // Divergence: invalidPrice and nullArea MATCH the business segment drillDownFilter
    expect(row.drillDownFilter.matches({ property: invalidPrice })).toBe(true);
    expect(row.drillDownFilter.matches({ property: nullArea })).toBe(true);

    // But properties of another segment do NOT match
    const otherArea = createProp({ id: "other", area: "Lê Chân", propertyType: "Nhà phố", price: 3.0, areaSize: 50.0 });
    expect(row.drillDownFilter.matches({ property: otherArea })).toBe(false);
  });

  it("testPermutationInvariance", () => {
    const props: Property[] = [];
    for (let i = 1; i <= 30; i++) {
      const area = i % 2 === 0 ? "Hải An" : "Lê Chân";
      const type = i % 3 === 0 ? "Đất" : "Nhà phố";
      props.push(createProp({ id: `p${i}`, area, propertyType: type, price: 1.0 + (i % 10), areaSize: 40.0 + (i % 20) }));
    }

    const shuffled = [...props];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const resultOriginal = PriceTableCalculator.calculate(props);
    const resultShuffled = PriceTableCalculator.calculate(shuffled);

    expect(resultOriginal.totalRows).toBe(resultShuffled.totalRows);
    expect(resultOriginal.totalPropertiesEvaluated).toBe(resultShuffled.totalPropertiesEvaluated);

    for (let i = 0; i < resultOriginal.rows.length; i++) {
      const r1 = resultOriginal.rows[i];
      const r2 = resultShuffled.rows[i];
      expect(r1.areaKey).toBe(r2.areaKey);
      expect(r1.propertyTypeKey).toBe(r2.propertyTypeKey);
      expect(r1.areaDisplayName).toBe(r2.areaDisplayName);
      expect(r1.propertyTypeDisplayName).toBe(r2.propertyTypeDisplayName);
      expect(r1.sampleCount).toBe(r2.sampleCount);
      expect(r1.medianPrice).toBeCloseTo(r2.medianPrice, 4);
      expect(r1.medianPricePerM2).toBeCloseTo(r2.medianPricePerM2, 4);
      expect(r1.p25PricePerM2).toBeCloseTo(r2.p25PricePerM2, 4);
      expect(r1.p75PricePerM2).toBeCloseTo(r2.p75PricePerM2, 4);
      expect(r1.confidence).toBe(r2.confidence);
    }
  });

  it("testOverallMedianPricePerM2", () => {
    // 4 properties across 2 different areas
    // Area 1: p1 (price=1.0, areaSize=10.0 -> 0.1), p2 (price=2.0, areaSize=10.0 -> 0.2)
    // Area 2: p3 (price=3.0, areaSize=10.0 -> 0.3), p4 (price=4.0, areaSize=10.0 -> 0.4)
    const props = [
      createProp({ id: "p1", area: "Hải An", propertyType: "Đất", price: 1.0, areaSize: 10.0 }),
      createProp({ id: "p2", area: "Hải An", propertyType: "Đất", price: 2.0, areaSize: 10.0 }),
      createProp({ id: "p3", area: "Lê Chân", propertyType: "Nhà phố", price: 3.0, areaSize: 10.0 }),
      createProp({ id: "p4", area: "Lê Chân", propertyType: "Nhà phố", price: 4.0, areaSize: 10.0 })
    ];

    const result = PriceTableCalculator.calculate(props);
    expect(result.totalRows).toBe(2);
    expect(result.totalPropertiesEvaluated).toBe(4);
    // Median of [0.1, 0.2, 0.3, 0.4] via R-7 is (0.2 + 0.3) / 2 = 0.25
    expect(result.overallMedianPricePerM2).toBeCloseTo(0.25, 3);
  });

  it("testOverallMedianPricePerM2Empty", () => {
    const result = PriceTableCalculator.calculate([]);
    expect(result.totalRows).toBe(0);
    expect(result.totalPropertiesEvaluated).toBe(0);
    expect(result.overallMedianPricePerM2).toBeNull();
  });

  it("testPriceTableResultConstructorBackwardCompatibility", () => {
    const legacyResult: PriceTableResult = {
      totalRows: 0,
      totalPropertiesEvaluated: 0,
      rows: []
    };
    expect(legacyResult.overallMedianPricePerM2).toBeUndefined();
  });
});
