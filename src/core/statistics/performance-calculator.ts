import { Property } from "../models/property";
import {
  ConfidenceLevel,
  sampleCountToConfidence
} from "./confidence-level";
import { DrillDownFilter } from "./drill-down-filter";
import { PriceUtils } from "./price-utils";
import {
  getLocalDateParts,
  normalizePropertyType,
  PropertyStatusConstants,
  STATS_ZONE_ID,
  StatisticsFilter,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "./statistics-filter";
import { toTitleCase } from "../utils/vietnamese";

/**
 * Single segment liquidity row in Performance Snapshot analysis.
 */
export interface SegmentLiquidityRow {
  segmentKey: string;
  displayName: string;
  forSaleCreatedInWindow: number;
  soldCreatedInWindow: number;
  liquidityDenominator: number;
  soldRatioProxy: number | null; // Tỷ lệ [0.0, 1.0], null nếu denominator == 0
  displaySoldRatioPercent: number | null; // Phần trăm [0.0, 100.0], null nếu denominator == 0
  confidence: ConfidenceLevel;
  drillDownFilter: DrillDownFilter | null;
}

/**
 * Overall liquidity summary across the entire inventory in the evaluation window.
 */
export interface OverallLiquiditySummary {
  totalForSaleCreatedInWindow: number;
  totalSoldCreatedInWindow: number;
  totalLiquidityDenominator: number;
  overallSoldRatioProxy: number | null;
  displayOverallSoldRatioPercent: number | null;
  overallConfidence: ConfidenceLevel;
}

/**
 * Result container for Performance Snapshot analysis (Tab 3 Hiệu quả).
 */
export interface PerformanceResult {
  summary: OverallLiquiditySummary;
  byArea: SegmentLiquidityRow[];
  byPropertyType: SegmentLiquidityRow[];
  byPriceTier: SegmentLiquidityRow[];
}

const SENTINEL_KEYS = new Set<string>(["chưa xác định", "chua_ro", "null"]);

export const PerformanceCalculator = {
  calculate(
    properties: Property[],
    filter: StatisticsFilter,
    now: number
  ): PerformanceResult {
    const pNow = getLocalDateParts(now, STATS_ZONE_ID);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    // 1. Frozen population filtering for liquidity
    const eligibleProperties = properties.filter((p) => {
      // Filter match check (handles date window, numeric bounds, verifiedMode, etc.)
      if (
        !filter.matches(
          p,
          now,
          /* excludeDeleted = */ true,
          /* excludeDraft = */ true,
          /* checkDateWindow = */ true
        )
      ) {
        return false;
      }

      // Liquidity metric specific enforcement: status must be liquidity relevant (FOR_SALE, PENDING_SURVEY, SOLD)
      if (!PropertyStatusConstants.isLiquidityRelevant(p.status)) {
        return false;
      }

      // For AllTime range: reject createdAt <= 0 and reject future createdAt
      if (filter.dateRange.type === "ALL_TIME") {
        if (p.createdAt <= 0) return false;
        const pCreated = getLocalDateParts(p.createdAt, STATS_ZONE_ID);
        const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
        if (createdDateUtc > nowDateUtc) return false;
      }

      return true;
    });

    // 2. Summary calculations
    const totalForSale = eligibleProperties.filter((p) =>
      PropertyStatusConstants.isActiveMarket(p.status)
    ).length;
    const totalSold = eligibleProperties.filter((p) =>
      PropertyStatusConstants.isSold(p.status)
    ).length;
    const totalDenominator = totalForSale + totalSold;
    const overallRatio =
      totalDenominator === 0 ? null : totalSold / totalDenominator;
    const displayOverallPercent =
      overallRatio != null ? overallRatio * 100.0 : null;
    const overallConfidence = sampleCountToConfidence(totalDenominator);

    const summary: OverallLiquiditySummary = {
      totalForSaleCreatedInWindow: totalForSale,
      totalSoldCreatedInWindow: totalSold,
      totalLiquidityDenominator: totalDenominator,
      overallSoldRatioProxy: overallRatio,
      displayOverallSoldRatioPercent: displayOverallPercent,
      overallConfidence
    };

    // 3. Breakdown by Area (exclude blank and 3 standard sentinel keys)
    const validAreaProps = eligibleProperties.filter((p) => {
      const key = toCanonicalAreaKey(p.area);
      return key.length > 0 && !SENTINEL_KEYS.has(key);
    });

    const areaGroups = new Map<string, Property[]>();
    for (const p of validAreaProps) {
      const key = toCanonicalAreaKey(p.area);
      const list = areaGroups.get(key) ?? [];
      list.push(p);
      areaGroups.set(key, list);
    }

    const byAreaRows: SegmentLiquidityRow[] = [];
    for (const [areaKey, groupProps] of areaGroups.entries()) {
      const areaDisplayName = toTitleCase(areaKey);
      const forSale = groupProps.filter((p) =>
        PropertyStatusConstants.isActiveMarket(p.status)
      ).length;
      const sold = groupProps.filter((p) =>
        PropertyStatusConstants.isSold(p.status)
      ).length;
      const denom = forSale + sold;
      const ratio = denom === 0 ? null : sold / denom;
      const displayPercent = ratio != null ? ratio * 100.0 : null;
      const confidence = sampleCountToConfidence(denom);

      byAreaRows.push({
        segmentKey: areaKey,
        displayName: areaDisplayName,
        forSaleCreatedInWindow: forSale,
        soldCreatedInWindow: sold,
        liquidityDenominator: denom,
        soldRatioProxy: ratio,
        displaySoldRatioPercent: displayPercent,
        confidence,
        drillDownFilter: null
      });
    }

    byAreaRows.sort((a, b) => {
      if (b.liquidityDenominator !== a.liquidityDenominator) {
        return b.liquidityDenominator - a.liquidityDenominator;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    // 4. Breakdown by Property Type (exclude blank and 3 standard sentinel keys)
    const validTypeProps = eligibleProperties.filter((p) => {
      const key = toCanonicalPropertyTypeKey(p.propertyType);
      return key.length > 0 && !SENTINEL_KEYS.has(key);
    });

    const typeGroups = new Map<string, Property[]>();
    for (const p of validTypeProps) {
      const key = toCanonicalPropertyTypeKey(p.propertyType);
      const list = typeGroups.get(key) ?? [];
      list.push(p);
      typeGroups.set(key, list);
    }

    const byTypeRows: SegmentLiquidityRow[] = [];
    for (const [typeKey, groupProps] of typeGroups.entries()) {
      const typeDisplayName = toTitleCase(normalizePropertyType(typeKey));
      const forSale = groupProps.filter((p) =>
        PropertyStatusConstants.isActiveMarket(p.status)
      ).length;
      const sold = groupProps.filter((p) =>
        PropertyStatusConstants.isSold(p.status)
      ).length;
      const denom = forSale + sold;
      const ratio = denom === 0 ? null : sold / denom;
      const displayPercent = ratio != null ? ratio * 100.0 : null;
      const confidence = sampleCountToConfidence(denom);

      byTypeRows.push({
        segmentKey: typeKey,
        displayName: typeDisplayName,
        forSaleCreatedInWindow: forSale,
        soldCreatedInWindow: sold,
        liquidityDenominator: denom,
        soldRatioProxy: ratio,
        displaySoldRatioPercent: displayPercent,
        confidence,
        drillDownFilter: null
      });
    }

    byTypeRows.sort((a, b) => {
      if (b.liquidityDenominator !== a.liquidityDenominator) {
        return b.liquidityDenominator - a.liquidityDenominator;
      }
      return a.displayName.localeCompare(b.displayName);
    });

    // 5. Breakdown by Price Tier (always exactly 5 fixed rows in ascending order)
    const byPriceTierRows: SegmentLiquidityRow[] = PriceUtils.PriceBucket.values().map(
      (bucket) => {
        const bucketProps = eligibleProperties.filter((p) => bucket.contains(p.price));
        const forSale = bucketProps.filter((p) =>
          PropertyStatusConstants.isActiveMarket(p.status)
        ).length;
        const sold = bucketProps.filter((p) =>
          PropertyStatusConstants.isSold(p.status)
        ).length;
        const denom = forSale + sold;
        const ratio = denom === 0 ? null : sold / denom;
        const displayPercent = ratio != null ? ratio * 100.0 : null;
        const confidence = sampleCountToConfidence(denom);

        return {
          segmentKey: bucket.name,
          displayName: bucket.label,
          forSaleCreatedInWindow: forSale,
          soldCreatedInWindow: sold,
          liquidityDenominator: denom,
          soldRatioProxy: ratio,
          displaySoldRatioPercent: displayPercent,
          confidence,
          drillDownFilter: null
        };
      }
    );

    return {
      summary,
      byArea: byAreaRows,
      byPropertyType: byTypeRows,
      byPriceTier: byPriceTierRows
    };
  }
};
