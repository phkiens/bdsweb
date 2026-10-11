import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import {
  InventoryCalculator
} from "../../../src/core/statistics/inventory-calculator";
import {
  PropertyStatusConstants,
  StatisticsDateRange,
  StatisticsFilter
} from "../../../src/core/statistics/statistics-filter";

describe("InventoryCalculatorTest", () => {

  // Fixed "today" for deterministic testing: 2026-09-11T12:00:00+07:00
  // In UTC: 2026-09-11 05:00:00 UTC
  const fixedNow = Date.UTC(2026, 8, 11, 5, 0, 0);

  const fixedClock = {
    millis(): number {
      return fixedNow;
    }
  };

  function timeAtDaysAgo(daysAgo: number): number {
    const todayUtc = Date.UTC(2026, 8, 11);
    // 10:00:00+07:00 is (10 - 7) = 3:00 UTC
    return todayUtc - daysAgo * 86_400_000 + 3 * 3600 * 1000;
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
      createdAt: fixedNow,
      ...partial
    });
  }

  it("test empty inputs return empty InventoryData", () => {
    const emptyData = InventoryCalculator.calculate([], { now: fixedNow });
    expect(emptyData.totalInventory).toBe(0);
    expect(emptyData.activeCount).toBe(0);
    expect(emptyData.soldRatioProxy).toBeNull();
    expect(emptyData.medianAgeDays).toBeNull();
    expect(emptyData.longestAgingProperties).toHaveLength(0);
  });

  it("test draft properties are excluded from business KPIs and tracked separately", () => {
    const list = [
      createProp({ id: "p1", isVerified: true, isDraft: false }),
      createProp({ id: "p2", isVerified: true, isDraft: true }),
      createProp({ id: "p3", isVerified: false, isDraft: true })
    ];

    const result = InventoryCalculator.calculate(list, { now: fixedNow });

    expect(result.totalInventory).toBe(1);
    expect(result.activeCount).toBe(1);
    expect(result.draftExcludedCount).toBe(2);
  });

  it("test deleted properties are excluded from all counts", () => {
    const list = [
      createProp({ id: "p1", isDeleted: false }),
      createProp({ id: "p2", isDeleted: true })
    ];

    const result = InventoryCalculator.calculate(list, { now: fixedNow });
    expect(result.totalInventory).toBe(1);
  });

  it("test status counts strictly compare string literals without fromValue fallback", () => {
    const list = [
      createProp({ id: "p1", status: "Đang bán" }),
      createProp({ id: "p2", status: "Đã bán" }),
      createProp({ id: "p3", status: "Chờ khảo sát" }),
      // English enum or random string must be recognized as unknown status and NOT fallback to FOR_SALE
      createProp({ id: "p4", status: "FOR_SALE" }),
      createProp({ id: "p5", status: "random_dirty_status" })
    ];

    const result = InventoryCalculator.calculate(list, { now: fixedNow });

    expect(result.activeCount).toBe(2); // p1 (Đang bán) + p3 (Chờ khảo sát) are both active market
    expect(result.soldCount).toBe(1);
    expect(result.pendingSurveyCount).toBe(1);
    expect(result.unknownStatusCount).toBe(2);
    expect(result.totalInventory).toBe(5);
  });

  it("test date window metrics and soldRatioProxy with zero denominator", () => {
    // Filter Last7Days (from 2026-09-05 to 2026-09-12)
    const filter7 = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });

    const list = [
      // In window: 2 For Sale, 1 Sold
      createProp({ id: "p1", status: "Đang bán", createdAt: timeAtDaysAgo(2) }),
      createProp({ id: "p2", status: "Đang bán", createdAt: timeAtDaysAgo(4) }),
      createProp({ id: "p3", status: "Đã bán", createdAt: timeAtDaysAgo(1) }),
      // Outside window (10 days ago): 1 For Sale, 1 Sold
      createProp({ id: "p4", status: "Đang bán", createdAt: timeAtDaysAgo(10) }),
      createProp({ id: "p5", status: "Đã bán", createdAt: timeAtDaysAgo(12) })
    ];

    const result = InventoryCalculator.calculate(list, {
      filter: filter7,
      now: fixedNow
    });

    // Snapshot total in inventory
    expect(result.totalInventory).toBe(5);
    expect(result.activeCount).toBe(3);
    expect(result.soldCount).toBe(2);

    // Window metrics (only created in the 7-day window)
    expect(result.newInWindow).toBe(3);
    expect(result.forSaleCreatedInWindow).toBe(2);
    expect(result.soldCreatedInWindow).toBe(1);

    // soldRatioProxy = 1 / (2 + 1) = 1/3 = 0.3333...
    expect(result.soldRatioProxy).not.toBeNull();
    expect(result.soldRatioProxy!).toBeCloseTo(1.0 / 3.0, 4);

    // Zero denominator case: no properties created in window -> returns null
    const emptyWindowFilter = new StatisticsFilter({
      dateRange: StatisticsDateRange.Custom(timeAtDaysAgo(50), timeAtDaysAgo(40))
    });
    const zeroDenomResult = InventoryCalculator.calculate(list, {
      filter: emptyWindowFilter,
      now: fixedNow
    });
    expect(zeroDenomResult.forSaleCreatedInWindow).toBe(0);
    expect(zeroDenomResult.soldCreatedInWindow).toBe(0);
    expect(zeroDenomResult.soldRatioProxy).toBeNull();
  });

  it("test aging buckets distribution and ageDays calculation in Asia Ho_Chi_Minh", () => {
    const list = [
      createProp({ id: "p_today", status: "Đang bán", createdAt: fixedNow }), // 0 days -> bucket 0-7
      createProp({ id: "p_5d", status: "Đang bán", createdAt: timeAtDaysAgo(5) }), // 5 days -> bucket 0-7
      createProp({ id: "p_7d", status: "Đang bán", createdAt: timeAtDaysAgo(7) }), // 7 days -> bucket 0-7
      createProp({ id: "p_8d", status: "Đang bán", createdAt: timeAtDaysAgo(8) }), // 8 days -> bucket 8-30
      createProp({ id: "p_30d", status: "Đang bán", createdAt: timeAtDaysAgo(30) }), // 30 days -> bucket 8-30
      createProp({ id: "p_31d", status: "Đang bán", createdAt: timeAtDaysAgo(31) }), // 31 days -> bucket 31-60
      createProp({ id: "p_60d", status: "Đang bán", createdAt: timeAtDaysAgo(60) }), // 60 days -> bucket 31-60
      createProp({ id: "p_61d", status: "Đang bán", createdAt: timeAtDaysAgo(61) }), // 61 days -> bucket 61-90
      createProp({ id: "p_90d", status: "Đang bán", createdAt: timeAtDaysAgo(90) }), // 90 days -> bucket 61-90
      createProp({ id: "p_91d", status: "Đang bán", createdAt: timeAtDaysAgo(91) }), // 91 days -> bucket >90
      createProp({ id: "p_120d", status: "Đang bán", createdAt: timeAtDaysAgo(120) }) // 120 days -> bucket >90
    ];

    const result = InventoryCalculator.calculate(list, { now: fixedNow });

    const buckets = result.agingBuckets;
    expect(buckets.days0to7).toBe(3);
    expect(buckets.days8to30).toBe(2);
    expect(buckets.days31to60).toBe(2);
    expect(buckets.days61to90).toBe(2);
    expect(buckets.daysOver90).toBe(2);
    expect(buckets.total).toBe(11);

    // Count over 60 days: 61d, 90d, 91d, 120d = 4 items out of 11 -> 4 / 11 * 100%
    const expectedOver60 = (4.0 / 11.0) * 100.0;
    expect(result.ratioOver60Days!).toBeCloseTo(expectedOver60, 3);

    // Count over 90 days: 91d, 120d = 2 items out of 11 -> 2 / 11 * 100%
    const expectedOver90 = (2.0 / 11.0) * 100.0;
    expect(result.ratioOver90Days!).toBeCloseTo(expectedOver90, 3);
  });

  it("test abnormal dates are excluded from aging and counted in anomalies", () => {
    const tomorrow = Date.UTC(2026, 8, 12, 3, 0, 0); // 10:00 AM VN on Sept 12

    const list = [
      createProp({ id: "p_valid", status: "Đang bán", createdAt: timeAtDaysAgo(10) }),
      createProp({ id: "p_invalid_zero", status: "Đang bán", createdAt: 0 }),
      createProp({ id: "p_invalid_neg", status: "Đang bán", createdAt: -1000 }),
      createProp({ id: "p_future", status: "Đang bán", createdAt: tomorrow })
    ];

    const result = InventoryCalculator.calculate(list, { now: fixedNow });

    expect(result.invalidDateCount).toBe(2);
    expect(result.futureDateCount).toBe(1);
    // Only the valid property participates in aging buckets and stats
    expect(result.agingBuckets.total).toBe(1);
    expect(result.medianAgeDays!).toBeCloseTo(10.0, 3);
  });

  it("test deterministic tie sorting for longest aging properties", () => {
    // Tie rules according to Section 3.5:
    // ageDays descending -> createdAt ascending -> id ascending
    const list = [
      createProp({ id: "p_low_age", status: "Đang bán", createdAt: timeAtDaysAgo(10) }),
      createProp({ id: "p_b", status: "Đang bán", createdAt: timeAtDaysAgo(50) }),
      createProp({ id: "p_a", status: "Đang bán", createdAt: timeAtDaysAgo(50) }),
      createProp({ id: "p_top", status: "Đang bán", createdAt: timeAtDaysAgo(100) })
    ];

    const result = InventoryCalculator.calculate(list, {
      now: fixedNow,
      topNLongestAging: 10
    });
    const longest = result.longestAgingProperties;

    expect(longest).toHaveLength(4);
    // 1st: age = 100 days
    expect(longest[0].property.id).toBe("p_top");
    // 2nd and 3rd: both age = 50 days, same createdAt -> sorted by id: "p_a" comes before "p_b"
    expect(longest[1].property.id).toBe("p_a");
    expect(longest[2].property.id).toBe("p_b");
    // 4th: age = 10 days
    expect(longest[3].property.id).toBe("p_low_age");
  });

  it("test Clock injection produces identical deterministic result", () => {
    const list = [
      createProp({ id: "p1", status: "Đang bán", createdAt: timeAtDaysAgo(5) }),
      createProp({ id: "p2", status: "Đang bán", createdAt: timeAtDaysAgo(15) })
    ];

    const byNow = InventoryCalculator.calculate(list, { now: fixedNow });
    const byClock = InventoryCalculator.calculate(list, { clock: fixedClock });

    expect(byNow.totalInventory).toBe(byClock.totalInventory);
    expect(byNow.medianAgeDays).toBe(byClock.medianAgeDays);
    expect(byNow.agingBuckets).toEqual(byClock.agingBuckets);
  });

  it("test negative topNLongestAging throws IllegalArgumentException", () => {
    expect(() =>
      InventoryCalculator.calculate([], { now: fixedNow, topNLongestAging: -1 })
    ).toThrow();
  });

  it("test topNLongestAging zero returns empty longestAgingProperties without error", () => {
    const list = [createProp({ id: "p1", status: "Đang bán", createdAt: timeAtDaysAgo(5) })];
    const result = InventoryCalculator.calculate(list, {
      now: fixedNow,
      topNLongestAging: 0
    });
    expect(result.longestAgingProperties).toHaveLength(0);
  });

  it("test snapshot inventory retains all dates while window metrics filter by date window", () => {
    const filter30 = new StatisticsFilter({ dateRange: StatisticsDateRange.Last30Days });
    const list = [
      createProp({ id: "recent", createdAt: timeAtDaysAgo(5) }),
      createProp({ id: "old", createdAt: timeAtDaysAgo(60) })
    ];

    const result = InventoryCalculator.calculate(list, {
      filter: filter30,
      now: fixedNow
    });

    // Total and active counts must reflect all properties regardless of age (snapshot semantics)
    expect(result.totalInventory).toBe(2);
    expect(result.activeCount).toBe(2);
    // Window metric must only include properties created in the 30-day window
    expect(result.newInWindow).toBe(1);
    expect(result.forSaleCreatedInWindow).toBe(1);
    // Aging items must include both (snapshot active items)
    expect(result.longestAgingProperties).toHaveLength(2);
  });
});
