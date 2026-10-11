import { Property } from "../models/property";
import { PropertyPriceHistory } from "../models/price-history";
import { DrillDownEvaluationContextFactory } from "./drill-down-evaluation-context-factory";
import { DrillDownFilter } from "./drill-down-filter";
import { IssueType } from "./issue-type";

export interface DrillDownApplierOptions {
  now?: number;
  ownerMap?: Map<string, { ownerCount: number; ownerId: string | null }>;
  issueMap?: Map<string, Set<IssueType>>;
  deviationMap?: Map<string, number>;
}

/**
 * Pure function to apply a DrillDownFilter to a list of properties.
 *
 * Constructs the deterministic DrillDownEvaluationContext for each property
 * and checks matches against the DrillDownFilter.
 */
export function applyDrillDownFilter(
  properties: Property[],
  filter: DrillDownFilter | null | undefined,
  options?: DrillDownApplierOptions
): Property[] {
  if (!filter) return properties;
  const now = options?.now ?? Date.now();
  const ownerMap = options?.ownerMap;
  const issueMap = options?.issueMap;
  const deviationMap = options?.deviationMap;

  return properties.filter((p) => {
    const ownerInfo = ownerMap?.get(p.id);
    const ownerCount = ownerInfo !== undefined ? ownerInfo.ownerCount : p.linkedCustomerId ? 1 : 0;
    const ownerId = ownerInfo !== undefined ? ownerInfo.ownerId : p.linkedCustomerId ?? null;
    const issues = issueMap?.get(p.id) ?? new Set<IssueType>();
    const deviation = deviationMap?.get(p.id) ?? null;

    const context = DrillDownEvaluationContextFactory.create(
      p,
      ownerCount,
      ownerId,
      issues,
      deviation,
      now
    );
    return filter.matches(context);
  });
}

/**
 * Pure function corresponding to Room's PropertyPriceHistoryDao.getAllHistories:
 * Filters out price histories with revision <= property.priceHistoryClearedRev,
 * and orders the remaining visible histories by revision ASC.
 */
export function getVisibleHistories(
  histories: PropertyPriceHistory[],
  properties: Property[]
): PropertyPriceHistory[] {
  const clearedRevMap = new Map<string, number>();
  for (const p of properties) {
    clearedRevMap.set(p.id, p.priceHistoryClearedRev ?? 0);
  }

  return histories
    .filter((h) => {
      const clearedRev = clearedRevMap.get(h.propertyId) ?? 0;
      return h.revision > clearedRev;
    })
    .sort((a, b) => a.revision - b.revision);
}
