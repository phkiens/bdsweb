import { describe, expect, it } from "vitest";
import fixture from "../fixtures/match-engine.v1.json";
import { MatchEngine } from "../../src/core/engine/match-engine";
import { Customer } from "../../src/core/models/customer";
import { Property } from "../../src/core/models/property";

describe("MatchEngine Contract Fixture Tests (match-engine.v1.json)", () => {
  const engine = new MatchEngine();

  for (const testCase of fixture.cases) {
    it(`Case ${testCase.id}: ${testCase.description}`, () => {
      const customer = {
        id: testCase.customer.id,
        name: testCase.customer.id,
        phone: "0900000000",
        demandType: "Cần mua",
        propertyType: testCase.customer.propertyType,
        demandAreas: testCase.customer.demandAreas,
        demandDirections: testCase.customer.demandDirections,
        priceMin: testCase.customer.priceMin,
        priceMax: testCase.customer.priceMax,
        note: "",
        status: testCase.customer.status,
        role: "BUYER",
        updatedAt: Date.now(),
        isSynced: true,
        isDeleted: false
      } as unknown as Customer;

      const property = {
        id: testCase.property.id,
        area: testCase.property.area,
        price: testCase.property.price,
        status: testCase.property.status,
        direction: testCase.property.direction,
        propertyType: testCase.property.propertyType,
        description: "",
        rawText: "",
        ownerName: "",
        ownerPhone: "",
        updatedAt: Date.now(),
        isVerified: true,
        isDeleted: false
      } as unknown as Property;

      const result = engine.score(customer, property);

      expect(result.score).toBe(testCase.expected.score);
      expect(result.matchingReasons).toEqual(testCase.expected.matchingReasons);
      expect(result.warnings).toEqual(testCase.expected.warnings);
    });
  }
});
