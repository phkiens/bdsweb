import { describe, expect, it } from "vitest";
import { RouteOptimizer, RoutePoint } from "../../src/core/engine/route-optimizer";

describe("RouteOptimizer TSP", () => {
  it("filters out invalid coordinates (0,0 or NaN)", () => {
    const points: RoutePoint[] = [
      { id: "1", latitude: 10.77, longitude: 106.70, title: "Valid Point 1" },
      { id: "2", latitude: 0, longitude: 0, title: "Invalid Point" },
      { id: "3", latitude: 10.78, longitude: 106.71, title: "Valid Point 2" }
    ];

    const result = RouteOptimizer.optimize(null, points);
    expect(result.invalidPointsCount).toBe(1);
    expect(result.optimizedPoints).toHaveLength(2);
  });

  it("permutes routes <= 7 points to find the shortest total distance", () => {
    // 3 colinear points: A (0,0), B (0, 1), C (0, 2)
    // If start is at (0,0) and points are in reverse order [C, B, A], optimal order must be [A, B, C]
    const points: RoutePoint[] = [
      { id: "C", latitude: 10.79, longitude: 106.70, title: "Point C" },
      { id: "A", latitude: 10.77, longitude: 106.70, title: "Point A" },
      { id: "B", latitude: 10.78, longitude: 106.70, title: "Point B" }
    ];

    const start: [number, number] = [10.76, 106.70];
    const result = RouteOptimizer.optimize(start, points);

    expect(result.optimizedPoints.map((p) => p.id)).toEqual(["A", "B", "C"]);
  });
});
