import { describe, it, expect } from "vitest";
import { createDefaultProperty, Property } from "../../../src/core/models/property";
import {
  PropertyStatusConstants,
  STATS_ZONE_ID,
  StatisticsDateRange,
  StatisticsFilter,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey,
  VerifiedMode
} from "../../../src/core/statistics/statistics-filter";

describe("StatisticsFilterTest", () => {
  const zoneId = STATS_ZONE_ID;

  // Fixed timestamp: 2026-09-11T12:00:00+07:00
  // In UTC: 2026-09-11 05:00:00 UTC
  const fixedNow = Date.UTC(2026, 8, 11, 5, 0, 0);

  function createTestProperty(partial?: Partial<Property>): Property {
    return createDefaultProperty({
      id: "prop-1",
      area: "Hải An",
      propertyType: "Nhà phố",
      price: 3.5,
      areaSize: 80.0,
      status: PropertyStatusConstants.FOR_SALE,
      isVerified: true,
      isDraft: false,
      isDeleted: false,
      createdAt: fixedNow,
      ...partial
    });
  }

  it("test canonical area key preserves diacritics and collapses whitespace", () => {
    expect(toCanonicalAreaKey("  Hải   An  ")).toBe("hải an");
    expect(toCanonicalAreaKey("Đồ   Sơn")).toBe("đồ sơn");
    expect(toCanonicalAreaKey("HẢI PHÒNG")).toBe("hải phòng");
    expect(toCanonicalAreaKey(null)).toBe("");
    expect(toCanonicalAreaKey("   ")).toBe("");
  });

  it("test canonical propertyType key normalizes domain aliases first", () => {
    // "house", "nha" normalize to "Nhà" -> canonical "nhà"
    expect(toCanonicalPropertyTypeKey("house")).toBe("nhà");
    expect(toCanonicalPropertyTypeKey("nha")).toBe("nhà");
    expect(toCanonicalPropertyTypeKey("  nha  ")).toBe("nhà");

    // "land", "dat" normalize to "Đất" -> canonical "đất"
    expect(toCanonicalPropertyTypeKey("land")).toBe("đất");
    expect(toCanonicalPropertyTypeKey("dat")).toBe("đất");

    // Custom types
    expect(toCanonicalPropertyTypeKey("  Nhà   phố ")).toBe("nhà phố");
    expect(toCanonicalPropertyTypeKey("Biệt thự")).toBe("biệt thự");
  });

  it("test property status constants and literal checks", () => {
    expect(PropertyStatusConstants.FOR_SALE).toBe("Đang bán");
    expect(PropertyStatusConstants.SOLD).toBe("Đã bán");
    expect(PropertyStatusConstants.PENDING_SURVEY).toBe("Chờ khảo sát");

    expect(PropertyStatusConstants.isForSale("Đang bán")).toBe(true);
    expect(PropertyStatusConstants.isSold("Đã bán")).toBe(true);
    expect(PropertyStatusConstants.isPendingSurvey("Chờ khảo sát")).toBe(true);

    // English enums and unknown strings must not be recognized as valid known physical literals
    expect(PropertyStatusConstants.isKnown("FOR_SALE")).toBe(false);
    expect(PropertyStatusConstants.isKnown("SOLD")).toBe(false);
    expect(PropertyStatusConstants.isKnown("random_status")).toBe(false);
    expect(PropertyStatusConstants.isKnown(null)).toBe(false);
  });

  it("test date range resolution with Asia Ho_Chi_Minh timezone", () => {
    // 7 days window: today (2026-09-11) and 6 preceding days -> 2026-09-05T00:00:00 to 2026-09-12T00:00:00
    const window7 = StatisticsDateRange.Last7Days.resolveWindow(fixedNow, zoneId);
    expect(window7).not.toBeNull();

    // 2026-09-05 00:00:00+07:00 is Date.UTC(2026, 8, 4, 17, 0, 0)
    const expectedStart = Date.UTC(2026, 8, 5) - 7 * 3600 * 1000;
    const expectedEnd = Date.UTC(2026, 8, 12) - 7 * 3600 * 1000;

    expect(window7!.startInclusive).toBe(expectedStart);
    expect(window7!.endExclusive).toBe(expectedEnd);

    // Inside window
    const sep11Noon = Date.UTC(2026, 8, 11, 5, 0, 0);
    const sep5Midnight = expectedStart;
    expect(window7!.contains(sep11Noon)).toBe(true);
    expect(window7!.contains(sep5Midnight)).toBe(true);

    // Outside window
    const sep4Late = expectedStart - 1;
    const sep12Midnight = expectedEnd;
    expect(window7!.contains(sep4Late)).toBe(false);
    expect(window7!.contains(sep12Midnight)).toBe(false); // Half-open: end is exclusive
  });

  it("test custom date range from local dates", () => {
    const custom = StatisticsDateRange.fromDates(
      { year: 2026, month: 9, day: 1 },
      { year: 2026, month: 9, day: 10 },
      zoneId
    );
    const window = custom.resolveWindow(fixedNow, zoneId);
    expect(window).not.toBeNull();

    const start = Date.UTC(2026, 8, 1) - 7 * 3600 * 1000;
    const end = Date.UTC(2026, 8, 11) - 7 * 3600 * 1000;

    expect(window!.startInclusive).toBe(start);
    expect(window!.endExclusive).toBe(end);
  });

  it("test filter matches criteria correctly", () => {
    const prop = createTestProperty({
      area: "Hải An",
      propertyType: "Nhà phố",
      price: 3.5,
      areaSize: 100.0,
      status: PropertyStatusConstants.FOR_SALE,
      isVerified: true,
      isDraft: false,
      isDeleted: false
    });

    // Area canonical matching
    expect(new StatisticsFilter({ area: "hải an" }).matches(prop)).toBe(true);
    expect(new StatisticsFilter({ area: "  HẢI   AN " }).matches(prop)).toBe(true);
    expect(new StatisticsFilter({ area: "Lê Chân" }).matches(prop)).toBe(false);

    // PropertyType canonical matching
    expect(new StatisticsFilter({ propertyType: "nhà phố" }).matches(prop)).toBe(true);
    expect(new StatisticsFilter({ propertyType: "đất nền" }).matches(prop)).toBe(false);

    // Price range [min, max)
    expect(new StatisticsFilter({ priceMin: 3.0, priceMax: 4.0 }).matches(prop)).toBe(true);
    expect(new StatisticsFilter({ priceMin: 3.5, priceMax: 4.0 }).matches(prop)).toBe(true); // min inclusive
    expect(new StatisticsFilter({ priceMin: 2.0, priceMax: 3.5 }).matches(prop)).toBe(false); // max exclusive

    // VerifiedMode
    expect(new StatisticsFilter({ verifiedMode: VerifiedMode.ALL }).matches(prop)).toBe(true);
    expect(new StatisticsFilter({ verifiedMode: VerifiedMode.VERIFIED_ONLY }).matches(prop)).toBe(true);
    expect(new StatisticsFilter({ verifiedMode: VerifiedMode.UNVERIFIED_ONLY }).matches(prop)).toBe(false);

    // Exclude deleted & draft
    expect(new StatisticsFilter().matches({ ...prop, isDeleted: true })).toBe(false);
    expect(new StatisticsFilter().matches({ ...prop, isDraft: true })).toBe(false);
    expect(new StatisticsFilter().matches({ ...prop, isDraft: true }, null, true, false)).toBe(true);
  });

  it("test non-AllTime filter without now throws IllegalArgumentException", () => {
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const prop = createTestProperty();
    expect(() => filter.matches(prop)).toThrowError(/now parameter must be supplied/);
  });

  it("test AllTime filter without now does not throw and matches", () => {
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.AllTime });
    const prop = createTestProperty();
    expect(filter.matches(prop)).toBe(true);
  });

  it("test disabling checkDateWindow skips date check even if now is null", () => {
    const filter = new StatisticsFilter({ dateRange: StatisticsDateRange.Last7Days });
    const prop = createTestProperty();
    expect(filter.matches(prop, null, true, true, false)).toBe(true);
  });

  it("test date window half-open boundary conditions", () => {
    const filter = new StatisticsFilter({
      dateRange: StatisticsDateRange.Custom(1000, 2000)
    });

    const propBefore = createTestProperty({ createdAt: 999 });
    const propStart = createTestProperty({ createdAt: 1000 });
    const propInsideLast = createTestProperty({ createdAt: 1999 });
    const propEnd = createTestProperty({ createdAt: 2000 });
    const propAfter = createTestProperty({ createdAt: 2001 });

    expect(filter.matches(propBefore, fixedNow)).toBe(false);
    expect(filter.matches(propStart, fixedNow)).toBe(true);
    expect(filter.matches(propInsideLast, fixedNow)).toBe(true);
    expect(filter.matches(propEnd, fixedNow)).toBe(false);
    expect(filter.matches(propAfter, fixedNow)).toBe(false);
  });

  it("test numeric price boundaries half-open and fail-closed", () => {
    const filter = new StatisticsFilter({ priceMin: 2.0, priceMax: 5.0 });

    expect(filter.matches(createTestProperty({ price: 2.0 }))).toBe(true); // minInclusive -> match
    expect(filter.matches(createTestProperty({ price: 4.999 }))).toBe(true); // inside -> match
    expect(filter.matches(createTestProperty({ price: 5.0 }))).toBe(false); // maxExclusive -> false
    expect(filter.matches(createTestProperty({ price: 1.999 }))).toBe(false); // below -> false
    expect(filter.matches(createTestProperty({ price: 5.001 }))).toBe(false); // above -> false

    // Non-finite and negative prices must fail-closed
    expect(filter.matches(createTestProperty({ price: NaN }))).toBe(false);
    expect(filter.matches(createTestProperty({ price: Infinity }))).toBe(false);
    expect(filter.matches(createTestProperty({ price: -Infinity }))).toBe(false);
    expect(filter.matches(createTestProperty({ price: -1.0 }))).toBe(false);
  });

  it("test numeric areaSize boundaries half-open and fail-closed", () => {
    const filter = new StatisticsFilter({ areaSizeMin: 50.0, areaSizeMax: 100.0 });

    expect(filter.matches(createTestProperty({ areaSize: 50.0 }))).toBe(true); // minInclusive -> match
    expect(filter.matches(createTestProperty({ areaSize: 99.99 }))).toBe(true); // inside -> match
    expect(filter.matches(createTestProperty({ areaSize: 100.0 }))).toBe(false); // maxExclusive -> false
    expect(filter.matches(createTestProperty({ areaSize: 49.99 }))).toBe(false); // below -> false

    // Null, non-finite, and negative areaSize must fail-closed
    expect(filter.matches(createTestProperty({ areaSize: null }))).toBe(false);
    expect(filter.matches(createTestProperty({ areaSize: NaN }))).toBe(false);
    expect(filter.matches(createTestProperty({ areaSize: Infinity }))).toBe(false);
    expect(filter.matches(createTestProperty({ areaSize: -Infinity }))).toBe(false);
    expect(filter.matches(createTestProperty({ areaSize: -10.0 }))).toBe(false);
  });

  it("test filter throws on priceMin greater than priceMax", () => {
    expect(() => new StatisticsFilter({ priceMin: 10.0, priceMax: 5.0 })).toThrow();
  });

  it("test filter throws on areaSizeMin greater than areaSizeMax", () => {
    expect(() => new StatisticsFilter({ areaSizeMin: 120.0, areaSizeMax: 80.0 })).toThrow();
  });

  it("test filter throws on NaN priceMin", () => {
    expect(() => new StatisticsFilter({ priceMin: NaN })).toThrow();
  });

  it("test filter throws on infinite priceMax", () => {
    expect(() => new StatisticsFilter({ priceMax: Infinity })).toThrow();
  });

  it("test filter throws on negative areaSizeMin", () => {
    expect(() => new StatisticsFilter({ areaSizeMin: -5.0 })).toThrow();
  });

  it("test filter throws on NaN areaSizeMax", () => {
    expect(() => new StatisticsFilter({ areaSizeMax: NaN })).toThrow();
  });

  it("test fixed price range brackets with half-open boundaries", () => {
    // Bracket: < 2 tỷ (min = null, max = 2.0)
    const under2 = new StatisticsFilter({ priceMin: null, priceMax: 2.0 });
    expect(under2.matches(createTestProperty({ price: 0.0 }))).toBe(false);
    expect(under2.matches(createTestProperty({ price: 0.5 }))).toBe(true);
    expect(under2.matches(createTestProperty({ price: 1.999 }))).toBe(true);
    expect(under2.matches(createTestProperty({ price: 2.0 }))).toBe(false);
    expect(under2.matches(createTestProperty({ price: 2.5 }))).toBe(false);

    // Bracket: 2–3 tỷ (min = 2.0, max = 3.0)
    const from2To3 = new StatisticsFilter({ priceMin: 2.0, priceMax: 3.0 });
    expect(from2To3.matches(createTestProperty({ price: 1.999 }))).toBe(false);
    expect(from2To3.matches(createTestProperty({ price: 2.0 }))).toBe(true);
    expect(from2To3.matches(createTestProperty({ price: 2.999 }))).toBe(true);
    expect(from2To3.matches(createTestProperty({ price: 3.0 }))).toBe(false);

    // Bracket: 3–5 tỷ (min = 3.0, max = 5.0)
    const from3To5 = new StatisticsFilter({ priceMin: 3.0, priceMax: 5.0 });
    expect(from3To5.matches(createTestProperty({ price: 2.999 }))).toBe(false);
    expect(from3To5.matches(createTestProperty({ price: 3.0 }))).toBe(true);
    expect(from3To5.matches(createTestProperty({ price: 4.999 }))).toBe(true);
    expect(from3To5.matches(createTestProperty({ price: 5.0 }))).toBe(false);

    // Bracket: 5–7 tỷ (min = 5.0, max = 7.0)
    const from5To7 = new StatisticsFilter({ priceMin: 5.0, priceMax: 7.0 });
    expect(from5To7.matches(createTestProperty({ price: 4.999 }))).toBe(false);
    expect(from5To7.matches(createTestProperty({ price: 5.0 }))).toBe(true);
    expect(from5To7.matches(createTestProperty({ price: 6.999 }))).toBe(true);
    expect(from5To7.matches(createTestProperty({ price: 7.0 }))).toBe(false);

    // Bracket: ≥ 7 tỷ (min = 7.0, max = null)
    const from7AndAbove = new StatisticsFilter({ priceMin: 7.0, priceMax: null });
    expect(from7AndAbove.matches(createTestProperty({ price: 6.999 }))).toBe(false);
    expect(from7AndAbove.matches(createTestProperty({ price: 7.0 }))).toBe(true);
    expect(from7AndAbove.matches(createTestProperty({ price: 15.0 }))).toBe(true);

    // Bracket: Tất cả (min = null, max = null)
    const allPrices = new StatisticsFilter({ priceMin: null, priceMax: null });
    expect(allPrices.matches(createTestProperty({ price: 0.0 }))).toBe(true);
    expect(allPrices.matches(createTestProperty({ price: 0.5 }))).toBe(true);
    expect(allPrices.matches(createTestProperty({ price: 2.0 }))).toBe(true);
    expect(allPrices.matches(createTestProperty({ price: 10.0 }))).toBe(true);
  });
});
