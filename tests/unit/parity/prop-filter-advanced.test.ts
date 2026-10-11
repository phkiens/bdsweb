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

  it("W002: Các hướng chính (Đông, Tây, Nam, Bắc) chỉ khớp chính nó và loại trừ các hướng ghép", () => {
    const pDong = createMockProp({ direction: "Đông" });
    const pDongNam = createMockProp({ direction: "Đông Nam" });
    const pDongBac = createMockProp({ direction: "Đông Bắc" });
    const pTay = createMockProp({ direction: "Tây" });
    const pTayNam = createMockProp({ direction: "Tây Nam" });
    const pTayBac = createMockProp({ direction: "Tây Bắc" });
    const pNam = createMockProp({ direction: "Nam" });
    const pBac = createMockProp({ direction: "Bắc" });

    // Đông không được khớp Đông Nam hay Đông Bắc
    const filterDong: FilterState = { directions: new Set(["Đông"]) };
    expect(PropertyFilter.matches(pDong, filterDong)).toBe(true);
    expect(PropertyFilter.matches(pDongNam, filterDong)).toBe(false);
    expect(PropertyFilter.matches(pDongBac, filterDong)).toBe(false);

    // Tây không được khớp Tây Nam hay Tây Bắc
    const filterTay: FilterState = { directions: new Set(["Tây"]) };
    expect(PropertyFilter.matches(pTay, filterTay)).toBe(true);
    expect(PropertyFilter.matches(pTayNam, filterTay)).toBe(false);
    expect(PropertyFilter.matches(pTayBac, filterTay)).toBe(false);

    // Nam không được khớp Đông Nam hay Tây Nam
    const filterNam: FilterState = { directions: new Set(["Nam"]) };
    expect(PropertyFilter.matches(pNam, filterNam)).toBe(true);
    expect(PropertyFilter.matches(pDongNam, filterNam)).toBe(false);
    expect(PropertyFilter.matches(pTayNam, filterNam)).toBe(false);

    // Bắc không được khớp Đông Bắc hay Tây Bắc
    const filterBac: FilterState = { directions: new Set(["Bắc"]) };
    expect(PropertyFilter.matches(pBac, filterBac)).toBe(true);
    expect(PropertyFilter.matches(pDongBac, filterBac)).toBe(false);
    expect(PropertyFilter.matches(pTayBac, filterBac)).toBe(false);
  });

  it("W002: Mỗi hướng trong 8 hướng chỉ khớp chính token đó và loại bỏ 7 hướng còn lại", () => {
    const ALL_8_DIRECTIONS = [
      "Đông",
      "Tây",
      "Nam",
      "Bắc",
      "Đông Nam",
      "Đông Bắc",
      "Tây Nam",
      "Tây Bắc"
    ];

    for (const dirChoice of ALL_8_DIRECTIONS) {
      const filter: FilterState = { directions: new Set([dirChoice]) };
      for (const propDir of ALL_8_DIRECTIONS) {
        const prop = createMockProp({ direction: propDir });
        const matches = PropertyFilter.matches(prop, filter);
        expect(matches).toBe(dirChoice === propDir);
      }
    }
  });

  it("W002: Đông Nam không khớp Đông Bắc và ngược lại", () => {
    const pDongNam = createMockProp({ direction: "Đông Nam" });
    const pDongBac = createMockProp({ direction: "Đông Bắc" });

    const filterDongNam: FilterState = { directions: new Set(["Đông Nam"]) };
    expect(PropertyFilter.matches(pDongNam, filterDongNam)).toBe(true);
    expect(PropertyFilter.matches(pDongBac, filterDongNam)).toBe(false);

    const filterDongBac: FilterState = { directions: new Set(["Đông Bắc"]) };
    expect(PropertyFilter.matches(pDongBac, filterDongBac)).toBe(true);
    expect(PropertyFilter.matches(pDongNam, filterDongBac)).toBe(false);
  });

  it("W002: Xử lý khoảng trắng, chữ hoa/thường và chuỗi đa hướng qua dấu phân tách |||", () => {
    // BĐS có nhiều hướng với khoảng trắng và chữ hoa chữ thường
    const pMulti = createMockProp({ direction: "  đông bắc  |||  TÂY NAM  " });

    expect(PropertyFilter.matches(pMulti, { directions: new Set(["Đông Bắc"]) })).toBe(true);
    expect(PropertyFilter.matches(pMulti, { directions: new Set(["Tây Nam"]) })).toBe(true);
    expect(PropertyFilter.matches(pMulti, { directions: new Set(["Đông"]) })).toBe(false);
    expect(PropertyFilter.matches(pMulti, { directions: new Set(["Nam"]) })).toBe(false);
    expect(PropertyFilter.matches(pMulti, { directions: new Set(["Tây"]) })).toBe(false);
    expect(PropertyFilter.matches(pMulti, { directions: new Set(["Bắc"]) })).toBe(false);

    // Bộ lọc có khoảng trắng và chữ thường
    const pDongUpper = createMockProp({ direction: " ĐÔNG " });
    expect(PropertyFilter.matches(pDongUpper, { directions: new Set(["  đông  "]) })).toBe(true);
  });

  it("W002: Logic OR giữa các hướng được chọn, kết hợp AND với loại BĐS và khoảng giá", () => {
    const filterCombo: FilterState = {
      directions: new Set(["Đông", "Nam"]),
      propertyTypes: new Set(["Nhà"]),
      selectedPrices: new Set(["4-5"])
    };

    const pMatch1 = createMockProp({ direction: "Đông", propertyType: "Nhà", price: 4.5 });
    const pMatch2 = createMockProp({ direction: "Nam", propertyType: "Nhà", price: 4.2 });
    const pWrongDir = createMockProp({ direction: "Tây", propertyType: "Nhà", price: 4.5 });
    const pWrongType = createMockProp({ direction: "Đông", propertyType: "Đất", price: 4.5 });
    const pWrongPrice = createMockProp({ direction: "Đông", propertyType: "Nhà", price: 8.5 });

    expect(PropertyFilter.matches(pMatch1, filterCombo)).toBe(true);
    expect(PropertyFilter.matches(pMatch2, filterCombo)).toBe(true);
    expect(PropertyFilter.matches(pWrongDir, filterCombo)).toBe(false);
    expect(PropertyFilter.matches(pWrongType, filterCombo)).toBe(false);
    expect(PropertyFilter.matches(pWrongPrice, filterCombo)).toBe(false);
  });

  it("W002: Tập Đông tứ trạch [Đông, Nam, Bắc, Đông Nam] loại trừ Đông Bắc, Tây Bắc, Tây Nam, Tây", () => {
    const dongTuTrach = new Set(["Đông", "Nam", "Bắc", "Đông Nam"]);
    const filter: FilterState = { directions: dongTuTrach };

    // Khớp các hướng trong Đông tứ trạch
    expect(PropertyFilter.matches(createMockProp({ direction: "Đông" }), filter)).toBe(true);
    expect(PropertyFilter.matches(createMockProp({ direction: "Nam" }), filter)).toBe(true);
    expect(PropertyFilter.matches(createMockProp({ direction: "Bắc" }), filter)).toBe(true);
    expect(PropertyFilter.matches(createMockProp({ direction: "Đông Nam" }), filter)).toBe(true);

    // Không khớp các hướng thuộc Tây tứ trạch
    expect(PropertyFilter.matches(createMockProp({ direction: "Đông Bắc" }), filter)).toBe(false);
    expect(PropertyFilter.matches(createMockProp({ direction: "Tây Bắc" }), filter)).toBe(false);
    expect(PropertyFilter.matches(createMockProp({ direction: "Tây Nam" }), filter)).toBe(false);
    expect(PropertyFilter.matches(createMockProp({ direction: "Tây" }), filter)).toBe(false);
  });

  it("W002: Tập Tây tứ trạch [Tây, Đông Bắc, Tây Bắc, Tây Nam] loại trừ tập Đông tứ trạch", () => {
    const tayTuTrach = new Set(["Tây", "Đông Bắc", "Tây Bắc", "Tây Nam"]);
    const filter: FilterState = { directions: tayTuTrach };

    // Khớp các hướng trong Tây tứ trạch
    expect(PropertyFilter.matches(createMockProp({ direction: "Tây" }), filter)).toBe(true);
    expect(PropertyFilter.matches(createMockProp({ direction: "Đông Bắc" }), filter)).toBe(true);
    expect(PropertyFilter.matches(createMockProp({ direction: "Tây Bắc" }), filter)).toBe(true);
    expect(PropertyFilter.matches(createMockProp({ direction: "Tây Nam" }), filter)).toBe(true);

    // Không khớp các hướng thuộc Đông tứ trạch
    expect(PropertyFilter.matches(createMockProp({ direction: "Đông" }), filter)).toBe(false);
    expect(PropertyFilter.matches(createMockProp({ direction: "Nam" }), filter)).toBe(false);
    expect(PropertyFilter.matches(createMockProp({ direction: "Bắc" }), filter)).toBe(false);
    expect(PropertyFilter.matches(createMockProp({ direction: "Đông Nam" }), filter)).toBe(false);
  });

  it("W002: Không chọn hướng thì không lọc hướng, BĐS thiếu/rỗng hướng khi có chọn hướng sẽ bị loại", () => {
    const pHasDir = createMockProp({ direction: "Đông" });
    const pNull = createMockProp({ direction: null });
    const pUndefined = createMockProp({ direction: undefined });
    const pEmpty = createMockProp({ direction: "" });
    const pBlank = createMockProp({ direction: "   " });
    const pBlankPipes = createMockProp({ direction: "   |||   " });

    // Không chọn hướng (không truyền hoặc Set rỗng) -> không áp đặt điều kiện hướng
    expect(PropertyFilter.matches(pHasDir, {})).toBe(true);
    expect(PropertyFilter.matches(pNull, {})).toBe(true);
    expect(PropertyFilter.matches(pUndefined, {})).toBe(true);
    expect(PropertyFilter.matches(pEmpty, {})).toBe(true);
    expect(PropertyFilter.matches(pBlank, {})).toBe(true);

    expect(PropertyFilter.matches(pHasDir, { directions: new Set() })).toBe(true);
    expect(PropertyFilter.matches(pNull, { directions: new Set() })).toBe(true);
    expect(PropertyFilter.matches(pUndefined, { directions: new Set() })).toBe(true);
    expect(PropertyFilter.matches(pEmpty, { directions: new Set() })).toBe(true);
    expect(PropertyFilter.matches(pBlank, { directions: new Set() })).toBe(true);

    // Khi có chọn hướng -> BĐS thiếu hoặc trống hướng phải bị loại (false)
    const filterSelected: FilterState = { directions: new Set(["Đông"]) };
    expect(PropertyFilter.matches(pHasDir, filterSelected)).toBe(true);
    expect(PropertyFilter.matches(pNull, filterSelected)).toBe(false);
    expect(PropertyFilter.matches(pUndefined, filterSelected)).toBe(false);
    expect(PropertyFilter.matches(pEmpty, filterSelected)).toBe(false);
    expect(PropertyFilter.matches(pBlank, filterSelected)).toBe(false);
    expect(PropertyFilter.matches(pBlankPipes, filterSelected)).toBe(false);
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
