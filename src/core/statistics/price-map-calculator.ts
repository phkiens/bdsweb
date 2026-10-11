import { Property } from "../models/property";
import { ConfidenceLevel } from "./confidence-level";
import { DrillDownFilter } from "./drill-down-filter";
import { PerformanceResult } from "./performance-calculator";
import { AreaPriceRow, PriceTableResult } from "./price-table-calculator";
import {
  normalizePropertyType,
  PropertyStatusConstants,
  StatisticsFilter,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "./statistics-filter";
import { toTitleCase } from "../utils/vietnamese";

/**
 * 4 cấp độ lệch giá của từng điểm BĐS so với mặt bằng phân khúc.
 */
export enum PriceDotTier {
  BELOW_BENCHMARK = "Thấp hơn mặt bằng", // <= -5.0%
  NEAR_BENCHMARK = "Sát mặt bằng", // (-5.0%, +5.0%)
  ABOVE_BENCHMARK = "Cao hơn mặt bằng", // >= +5.0%
  NO_BENCHMARK = "Chưa đủ dữ liệu" // Không có benchmark, benchmark <= 0, duplicate row, hoặc < 5 mẫu
}

/**
 * 5 cấp độ nhiệt của Centroid Heat Markers theo phân vị giá thị trường.
 */
export enum HeatTier {
  LOWEST = "LOWEST", // intensity < 0.20
  LOW = "LOW", // 0.20 <= intensity < 0.40
  MEDIUM = "MEDIUM", // 0.40 <= intensity < 0.60
  HIGH = "HIGH", // 0.60 <= intensity < 0.80
  HIGHEST = "HIGHEST" // intensity >= 0.80
}

export const HEAT_TIER_CONFIG = {
  [HeatTier.LOWEST]: { rank: 1, label: "Rất thấp" },
  [HeatTier.LOW]: { rank: 2, label: "Thấp" },
  [HeatTier.MEDIUM]: { rank: 3, label: "Trung bình" },
  [HeatTier.HIGH]: { rank: 4, label: "Cao" },
  [HeatTier.HIGHEST]: { rank: 5, label: "Rất cao" }
} as const;

/**
 * 4 cấp độ thanh khoản cho Layer Liquidity.
 */
export enum LiquidityTier {
  LOW = "Thanh khoản thấp", // [0.0, 0.20)
  MEDIUM = "Thanh khoản trung bình", // [0.20, 0.40)
  HIGH = "Thanh khoản cao", // [0.40, 1.0]
  NO_DATA = "Chưa có dữ liệu" // soldRatioProxy === null hoặc ngoài [0,1], NaN, Infinity
}

/**
 * 4 cấp độ tồn kho cho Layer Inventory.
 */
export enum InventoryTier {
  EMPTY = "Hết hàng", // 0 căn
  SPARSE = "Mỏng", // 1..4 căn
  MODERATE = "Vừa phải", // 5..14 căn
  DENSE = "Dày đặc" // >= 15 căn
}

/**
 * 3 lớp hiển thị bản đồ đa chiều.
 */
export enum MapDisplayLayer {
  PRICE_PER_M2 = "Mặt bằng giá/m²",
  LIQUIDITY = "Thanh khoản",
  INVENTORY = "Mật độ kho hàng"
}

/**
 * Dữ liệu 1 điểm Dot Map trên bản đồ.
 */
export interface MapDotPoint {
  propertyId: string;
  title: string;
  latitude: number;
  longitude: number;
  areaKey: string;
  areaDisplayName: string;
  propertyTypeKey: string;
  propertyTypeDisplayName: string;
  price: number; // Tỷ VNĐ
  areaSize: number; // m²
  pricePerM2: number; // Triệu VNĐ/m²
  benchmarkMedianPricePerM2: number | null; // Triệu VNĐ/m² (từ PriceTableResult)
  deviationPercent: number | null; // % lệch
  dotTier: PriceDotTier;
  isOutlier: boolean;
  drillDownFilter?: DrillDownFilter | null; // Luôn null
}

/**
 * Cụm dữ liệu phân khúc cho Area Centroid Heat Markers.
 */
export interface MapAreaCluster {
  areaKey: string;
  areaDisplayName: string;
  propertyTypeKey: string;
  propertyTypeDisplayName: string;
  centroidLat: number | null;
  centroidLng: number | null;
  validGpsPointsCount: number;
  benchmarkSampleCount: number | null; // Số mẫu tính benchmark
  medianPricePerM2: number | null; // Triệu VNĐ/m² (nullable, không fallback 0.0)
  confidence: ConfidenceLevel | null; // Nullable khi thiếu benchmark
  heatTier: HeatTier | null; // Nullable khi thiếu benchmark
  normalizedIntensity: number | null; // 0.0 .. 1.0 (nullable, không fallback 0.0)
  inventoryCount: number; // Đếm trên baseFilteredProperties
  inventoryTier: InventoryTier;
  soldRatioProxy: number | null; // Tỷ lệ thanh khoản cấp area
  liquidityTier: LiquidityTier;
  drillDownFilter?: DrillDownFilter | null; // Luôn null
}

/**
 * Kết quả phân tích dữ liệu bản đồ toàn diện.
 */
export interface PriceMapResult {
  totalBaseFilteredProperties: number;
  plottedDotsCount: number;
  excludedMissingGpsCount: number;
  excludedInvalidPriceCount: number;
  boundingCenterLat: number | null;
  boundingCenterLng: number | null;
  dotPoints: MapDotPoint[];
  areaClusters: MapAreaCluster[];
}

const SENTINEL_KEYS = new Set<string>(["chưa xác định", "chua_ro", "null"]);

export const PriceMapCalculator = {
  empty(): PriceMapResult {
    return {
      totalBaseFilteredProperties: 0,
      plottedDotsCount: 0,
      excludedMissingGpsCount: 0,
      excludedInvalidPriceCount: 0,
      boundingCenterLat: null,
      boundingCenterLng: null,
      dotPoints: [],
      areaClusters: []
    };
  },

  /**
   * Checks if coordinates are physically valid and not Null Island.
   */
  isGpsValid(lat?: number | null, lon?: number | null): boolean {
    if (lat == null || lon == null) return false;
    if (!Number.isFinite(lat) || Number.isNaN(lat) || !Number.isFinite(lon) || Number.isNaN(lon)) {
      return false;
    }
    if (lat === 0.0 && lon === 0.0) return false; // Exclude Null Island
    return lat >= -90.0 && lat <= 90.0 && lon >= -180.0 && lon <= 180.0;
  },

  /**
   * Classifies liquidity ratio into LiquidityTier.
   */
  classifyLiquidityTier(soldRatioProxy?: number | null): LiquidityTier {
    if (
      soldRatioProxy == null ||
      !Number.isFinite(soldRatioProxy) ||
      Number.isNaN(soldRatioProxy) ||
      soldRatioProxy < 0.0 ||
      soldRatioProxy > 1.0
    ) {
      return LiquidityTier.NO_DATA;
    }
    if (soldRatioProxy >= 0.40) return LiquidityTier.HIGH;
    if (soldRatioProxy >= 0.20) return LiquidityTier.MEDIUM;
    return LiquidityTier.LOW;
  },

  /**
   * Classifies active inventory count into InventoryTier.
   */
  classifyInventoryTier(inventoryCount: number): InventoryTier {
    if (inventoryCount < 0) {
      throw new Error(`inventoryCount must be non-negative: ${inventoryCount}`);
    }
    if (inventoryCount >= 15) return InventoryTier.DENSE;
    if (inventoryCount >= 5) return InventoryTier.MODERATE;
    if (inventoryCount >= 1) return InventoryTier.SPARSE;
    return InventoryTier.EMPTY;
  },

  /**
   * Calculates spatial map visualization data.
   */
  calculate(
    properties: Property[],
    filter: StatisticsFilter,
    priceTableResult: PriceTableResult,
    performanceResult?: PerformanceResult | null,
    now: number = Date.now()
  ): PriceMapResult {
    // 1. Fail-closed on ownerId filter since Property does not hold owner association
    if (filter.ownerId != null && filter.ownerId.trim().length > 0) {
      return PriceMapCalculator.empty();
    }

    // 2. Base filtered properties: StatisticsFilter + Business rules (active market properties)
    const baseFilteredProperties = properties.filter((prop) => {
      return (
        filter.matches(prop, now, true, true) &&
        PropertyStatusConstants.isActiveMarket(prop.status)
      );
    });
    const totalBaseFilteredProperties = baseFilteredProperties.length;

    // 3. Non-overlapping exclusion pipeline: Price/Area size validation
    const invalidPriceProperties: Property[] = [];
    const priceEligibleProperties: Property[] = [];
    for (const prop of baseFilteredProperties) {
      const p = prop.price;
      const a = prop.areaSize;
      const isValidPrice =
        p != null &&
        p > 0.0 &&
        Number.isFinite(p) &&
        !Number.isNaN(p) &&
        a != null &&
        a > 0.0 &&
        Number.isFinite(a) &&
        !Number.isNaN(a);
      if (isValidPrice) {
        priceEligibleProperties.push(prop);
      } else {
        invalidPriceProperties.push(prop);
      }
    }
    const excludedInvalidPriceCount = invalidPriceProperties.length;

    // 4. GPS validation on priceEligibleProperties (strictly non-overlapping)
    const missingGpsProperties: Property[] = [];
    const validGpsProperties: Property[] = [];
    for (const prop of priceEligibleProperties) {
      if (PriceMapCalculator.isGpsValid(prop.latitude, prop.longitude)) {
        validGpsProperties.push(prop);
      } else {
        missingGpsProperties.push(prop);
      }
    }
    const excludedMissingGpsCount = missingGpsProperties.length;
    const plottedDotsCount = validGpsProperties.length;

    // 5. Benchmark lookup from PriceTableResult (fail-closed on duplicate keys or median <= 0)
    const priceTableRowsByKey = new Map<string, AreaPriceRow[]>();
    for (const row of priceTableResult.rows) {
      const key = `${row.areaKey}|||${row.propertyTypeKey}`;
      const list = priceTableRowsByKey.get(key) ?? [];
      list.push(row);
      priceTableRowsByKey.set(key, list);
    }

    const validBenchmarkMap = new Map<string, AreaPriceRow>();
    for (const [key, rows] of priceTableRowsByKey.entries()) {
      if (rows.length === 1) {
        const row = rows[0];
        if (
          row.displayMedianPricePerM2 > 0.0 &&
          Number.isFinite(row.displayMedianPricePerM2) &&
          !Number.isNaN(row.displayMedianPricePerM2) &&
          row.sampleCount >= 5
        ) {
          validBenchmarkMap.set(key, row);
        }
      }
    }

    // 6. Dot Map Points
    const dotPoints: MapDotPoint[] = validGpsProperties.map((prop) => {
      const areaKey = toCanonicalAreaKey(prop.area);
      const propertyTypeKey = toCanonicalPropertyTypeKey(prop.propertyType);
      const key = `${areaKey}|||${propertyTypeKey}`;
      const benchmarkRow = validBenchmarkMap.get(key);
      const areaDisplayName = benchmarkRow?.areaDisplayName ?? toTitleCase(areaKey);
      const propertyTypeDisplayName =
        benchmarkRow?.propertyTypeDisplayName ?? toTitleCase(normalizePropertyType(propertyTypeKey));

      const priceVal = prop.price;
      const areaSizeVal = prop.areaSize!;
      const pricePerM2 = (priceVal * 1000.0) / areaSizeVal; // Triệu VNĐ/m²

      const benchmarkMedian = benchmarkRow?.displayMedianPricePerM2 ?? null;
      const deviationPercent =
        benchmarkMedian != null && benchmarkMedian > 0.0
          ? ((pricePerM2 - benchmarkMedian) / benchmarkMedian) * 100.0
          : null;

      let dotTier: PriceDotTier;
      if (deviationPercent == null) {
        dotTier = PriceDotTier.NO_BENCHMARK;
      } else if (deviationPercent <= -5.0) {
        dotTier = PriceDotTier.BELOW_BENCHMARK;
      } else if (deviationPercent >= 5.0) {
        dotTier = PriceDotTier.ABOVE_BENCHMARK;
      } else {
        dotTier = PriceDotTier.NEAR_BENCHMARK;
      }

      let isOutlier = false;
      if (benchmarkRow) {
        const iqr = benchmarkRow.p75PricePerM2 - benchmarkRow.p25PricePerM2;
        const pricePerM2InTy = pricePerM2 / 1000.0;
        isOutlier =
          pricePerM2InTy < benchmarkRow.p25PricePerM2 - 1.5 * iqr ||
          pricePerM2InTy > benchmarkRow.p75PricePerM2 + 1.5 * iqr;
      }

      return {
        propertyId: prop.id,
        title: prop.title ?? "",
        latitude: prop.latitude!,
        longitude: prop.longitude!,
        areaKey,
        areaDisplayName,
        propertyTypeKey,
        propertyTypeDisplayName,
        price: priceVal,
        areaSize: areaSizeVal,
        pricePerM2,
        benchmarkMedianPricePerM2: benchmarkMedian,
        deviationPercent,
        dotTier,
        isOutlier,
        drillDownFilter: null
      };
    });

    dotPoints.sort((a, b) => {
      if (a.pricePerM2 !== b.pricePerM2) {
        return a.pricePerM2 - b.pricePerM2;
      }
      return a.propertyId.localeCompare(b.propertyId);
    });

    // Bounding Center
    const boundingCenterLat =
      validGpsProperties.length > 0
        ? validGpsProperties.reduce((acc, p) => acc + p.latitude!, 0) / validGpsProperties.length
        : null;
    const boundingCenterLng =
      validGpsProperties.length > 0
        ? validGpsProperties.reduce((acc, p) => acc + p.longitude!, 0) / validGpsProperties.length
        : null;

    // 7. Liquidity lookup from PerformanceResult.byArea (fail-closed on duplicate keys, range [0, 1], NaN, Infinity)
    const liquidityMap = new Map<string, number>();
    if (performanceResult != null) {
      const groupedLiquidity = new Map<string, typeof performanceResult.byArea>();
      for (const row of performanceResult.byArea) {
        const list = groupedLiquidity.get(row.segmentKey) ?? [];
        list.push(row);
        groupedLiquidity.set(row.segmentKey, list);
      }
      for (const [segKey, rows] of groupedLiquidity.entries()) {
        if (rows.length === 1) {
          const row = rows[0];
          const ratio = row.soldRatioProxy;
          if (
            ratio != null &&
            Number.isFinite(ratio) &&
            !Number.isNaN(ratio) &&
            ratio >= 0.0 &&
            ratio <= 1.0
          ) {
            liquidityMap.set(segKey, ratio);
          }
        }
      }
    }

    // 8. Area Clusters (Union of baseFilteredProperties segments and priceTableResult segments)
    const baseSegments = new Set<string>();
    for (const p of baseFilteredProperties) {
      const aKey = toCanonicalAreaKey(p.area);
      const tKey = toCanonicalPropertyTypeKey(p.propertyType);
      if (
        aKey.length > 0 &&
        !SENTINEL_KEYS.has(aKey) &&
        tKey.length > 0 &&
        !SENTINEL_KEYS.has(tKey)
      ) {
        baseSegments.add(`${aKey}|||${tKey}`);
      }
    }

    for (const row of priceTableResult.rows) {
      const aKey = row.areaKey;
      const tKey = row.propertyTypeKey;
      if (
        aKey.length > 0 &&
        !SENTINEL_KEYS.has(aKey) &&
        tKey.length > 0 &&
        !SENTINEL_KEYS.has(tKey)
      ) {
        baseSegments.add(`${aKey}|||${tKey}`);
      }
    }

    const allDistinctSegments = Array.from(baseSegments);

    // Build raw clusters
    const rawClusters: MapAreaCluster[] = allDistinctSegments.map((segmentPair) => {
      const [aKey, tKey] = segmentPair.split("|||");
      const matchingProps = baseFilteredProperties.filter(
        (it) =>
          toCanonicalAreaKey(it.area) === aKey &&
          toCanonicalPropertyTypeKey(it.propertyType) === tKey
      );
      const inventoryCount = matchingProps.length;
      const inventoryTier = PriceMapCalculator.classifyInventoryTier(inventoryCount);

      const gpsProps = matchingProps.filter((it) =>
        PriceMapCalculator.isGpsValid(it.latitude, it.longitude)
      );
      const validGpsCount = gpsProps.length;
      const centroidLat =
        validGpsCount > 0
          ? gpsProps.reduce((acc, p) => acc + p.latitude!, 0) / validGpsCount
          : null;
      const centroidLng =
        validGpsCount > 0
          ? gpsProps.reduce((acc, p) => acc + p.longitude!, 0) / validGpsCount
          : null;

      const benchmarkRow = validBenchmarkMap.get(`${aKey}|||${tKey}`);
      const medianPricePerM2 = benchmarkRow?.displayMedianPricePerM2 ?? null;
      const confidence = benchmarkRow?.confidence ?? null;
      const rawRows = priceTableRowsByKey.get(`${aKey}|||${tKey}`);
      const benchmarkSampleCount =
        benchmarkRow?.sampleCount ?? (rawRows?.length === 1 ? rawRows[0].sampleCount : null);

      const uniqueRawRow = rawRows?.length === 1 ? rawRows[0] : null;
      const areaDisplayName =
        benchmarkRow?.areaDisplayName ?? uniqueRawRow?.areaDisplayName ?? toTitleCase(aKey);
      const propertyTypeDisplayName =
        benchmarkRow?.propertyTypeDisplayName ??
        uniqueRawRow?.propertyTypeDisplayName ??
        toTitleCase(normalizePropertyType(tKey));

      const soldRatioProxy = liquidityMap.get(aKey) ?? null;
      const liquidityTier = PriceMapCalculator.classifyLiquidityTier(soldRatioProxy);

      return {
        areaKey: aKey,
        areaDisplayName,
        propertyTypeKey: tKey,
        propertyTypeDisplayName,
        centroidLat,
        centroidLng,
        validGpsPointsCount: validGpsCount,
        benchmarkSampleCount,
        medianPricePerM2,
        confidence,
        heatTier: null,
        normalizedIntensity: null,
        inventoryCount,
        inventoryTier,
        soldRatioProxy,
        liquidityTier,
        drillDownFilter: null
      };
    });

    // 9. Normalize HeatTier only for clusters with valid benchmark
    const benchmarkedClusters = rawClusters.filter((it) => it.medianPricePerM2 != null);
    let minMedian: number | null = null;
    let maxMedian: number | null = null;
    if (benchmarkedClusters.length > 0) {
      minMedian = Math.min(...benchmarkedClusters.map((it) => it.medianPricePerM2!));
      maxMedian = Math.max(...benchmarkedClusters.map((it) => it.medianPricePerM2!));
    }

    const finalizedClusters: MapAreaCluster[] = rawClusters.map((cluster) => {
      const median = cluster.medianPricePerM2;
      if (median != null && minMedian != null && maxMedian != null) {
        const intensity = maxMedian > minMedian ? (median - minMedian) / (maxMedian - minMedian) : 0.5;
        let heatTier: HeatTier;
        if (intensity < 0.20) {
          heatTier = HeatTier.LOWEST;
        } else if (intensity < 0.40) {
          heatTier = HeatTier.LOW;
        } else if (intensity < 0.60) {
          heatTier = HeatTier.MEDIUM;
        } else if (intensity < 0.80) {
          heatTier = HeatTier.HIGH;
        } else {
          heatTier = HeatTier.HIGHEST;
        }
        return {
          ...cluster,
          normalizedIntensity: intensity,
          heatTier
        };
      } else {
        return cluster; // Keeps normalizedIntensity = null, heatTier = null
      }
    });

    finalizedClusters.sort((a, b) => {
      if (b.inventoryCount !== a.inventoryCount) {
        return b.inventoryCount - a.inventoryCount;
      }
      const areaCmp = a.areaDisplayName.localeCompare(b.areaDisplayName);
      if (areaCmp !== 0) return areaCmp;
      const typeCmp = a.propertyTypeDisplayName.localeCompare(b.propertyTypeDisplayName);
      if (typeCmp !== 0) return typeCmp;
      const keyAreaCmp = a.areaKey.localeCompare(b.areaKey);
      if (keyAreaCmp !== 0) return keyAreaCmp;
      return a.propertyTypeKey.localeCompare(b.propertyTypeKey);
    });

    return {
      totalBaseFilteredProperties,
      plottedDotsCount,
      excludedMissingGpsCount,
      excludedInvalidPriceCount,
      boundingCenterLat,
      boundingCenterLng,
      dotPoints,
      areaClusters: finalizedClusters
    };
  }
};
