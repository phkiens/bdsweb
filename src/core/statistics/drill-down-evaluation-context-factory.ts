import { Property } from "../models/property";
import { DrillDownEvaluationContext } from "./drill-down-filter";
import { IssueType } from "./issue-type";
import { getLocalDateParts, STATS_ZONE_ID } from "./statistics-filter";

export const DrillDownEvaluationContextFactory = {
  /**
   * Constructs a deterministic DrillDownEvaluationContext for property filtering.
   *
   * @param property the candidate property.
   * @param ownerCount number of owners associated with this property.
   * @param ownerId ID of the single owner (only provided when ownerCount === 1).
   * @param issueTypes set of detected IssueType issues for this property.
   * @param deviationPercent price deviation percent from Deal Finder analysis.
   * @param now current timestamp in milliseconds (mandatory, no default).
   */
  create(
    property: Property,
    ownerCount: number = 0,
    ownerId?: string | null,
    issueTypes: Set<IssueType> | IssueType[] = new Set<IssueType>(),
    deviationPercent?: number | null,
    now: number = Date.now()
  ): DrillDownEvaluationContext {
    const pNow = getLocalDateParts(now, STATS_ZONE_ID);
    const nowDateUtc = Date.UTC(pNow.year, pNow.month - 1, pNow.day);

    // Calculate ageDays: invalid (createdAt <= 0) or future date returns null
    let ageDays: number | null = null;
    if (property.createdAt > 0) {
      const pCreated = getLocalDateParts(property.createdAt, STATS_ZONE_ID);
      const createdDateUtc = Date.UTC(pCreated.year, pCreated.month - 1, pCreated.day);
      if (createdDateUtc <= nowDateUtc) {
        ageDays = Math.round((nowDateUtc - createdDateUtc) / 86_400_000);
      }
    }

    // Single-owner guard: only expose ownerId when ownerCount === 1
    const resolvedOwnerId = ownerCount === 1 ? (ownerId ?? null) : null;

    return {
      property,
      ownerId: resolvedOwnerId,
      issueTypes,
      ageDays,
      deviationPercent: deviationPercent ?? null,
      now
    };
  }
};
