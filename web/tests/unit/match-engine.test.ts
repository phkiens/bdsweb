import { describe, expect, it } from "vitest";
import { MatchEngine } from "../../src/core/engine/match-engine";
import { CustomerRole, CustomerStatus, PropertyStatus, PropertyType } from "../../src/core/models/enums";
import { createDefaultProperty } from "../../src/core/models/property";
import { Customer } from "../../src/core/models/customer";

describe("MatchEngine Scoring (100 Points Scale)", () => {
  const engine = new MatchEngine();

  const baseCustomer: Customer = {
    id: "cust-1",
    name: "Nguyễn Văn A",
    nameNormalized: "nguyen van a",
    phone: "0901234567",
    demandType: "Cần mua",
    propertyType: PropertyType.HOUSE,
    demandAreas: "Bình Thạnh|||Quận 1",
    demandDirections: "Đông Nam",
    priceMin: 3.0,
    priceMax: 5.0,
    note: "Tìm nhà hẻm xe hơi",
    noteNormalized: "tim nha hem xe hoi",
    role: CustomerRole.BUYER,
    status: CustomerStatus.ACTIVE,
    updatedAt: Date.now(),
    isSynced: true,
    isDeleted: false,
    avatarPath: null,
    avatarDriveUrl: null
  };

  it("scores 100 for perfect match", () => {
    const property = createDefaultProperty({
      propertyType: PropertyType.HOUSE,
      price: 4.5,
      area: "Phường 25, Quận Bình Thạnh",
      direction: "Đông Nam",
      status: PropertyStatus.FOR_SALE
    });

    const result = engine.score(baseCustomer, property);
    expect(result.score).toBe(100);
    expect(result.warnings).toHaveLength(0);
  });

  it("returns 0 score if property is not FOR_SALE (hard exclusion)", () => {
    const property = createDefaultProperty({
      propertyType: PropertyType.HOUSE,
      price: 4.5,
      area: "Bình Thạnh",
      status: PropertyStatus.SOLD
    });

    const result = engine.score(baseCustomer, property);
    expect(result.score).toBe(0);
    expect(result.warnings[0]).toContain("đã bán");
  });

  it("returns 0 score if customer is CLOSED (hard exclusion)", () => {
    const closedCustomer = { ...baseCustomer, status: CustomerStatus.CLOSED };
    const property = createDefaultProperty({
      propertyType: PropertyType.HOUSE,
      price: 4.5,
      area: "Bình Thạnh",
      status: PropertyStatus.FOR_SALE
    });

    const result = engine.score(closedCustomer, property);
    expect(result.score).toBe(0);
    expect(result.warnings[0]).toContain("đã đóng");
  });

  it("returns 0 score if property type mismatches (Step 1 mandatory 40 pts)", () => {
    const property = createDefaultProperty({
      propertyType: PropertyType.LAND, // Customer wants HOUSE
      price: 4.5,
      area: "Bình Thạnh",
      status: PropertyStatus.FOR_SALE
    });

    const result = engine.score(baseCustomer, property);
    expect(result.score).toBe(0);
    expect(result.warnings[0]).toContain("Khác loại hình");
  });

  it("awards 30 pts when budget is flexible (no price range)", () => {
    const flexCustomer = { ...baseCustomer, priceMin: 0, priceMax: 0 };
    const property = createDefaultProperty({
      propertyType: PropertyType.HOUSE,
      price: 15.0,
      area: "Bình Thạnh",
      direction: "Đông Nam",
      status: PropertyStatus.FOR_SALE
    });

    const result = engine.score(flexCustomer, property);
    expect(result.score).toBe(100); // 40 type + 30 flex price + 20 area + 10 direction
  });

  it("penalizes price exceeding budget by delta brackets", () => {
    // Max price is 5.0. If price is 5.4 (exceeds by 8% <= 10%) -> +15 pts
    const propertyOver10 = createDefaultProperty({
      propertyType: PropertyType.HOUSE,
      price: 5.4,
      area: "Bình Thạnh",
      direction: "Đông Nam",
      status: PropertyStatus.FOR_SALE
    });
    const resOver10 = engine.score(baseCustomer, propertyOver10);
    expect(resOver10.score).toBe(85); // 40 + 15 + 20 + 10 = 85

    // If price is 5.8 (exceeds by 16% <= 20%) -> +5 pts
    const propertyOver20 = createDefaultProperty({
      propertyType: PropertyType.HOUSE,
      price: 5.8,
      area: "Bình Thạnh",
      direction: "Đông Nam",
      status: PropertyStatus.FOR_SALE
    });
    const resOver20 = engine.score(baseCustomer, propertyOver20);
    expect(resOver20.score).toBe(75); // 40 + 5 + 20 + 10 = 75
  });
});
