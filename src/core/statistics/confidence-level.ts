/**
 * Three-tier sample confidence level according to Data Contract v1.2.2 Section 8.1.
 *
 * Explicit ranking:
 * - LOW: rank = 1 (< 5 samples)
 * - MEDIUM: rank = 2 (5..9 samples)
 * - GOOD: rank = 3 (>= 10 samples)
 */
export interface IConfidenceLevel {
  readonly rank: number;
  readonly label: string;
  readonly name: string;
}

export class ConfidenceLevelItem implements IConfidenceLevel {
  constructor(
    public readonly name: string,
    public readonly rank: number,
    public readonly label: string
  ) {}
}

const CONFIDENCE_LOW = new ConfidenceLevelItem("LOW", 1, "Kém tin cậy");
const CONFIDENCE_MEDIUM = new ConfidenceLevelItem("MEDIUM", 2, "Tham khảo");
const CONFIDENCE_GOOD = new ConfidenceLevelItem("GOOD", 3, "Tin cậy cao");

export const ConfidenceLevel = {
  LOW: CONFIDENCE_LOW,
  MEDIUM: CONFIDENCE_MEDIUM,
  GOOD: CONFIDENCE_GOOD
};

export type ConfidenceLevel = ConfidenceLevelItem;

/**
 * Converts sample count to ConfidenceLevel with non-negative validation.
 *
 * @param count sample count, must be >= 0.
 * @return ConfidenceLevel.GOOD if count >= 10, ConfidenceLevel.MEDIUM if count >= 5, ConfidenceLevel.LOW otherwise.
 * @throws Error if count < 0.
 */
export function sampleCountToConfidence(count: number): ConfidenceLevel {
  if (count < 0 || !Number.isFinite(count) || Number.isNaN(count)) {
    throw new Error(`sample count must be non-negative: ${count}`);
  }
  if (count >= 10) return ConfidenceLevel.GOOD;
  if (count >= 5) return ConfidenceLevel.MEDIUM;
  return ConfidenceLevel.LOW;
}

/**
 * Returns minimum / worst-of confidence among multiple levels based on ConfidenceLevel.rank.
 * Strictly does NOT rely on enum ordinal.
 */
export function minConfidence(...levels: ConfidenceLevel[]): ConfidenceLevel {
  if (levels.length === 0) return ConfidenceLevel.LOW;
  let min = levels[0];
  for (let i = 1; i < levels.length; i++) {
    if (levels[i].rank < min.rank) {
      min = levels[i];
    }
  }
  return min;
}
