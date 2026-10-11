import { Property } from "../models/property";
import {
  getLocalDateParts,
  isActiveMarketProperty,
  PropertyStatusConstants,
  STATS_ZONE_ID,
  StatisticsFilter
} from "./statistics-filter";
import { MedianUtils } from "./median-utils";

/**
 * Statistics on inventory aging buckets as defined in Data Contract v1.2.1 Section 11.2.
 */
export class AgingBuckets {
  constructor(
    public readonly days0to7: number = 0,
    public readonly days8to30: number = 0,
    public readonly days31to60: number = 0,
    public readonly days61to90: number = 0,
    public readonly daysOver90: number = 0
  ) {}

  get total(): number {
    return (
      this.days0to7 +
      this.days8to30 +
      this.days31to60 +
      this.days61to90 +
      this.daysOver90
    );
  }
}

/**
 * Encapsulates an active property and its calculated age in days.
 */
export interface AgingPropertyItem {
  property: Property;
  ageDays: number;
}

/**
 * Aggregated inventory and aging data for Statistics V2.
 */
export interface InventoryData {
  totalInventory: number;
  verifiedCount: number;
  unverifiedCount: number;
  activeCount: number;
  soldCount: number;
  pendingSurveyCount: number;
  unknownStatusCount: number;
  newInWindow: number;
  forSaleCreatedInWindow: number;
  soldCreatedInWindow: number;
  soldRatioProxy: number | null;
  agingBuckets: AgingBuckets;
  medianAgeDays: number | null;
  p75AgeDays: number | null;
  ratioOver60Days: number | null;
  ratioOver90Days: number | null;
  longestAgingProperties: AgingPropertyItem[];
  invalidDateCount: number;
  futureDateCount: number;
  draftExcludedCount: number;
}

export interface InventoryCalculatorOptions {
  properties?: Property[] | null;
  filter?: StatisticsFilter;
  now?: number;
  clock?: { millis(): number };
  zoneId?: string;
  topNLongestAging?: number;
}

export const InventoryCalculator = {
  calculate(
    properties?: Property[] | null,
    options: {
      filter?: StatisticsFilter;
      now?: number;
      clock?: { millis(): number };
      zoneId?: string;
      topNLongestAging?: number;
    } = {}
  ): InventoryData {
    const topNLongestAging = options.topNLongestAging ?? 10;
    if (topNLongestAging < 0) {
      throw new Error(
        `topNLongestAging must be non-negative, but was ${topNLongestAging}`
      );
    }

    const now = options.now ?? options.clock?.millis() ?? Date.now();
    const zoneId = options.zoneId ?? STATS_ZONE_ID;
    const filter = options.filter ?? new StatisticsFilter();

    if (!properties || properties.length === 0) {
      return {
        totalInventory: 0,
        verifiedCount: 0,
        unverifiedCount: 0,
        activeCount: 0,
        soldCount: 0,
        pendingSurveyCount: 0,
        unknownStatusCount: 0,
        newInWindow: 0,
        forSaleCreatedInWindow: 0,
        soldCreatedInWindow: 0,
        soldRatioProxy: null,
        agingBuckets: new AgingBuckets(),
        medianAgeDays: null,
        p75AgeDays: null,
        ratioOver60Days: null,
        ratioOver90Days: null,
        longestAgingProperties: [],
        invalidDateCount: 0,
        futureDateCount: 0,
        draftExcludedCount: 0
      };
    }

    // 1. Exclude tombstones (isDeleted = true)
    const nonDeleted = properties.filter((p) => !p.isDeleted);
    const draftExcludedCount = nonDeleted.filter((p) => p.isDraft).length;

    // 2. Exclude drafts from business inventory calculations (Section 2)
    const businessProperties = nonDeleted.filter((p) => !p.isDraft);

    // 3. Apply StatisticsFilter (snapshot inventory evaluates non-date dimensions across all dates)
    const filtered = businessProperties.filter((p) =>
      filter.matches(
        p,
        now,
        /* excludeDeleted = */ false,
        /* excludeDraft = */ false,
        /* checkDateWindow = */ false
      )
    );

    const totalInventory = filtered.length;
    const verifiedCount = filtered.filter((p) => p.isVerified).length;
    const unverifiedCount = filtered.filter((p) => !p.isVerified).length;

    // Status counts: strictly comparing with PropertyStatus string literals (Section 4)
    const activeCount = filtered.filter(isActiveMarketProperty).length;
    const soldCount = filtered.filter((p) => PropertyStatusConstants.isSold(p.status)).length;
    const pendingSurveyCount = filtered.filter((p) => PropertyStatusConstants.isPendingSurvey(p.status)).length;
    const unknownStatusCount = filtered.filter((p) => !PropertyStatusConstants.isKnown(p.status)).length;

    // Date window metrics (Section 5.2)
    const window = filter.dateRange.resolveWindow(now, zoneId);
    const windowProperties = filtered.filter((p) => !p.isDeleted && !p.isDraft);

    const newInWindow =
      window != null
        ? windowProperties.filter((p) => window.contains(p.createdAt)).length
        : windowProperties.length;

    const forSaleCreatedInWindow =
      window != null
        ? windowProperties.filter(
            (p) =>
              PropertyStatusConstants.isActiveMarket(p.status) &&
              window.contains(p.createdAt)
          ).length
        : windowProperties.filter((p) => PropertyStatusConstants.isActiveMarket(p.status)).length;

    const soldCreatedInWindow =
      window != null
        ? windowProperties.filter(
            (p) =>
              PropertyStatusConstants.isSold(p.status) &&
              window.contains(p.createdAt)
          ).length
        : windowProperties.filter((p) => PropertyStatusConstants.isSold(p.status)).length;

    const liquidityDenominator = forSaleCreatedInWindow + soldCreatedInWindow;
    const soldRatioProxy =
      liquidityDenominator > 0
        ? soldCreatedInWindow / liquidityDenominator
        : null;

    // Aging metrics: evaluated on all active market properties
    const activeProperties = filtered.filter(isActiveMarketProperty);
    const pNow = getLocalDateParts(now, zoneId);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    let invalidDateCount = 0;
    let futureDateCount = 0;
    const validAgingItems: AgingPropertyItem[] = [];

    for (const prop of activeProperties) {
      if (prop.createdAt <= 0) {
        invalidDateCount++;
        continue;
      }
      const pCreated = getLocalDateParts(prop.createdAt, zoneId);
      const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
      if (createdDateUtc > nowDateUtc) {
        futureDateCount++;
        continue;
      }
      const ageDays = Math.round((nowDateUtc - createdDateUtc) / 86_400_000);
      validAgingItems.push({ property: prop, ageDays });
    }

    // Aging buckets (Section 11.2)
    let b0to7 = 0;
    let b8to30 = 0;
    let b31to60 = 0;
    let b61to90 = 0;
    let bOver90 = 0;

    for (const item of validAgingItems) {
      const days = item.ageDays;
      if (days >= 0 && days <= 7) {
        b0to7++;
      } else if (days >= 8 && days <= 30) {
        b8to30++;
      } else if (days >= 31 && days <= 60) {
        b31to60++;
      } else if (days >= 61 && days <= 90) {
        b61to90++;
      } else if (days > 90) {
        bOver90++;
      }
    }
    const agingBuckets = new AgingBuckets(b0to7, b8to30, b31to60, b61to90, bOver90);

    // Age percentiles using MedianUtils
    const ageDaysList = validAgingItems.map((it) => it.ageDays);
    const medianAgeDays = MedianUtils.calculateMedian(ageDaysList);
    const p75AgeDays = MedianUtils.calculateP75(ageDaysList);

    const validActiveCount = validAgingItems.length;
    const countOver60 = validAgingItems.filter((it) => it.ageDays > 60).length;
    const countOver90 = validAgingItems.filter((it) => it.ageDays > 90).length;

    const ratioOver60Days =
      validActiveCount > 0 ? (countOver60 / validActiveCount) * 100.0 : null;
    const ratioOver90Days =
      validActiveCount > 0 ? (countOver90 / validActiveCount) * 100.0 : null;

    // Deterministic sorting for longest aging: ageDays desc -> createdAt asc -> id asc (Section 3.5)
    validAgingItems.sort((a, b) => {
      if (b.ageDays !== a.ageDays) return b.ageDays - a.ageDays;
      if (a.property.createdAt !== b.property.createdAt) {
        return a.property.createdAt - b.property.createdAt;
      }
      return a.property.id.localeCompare(b.property.id);
    });

    const longestAging = validAgingItems.slice(0, topNLongestAging);

    return {
      totalInventory,
      verifiedCount,
      unverifiedCount,
      activeCount,
      soldCount,
      pendingSurveyCount,
      unknownStatusCount,
      newInWindow,
      forSaleCreatedInWindow,
      soldCreatedInWindow,
      soldRatioProxy,
      agingBuckets,
      medianAgeDays,
      p75AgeDays,
      ratioOver60Days,
      ratioOver90Days,
      longestAgingProperties: longestAging,
      invalidDateCount,
      futureDateCount,
      draftExcludedCount
    };
  }
};
