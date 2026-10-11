/**
 * Immutable configuration for the Opportunity Radar engine.
 *
 * Implements constants and validation according to Data Contract v1.2.2.
 */
export interface RadarConfigOptions {
  minimumSample?: number;
  goodSample?: number;
  minimumComparatorAreas?: number;
  lowPriceThresholdPercent?: number;
  highPriceThresholdPercent?: number;
  priceWeight?: number;
  liquidityWeight?: number;
  ageWeight?: number;
  supplyWeight?: number;
  confidenceWeight?: number;
}

export class RadarConfig {
  public readonly minimumSample: number;
  public readonly goodSample: number;
  public readonly minimumComparatorAreas: number;
  public readonly lowPriceThresholdPercent: number;
  public readonly highPriceThresholdPercent: number;
  public readonly priceWeight: number;
  public readonly liquidityWeight: number;
  public readonly ageWeight: number;
  public readonly supplyWeight: number;
  public readonly confidenceWeight: number;

  constructor(options: RadarConfigOptions = {}) {
    this.minimumSample = options.minimumSample ?? 5;
    this.goodSample = options.goodSample ?? 10;
    this.minimumComparatorAreas = options.minimumComparatorAreas ?? 2;
    this.lowPriceThresholdPercent = options.lowPriceThresholdPercent ?? -5.0;
    this.highPriceThresholdPercent = options.highPriceThresholdPercent ?? 10.0;
    this.priceWeight = options.priceWeight ?? 0.35;
    this.liquidityWeight = options.liquidityWeight ?? 0.30;
    this.ageWeight = options.ageWeight ?? 0.20;
    this.supplyWeight = options.supplyWeight ?? 0.10;
    this.confidenceWeight = options.confidenceWeight ?? 0.05;

    if (this.minimumSample <= 0) {
      throw new Error(`minimumSample must be > 0: ${this.minimumSample}`);
    }
    if (this.goodSample < this.minimumSample) {
      throw new Error(
        `goodSample (${this.goodSample}) must be >= minimumSample (${this.minimumSample})`
      );
    }
    if (this.minimumComparatorAreas < 2) {
      throw new Error(
        `minimumComparatorAreas must be >= 2: ${this.minimumComparatorAreas}`
      );
    }
    if (!Number.isFinite(this.lowPriceThresholdPercent) || Number.isNaN(this.lowPriceThresholdPercent)) {
      throw new Error(`lowPriceThresholdPercent must be finite: ${this.lowPriceThresholdPercent}`);
    }
    if (!Number.isFinite(this.highPriceThresholdPercent) || Number.isNaN(this.highPriceThresholdPercent)) {
      throw new Error(`highPriceThresholdPercent must be finite: ${this.highPriceThresholdPercent}`);
    }
    if (this.lowPriceThresholdPercent >= this.highPriceThresholdPercent) {
      throw new Error(
        `lowPriceThresholdPercent (${this.lowPriceThresholdPercent}) must be < highPriceThresholdPercent (${this.highPriceThresholdPercent})`
      );
    }

    const weights = [
      this.priceWeight,
      this.liquidityWeight,
      this.ageWeight,
      this.supplyWeight,
      this.confidenceWeight
    ];
    for (const w of weights) {
      if (!Number.isFinite(w) || Number.isNaN(w) || w < 0.0 || w > 1.0) {
        throw new Error(`Weight must be finite and in [0.0, 1.0]: ${w}`);
      }
    }
    const sum = weights.reduce((acc, cur) => acc + cur, 0);
    if (Math.abs(sum - 1.0) > 1e-9) {
      throw new Error(`Sum of weights must equal 1.0 (within 1e-9 tolerance): ${sum}`);
    }
  }
}
