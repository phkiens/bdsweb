import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import { ConfidenceLevel } from "../../../src/core/statistics/confidence-level";
import {
  DrillDownEvaluationContext,
  DrillDownSource
} from "../../../src/core/statistics/drill-down-filter";
import {
  OwnerPerformanceCalculator,
  PropertyWithOwner
} from "../../../src/core/statistics/owner-performance-calculator";
import {
  PropertyStatusConstants,
  StatisticsDateRange,
  StatisticsFilter
} from "../../../src/core/statistics/statistics-filter";

describe("OwnerPerformanceCalculatorTest", () => {

  // Fixed now: 2026-09-12T12:00:00+07:00
  // In UTC: 2026-09-12 05:00:00 UTC
  const fixedNow = Date.UTC(2026, 8, 12, 5, 0, 0);

  function daysAgo(days: number): number {
    const baseUtc = Date.UTC(2026, 8, 12, 3, 0, 0); // 10:00:00 UTC+7
    return baseUtc - days * 86_400_000;
  }

  function createProp(
    id: string,
    status: string = PropertyStatusConstants.FOR_SALE,
    createdAt: number = daysAgo(10),
    isVerified: boolean = true,
    isDraft: boolean = false,
    isDeleted: boolean = false
  ): Property {
    return createDefaultProperty({
      id,
      area: "Hải An",
      latitude: 20.85,
      longitude: 106.68,
      areaSize: 60.0,
      price: 3.0,
      description: `Mô tả ${id}`,
      status,
      propertyType: "Nhà phố",
      isVerified,
      isDraft,
      isDeleted,
      createdAt
    });
  }

  function createRecord(
    property: Property,
    ownerId: string | null = "owner_1",
    ownerName: string | null = "Nguyễn Văn A",
    ownerCount: number = 1
  ): PropertyWithOwner {
    return {
      property,
      ownerId,
      ownerName,
      ownerCount
    };
  }

  it("testOwnerQuerySafety_singleMultiNoCorruptAndNegative", () => {
    const now = fixedNow;

    const p1 = createRecord(createProp("p1"), "c1", "Chủ A", 1);
    const p2Multi = createRecord(createProp("p2"), null, null, 2);
    const p3Multi = createRecord(createProp("p3"), null, null, 3);
    const p4NoOwner = createRecord(createProp("p4"), null, null, 0);
    const p5CorruptIdNull = createRecord(createProp("p5"), null, "Chủ B", 1);
    const p6CorruptIdBlank = createRecord(createProp("p6"), "   ", "Chủ B", 1);
    const p7CorruptNameNull = createRecord(createProp("p7"), "c2", null, 1);
    const p8CorruptNameBlank = createRecord(createProp("p8"), "c2", "", 1);

    const result = OwnerPerformanceCalculator.calculate(
      [p1, p2Multi, p3Multi, p4NoOwner, p5CorruptIdNull, p6CorruptIdBlank, p7CorruptNameNull, p8CorruptNameBlank],
      now
    );

    expect(result.totalOwnersEvaluated).toBe(1);
    expect(result.totalSingleOwnerProperties).toBe(1);
    expect(result.totalExcludedMultiOwnerProperties).toBe(2);
    expect(result.totalExcludedNoOwnerProperties).toBe(1);
    expect(result.totalExcludedCorruptOwnerProperties).toBe(4);
    expect(result.items.length).toBe(1);
    expect(result.items[0].ownerId).toBe("c1");
    expect(result.items[0].ownerName).toBe("Chủ A");

    // Negative ownerCount -> throws Error
    const invalidRecord = createRecord(createProp("p_neg"), "c_neg", "Chủ Âm", -1);
    expect(() => {
      OwnerPerformanceCalculator.calculate([invalidRecord], now);
    }).toThrow();
  });

  it("testOwnerWithOnlyPendingSurvey", () => {
    const now = fixedNow;

    const p1 = createRecord(createProp("p1", PropertyStatusConstants.PENDING_SURVEY), "owner_x", "Chủ X", 1);
    const p2 = createRecord(createProp("p2", PropertyStatusConstants.PENDING_SURVEY), "owner_x", "Chủ X", 1);
    const p3 = createRecord(createProp("p3", PropertyStatusConstants.PENDING_SURVEY), "owner_x", "Chủ X", 1);

    const result = OwnerPerformanceCalculator.calculate([p1, p2, p3], now);

    expect(result.totalOwnersEvaluated).toBe(1);
    expect(result.totalSingleOwnerProperties).toBe(3);
    expect(result.totalExcludedMultiOwnerProperties).toBe(0);
    expect(result.totalExcludedNoOwnerProperties).toBe(0);
    expect(result.totalExcludedCorruptOwnerProperties).toBe(0);

    const item = result.items[0];
    expect(item.ownerId).toBe("owner_x");
    expect(item.ownerName).toBe("Chủ X");
    expect(item.totalPropertiesListed).toBe(3);
    expect(item.activePropertiesCount).toBe(3); // PENDING_SURVEY is active market
    expect(item.soldPropertiesCount).toBe(0);
    expect(item.soldRatioProxy).toBeCloseTo(0.0, 3);
    expect(item.displaySoldRatioPercent).toBeCloseTo(0.0, 3);
    expect(item.confidence).toBe(ConfidenceLevel.LOW);
    expect(item.activeAgingMedianDays).not.toBeNull();
    expect(item.stalePropertiesCount).toBe(0);
    expect(item.drillDownFilter.source).toBe(DrillDownSource.OWNER_PERFORMANCE);
    expect(item.drillDownFilter.targetOwnerId).toBe("owner_x");
  });

  it("testActiveAgingMedianAndStalePropertiesCount", () => {
    const now = fixedNow;

    // Owner A: 3 active (age 10, 20, 30 days) and 1 sold (age 100 days)
    const a1 = createRecord(createProp("a1", PropertyStatusConstants.FOR_SALE, daysAgo(10)), "oa", "Chủ A");
    const a2 = createRecord(createProp("a2", PropertyStatusConstants.FOR_SALE, daysAgo(20)), "oa", "Chủ A");
    const a3 = createRecord(createProp("a3", PropertyStatusConstants.FOR_SALE, daysAgo(30)), "oa", "Chủ A");
    const aSold = createRecord(createProp("aSold", PropertyStatusConstants.SOLD, daysAgo(100)), "oa", "Chủ A");

    // Owner B: 2 active (age 90 and 91 days)
    const b1 = createRecord(createProp("b1", PropertyStatusConstants.FOR_SALE, daysAgo(90)), "ob", "Chủ B");
    const b2 = createRecord(createProp("b2", PropertyStatusConstants.FOR_SALE, daysAgo(91)), "ob", "Chủ B");

    const result = OwnerPerformanceCalculator.calculate([a1, a2, a3, aSold, b1, b2], now);

    expect(result.totalOwnersEvaluated).toBe(2);

    const itemA = result.items.find(it => it.ownerId === "oa")!;
    expect(itemA.totalPropertiesListed).toBe(4);
    expect(itemA.activePropertiesCount).toBe(3);
    expect(itemA.soldPropertiesCount).toBe(1);
    // Median of [10.0, 20.0, 30.0] is 20.0 (sold property 100 days is strictly ignored)
    expect(itemA.activeAgingMedianDays).not.toBeNull();
    expect(itemA.activeAgingMedianDays!).toBeCloseTo(20.0, 3);
    expect(itemA.stalePropertiesCount).toBe(0);
    expect(itemA.soldRatioProxy!).toBeCloseTo(0.25, 3);
    expect(itemA.displaySoldRatioPercent!).toBeCloseTo(25.0, 3);
    expect(itemA.confidence).toBe(ConfidenceLevel.LOW); // sample = 1 + 3 = 4 < 5 -> LOW

    const itemB = result.items.find(it => it.ownerId === "ob")!;
    expect(itemB.totalPropertiesListed).toBe(2);
    expect(itemB.activePropertiesCount).toBe(2);
    expect(itemB.soldPropertiesCount).toBe(0);
    // Median of [90.0, 91.0] is 90.5
    expect(itemB.activeAgingMedianDays).not.toBeNull();
    expect(itemB.activeAgingMedianDays!).toBeCloseTo(90.5, 3);
    // Only 91 > 90, so stale count is 1
    expect(itemB.stalePropertiesCount).toBe(1);
  });

  it("testDeterministicFourTierSorting", () => {
    const now = fixedNow;

    // Tier 1: totalPropertiesListed desc
    // Tier 2: soldPropertiesCount desc
    // Tier 3: ownerName asc
    // Tier 4: ownerId asc

    // Owner 1: total = 5, sold = 2
    const o1 = [1, 2, 3, 4, 5].map(i => {
      const status = i <= 2 ? PropertyStatusConstants.SOLD : PropertyStatusConstants.FOR_SALE;
      return createRecord(createProp(`o1_${i}`, status), "id_1", "Trần D");
    });
    // Owner 2: total = 5, sold = 3 (wins over o1 on sold count)
    const o2 = [1, 2, 3, 4, 5].map(i => {
      const status = i <= 3 ? PropertyStatusConstants.SOLD : PropertyStatusConstants.FOR_SALE;
      return createRecord(createProp(`o2_${i}`, status), "id_2", "Nguyễn Z");
    });
    // Owner 3: total = 3, sold = 1, name = "An"
    const o3 = [1, 2, 3].map(i => {
      const status = i <= 1 ? PropertyStatusConstants.SOLD : PropertyStatusConstants.FOR_SALE;
      return createRecord(createProp(`o3_${i}`, status), "id_3b", "An");
    });
    // Owner 4: total = 3, sold = 1, name = "Bình"
    const o4 = [1, 2, 3].map(i => {
      const status = i <= 1 ? PropertyStatusConstants.SOLD : PropertyStatusConstants.FOR_SALE;
      return createRecord(createProp(`o4_${i}`, status), "id_4", "Bình");
    });
    // Owner 5: total = 3, sold = 1, name = "An", id = "id_3a" (wins over o3 on id asc)
    const o5 = [1, 2, 3].map(i => {
      const status = i <= 1 ? PropertyStatusConstants.SOLD : PropertyStatusConstants.FOR_SALE;
      return createRecord(createProp(`o5_${i}`, status), "id_3a", "An");
    });

    const allRecords = [...o1, ...o2, ...o3, ...o4, ...o5];
    const result = OwnerPerformanceCalculator.calculate(allRecords, now);

    const orderedOwnerIds = result.items.map(it => it.ownerId);
    const expectedOrder = ["id_2", "id_1", "id_3a", "id_3b", "id_4"];
    expect(orderedOwnerIds).toEqual(expectedOrder);
  });

  it("testDataInvariants", () => {
    const now = fixedNow;

    const records = [
      createRecord(createProp("p1", PropertyStatusConstants.FOR_SALE), "o1", "Chủ 1"),
      createRecord(createProp("p2", PropertyStatusConstants.SOLD), "o1", "Chủ 1"),
      createRecord(createProp("p3", PropertyStatusConstants.PENDING_SURVEY), "o1", "Chủ 1"),
      createRecord(createProp("p4", PropertyStatusConstants.FOR_SALE), "o2", "Chủ 2"),
      createRecord(createProp("p5", PropertyStatusConstants.SOLD), "o2", "Chủ 2"),
      createRecord(createProp("p6"), null, null, 2), // multi
      createRecord(createProp("p7"), null, null, 0), // no owner
      createRecord(createProp("p8"), "", "Chủ 3", 1) // corrupt
    ];

    const result = OwnerPerformanceCalculator.calculate(records, now);

    expect(result.items.length).toBe(result.totalOwnersEvaluated);
    expect(result.items.reduce((acc, it) => acc + it.totalPropertiesListed, 0)).toBe(result.totalSingleOwnerProperties);

    for (const item of result.items) {
      expect(item.soldPropertiesCount + item.activePropertiesCount).toBeLessThanOrEqual(item.totalPropertiesListed);
    }

    const eligibleBaseCount = result.totalSingleOwnerProperties +
      result.totalExcludedMultiOwnerProperties +
      result.totalExcludedNoOwnerProperties +
      result.totalExcludedCorruptOwnerProperties;
    expect(records.length).toBe(eligibleBaseCount);
  });

  it("testPermutationInvariance", () => {
    const now = fixedNow;

    const records: PropertyWithOwner[] = [];
    for (let i = 1; i <= 20; i++) {
      const ownerIdx = (i % 4) + 1;
      let status: string;
      switch (i % 3) {
        case 0:
          status = PropertyStatusConstants.FOR_SALE;
          break;
        case 1:
          status = PropertyStatusConstants.SOLD;
          break;
        default:
          status = PropertyStatusConstants.PENDING_SURVEY;
          break;
      }
      records.push(
        createRecord(
          createProp(`p_${i}`, status, daysAgo(i * 5)),
          `owner_${ownerIdx}`,
          `Chủ ${ownerIdx}`,
          1
        )
      );
    }
    // Add some exclusions
    records.push(createRecord(createProp("multi"), null, null, 2));
    records.push(createRecord(createProp("no_owner"), null, null, 0));

    // Fisher-Yates shuffle
    const shuffled = [...records];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    const result1 = OwnerPerformanceCalculator.calculate(records, now);
    const result2 = OwnerPerformanceCalculator.calculate(shuffled, now);

    expect(result1.totalOwnersEvaluated).toBe(result2.totalOwnersEvaluated);
    expect(result1.totalSingleOwnerProperties).toBe(result2.totalSingleOwnerProperties);
    expect(result1.totalExcludedMultiOwnerProperties).toBe(result2.totalExcludedMultiOwnerProperties);
    expect(result1.totalExcludedNoOwnerProperties).toBe(result2.totalExcludedNoOwnerProperties);
    expect(result1.totalExcludedCorruptOwnerProperties).toBe(result2.totalExcludedCorruptOwnerProperties);
    expect(result1.items.length).toBe(result2.items.length);

    for (let i = 0; i < result1.items.length; i++) {
      const item1 = result1.items[i];
      const item2 = result2.items[i];
      expect(item1.ownerId).toBe(item2.ownerId);
      expect(item1.ownerName).toBe(item2.ownerName);
      expect(item1.totalPropertiesListed).toBe(item2.totalPropertiesListed);
      expect(item1.activePropertiesCount).toBe(item2.activePropertiesCount);
      expect(item1.soldPropertiesCount).toBe(item2.soldPropertiesCount);
      expect(item1.activeAgingMedianDays).toBe(item2.activeAgingMedianDays);
      expect(item1.stalePropertiesCount).toBe(item2.stalePropertiesCount);
      expect(item1.soldRatioProxy).toBe(item2.soldRatioProxy);
      expect(item1.displaySoldRatioPercent).toBe(item2.displaySoldRatioPercent);
      expect(item1.confidence).toBe(item2.confidence);
    }
  });

  it("testBasePopulationExclusionOfDeletedUnverifiedDraftAndUnknownStatus", () => {
    const now = fixedNow;

    const pValid = createRecord(createProp("p_valid"), "o1", "Chủ 1");
    const pDeleted = createRecord(createProp("p_del", PropertyStatusConstants.FOR_SALE, daysAgo(10), true, false, true), "o1", "Chủ 1");
    const pUnverified = createRecord(createProp("p_unver", PropertyStatusConstants.FOR_SALE, daysAgo(10), false), "o1", "Chủ 1");
    const pDraft = createRecord(createProp("p_draft", PropertyStatusConstants.FOR_SALE, daysAgo(10), true, true), "o1", "Chủ 1");
    const pUnknown = createRecord(createProp("p_unk", "GIAO_DICH_LA"), "o1", "Chủ 1");

    const result = OwnerPerformanceCalculator.calculate([pValid, pDeleted, pUnverified, pDraft, pUnknown], now);

    expect(result.totalOwnersEvaluated).toBe(1);
    expect(result.totalSingleOwnerProperties).toBe(2); // pValid + pUnverified are both evaluated
    expect(result.items[0].totalPropertiesListed).toBe(2);
  });

  it("testFilterPreservationInDrillDownFilter", () => {
    const now = fixedNow;
    const baseP = createProp("p1");
    const p = createRecord(
      {
        ...baseP,
        area: "Lê Chân",
        propertyType: "Nhà ngõ"
      },
      "o1",
      "Chủ 1"
    );

    const filter = new StatisticsFilter({
      area: "Lê Chân",
      propertyType: "Nhà ngõ",
      status: "Đang bán",
      priceMin: 2.0,
      priceMax: 5.0,
      areaSizeMin: 40.0,
      areaSizeMax: 100.0,
      dateRange: StatisticsDateRange.Last30Days
    });

    const result = OwnerPerformanceCalculator.calculate([p], now, filter);
    const drillDown = result.items[0].drillDownFilter;

    expect(drillDown.targetArea).toBe("Lê Chân");
    expect(drillDown.targetPropertyType).toBe("Nhà ngõ");
    expect(drillDown.targetStatus).toBe(PropertyStatus.FOR_SALE);
    expect(drillDown.priceMin).toBe(2.0);
    expect(drillDown.priceMax).toBe(5.0);
    expect(drillDown.areaSizeMin).toBe(40.0);
    expect(drillDown.areaSizeMax).toBe(100.0);
    expect(drillDown.createdAtFrom).not.toBeNull();
    expect(drillDown.createdAtTo).not.toBeNull();
    expect(drillDown.targetOwnerId).toBe("o1");

    // Matching context check
    const ctxMatching: DrillDownEvaluationContext = {
      property: { ...p.property, price: 3.5, areaSize: 65.0, status: "Đang bán" },
      ownerId: "o1",
      now
    };
    expect(drillDown.matches(ctxMatching)).toBe(true);

    // Price out of bounds -> rejected
    const ctxHighPrice: DrillDownEvaluationContext = {
      property: { ...p.property, price: 6.0, areaSize: 65.0, status: "Đang bán" },
      ownerId: "o1",
      now
    };
    expect(drillDown.matches(ctxHighPrice)).toBe(false);

    // Status mismatch -> rejected
    const ctxWrongStatus: DrillDownEvaluationContext = {
      property: { ...p.property, price: 3.5, areaSize: 65.0, status: "Đã bán" },
      ownerId: "o1",
      now
    };
    expect(drillDown.matches(ctxWrongStatus)).toBe(false);
  });
});
