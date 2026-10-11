import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import {
  DrillDownFilter,
  DrillDownSource
} from "./drill-down-filter";
import {
  StatisticsFilter,
  VerifiedMode
} from "./statistics-filter";

function resolveStatusFromFilter(rawStatus?: string | null): {
  status: PropertyStatus | null;
  isUnmapped: boolean;
} {
  if (!rawStatus || rawStatus.trim().length === 0) {
    return { status: null, isUnmapped: false };
  }
  const trimmed = rawStatus.trim();
  const allStatuses = Object.values(PropertyStatus) as string[];
  const match = allStatuses.find(
    (s) => s === trimmed || s.toLowerCase() === trimmed.toLowerCase()
  );
  if (match) {
    return { status: match as PropertyStatus, isUnmapped: false };
  }
  // Check enum key names: FOR_SALE, SOLD, PENDING_SURVEY, PAUSED
  for (const [key, val] of Object.entries(PropertyStatus)) {
    if (key.toLowerCase() === trimmed.toLowerCase()) {
      return { status: val as PropertyStatus, isUnmapped: false };
    }
  }
  return { status: null, isUnmapped: true };
}

export const DrillDownFilterFactory = {
  createUnverifiedFilter(
    filter?: StatisticsFilter | null,
    now: number = Date.now(),
    source: DrillDownSource = DrillDownSource.INVENTORY
  ): DrillDownFilter {
    const window =
      filter != null && filter.dateRange.type !== "ALL_TIME"
        ? filter.dateRange.resolveWindow(now)
        : null;

    const { status, isUnmapped } = resolveStatusFromFilter(filter?.status);

    return new DrillDownFilter({
      source,
      contextLabel: "Tin chờ xác minh",
      verifiedMode: VerifiedMode.UNVERIFIED_ONLY,
      excludeDraft: true,
      targetStatus: status,
      targetArea: filter?.area,
      targetPropertyType: filter?.propertyType,
      targetOwnerId: null,
      minAgeDays: null,
      maxAgeDays: null,
      createdAtFrom: window?.startInclusive ?? null,
      createdAtTo: window?.endExclusive ?? null,
      lastEditedAtBefore: null,
      targetIssueType: null,
      deviationMin: null,
      deviationMax: null,
      priceMin: filter?.priceMin,
      priceMax: filter?.priceMax,
      areaSizeMin: filter?.areaSizeMin,
      areaSizeMax: filter?.areaSizeMax,
      isFailClosed: isUnmapped
    });
  },

  createForSaleKpiFilter(
    filter?: StatisticsFilter | null,
    now: number = Date.now(),
    source: DrillDownSource = DrillDownSource.INVENTORY
  ): DrillDownFilter {
    const window =
      filter != null && filter.dateRange.type !== "ALL_TIME"
        ? filter.dateRange.resolveWindow(now)
        : null;

    return new DrillDownFilter({
      source,
      contextLabel: "BĐS đang bán",
      verifiedMode: filter?.verifiedMode ?? VerifiedMode.ALL,
      excludeDraft: true,
      targetStatus: PropertyStatus.FOR_SALE,
      targetArea: filter?.area,
      targetPropertyType: filter?.propertyType,
      targetOwnerId: null,
      minAgeDays: null,
      maxAgeDays: null,
      createdAtFrom: window?.startInclusive ?? null,
      createdAtTo: window?.endExclusive ?? null,
      lastEditedAtBefore: null,
      targetIssueType: null,
      deviationMin: null,
      deviationMax: null,
      priceMin: filter?.priceMin,
      priceMax: filter?.priceMax,
      areaSizeMin: filter?.areaSizeMin,
      areaSizeMax: filter?.areaSizeMax,
      isFailClosed: false
    });
  },

  createSoldKpiFilter(
    filter?: StatisticsFilter | null,
    now: number = Date.now(),
    source: DrillDownSource = DrillDownSource.INVENTORY
  ): DrillDownFilter {
    const window =
      filter != null && filter.dateRange.type !== "ALL_TIME"
        ? filter.dateRange.resolveWindow(now)
        : null;

    let contextLabel = "BĐS đã bán";
    if (filter?.dateRange) {
      switch (filter.dateRange.type) {
        case "ALL_TIME":
          contextLabel = "BĐS đã bán";
          break;
        case "LAST_7_DAYS":
          contextLabel = "BĐS đã bán · bán trong 7 ngày";
          break;
        case "LAST_30_DAYS":
          contextLabel = "BĐS đã bán · bán trong 30 ngày";
          break;
        case "LAST_90_DAYS":
          contextLabel = "BĐS đã bán · bán trong 90 ngày";
          break;
        case "CUSTOM":
          contextLabel = "BĐS đã bán · bán trong kỳ";
          break;
      }
    }

    return new DrillDownFilter({
      source,
      contextLabel,
      verifiedMode: filter?.verifiedMode ?? VerifiedMode.ALL,
      excludeDraft: true,
      targetStatus: PropertyStatus.SOLD,
      targetArea: filter?.area,
      targetPropertyType: filter?.propertyType,
      targetOwnerId: null,
      createdAtFrom: null,
      createdAtTo: null,
      soldAtFrom: window?.startInclusive ?? null,
      soldAtTo: window?.endExclusive ?? null,
      priceMin: filter?.priceMin,
      priceMax: filter?.priceMax,
      areaSizeMin: filter?.areaSizeMin,
      areaSizeMax: filter?.areaSizeMax
    });
  },

  countMatching(
    properties: Property[],
    drillDownFilter: DrillDownFilter,
    now: number
  ): number {
    return properties.filter((prop) =>
      drillDownFilter.matches({
        property: prop,
        now
      })
    ).length;
  }
};
