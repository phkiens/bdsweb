import { describe, it, expect } from "vitest";
import { MedianUtils } from "../../../src/core/statistics/median-utils";

describe("MedianUtilsTest", () => {
  it("test empty and null inputs return null", () => {
    expect(MedianUtils.calculatePercentile(null, 0.5)).toBeNull();
    expect(MedianUtils.calculatePercentile([], 0.5)).toBeNull();
    expect(MedianUtils.calculateMedian(null)).toBeNull();
    expect(MedianUtils.calculateMedian([])).toBeNull();
    expect(MedianUtils.calculateP25([])).toBeNull();
    expect(MedianUtils.calculateP75([])).toBeNull();
  });

  it("test non-finite values are filtered out", () => {
    const list = [NaN, Infinity, -Infinity, null];
    expect(MedianUtils.calculateMedian(list)).toBeNull();

    const mixed = [NaN, 10.0, Infinity, null, 20.0];
    expect(MedianUtils.calculateMedian(mixed)).toBeCloseTo(15.0, 3);
  });

  it("test single element returns that element for any p", () => {
    const list = [42.0];
    expect(MedianUtils.calculatePercentile(list, 0.0)).toBeCloseTo(42.0, 3);
    expect(MedianUtils.calculatePercentile(list, 0.5)).toBeCloseTo(42.0, 3);
    expect(MedianUtils.calculatePercentile(list, 1.0)).toBeCloseTo(42.0, 3);
    expect(MedianUtils.calculateP25(list)).toBeCloseTo(42.0, 3);
    expect(MedianUtils.calculateP75(list)).toBeCloseTo(42.0, 3);
  });

  it("test boundary p=0 returns first and p=1 returns last element", () => {
    const list = [10.0, 20.0, 30.0, 40.0, 50.0];
    expect(MedianUtils.calculatePercentile(list, 0.0)).toBeCloseTo(10.0, 3);
    expect(MedianUtils.calculatePercentile(list, 1.0)).toBeCloseTo(50.0, 3);
  });

  it("test median with odd number of elements", () => {
    // N = 3: index (3-1)/2 = 1 -> value 20.0
    const oddList = [30.0, 10.0, 20.0];
    expect(MedianUtils.calculateMedian(oddList)).toBeCloseTo(20.0, 3);

    // N = 5: index (5-1)/2 = 2 -> value 3.0
    const odd5 = [1.0, 2.0, 3.0, 4.0, 5.0];
    expect(MedianUtils.calculateMedian(odd5)).toBeCloseTo(3.0, 3);
  });

  it("test median with even number of elements", () => {
    // N = 4: indices 1 and 2 -> (20 + 30) / 2 = 25.0
    const evenList = [40.0, 10.0, 30.0, 20.0];
    expect(MedianUtils.calculateMedian(evenList)).toBeCloseTo(25.0, 3);

    // N = 2: (10 + 20) / 2 = 15.0
    const even2 = [20.0, 10.0];
    expect(MedianUtils.calculateMedian(even2)).toBeCloseTo(15.0, 3);
  });

  it("test P25 and P75 linear interpolation", () => {
    // N = 5: [10, 20, 30, 40, 50]
    // h_25 = 4 * 0.25 = 1.0 -> index 1 -> 20.0
    // h_75 = 4 * 0.75 = 3.0 -> index 3 -> 40.0
    const list5 = [10.0, 20.0, 30.0, 40.0, 50.0];
    expect(MedianUtils.calculateP25(list5)).toBeCloseTo(20.0, 3);
    expect(MedianUtils.calculateP75(list5)).toBeCloseTo(40.0, 3);

    // N = 4: [10, 20, 30, 40]
    // h_25 = 3 * 0.25 = 0.75 -> i=0, f=0.75 -> 10 + 0.75 * (20 - 10) = 17.5
    // h_75 = 3 * 0.75 = 2.25 -> i=2, f=0.25 -> 30 + 0.25 * (40 - 30) = 32.5
    const list4 = [10.0, 20.0, 30.0, 40.0];
    expect(MedianUtils.calculateP25(list4)).toBeCloseTo(17.5, 3);
    expect(MedianUtils.calculateP75(list4)).toBeCloseTo(32.5, 3);
  });

  it("test invalid p throws IllegalArgumentException", () => {
    const list = [1.0, 2.0, 3.0];
    expect(() => MedianUtils.calculatePercentile(list, -0.01)).toThrow();
    expect(() => MedianUtils.calculatePercentile(list, 1.01)).toThrow();
  });
});
