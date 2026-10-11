/**
 * Pure price utility for unit price calculations and price range bucket classifications.
 *
 * Implements calculations and boundaries strictly according to plans/STATISTICS_DATA_CONTRACT.md v1.2.1:
 * - Section 3.3 (Price-Bucket Half-Open Boundaries)
 * - Section 6.1, 6.2 (Price validation rules)
 *
 * Storage units:
 * - price: Tỷ VNĐ
 * - areaSize: m²
 * - pricePerM2: Tỷ VNĐ / m²
 * - displayPricePerM2: Triệu VNĐ / m² (Tỷ * 1000 / m²)
 */

export interface IPriceBucket {
  readonly name: string;
  readonly label: string;
  readonly minInclusive: number;
  readonly maxExclusive: number;
  contains(price: number | null | undefined): boolean;
}

export class PriceBucketItem implements IPriceBucket {
  constructor(
    public readonly name: string,
    public readonly label: string,
    public readonly minInclusive: number,
    public readonly maxExclusive: number
  ) {}

  contains(price: number | null | undefined): boolean {
    if (price == null || !Number.isFinite(price) || Number.isNaN(price) || price < 0.0) {
      return false;
    }
    return price >= this.minInclusive && price < this.maxExclusive;
  }
}

const BUCKET_UNDER_2 = new PriceBucketItem("UNDER_2", "< 2 tỷ", 0.0, 2.0);
const BUCKET_FROM_2_TO_3 = new PriceBucketItem("FROM_2_TO_3", "2–3 tỷ", 2.0, 3.0);
const BUCKET_FROM_3_TO_5 = new PriceBucketItem("FROM_3_TO_5", "3–5 tỷ", 3.0, 5.0);
const BUCKET_FROM_5_TO_7 = new PriceBucketItem("FROM_5_TO_7", "5–7 tỷ", 5.0, 7.0);
const BUCKET_FROM_7_AND_ABOVE = new PriceBucketItem("FROM_7_AND_ABOVE", "≥ 7 tỷ", 7.0, Infinity);

const ALL_PRICE_BUCKETS: PriceBucketItem[] = [
  BUCKET_UNDER_2,
  BUCKET_FROM_2_TO_3,
  BUCKET_FROM_3_TO_5,
  BUCKET_FROM_5_TO_7,
  BUCKET_FROM_7_AND_ABOVE
];

export const PriceBucket = {
  UNDER_2: BUCKET_UNDER_2,
  FROM_2_TO_3: BUCKET_FROM_2_TO_3,
  FROM_3_TO_5: BUCKET_FROM_3_TO_5,
  FROM_5_TO_7: BUCKET_FROM_5_TO_7,
  FROM_7_AND_ABOVE: BUCKET_FROM_7_AND_ABOVE,

  values(): PriceBucketItem[] {
    return ALL_PRICE_BUCKETS;
  },

  fromPrice(price: number | null | undefined): PriceBucketItem | null {
    if (price == null || !Number.isFinite(price) || Number.isNaN(price) || price < 0.0) {
      return null;
    }
    return ALL_PRICE_BUCKETS.find((b) => b.contains(price)) ?? null;
  }
};

export type PriceBucket = PriceBucketItem;

export const PriceUtils = {
  /** Một chữ số thập phân, dấu phẩy kiểu VN: 12.34 → "12,3". */
  formatOneDecimal(value: number): string {
    return value.toFixed(1).replace(".", ",");
  },

  /**
   * Checks if both price and areaSize can form a valid unit price.
   * Both values must be non-null, strictly positive (> 0.0), and finite (!NaN, !Infinite).
   */
  isValidPriceAndArea(
    price: number | null | undefined,
    areaSize: number | null | undefined
  ): boolean {
    if (price == null || areaSize == null) return false;
    return (
      price > 0.0 &&
      areaSize > 0.0 &&
      Number.isFinite(price) &&
      Number.isFinite(areaSize) &&
      !Number.isNaN(price) &&
      !Number.isNaN(areaSize)
    );
  },

  /**
   * Calculates unit price in storage unit: Tỷ VNĐ / m².
   *
   * @return price / areaSize if both values are valid, strictly positive, and finite;
   *         null otherwise. Never returns NaN or Infinity, and never falls back to 0.0.
   */
  calculatePricePerM2(
    price: number | null | undefined,
    areaSize: number | null | undefined
  ): number | null {
    if (!PriceUtils.isValidPriceAndArea(price, areaSize)) return null;
    const result = price! / areaSize!;
    return Number.isFinite(result) && !Number.isNaN(result) && result > 0.0 ? result : null;
  },

  /**
   * Calculates unit price for UI display: Triệu VNĐ / m² (Tỷ * 1000 / m²).
   *
   * @return price * 1000.0 / areaSize if valid; null otherwise.
   */
  calculateDisplayPricePerM2(
    price: number | null | undefined,
    areaSize: number | null | undefined
  ): number | null {
    const perM2 = PriceUtils.calculatePricePerM2(price, areaSize);
    if (perM2 == null) return null;
    const display = perM2 * 1000.0;
    return Number.isFinite(display) && !Number.isNaN(display) && display > 0.0 ? display : null;
  },

  PriceBucket
};
