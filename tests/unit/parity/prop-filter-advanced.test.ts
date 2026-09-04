import { describe, it, expect } from "vitest";
import { Property } from "../../../src/core/models/property";
import { PropertyStatus, FilterScope, PropertySortType, PropertyListMode } from "../../../src/core/models/enums";
import {
  PropertyFilter,
  FilterState,
  PRICE_BUCKETS,
  SIZE_BUCKETS,
  matchesAnyBucket,
  sortProperties
} from "../../../src/core/engine/property-filter";

describe("FEATURE PARITY: PROP-FILTER-ADVANCED-001 (Bộ lọc BĐS nâng cao)", () => {
  const createMockProp = (overrides: Partial<Property>): Property => ({
    id: "prop-" + Math.random().toString(36).substring(2, 6),
    area: "123 Lê Quang Định, Bình Thạnh",
    latitude: 10.8,
    longitude: 106.7,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    priceAtFolderCreation: null,
    documentUrl: "",
    areaSize: 50,
    price: 4.5,
    description: "Mặt tiền đẹp",
    status: PropertyStatus.FOR_SALE,
    surveyDate: "2026-09-04",
    direction: "Đông Nam",
    ownerName: "Bác Nam",
    ownerPhone: "0903112233",
    propertyType: "Nhà",
    needToViewToday: false,
    isDraft: false,
    isTextSynced: false,
    rawText: "",
    diary: "",
    updatedAt: 1000,
    isDeleted: false,
    propertyDetailJsonFileId: null,
    txtFileId: null,
    isMediaSynced: false,
    linkedCustomerId: null,
    title: null,
    mapLink: null,
    extractedBy: null,
    createdAt: 1000,
    isVerified: true,
    lastEditedAt: 1000,
    r2MediaKeys: null,
    ...overrides
  });

  it("Khớp chính xác các khoảng giá PRICE_BUCKETS (<1, 1-2, 2-3, 3-4, 4-5, 5-7, 7-10, >10)", () => {
    const p1 = createMockProp({ price: 0.8 });
    const p2 = createMockProp({ price: 3.5 });
    const p3 = createMockProp({ price: 6.2 });
    const p4 = createMockProp({ price: 15.0 });

    expect(matchesAnyBucket(p1.price, new Set(["<1"]), PRICE_BUCKETS)).toBe(true);
    expect(matchesAnyBucket(p1.price, new Set(["1-2"]), PRICE_BUCKETS)).toBe(false);

    expect(matchesAnyBucket(p2.price, new Set(["3-4"]), PRICE_BUCKETS)).toBe(true);
    expect(matchesAnyBucket(p2.price, new Set(["4-5"]), PRICE_BUCKETS)).toBe(false);

    expect(matchesAnyBucket(p3.price, new Set(["5-7"]), PRICE_BUCKETS)).toBe(true);
    expect(matchesAnyBucket(p4.price, new Set([">10"]), PRICE_BUCKETS)).toBe(true);

    // Multi-bucket OR matching
    expect(matchesAnyBucket(p2.price, new Set(["1-2", "3-4"]), PRICE_BUCKETS)).toBe(true);
  });

  it("Khớp chính xác các khoảng diện tích SIZE_BUCKETS (<30, 30-50, 50-80, 80-100, 100-150, >150)", () => {
    const p1 = createMockProp({ areaSize: 25 });
    const p2 = createMockProp({ areaSize: 65 });
    const p3 = createMockProp({ areaSize: 180 });

    expect(matchesAnyBucket(p1.areaSize, new Set(["<30"]), SIZE_BUCKETS)).toBe(true);
    expect(matchesAnyBucket(p2.areaSize, new Set(["50-80"]), SIZE_BUCKETS)).toBe(true);
    expect(matchesAnyBucket(p3.areaSize, new Set([">150"]), SIZE_BUCKETS)).toBe(true);
  });

  it("Lọc theo khoảng giá tùy biến (priceMin / priceMax) và diện tích tùy biến (sizeMin / sizeMax)", () => {
    const p = createMockProp({ price: 5.5, areaSize: 75 });

    const filter1: FilterState = {
      priceMin: 5.0,
      priceMax: 6.0,
      sizeMin: 70,
      sizeMax: 80
    };
    expect(PropertyFilter.matches(p, filter1)).toBe(true);

    const filter2: FilterState = {
      priceMin: 6.0,
      priceMax: 7.0
    };
    expect(PropertyFilter.matches(p, filter2)).toBe(false);
  });

  it("Lọc đa hướng nhà (directions set matching)", () => {
    const pEast = createMockProp({ direction: "Đông" });
    const pSouthEast = createMockProp({ direction: "Đông Nam" });
    const pWest = createMockProp({ direction: "Tây" });

    const filter: FilterState = {
      directions: new Set(["Đông", "Đông Nam"])
    };

    expect(PropertyFilter.matches(pEast, filter)).toBe(true);
    expect(PropertyFilter.matches(pSouthEast, filter)).toBe(true);
    expect(PropertyFilter.matches(pWest, filter)).toBe(false);
  });

  it("Phạm vi lọc FilterScope: CURRENT_TAB vs ALL", () => {
    const verifiedProp = createMockProp({ isVerified: true });
    const unverifiedProp = createMockProp({ isVerified: false });

    // Khi ở tab BĐS chính thức (VERIFIED) với scope = CURRENT_TAB: Chỉ cho phép verified
    const currentTabFilter: FilterState = { scope: FilterScope.CURRENT_TAB };
    expect(PropertyFilter.matches(verifiedProp, currentTabFilter, "", false, PropertyListMode.VERIFIED)).toBe(true);
    expect(PropertyFilter.matches(unverifiedProp, currentTabFilter, "", false, PropertyListMode.VERIFIED)).toBe(false);

    // Khi bật scope = ALL: Cho phép cả tin chính thức lẫn tin chờ khảo sát
    const allScopeFilter: FilterState = { scope: FilterScope.ALL };
    expect(PropertyFilter.matches(verifiedProp, allScopeFilter, "", false, PropertyListMode.VERIFIED)).toBe(true);
    expect(PropertyFilter.matches(unverifiedProp, allScopeFilter, "", false, PropertyListMode.VERIFIED)).toBe(true);
  });

  it("Sắp xếp sortProperties: Mới nhất, Giá tăng, Giá giảm, Diện tích", () => {
    const p1 = createMockProp({ id: "p1", price: 3.0, areaSize: 80, updatedAt: 1000 });
    const p2 = createMockProp({ id: "p2", price: 7.0, areaSize: 40, updatedAt: 2000 });
    const p3 = createMockProp({ id: "p3", price: 5.0, areaSize: 120, updatedAt: 1500 });

    const list = [p1, p2, p3];

    const sortedByPriceAsc = sortProperties(list, PropertySortType.PRICE_ASC);
    expect(sortedByPriceAsc.map((p) => p.id)).toEqual(["p1", "p3", "p2"]);

    const sortedByPriceDesc = sortProperties(list, PropertySortType.PRICE_DESC);
    expect(sortedByPriceDesc.map((p) => p.id)).toEqual(["p2", "p3", "p1"]);

    const sortedBySize = sortProperties(list, PropertySortType.SIZE);
    expect(sortedBySize.map((p) => p.id)).toEqual(["p3", "p1", "p2"]);
  });
});
