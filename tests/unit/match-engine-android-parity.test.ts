import { describe, expect, it } from "vitest";
import {
  calculateAreaMatchScore,
  calculateDirectionMatch,
  isAnyAreaDemand,
  MatchEngine
} from "../../src/core/engine/match-engine";
import { CustomerRole, CustomerStatus, PropertyStatus } from "../../src/core/models/enums";
import { Customer } from "../../src/core/models/customer";
import { Property } from "../../src/core/models/property";

describe("MatchEngine Android Parity Tests (Diff 4)", () => {
  const engine = new MatchEngine();

  const createCustomer = (overrides: Partial<Customer> = {}): Customer => ({
    id: "cust-test",
    name: "Test Buyer",
    nameNormalized: "test buyer",
    phone: "123",
    demandType: "Cần mua",
    propertyType: "Nhà",
    demandAreas: "quan 1",
    demandDirections: "Đông",
    priceMin: 1.0,
    priceMax: 5.0,
    note: "",
    noteNormalized: "",
    role: CustomerRole.BUYER,
    status: CustomerStatus.ACTIVE,
    updatedAt: Date.now(),
    isSynced: true,
    isDeleted: false,
    avatarPath: null,
    avatarDriveUrl: null,
    ...overrides
  });

  const createProperty = (overrides: Partial<Property> = {}): Property => ({
    id: "prop-test",
    area: "quan 1",
    latitude: 0,
    longitude: 0,
    areaSize: 50.0,
    price: 3.0,
    description: "",
    rawText: "",
    status: PropertyStatus.FOR_SALE,
    direction: "Đông",
    propertyType: "Nhà",
    ownerName: "Chủ",
    ownerPhone: "0900000000",
    updatedAt: Date.now(),
    isVerified: true,
    isDeleted: false,
    ...overrides
  });

  // commit d1312a9: Cùng trạch = 8 điểm
  describe("Direction same trach group matching (d1312a9)", () => {
    it("testSameTrachGroupDirectionMatching", () => {
      const customer = createCustomer({
        name: "Test Buyer",
        phone: "123",
        demandType: "Cần mua",
        propertyType: "Nhà",
        demandAreas: "quan 1",
        demandDirections: "Đông",
        priceMin: 1.0,
        priceMax: 5.0,
        status: CustomerStatus.ACTIVE
      });

      const propertyExact = createProperty({
        area: "quan 1",
        areaSize: 50.0,
        price: 3.0,
        status: PropertyStatus.FOR_SALE,
        direction: "Đông",
        propertyType: "Nhà"
      });

      const propertySameGroup = { ...propertyExact, direction: "Nam" };

      const resExact = engine.score(customer, propertyExact);
      const resSameGroup = engine.score(customer, propertySameGroup);

      expect(resSameGroup.matchingReasons).toContain("Cùng Đông tứ trạch (Nam)");
      expect(resSameGroup.score).toBe(resExact.score - 2);
    });

    it("calculateDirectionMatch_sameTrachGroupScores8", () => {
      const m1 = calculateDirectionMatch("Nam", "Đông");
      expect(m1.score).toBe(8);
      expect(m1.sameGroupLabel).toBe("Đông tứ trạch");

      const m2 = calculateDirectionMatch("Bắc", "Đông");
      expect(m2.score).toBe(8);

      const m3 = calculateDirectionMatch("Đông", "Đông");
      expect(m3.score).toBe(10);
      expect(m3.sameGroupLabel).toBeFalsy();

      const m4 = calculateDirectionMatch("Tây", "Đông");
      expect(m4.score).toBe(0);

      const m5 = calculateDirectionMatch("Đông Bắc", "Đông");
      expect(m5.score).toBe(0);

      const m6 = calculateDirectionMatch("Tây Nam", "Tây Bắc");
      expect(m6.score).toBe(8);
      expect(m6.sameGroupLabel).toBe("Tây tứ trạch");

      const m7 = calculateDirectionMatch("Tây Nam", "Đông|||Tây");
      expect(m7.score).toBe(8);

      const m8 = calculateDirectionMatch("Nam|||Tây", "Nam");
      expect(m8.score).toBe(10);

      const matchTayTayBac = calculateDirectionMatch("Tây Bắc", "Tây");
      expect(matchTayTayBac.score).toBe(8);

      const matchBacDongBac = calculateDirectionMatch("Đông Bắc", "Bắc");
      expect(matchBacDongBac.score).toBe(0);

      const matchExact = calculateDirectionMatch("Đông Bắc", "Đông Bắc");
      expect(matchExact.score).toBe(10);

      const matchBlank = calculateDirectionMatch("Đông", "");
      expect(matchBlank.score).toBe(10);

      const matchBatKy = calculateDirectionMatch("Tây", "bất kỳ");
      expect(matchBatKy.score).toBe(10);

      const matchJunk = calculateDirectionMatch("Tây", "top");
      expect(matchJunk.score).toBe(0);

      const matchMixedAny = calculateDirectionMatch("Tây", "any|||top");
      expect(matchMixedAny.score).toBe(0);

      const matchLegacy = calculateDirectionMatch("dong", "dong");
      expect(matchLegacy.score).toBe(10);

      const matchLegacyMixed = calculateDirectionMatch("dong", "Đông");
      expect(matchLegacyMixed.score).toBe(10);

      const matchMultiProp = calculateDirectionMatch("Tây|||Nam", "Nam");
      expect(matchMultiProp.score).toBe(10);
    });
  });

  // commit c71d210: B1 price bounds
  describe("B1: MatchEnginePriceBoundsTest", () => {
    const customer = createCustomer({
      name: "Khách",
      phone: "0900000000",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0.0,
      priceMax: 0.0
    });

    const property = createProperty({
      area: "",
      areaSize: 50.0,
      price: 5.0,
      direction: "",
      propertyType: "Nhà"
    });

    it("chi co gia toi thieu - can dat hon van khop khoang gia", () => {
      const res = engine.score({ ...customer, priceMin: 3.0 }, property);
      expect(res.score).toBe(100);
      expect(res.matchingReasons).toContain("Khớp khoảng giá");
      expect(res.warnings.some((w) => w.includes("Vượt ngân sách"))).toBe(false);
    });

    it("chi co gia toi thieu - can re hon van tinh theo muc thap", () => {
      const res = engine.score({ ...customer, priceMin: 10.0 }, { ...property, price: 9.0 });
      expect(res.score).toBe(95);
      expect(res.matchingReasons).toContain("Giá tốt hơn mong đợi");
    });

    it("chi co gia toi da - can re hon khop, dat hon bi canh bao dung phan tram", () => {
      expect(engine.score({ ...customer, priceMax: 6.0 }, property).score).toBe(100);

      const over = engine.score({ ...customer, priceMax: 4.8 }, { ...property, price: 5.0 });
      expect(over.score).toBe(85);
      expect(over.warnings).toContain("Vượt ngân sách nhẹ (+4%)");
    });
  });

  // commit b5deb58: B3 strip admin prefix only once
  describe("B3: AreaPrefixStripTest", () => {
    it("phuong quan hoa khong bi rut thanh hoa", () => {
      expect(calculateAreaMatchScore("Phường Quan Hoa", "Phường Quan Hoa")).toBe(20);
      expect(calculateAreaMatchScore("Hòa Xuân", "Phường Quan Hoa")).toBeLessThan(18);
    });
  });

  // commit a37299b: B2 area whole words match
  describe("B2: AreaMatchScoreTest", () => {
    it("quan 1 khong khop quan 10", () => {
      expect(calculateAreaMatchScore("Quận 10", "Quận 1")).toBe(0);
      expect(calculateAreaMatchScore("Quận 1", "Q10")).toBe(0);
      expect(calculateAreaMatchScore("Phường 15", "Phường 1")).toBe(0);
    });

    it("van khop dung va khop gan dung theo nguyen tu", () => {
      expect(calculateAreaMatchScore("Quận 1", "Q1")).toBe(20);
      expect(calculateAreaMatchScore("Kênh Dương Lê Chân", "Kênh Dương")).toBe(18);
      expect(calculateAreaMatchScore("Hòa Xuân", "Phường Hòa Xuân Cẩm Lệ")).toBe(18);
    });
  });

  // commit 78eafd0: B7 isAnyAreaDemand
  describe("B7: MatchEngineAreaAnyTest", () => {
    const customer = createCustomer({
      name: "Khách",
      phone: "0900000000",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0.0,
      priceMax: 0.0
    });

    const property = createProperty({
      area: "Hòa Xuân",
      areaSize: 50.0,
      price: 5.0,
      direction: "",
      propertyType: "Nhà"
    });

    it("nhu cau khu vuc chi gom dau phan cach la bat ky", () => {
      const res = engine.score({ ...customer, demandAreas: "|||" }, property);
      expect(res.score).toBe(100);
      expect(res.matchingReasons).toContain("Khu vực bất kỳ");
    });

    it("diem va nhan dung chung mot dinh nghia bat ky", () => {
      for (const raw of ["", "|||", "Bất kỳ", "any|||Hòa Xuân", " batky "]) {
        expect(isAnyAreaDemand(raw)).toBe(true);
        expect(calculateAreaMatchScore("Cẩm Lệ", raw)).toBe(20);
      }
      expect(isAnyAreaDemand("Hòa Xuân")).toBe(false);
    });
  });
});
