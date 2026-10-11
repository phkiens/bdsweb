import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import {
  toCanonicalAreaKey,
  toCanonicalPropertyTypeKey,
  VerifiedMode
} from "./statistics-filter";
import { IssueType, ALL_ISSUE_TYPES } from "./issue-type";

export enum DrillDownSource {
  AGING_BUCKET = "AGING_BUCKET",
  DATA_QUALITY_ISSUE = "DATA_QUALITY_ISSUE",
  ACTION_CENTER = "ACTION_CENTER",
  OWNER_PERFORMANCE = "OWNER_PERFORMANCE",
  DEAL_FINDER = "DEAL_FINDER",
  INVENTORY = "INVENTORY"
}

export interface DrillDownEvaluationContext {
  property: Property;
  ownerId?: string | null;
  issueTypes?: Set<IssueType> | IssueType[];
  ageDays?: number | null;
  deviationPercent?: number | null;
  now?: number | null;
}

export interface DrillDownFilterOptions {
  source: DrillDownSource;
  contextLabel: string;
  verifiedMode?: VerifiedMode;
  excludeDraft?: boolean;
  targetStatus?: PropertyStatus | string | null;
  targetArea?: string | null;
  targetPropertyType?: string | null;
  targetOwnerId?: string | null;
  minAgeDays?: number | null;
  maxAgeDays?: number | null;
  createdAtFrom?: number | null;
  createdAtTo?: number | null;
  soldAtFrom?: number | null;
  soldAtTo?: number | null;
  lastEditedAtBefore?: number | null;
  targetIssueType?: IssueType | null;
  deviationMin?: number | null;
  deviationMax?: number | null;
  priceMin?: number | null;
  priceMax?: number | null;
  areaSizeMin?: number | null;
  areaSizeMax?: number | null;
  isFailClosed?: boolean;
}

export class DrillDownFilter {
  public readonly source: DrillDownSource;
  public readonly contextLabel: string;
  public readonly verifiedMode: VerifiedMode;
  public readonly excludeDraft: boolean;
  public readonly targetStatus: PropertyStatus | null;
  public readonly targetArea: string | null;
  public readonly targetPropertyType: string | null;
  public readonly targetOwnerId: string | null;
  public readonly minAgeDays: number | null;
  public readonly maxAgeDays: number | null;
  public readonly createdAtFrom: number | null;
  public readonly createdAtTo: number | null;
  public readonly soldAtFrom: number | null;
  public readonly soldAtTo: number | null;
  public readonly lastEditedAtBefore: number | null;
  public readonly targetIssueType: IssueType | null;
  public readonly deviationMin: number | null;
  public readonly deviationMax: number | null;
  public readonly priceMin: number | null;
  public readonly priceMax: number | null;
  public readonly areaSizeMin: number | null;
  public readonly areaSizeMax: number | null;
  public readonly isFailClosed: boolean;

  constructor(options: DrillDownFilterOptions) {
    this.source = options.source;
    this.contextLabel = options.contextLabel;
    this.verifiedMode = options.verifiedMode ?? VerifiedMode.ALL;
    this.excludeDraft = options.excludeDraft ?? false;
    this.targetStatus = (options.targetStatus as PropertyStatus) ?? null;
    this.targetArea = options.targetArea ?? null;
    this.targetPropertyType = options.targetPropertyType ?? null;
    this.targetOwnerId = options.targetOwnerId ?? null;
    this.minAgeDays = options.minAgeDays ?? null;
    this.maxAgeDays = options.maxAgeDays ?? null;
    this.createdAtFrom = options.createdAtFrom ?? null;
    this.createdAtTo = options.createdAtTo ?? null;
    this.soldAtFrom = options.soldAtFrom ?? null;
    this.soldAtTo = options.soldAtTo ?? null;
    this.lastEditedAtBefore = options.lastEditedAtBefore ?? null;
    this.targetIssueType = options.targetIssueType ?? null;
    this.deviationMin = options.deviationMin ?? null;
    this.deviationMax = options.deviationMax ?? null;
    this.priceMin = options.priceMin ?? null;
    this.priceMax = options.priceMax ?? null;
    this.areaSizeMin = options.areaSizeMin ?? null;
    this.areaSizeMax = options.areaSizeMax ?? null;
    this.isFailClosed = options.isFailClosed ?? false;
  }

  matches(context: DrillDownEvaluationContext): boolean {
    if (this.isFailClosed) return false;
    const prop = context.property;
    if (prop.isDeleted) return false;

    // 1. Draft check
    if (this.excludeDraft && prop.isDraft) return false;

    // 2. Verified mode
    switch (this.verifiedMode) {
      case VerifiedMode.VERIFIED_ONLY:
        if (!prop.isVerified) return false;
        break;
      case VerifiedMode.UNVERIFIED_ONLY:
        if (prop.isVerified) return false;
        break;
      case VerifiedMode.ALL:
        break;
    }

    // 3. Physical status
    if (this.targetStatus != null) {
      const matchValue =
        prop.status === (this.targetStatus as any) ||
        (typeof this.targetStatus === "string" &&
          prop.status.toLowerCase() === this.targetStatus.toLowerCase());
      if (!matchValue) return false;
    }

    // 4. Area
    if (this.targetArea != null && this.targetArea.trim().length > 0) {
      const targetKey = toCanonicalAreaKey(this.targetArea);
      if (targetKey.length > 0 && toCanonicalAreaKey(prop.area) !== targetKey) {
        return false;
      }
    }

    // 5. Property type
    if (this.targetPropertyType != null && this.targetPropertyType.trim().length > 0) {
      const targetKey = toCanonicalPropertyTypeKey(this.targetPropertyType);
      if (targetKey.length > 0 && toCanonicalPropertyTypeKey(prop.propertyType) !== targetKey) {
        return false;
      }
    }

    // 6. Target owner id (fail-closed if context.ownerId is null)
    if (this.targetOwnerId != null) {
      if (context.ownerId == null || context.ownerId !== this.targetOwnerId) {
        return false;
      }
    }

    // 7. Target issue type (fail-closed if context.issueTypes is empty)
    if (this.targetIssueType != null) {
      if (!context.issueTypes) return false;
      let hasIssue = false;
      if (context.issueTypes instanceof Set) {
        hasIssue = context.issueTypes.has(this.targetIssueType);
      } else if (Array.isArray(context.issueTypes)) {
        hasIssue = context.issueTypes.some(
          (it) => it.name === this.targetIssueType!.name
        );
      }
      if (!hasIssue) return false;
    }

    // 8. Age range in days (fail-closed if context.ageDays is null)
    if (this.minAgeDays != null || this.maxAgeDays != null) {
      const age = context.ageDays;
      if (age == null) return false;
      if (this.minAgeDays != null && age < this.minAgeDays) return false;
      if (this.maxAgeDays != null && age > this.maxAgeDays) return false;
    }

    // 9. Created at range [fromInclusive, toExclusive)
    if (this.createdAtFrom != null || this.createdAtTo != null) {
      const created = prop.createdAt;
      if (this.createdAtFrom != null && created < this.createdAtFrom) return false;
      if (this.createdAtTo != null && created >= this.createdAtTo) return false;
    }

    // 9b. Sold at range [fromInclusive, toExclusive) with fail-closed matching
    if (this.soldAtFrom != null || this.soldAtTo != null) {
      const sold = prop.soldAt;
      if (sold == null) return false;
      if (this.soldAtFrom != null && sold < this.soldAtFrom) return false;
      if (this.soldAtTo != null && sold >= this.soldAtTo) return false;
    }

    // 10. Last edited before (half-open window: 0 < lastEditedAt <= now && lastEditedAt < lastEditedAtBefore)
    if (this.lastEditedAtBefore != null) {
      const edited = prop.lastEditedAt;
      if (edited <= 0) return false;
      const nowMs = context.now ?? Date.now();
      if (edited > nowMs) return false;
      if (edited >= this.lastEditedAtBefore) return false;
    }

    // 11. Deviation percent (fail-closed if context.deviationPercent is null or non-finite)
    if (this.deviationMin != null || this.deviationMax != null) {
      const dev = context.deviationPercent;
      if (dev == null || !Number.isFinite(dev) || Number.isNaN(dev)) return false;
      if (this.deviationMin != null && dev < this.deviationMin) return false;
      if (this.deviationMax != null && dev >= this.deviationMax) return false;
    }

    // 12. Price numeric range [minInclusive, maxExclusive) with fail-closed checks
    if (this.priceMin != null || this.priceMax != null) {
      if (!Number.isFinite(prop.price) || Number.isNaN(prop.price) || prop.price <= 0.0) {
        return false;
      }
      if (this.priceMin != null && prop.price < this.priceMin) return false;
      if (this.priceMax != null && prop.price >= this.priceMax) return false;
    }

    // 13. Area size numeric range [minInclusive, maxExclusive) with fail-closed checks
    if (this.areaSizeMin != null || this.areaSizeMax != null) {
      const size = prop.areaSize;
      if (size == null || !Number.isFinite(size) || Number.isNaN(size) || size <= 0.0) {
        return false;
      }
      if (this.areaSizeMin != null && size < this.areaSizeMin) return false;
      if (this.areaSizeMax != null && size >= this.areaSizeMax) return false;
    }

    return true;
  }
}

function resolvePropertyStatus(val: any): PropertyStatus | null {
  if (!val) return null;
  if (val === PropertyStatus.FOR_SALE || val === "FOR_SALE") return PropertyStatus.FOR_SALE;
  if (val === PropertyStatus.SOLD || val === "SOLD") return PropertyStatus.SOLD;
  if (val === PropertyStatus.PENDING_SURVEY || val === "PENDING_SURVEY") return PropertyStatus.PENDING_SURVEY;
  if (val === PropertyStatus.PAUSED || val === "PAUSED") return PropertyStatus.PAUSED;
  return null;
}

export const DrillDownJsonCodec = {
  encodeJson(filter: DrillDownFilter): string {
    const raw: any = {
      source: filter.source,
      contextLabel: filter.contextLabel,
      verifiedMode: filter.verifiedMode,
      excludeDraft: filter.excludeDraft,
      targetStatus: filter.targetStatus ?? null,
      targetArea: filter.targetArea,
      targetPropertyType: filter.targetPropertyType,
      targetOwnerId: filter.targetOwnerId,
      minAgeDays: filter.minAgeDays,
      maxAgeDays: filter.maxAgeDays,
      createdAtFrom: filter.createdAtFrom,
      createdAtTo: filter.createdAtTo,
      soldAtFrom: filter.soldAtFrom,
      soldAtTo: filter.soldAtTo,
      lastEditedAtBefore: filter.lastEditedAtBefore,
      targetIssueType: filter.targetIssueType ? filter.targetIssueType.name : null,
      deviationMin: filter.deviationMin,
      deviationMax: filter.deviationMax,
      priceMin: filter.priceMin,
      priceMax: filter.priceMax,
      areaSizeMin: filter.areaSizeMin,
      areaSizeMax: filter.areaSizeMax,
      isFailClosed: filter.isFailClosed
    };
    return JSON.stringify(raw);
  },

  decodeJson(jsonString: string | null | undefined): DrillDownFilter | null {
    if (jsonString == null || jsonString.trim().length === 0) return null;
    try {
      const obj = JSON.parse(jsonString);
      if (!obj || typeof obj !== "object") return null;

      // Source validation
      const validSources = Object.values(DrillDownSource);
      if (!validSources.includes(obj.source)) return null;

      // VerifiedMode validation
      let verifiedMode = VerifiedMode.ALL;
      if (obj.verifiedMode != null) {
        if (!Object.values(VerifiedMode).includes(obj.verifiedMode)) {
          return null; // Fail-closed on invalid verifiedMode
        }
        verifiedMode = obj.verifiedMode;
      }

      // TargetStatus validation
      let targetStatus: PropertyStatus | null = null;
      if (obj.targetStatus != null) {
        targetStatus = resolvePropertyStatus(obj.targetStatus);
        if (!targetStatus) {
          return null; // Fail-closed on invalid targetStatus
        }
      }

      // TargetIssueType validation
      let targetIssueType: IssueType | null = null;
      if (obj.targetIssueType != null) {
        targetIssueType =
          ALL_ISSUE_TYPES.find((it) => it.name === obj.targetIssueType) ?? null;
        if (!targetIssueType) {
          return null; // Fail-closed on invalid targetIssueType
        }
      }

      return new DrillDownFilter({
        source: obj.source,
        contextLabel: obj.contextLabel ?? "",
        verifiedMode,
        excludeDraft: Boolean(obj.excludeDraft),
        targetStatus,
        targetArea: obj.targetArea ?? null,
        targetPropertyType: obj.targetPropertyType ?? null,
        targetOwnerId: obj.targetOwnerId ?? null,
        minAgeDays: obj.minAgeDays ?? null,
        maxAgeDays: obj.maxAgeDays ?? null,
        createdAtFrom: obj.createdAtFrom ?? null,
        createdAtTo: obj.createdAtTo ?? null,
        soldAtFrom: obj.soldAtFrom ?? null,
        soldAtTo: obj.soldAtTo ?? null,
        lastEditedAtBefore: obj.lastEditedAtBefore ?? null,
        targetIssueType,
        deviationMin: obj.deviationMin ?? null,
        deviationMax: obj.deviationMax ?? null,
        priceMin: obj.priceMin ?? null,
        priceMax: obj.priceMax ?? null,
        areaSizeMin: obj.areaSizeMin ?? null,
        areaSizeMax: obj.areaSizeMax ?? null,
        isFailClosed: Boolean(obj.isFailClosed)
      });
    } catch {
      return null;
    }
  }
};
