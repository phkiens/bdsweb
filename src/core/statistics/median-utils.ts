/**
 * Pure statistical utility for calculating percentiles and medians.
 *
 * Implements the Hyndman-Fan Method 7 (R-7 Linear Interpolation / Excel PERCENTILE.INC / NumPy default)
 * strictly according to plans/STATISTICS_DATA_CONTRACT.md v1.2.1 Section 3.2.
 */
export const MedianUtils = {
  /**
   * Calculates the p-th percentile of values using R-7 linear interpolation.
   *
   * Non-finite values (NaN, Infinity, -Infinity) and nulls are filtered out.
   *
   * @param values collection of numeric values.
   * @param p percentile rank, strictly required to be in [0.0, 1.0].
   * @return calculated percentile, or null if values contains no valid finite elements.
   * @throws Error if p is not in [0.0, 1.0].
   */
  calculatePercentile(
    values: Iterable<number | null | undefined> | null | undefined,
    p: number
  ): number | null {
    if (values == null) return null;
    if (p < 0.0 || p > 1.0 || !Number.isFinite(p) || Number.isNaN(p)) {
      throw new Error(`Percentile rank p must be in range [0.0, 1.0], but was ${p}`);
    }

    const validSorted: number[] = [];
    for (const v of values) {
      if (v != null && Number.isFinite(v) && !Number.isNaN(v)) {
        validSorted.push(v);
      }
    }
    validSorted.sort((a, b) => a - b);

    const n = validSorted.length;
    if (n === 0) return null;
    if (n === 1) return validSorted[0];
    if (p === 0.0) return validSorted[0];
    if (p === 1.0) return validSorted[n - 1];

    const h = (n - 1) * p;
    const i = Math.floor(h);
    const f = h - i;

    if (i < n - 1) {
      return validSorted[i] + f * (validSorted[i + 1] - validSorted[i]);
    } else {
      return validSorted[n - 1];
    }
  },

  /**
   * Calculates median (P50) using R-7 linear interpolation.
   */
  calculateMedian(
    values: Iterable<number | null | undefined> | null | undefined
  ): number | null {
    return MedianUtils.calculatePercentile(values, 0.5);
  },

  /**
   * Calculates 25th percentile (P25 / Q1) using R-7 linear interpolation.
   */
  calculateP25(
    values: Iterable<number | null | undefined> | null | undefined
  ): number | null {
    return MedianUtils.calculatePercentile(values, 0.25);
  },

  /**
   * Calculates 75th percentile (P75 / Q3) using R-7 linear interpolation.
   */
  calculateP75(
    values: Iterable<number | null | undefined> | null | undefined
  ): number | null {
    return MedianUtils.calculatePercentile(values, 0.75);
  }
};
