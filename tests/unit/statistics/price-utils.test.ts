import { describe, it, expect } from "vitest";
import { PriceUtils, PriceBucket } from "../../../src/core/statistics/price-utils";

describe("PriceUtilsTest", () => {
  it("test valid price and areaSize calculations", () => {
    // 2.0 Tỷ / 50 m² = 0.04 Tỷ/m² = 40.0 Triệu/m²
    expect(PriceUtils.isValidPriceAndArea(2.0, 50.0)).toBe(true);
    expect(PriceUtils.calculatePricePerM2(2.0, 50.0)).toBeCloseTo(0.04, 4);
    expect(PriceUtils.calculateDisplayPricePerM2(2.0, 50.0)).toBeCloseTo(40.0, 4);
  });

  it("test invalid price and areaSize return null and never throw or return zero", () => {
    // Zero or negative price
    expect(PriceUtils.isValidPriceAndArea(0.0, 50.0)).toBe(false);
    expect(PriceUtils.isValidPriceAndArea(-1.0, 50.0)).toBe(false);
    expect(PriceUtils.calculatePricePerM2(0.0, 50.0)).toBeNull();
    expect(PriceUtils.calculatePricePerM2(-1.0, 50.0)).toBeNull();
    expect(PriceUtils.calculateDisplayPricePerM2(0.0, 50.0)).toBeNull();

    // Zero or negative areaSize
    expect(PriceUtils.isValidPriceAndArea(2.0, 0.0)).toBe(false);
    expect(PriceUtils.isValidPriceAndArea(2.0, -10.0)).toBe(false);
    expect(PriceUtils.calculatePricePerM2(2.0, 0.0)).toBeNull();
    expect(PriceUtils.calculatePricePerM2(2.0, -10.0)).toBeNull();

    // Null inputs
    expect(PriceUtils.isValidPriceAndArea(null, 50.0)).toBe(false);
    expect(PriceUtils.isValidPriceAndArea(2.0, null)).toBe(false);
    expect(PriceUtils.calculatePricePerM2(null, 50.0)).toBeNull();
    expect(PriceUtils.calculatePricePerM2(2.0, null)).toBeNull();

    // Non-finite values
    expect(PriceUtils.isValidPriceAndArea(Number.NaN, 50.0)).toBe(false);
    expect(PriceUtils.isValidPriceAndArea(2.0, Number.POSITIVE_INFINITY)).toBe(false);
    expect(PriceUtils.calculatePricePerM2(Number.NaN, 50.0)).toBeNull();
    expect(PriceUtils.calculatePricePerM2(2.0, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it("test price buckets half-open intervals and boundary values", () => {
    // Under 2 tỷ: [0.0, 2.0)
    expect(PriceBucket.fromPrice(0.0)).toEqual(PriceBucket.UNDER_2);
    expect(PriceBucket.fromPrice(1.0)).toEqual(PriceBucket.UNDER_2);
    expect(PriceBucket.fromPrice(1.999)).toEqual(PriceBucket.UNDER_2);

    // 2–3 tỷ: [2.0, 3.0) -> Exactly 2.0 falls into 2-3 tỷ, NOT under 2
    expect(PriceBucket.fromPrice(2.0)).toEqual(PriceBucket.FROM_2_TO_3);
    expect(PriceBucket.fromPrice(2.5)).toEqual(PriceBucket.FROM_2_TO_3);
    expect(PriceBucket.fromPrice(2.999)).toEqual(PriceBucket.FROM_2_TO_3);

    // 3–5 tỷ: [3.0, 5.0) -> Exactly 3.0 falls into 3-5 tỷ
    expect(PriceBucket.fromPrice(3.0)).toEqual(PriceBucket.FROM_3_TO_5);
    expect(PriceBucket.fromPrice(4.0)).toEqual(PriceBucket.FROM_3_TO_5);
    expect(PriceBucket.fromPrice(4.999)).toEqual(PriceBucket.FROM_3_TO_5);

    // 5–7 tỷ: [5.0, 7.0) -> Exactly 5.0 falls into 5-7 tỷ
    expect(PriceBucket.fromPrice(5.0)).toEqual(PriceBucket.FROM_5_TO_7);
    expect(PriceBucket.fromPrice(6.0)).toEqual(PriceBucket.FROM_5_TO_7);
    expect(PriceBucket.fromPrice(6.999)).toEqual(PriceBucket.FROM_5_TO_7);

    // >= 7 tỷ: [7.0, +Infinity) -> Exactly 7.0 falls into >= 7 tỷ
    expect(PriceBucket.fromPrice(7.0)).toEqual(PriceBucket.FROM_7_AND_ABOVE);
    expect(PriceBucket.fromPrice(15.0)).toEqual(PriceBucket.FROM_7_AND_ABOVE);
    expect(PriceBucket.fromPrice(100.0)).toEqual(PriceBucket.FROM_7_AND_ABOVE);

    // Invalid prices
    expect(PriceBucket.fromPrice(-1.0)).toBeNull();
    expect(PriceBucket.fromPrice(null)).toBeNull();
    expect(PriceBucket.fromPrice(Number.NaN)).toBeNull();
    expect(PriceBucket.fromPrice(Number.POSITIVE_INFINITY)).toBeNull();
  });
});
