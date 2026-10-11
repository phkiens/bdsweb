import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import {
  ConfidenceLevel,
  sampleCountToConfidence
} from "./confidence-level";
import {
  DrillDownFilter,
  DrillDownSource
} from "./drill-down-filter";
import { MedianUtils } from "./median-utils";
import {
  getLocalDateParts,
  PropertyStatusConstants,
  STATS_ZONE_ID,
  StatisticsFilter,
  VerifiedMode
} from "./statistics-filter";

/**
 * Domain model representing a Property associated with owner information
 * adhering strictly to Data Contract v1.2.2 Section 13.1.
 */
export interface PropertyWithOwner {
  property: Property;
  ownerId: string | null;
  ownerName: string | null;
  ownerCount: number;
}

/**
 * Performance evaluation row for a single property owner.
 */
export interface OwnerPerformanceItem {
  ownerId: string;
  ownerName: string;
  totalPropertiesListed: number; // FOR_SALE + SOLD + PENDING_SURVEY
  soldPropertiesCount: number; // SOLD
  activePropertiesCount: number; // FOR_SALE + PENDING_SURVEY (active market)
  activeAgingMedianDays: number | null; // Median tuổi hàng ĐANG BÁN, null nếu active == 0
  stalePropertiesCount: number; // Số căn ĐANG BÁN có ageDays > 90
  soldRatioProxy: number | null; // sold / (sold + active), null nếu mẫu số == 0
  displaySoldRatioPercent: number | null; // soldRatioProxy * 100.0
  confidence: ConfidenceLevel; // sampleCountToConfidence(sold + active)
  drillDownFilter: DrillDownFilter;
}

/**
 * Result container for Owner Performance analysis (Tab 3 Hiệu quả).
 */
export interface OwnerPerformanceResult {
  totalOwnersEvaluated: number;
  totalSingleOwnerProperties: number;
  totalExcludedMultiOwnerProperties: number;
  totalExcludedNoOwnerProperties: number;
  totalExcludedCorruptOwnerProperties: number;
  items: OwnerPerformanceItem[];
}

export const OwnerPerformanceCalculator = {
  calculate(
    records: PropertyWithOwner[],
    now: number,
    filter?: StatisticsFilter | null
  ): OwnerPerformanceResult {
    // Parameter defense: ownerCount < 0 is malformed data -> fail-fast
    for (const r of records) {
      if (r.ownerCount < 0) {
        throw new Error(
          `ownerCount must be non-negative, but was ${r.ownerCount} for property ${r.property.id}`
        );
      }
    }

    const pNow = getLocalDateParts(now, STATS_ZONE_ID);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    // 1. Base population filtering:
    // !isDeleted && !isDraft && status in (FOR_SALE, SOLD, PENDING_SURVEY)
    const baseRecords = records.filter((r) => {
      const p = r.property;
      return (
        !p.isDeleted &&
        !p.isDraft &&
        PropertyStatusConstants.isKnown(p.status)
      );
    });

    // 2. Partition by owner safety rules
    const multiOwnerRecords = baseRecords.filter((r) => r.ownerCount > 1);
    const noOwnerRecords = baseRecords.filter((r) => r.ownerCount === 0);
    const singleOwnerCandidates = baseRecords.filter((r) => r.ownerCount === 1);

    // Corrupt owner metadata: ownerCount == 1 but ownerId or ownerName is blank/null -> fail-closed
    const corruptOwnerRecords = singleOwnerCandidates.filter(
      (r) =>
        r.ownerId == null ||
        r.ownerId.trim().length === 0 ||
        r.ownerName == null ||
        r.ownerName.trim().length === 0
    );
    const validSingleOwnerRecords = singleOwnerCandidates.filter(
      (r) =>
        r.ownerId != null &&
        r.ownerId.trim().length > 0 &&
        r.ownerName != null &&
        r.ownerName.trim().length > 0
    );

    const totalExcludedMultiOwner = multiOwnerRecords.length;
    const totalExcludedNoOwner = noOwnerRecords.length;
    const totalExcludedCorrupt = corruptOwnerRecords.length;
    const totalSingleOwner = validSingleOwnerRecords.length;

    // 3. Group by unique ownerId
    const groupedByOwner = new Map<string, PropertyWithOwner[]>();
    for (const r of validSingleOwnerRecords) {
      const key = r.ownerId!;
      const list = groupedByOwner.get(key) ?? [];
      list.push(r);
      groupedByOwner.set(key, list);
    }

    const items: OwnerPerformanceItem[] = [];

    for (const [ownerId, ownerProps] of groupedByOwner.entries()) {
      const ownerName = ownerProps[0].ownerName!;
      const totalListed = ownerProps.length;

      const activeProps = ownerProps.filter((r) =>
        PropertyStatusConstants.isActiveMarket(r.property.status)
      );
      const soldProps = ownerProps.filter((r) =>
        PropertyStatusConstants.isSold(r.property.status)
      );

      const activeCount = activeProps.length;
      const soldCount = soldProps.length;

      // Liquidity ratio per owner: denominator is sold + active
      const denom = soldCount + activeCount;
      const soldRatio = denom === 0 ? null : soldCount / denom;
      const displayRatioPercent = soldRatio != null ? soldRatio * 100.0 : null;
      const confidence = sampleCountToConfidence(denom);

      // Aging calculation ONLY on active (FOR_SALE + PENDING_SURVEY) properties
      const validActiveAges: number[] = [];
      for (const r of activeProps) {
        const p = r.property;
        if (p.createdAt <= 0) continue;
        const pCreated = getLocalDateParts(p.createdAt, STATS_ZONE_ID);
        const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
        if (createdDateUtc > nowDateUtc) continue;
        const ageDays = Math.round((nowDateUtc - createdDateUtc) / 86_400_000);
        validActiveAges.push(ageDays);
      }

      const activeAgingMedian =
        validActiveAges.length === 0
          ? null
          : MedianUtils.calculateMedian(validActiveAges);
      const staleCount = validActiveAges.filter((age) => age > 90).length;

      const dateWindow =
        filter != null && filter.dateRange.type !== "ALL_TIME"
          ? filter.dateRange.resolveWindow(now)
          : null;

      let targetStatusEnum: PropertyStatus | null = null;
      if (filter?.status) {
        const raw = filter.status.trim();
        for (const [k, v] of Object.entries(PropertyStatus)) {
          if (v === raw || k.toLowerCase() === raw.toLowerCase()) {
            targetStatusEnum = v as PropertyStatus;
            break;
          }
        }
      }

      const drillDownFilter = new DrillDownFilter({
        source: DrillDownSource.OWNER_PERFORMANCE,
        contextLabel: `Chủ nhà: ${ownerName}`,
        verifiedMode: filter?.verifiedMode ?? VerifiedMode.VERIFIED_ONLY,
        excludeDraft: true,
        targetStatus: targetStatusEnum,
        targetArea: filter?.area ?? null,
        targetPropertyType: filter?.propertyType ?? null,
        targetOwnerId: ownerId,
        createdAtFrom: dateWindow?.startInclusive ?? null,
        createdAtTo: dateWindow?.endExclusive ?? null,
        priceMin: filter?.priceMin ?? null,
        priceMax: filter?.priceMax ?? null,
        areaSizeMin: filter?.areaSizeMin ?? null,
        areaSizeMax: filter?.areaSizeMax ?? null
      });

      items.push({
        ownerId,
        ownerName,
        totalPropertiesListed: totalListed,
        soldPropertiesCount: soldCount,
        activePropertiesCount: activeCount,
        activeAgingMedianDays: activeAgingMedian,
        stalePropertiesCount: staleCount,
        soldRatioProxy: soldRatio,
        displaySoldRatioPercent: displayRatioPercent,
        confidence,
        drillDownFilter
      });
    }

    // 4. Deterministic sorting: totalPropertiesListed desc -> soldPropertiesCount desc -> ownerName asc -> ownerId asc
    items.sort((a, b) => {
      if (b.totalPropertiesListed !== a.totalPropertiesListed) {
        return b.totalPropertiesListed - a.totalPropertiesListed;
      }
      if (b.soldPropertiesCount !== a.soldPropertiesCount) {
        return b.soldPropertiesCount - a.soldPropertiesCount;
      }
      const nameCmp = a.ownerName.localeCompare(b.ownerName);
      if (nameCmp !== 0) return nameCmp;
      return a.ownerId.localeCompare(b.ownerId);
    });

    return {
      totalOwnersEvaluated: items.length,
      totalSingleOwnerProperties: totalSingleOwner,
      totalExcludedMultiOwnerProperties: totalExcludedMultiOwner,
      totalExcludedNoOwnerProperties: totalExcludedNoOwner,
      totalExcludedCorruptOwnerProperties: totalExcludedCorrupt,
      items
    };
  }
};
