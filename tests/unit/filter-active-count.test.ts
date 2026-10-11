import { describe, it, expect } from "vitest";
import {
  PropertyFilter,
  activeFilterCount,
  FilterState
} from "../../src/core/engine/property-filter";
import {
  FilterScope,
  PropertySortType,
  PropertyStatus
} from "../../src/core/models/enums";
import { Property, createDefaultProperty } from "../../src/core/models/property";
import { priceDropMatchesFilter } from "../../src/core/engine/price-drop-calculator";

describe("PropertyFilterActiveCountTest", () => {
  it("defaultFilter_hasZeroActiveCount", () => {
    expect(PropertyFilter.activeFilterCount({})).toBe(0);
    expect(activeFilterCount({})).toBe(0);
  });

  it("changeSortByOnly_hasZeroActiveCount", () => {
    const filter: FilterState = { sortBy: PropertySortType.PRICE_ASC };
    expect(PropertyFilter.activeFilterCount(filter)).toBe(0);
  });

  it("selectTwoPricesAndOneArea_hasTwoActiveCount", () => {
    const filter: FilterState = {
      selectedPrices: new Set(["2-3", "3-4"]),
      areas: new Set(["Hòa Xuân"])
    };
    expect(PropertyFilter.activeFilterCount(filter)).toBe(2);
  });

  it("scopeAll_hasOneActiveCount", () => {
    const filter: FilterState = { scope: FilterScope.ALL };
    expect(PropertyFilter.activeFilterCount(filter)).toBe(1);
  });

  it("changeSources_hasOneActiveCount", () => {
    const filter: FilterState = { sources: new Set(["OFFICIAL"]) };
    expect(PropertyFilter.activeFilterCount(filter)).toBe(1);
  });

  it("baselineWithPropertyTypesAndFilterMatchingBaseline_hasZeroActiveCount", () => {
    const baseline: FilterState = { propertyTypes: new Set(["Nhà"]) };
    const filter: FilterState = { propertyTypes: new Set(["Nhà"]) };
    expect(PropertyFilter.activeFilterCount(filter, baseline)).toBe(0);
  });
});

describe("PriceDropFilterMatchTest", () => {
  function testProperty(overrides: Partial<Property> = {}): Property {
    return createDefaultProperty({
      id: "test-prop-1",
      area: "Hòa Xuân",
      latitude: 16.0,
      longitude: 108.0,
      price: 2.5,
      areaSize: 60.0,
      direction: "Đông Nam",
      propertyType: "Nhà",
      status: PropertyStatus.FOR_SALE,
      description: "",
      isVerified: true,
      ...overrides
    });
  }

  it("priceBucketMatching_price2Point5", () => {
    const prop = testProperty({ price: 2.5 });

    const matchFilter: FilterState = { selectedPrices: new Set(["2-3"]) };
    expect(priceDropMatchesFilter(prop, matchFilter)).toBe(true);

    const nonMatchFilter: FilterState = { selectedPrices: new Set(["3-4"]) };
    expect(priceDropMatchesFilter(prop, nonMatchFilter)).toBe(false);
  });

  it("sizeBucketMatching_size60", () => {
    const prop = testProperty({ areaSize: 60.0 });

    const matchFilter: FilterState = { selectedSizes: new Set(["50-80"]) };
    expect(priceDropMatchesFilter(prop, matchFilter)).toBe(true);

    const nonMatchFilter: FilterState = { selectedSizes: new Set(["80-100"]) };
    expect(priceDropMatchesFilter(prop, nonMatchFilter)).toBe(false);
  });

  it("directionMatching_dongNam", () => {
    const prop = testProperty({ direction: "Đông Nam" });

    const eastGroupFilter: FilterState = {
      directions: new Set(["Đông", "Nam", "Bắc", "Đông Nam"])
    };
    expect(priceDropMatchesFilter(prop, eastGroupFilter)).toBe(true);

    const westGroupFilter: FilterState = {
      directions: new Set(["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"])
    };
    expect(priceDropMatchesFilter(prop, westGroupFilter)).toBe(false);
  });

  it("areaMatching_hoaXuan", () => {
    const prop = testProperty({ area: "Hòa Xuân" });

    const matchFilter: FilterState = { areas: new Set(["Hòa Xuân"]) };
    expect(priceDropMatchesFilter(prop, matchFilter)).toBe(true);

    const nonMatchFilter: FilterState = { areas: new Set(["Cẩm Lệ"]) };
    expect(priceDropMatchesFilter(prop, nonMatchFilter)).toBe(false);
  });

  it("includeUnverifiedFalse_excludesUnverifiedProperty", () => {
    const unverifiedProp = testProperty({ isVerified: false });

    const filterExcludeUnverified: FilterState = { includeUnverified: false };
    expect(priceDropMatchesFilter(unverifiedProp, filterExcludeUnverified)).toBe(false);

    const filterIncludeUnverified: FilterState = { includeUnverified: true };
    expect(priceDropMatchesFilter(unverifiedProp, filterIncludeUnverified)).toBe(true);
  });

  it("emptyFilter_matchesAllProperties", () => {
    const emptyFilter: FilterState = {};

    const verifiedProp = testProperty({ isVerified: true });
    expect(priceDropMatchesFilter(verifiedProp, emptyFilter)).toBe(true);

    const unverifiedProp = testProperty({ isVerified: false });
    expect(priceDropMatchesFilter(unverifiedProp, emptyFilter)).toBe(true);
  });
});
