import { calculateDistanceKm } from "../utils/coordinates";

export interface RoutePoint {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
}

export interface OptimizationResult<T extends RoutePoint> {
  optimizedPoints: T[];
  invalidPointsCount: number;
}

function isValidCoordinate(lat: number, lng: number): boolean {
  return lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export class RouteOptimizer {
  public static optimize<T extends RoutePoint>(
    start: [number, number] | null,
    points: T[]
  ): OptimizationResult<T> {
    const validPoints = points.filter((pt) => isValidCoordinate(pt.latitude, pt.longitude));
    const invalidCount = points.length - validPoints.length;

    if (validPoints.length === 0) {
      return { optimizedPoints: [], invalidPointsCount: invalidCount };
    }

    const optimized =
      validPoints.length <= 7
        ? this.permute(start, validPoints)
        : this.twoOpt(start, validPoints);

    return {
      optimizedPoints: optimized,
      invalidPointsCount: invalidCount
    };
  }

  private static permute<T extends RoutePoint>(
    start: [number, number] | null,
    points: T[]
  ): T[] {
    if (points.length <= 1) return points;

    let bestRoute = points;
    let minDistance = Number.MAX_VALUE;

    const indices = points.map((_, i) => i);
    const permutations: number[][] = [];
    this.generatePermutations(indices, 0, permutations);

    for (const perm of permutations) {
      let currentDist = 0;
      let prevLat = start ? start[0] : null;
      let prevLng = start ? start[1] : null;

      for (const idx of perm) {
        const pt = points[idx];
        if (prevLat !== null && prevLng !== null) {
          currentDist += calculateDistanceKm(prevLat, prevLng, pt.latitude, pt.longitude);
        }
        prevLat = pt.latitude;
        prevLng = pt.longitude;
      }

      if (currentDist < minDistance) {
        minDistance = currentDist;
        bestRoute = perm.map((i) => points[i]);
      }
    }

    return bestRoute;
  }

  private static generatePermutations(list: number[], k: number, result: number[][]) {
    const n = list.length;
    const arr = [...list];
    if (k === n) {
      result.push(arr);
      return;
    }
    for (let i = k; i < n; i++) {
      const temp = arr[k];
      arr[k] = arr[i];
      arr[i] = temp;

      this.generatePermutations(arr, k + 1, result);

      const revert = arr[k];
      arr[k] = arr[i];
      arr[i] = revert;
    }
  }

  private static twoOpt<T extends RoutePoint>(
    start: [number, number] | null,
    points: T[]
  ): T[] {
    // Nearest neighbor initial route
    const remaining = [...points];
    const route: T[] = [];
    let curLat = start ? start[0] : remaining[0].latitude;
    let curLng = start ? start[1] : remaining[0].longitude;

    if (!start) {
      route.push(remaining.shift()!);
    }

    while (remaining.length > 0) {
      let nearestIdx = 0;
      let minDist = Number.MAX_VALUE;
      for (let i = 0; i < remaining.length; i++) {
        const d = calculateDistanceKm(curLat, curLng, remaining[i].latitude, remaining[i].longitude);
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }
      const nextPt = remaining.splice(nearestIdx, 1)[0];
      route.push(nextPt);
      curLat = nextPt.latitude;
      curLng = nextPt.longitude;
    }

    // 2-opt optimization loop
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 50) {
      improved = false;
      iterations++;
      for (let i = 0; i < route.length - 1; i++) {
        for (let k = i + 1; k < route.length; k++) {
          const delta = this.calculate2OptDelta(start, route, i, k);
          if (delta < -0.0001) {
            // Reverse segment between i and k
            const segment = route.slice(i, k + 1).reverse();
            route.splice(i, segment.length, ...segment);
            improved = true;
          }
        }
      }
    }

    return route;
  }

  private static calculate2OptDelta<T extends RoutePoint>(
    start: [number, number] | null,
    route: T[],
    i: number,
    k: number
  ): number {
    const prevA = i === 0 ? (start ? { latitude: start[0], longitude: start[1] } : null) : route[i - 1];
    const A = route[i];
    const B = route[k];
    const nextB = k + 1 < route.length ? route[k + 1] : null;

    let oldDist = 0;
    let newDist = 0;

    if (prevA) {
      oldDist += calculateDistanceKm(prevA.latitude, prevA.longitude, A.latitude, A.longitude);
      newDist += calculateDistanceKm(prevA.latitude, prevA.longitude, B.latitude, B.longitude);
    }
    if (nextB) {
      oldDist += calculateDistanceKm(B.latitude, B.longitude, nextB.latitude, nextB.longitude);
      newDist += calculateDistanceKm(A.latitude, A.longitude, nextB.latitude, nextB.longitude);
    }

    return newDist - oldDist;
  }
}
