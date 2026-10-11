import { Property } from "../models/property";
import { PriceUtils } from "./price-utils";
import {
  isActiveMarketProperty,
  StatisticsFilter,
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey
} from "./statistics-filter";
import { OpportunityQuadrant, RadarAreaSummary, RadarOpportunityResult } from "./radar/radar-models";
import { MarketNoteworthyProperty, MarketSortMode } from "./market-noteworthy-property";

const SENTINEL_KEYS = new Set<string>(["chưa xác định", "chua_ro", "null"]);

/**
 * Priority Comparator:
 * 1. GOLDEN_OPPORTUNITY first (true before false)
 * 2. opportunityScore descending (nulls last)
 * 3. deviationPercent ascending (cheapest vs median first, nulls last)
 * 4. createdAt descending (newest first)
 * 5. property.id ascending
 */
export const PriorityComparator = (
  a: MarketNoteworthyProperty,
  b: MarketNoteworthyProperty
): number => {
  const aGolden = a.segmentQuadrant === OpportunityQuadrant.GOLDEN_OPPORTUNITY;
  const bGolden = b.segmentQuadrant === OpportunityQuadrant.GOLDEN_OPPORTUNITY;
  if (aGolden !== bGolden) {
    return aGolden ? -1 : 1;
  }
  const aScore = a.segmentOpportunityScore;
  const bScore = b.segmentOpportunityScore;
  if (aScore !== bScore) {
    if (aScore == null) return 1;
    if (bScore == null) return -1;
    const cmp = bScore - aScore;
    if (cmp !== 0) return cmp;
  }
  const aDev = a.deviationPercent;
  const bDev = b.deviationPercent;
  if (aDev !== bDev) {
    if (aDev == null) return 1;
    if (bDev == null) return -1;
    const cmp = aDev - bDev;
    if (cmp !== 0) return cmp;
  }
  const createdCmp = b.property.createdAt - a.property.createdAt;
  if (createdCmp !== 0) return createdCmp;
  return a.property.id.localeCompare(b.property.id);
};

/**
 * Liquidity Comparator:
 * 1. soldRatio descending (nulls last)
 * 2. createdAt descending (newest first)
 * 3. opportunityScore descending (nulls last)
 * 4. property.id ascending
 */
export const LiquidityComparator = (
  a: MarketNoteworthyProperty,
  b: MarketNoteworthyProperty
): number => {
  const aRatio = a.segmentSoldRatio;
  const bRatio = b.segmentSoldRatio;
  if (aRatio !== bRatio) {
    if (aRatio == null) return 1;
    if (bRatio == null) return -1;
    const cmp = bRatio - aRatio;
    if (cmp !== 0) return cmp;
  }
  const createdCmp = b.property.createdAt - a.property.createdAt;
  if (createdCmp !== 0) return createdCmp;
  const aScore = a.segmentOpportunityScore;
  const bScore = b.segmentOpportunityScore;
  if (aScore !== bScore) {
    if (aScore == null) return 1;
    if (bScore == null) return -1;
    const cmp = bScore - aScore;
    if (cmp !== 0) return cmp;
  }
  return a.property.id.localeCompare(b.property.id);
};

/**
 * Price Low Comparator:
 * 1. displayPricePerM2 ascending
 * 2. deviationPercent ascending (cheapest vs median first, nulls last)
 * 3. createdAt descending (newest first)
 * 4. property.id ascending
 */
export const PriceLowComparator = (
  a: MarketNoteworthyProperty,
  b: MarketNoteworthyProperty
): number => {
  const priceCmp = a.displayPricePerM2 - b.displayPricePerM2;
  if (priceCmp !== 0) return priceCmp;
  const aDev = a.deviationPercent;
  const bDev = b.deviationPercent;
  if (aDev !== bDev) {
    if (aDev == null) return 1;
    if (bDev == null) return -1;
    const cmp = aDev - bDev;
    if (cmp !== 0) return cmp;
  }
  const createdCmp = b.property.createdAt - a.property.createdAt;
  if (createdCmp !== 0) return createdCmp;
  return a.property.id.localeCompare(b.property.id);
};

export const MarketNoteworthyPropertyMapper = {
  PriorityComparator,
  LiquidityComparator,
  PriceLowComparator,

  /**
   * Maps raw properties into MarketNoteworthyProperty items with O(1) segment lookups.
   */
  map(
    properties: Property[],
    radarResult: RadarOpportunityResult | null | undefined,
    filter: StatisticsFilter,
    now: number
  ): MarketNoteworthyProperty[] {
    const segments =
      radarResult && radarResult.type === "SUCCESS" ? radarResult.segments : [];
    if (segments.length === 0 || properties.length === 0) {
      return [];
    }

    // O(1) segment lookup map
    const segmentLookup = new Map<string, RadarAreaSummary>();
    for (const seg of segments) {
      segmentLookup.set(`${seg.key.areaKey}|||${seg.key.propertyTypeKey}`, seg);
    }

    const result: MarketNoteworthyProperty[] = [];

    for (const property of properties) {
      if (!isActiveMarketProperty(property)) continue;
      if (!PriceUtils.isValidPriceAndArea(property.price, property.areaSize)) continue;

      const aKey = toCanonicalAreaKey(property.area);
      const tKey = toCanonicalPropertyTypeKey(property.propertyType);
      if (
        aKey.length === 0 ||
        SENTINEL_KEYS.has(aKey) ||
        tKey.length === 0 ||
        SENTINEL_KEYS.has(tKey)
      ) {
        continue;
      }

      if (
        !filter.matches(
          property,
          now,
          /* excludeDeleted = */ true,
          /* excludeDraft = */ true
        )
      ) {
        continue;
      }

      const segKeyStr = `${aKey}|||${tKey}`;
      const segment = segmentLookup.get(segKeyStr);
      if (!segment) continue;

      const areaSize = property.areaSize!;
      const pricePerM2 = property.price / areaSize;
      const displayPricePerM2 = pricePerM2 * 1000.0;

      const targetMedian = segment.targetMedianPricePerM2;
      const displayTargetMedian = targetMedian != null ? targetMedian * 1000.0 : null;
      const deviationPercent =
        targetMedian != null &&
        targetMedian > 0.0 &&
        Number.isFinite(targetMedian) &&
        !Number.isNaN(targetMedian)
          ? ((pricePerM2 - targetMedian) / targetMedian) * 100.0
          : null;

      result.push({
        property,
        areaDisplayName: segment.areaDisplayName,
        propertyTypeDisplayName: segment.propertyTypeDisplayName,
        propertyPricePerM2: pricePerM2,
        displayPricePerM2: displayPricePerM2,
        targetMedianPricePerM2: targetMedian,
        displayTargetMedianPricePerM2: displayTargetMedian,
        deviationPercent,
        segmentOpportunityScore: segment.opportunityScore,
        segmentSoldRatio: segment.soldRatioProxy,
        segmentQuadrant: segment.quadrant,
        segmentKey: segment.key
      });
    }

    return result;
  },

  /**
   * Deterministically sorts items according to sortMode.
   */
  sort(
    items: MarketNoteworthyProperty[],
    sortMode: MarketSortMode
  ): MarketNoteworthyProperty[] {
    const copy = [...items];
    switch (sortMode) {
      case MarketSortMode.PRIORITY:
        return copy.sort(PriorityComparator);
      case MarketSortMode.LIQUIDITY:
        return copy.sort(LiquidityComparator);
      case MarketSortMode.PRICE_LOW:
        return copy.sort(PriceLowComparator);
    }
  }
};
