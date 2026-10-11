import { Property } from "../models/property";
import { PropertyStatus } from "../models/enums";
import { normalizeVietnamese } from "../utils/vietnamese";

export const STATS_ZONE_ID = "Asia/Ho_Chi_Minh";

/**
 * Filter mode for property verification status.
 */
export enum VerifiedMode {
  ALL = "ALL",
  VERIFIED_ONLY = "VERIFIED_ONLY",
  UNVERIFIED_ONLY = "UNVERIFIED_ONLY"
}

/**
 * Constants for physical status string comparison.
 *
 * Strictly adheres to Section 4 of Data Contract v1.2.1:
 * - Status stores Vietnamese string literals ("Đang bán", "Đã bán", "Chờ khảo sát").
 * - Never calls fallback to FOR_SALE.
 * - Comparisons must be made against string values directly.
 */
export const PropertyStatusConstants = {
  FOR_SALE: PropertyStatus.FOR_SALE as string, // "Đang bán"
  SOLD: PropertyStatus.SOLD as string, // "Đã bán"
  PENDING_SURVEY: PropertyStatus.PENDING_SURVEY as string, // "Chờ khảo sát"

  KNOWN_STATUSES: new Set<string>([
    PropertyStatus.FOR_SALE,
    PropertyStatus.SOLD,
    PropertyStatus.PENDING_SURVEY
  ]),

  isForSale(status: string | null | undefined): boolean {
    return status === PropertyStatusConstants.FOR_SALE;
  },

  isSold(status: string | null | undefined): boolean {
    return status === PropertyStatusConstants.SOLD;
  },

  isPendingSurvey(status: string | null | undefined): boolean {
    return status === PropertyStatusConstants.PENDING_SURVEY;
  },

  isKnown(status: string | null | undefined): boolean {
    return status != null && PropertyStatusConstants.KNOWN_STATUSES.has(status);
  },

  isActiveMarket(status: string | null | undefined): boolean {
    return (
      status === PropertyStatusConstants.FOR_SALE ||
      status === PropertyStatusConstants.PENDING_SURVEY
    );
  },

  isLiquidityRelevant(status: string | null | undefined): boolean {
    return (
      status === PropertyStatusConstants.FOR_SALE ||
      status === PropertyStatusConstants.PENDING_SURVEY ||
      status === PropertyStatusConstants.SOLD
    );
  }
};

export function isActiveMarketProperty(property: Property): boolean {
  return (
    !property.isDeleted &&
    !property.isDraft &&
    PropertyStatusConstants.isActiveMarket(property.status)
  );
}

/**
 * Half-open date window [startInclusive, endExclusive) in epoch milliseconds.
 */
export class DateWindow {
  constructor(
    public readonly startInclusive: number,
    public readonly endExclusive: number
  ) {
    if (startInclusive > endExclusive) {
      throw new Error(
        `startInclusive (${startInclusive}) must be <= endExclusive (${endExclusive})`
      );
    }
  }

  contains(epochMs: number): boolean {
    return epochMs >= this.startInclusive && epochMs < this.endExclusive;
  }
}

export function getLocalDateParts(
  epochMs: number,
  timeZone: string = STATS_ZONE_ID
): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric"
  });
  const parts = formatter.formatToParts(new Date(epochMs));
  let year = 0;
  let month = 0;
  let day = 0;
  for (const part of parts) {
    if (part.type === "year") year = parseInt(part.value, 10);
    if (part.type === "month") month = parseInt(part.value, 10);
    if (part.type === "day") day = parseInt(part.value, 10);
  }
  return { year, month, day };
}

export function resolveDaysWindow(
  now: number,
  days: number,
  timeZone: string = STATS_ZONE_ID
): DateWindow {
  if (days <= 0) {
    throw new Error(`Number of days must be strictly positive, but was ${days}`);
  }
  const p = getLocalDateParts(now, timeZone);
  const todayUtc = Date.UTC(p.year, p.month - 1, p.day);
  const offsetMs = timeZone === "Asia/Ho_Chi_Minh" ? 7 * 3600 * 1000 : 0;
  const endExclusive = todayUtc + 1 * 86_400_000 - offsetMs;
  const startInclusive = todayUtc - (days - 1) * 86_400_000 - offsetMs;
  return new DateWindow(startInclusive, endExclusive);
}

export type StatisticsDateRangeType =
  | "ALL_TIME"
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "CUSTOM";

export interface IStatisticsDateRange {
  readonly type: StatisticsDateRangeType;
  resolveWindow(now: number, timeZone?: string): DateWindow | null;
}

export class CustomDateRange implements IStatisticsDateRange {
  readonly type = "CUSTOM" as const;
  constructor(
    public readonly startInclusive: number,
    public readonly endExclusive: number
  ) {}

  resolveWindow(_now: number, _timeZone?: string): DateWindow | null {
    return new DateWindow(this.startInclusive, this.endExclusive);
  }
}

export const StatisticsDateRange = {
  AllTime: {
    type: "ALL_TIME" as const,
    resolveWindow(_now: number, _timeZone?: string): DateWindow | null {
      return null;
    }
  },
  Last7Days: {
    type: "LAST_7_DAYS" as const,
    resolveWindow(now: number, timeZone: string = STATS_ZONE_ID): DateWindow | null {
      return resolveDaysWindow(now, 7, timeZone);
    }
  },
  Last30Days: {
    type: "LAST_30_DAYS" as const,
    resolveWindow(now: number, timeZone: string = STATS_ZONE_ID): DateWindow | null {
      return resolveDaysWindow(now, 30, timeZone);
    }
  },
  Last90Days: {
    type: "LAST_90_DAYS" as const,
    resolveWindow(now: number, timeZone: string = STATS_ZONE_ID): DateWindow | null {
      return resolveDaysWindow(now, 90, timeZone);
    }
  },
  Custom(startInclusive: number, endExclusive: number): CustomDateRange {
    return new CustomDateRange(startInclusive, endExclusive);
  },
  resolveDaysWindow,
  fromDates(
    startDate: { year: number; month: number; day: number },
    endDateInclusive: { year: number; month: number; day: number },
    timeZone: string = STATS_ZONE_ID
  ): CustomDateRange {
    const offsetMs = timeZone === "Asia/Ho_Chi_Minh" ? 7 * 3600 * 1000 : 0;
    const startInclusive =
      Date.UTC(startDate.year, startDate.month - 1, startDate.day) - offsetMs;
    const endExclusive =
      Date.UTC(endDateInclusive.year, endDateInclusive.month - 1, endDateInclusive.day) +
      86_400_000 -
      offsetMs;
    return new CustomDateRange(startInclusive, endExclusive);
  }
};

export type StatisticsDateRange = IStatisticsDateRange;

/**
 * Normalizes an area name into a canonical grouping key according to Section 3.1:
 * trim -> collapse multiple spaces to single space -> lowercase.
 * Vietnamese diacritics are strictly preserved.
 */
export function toCanonicalAreaKey(raw: string | null | undefined): string {
  if (raw == null) return "";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

/**
 * Normalizes propertyType into canonical type string according to domain logic:
 * "house", "nha" -> "Nhà"
 * "land", "dat" -> "Đất"
 * otherwise -> trimmed raw
 */
export function normalizePropertyType(input: string | null | undefined): string {
  if (input == null) return "";
  const trimmed = input.trim();
  const normalized = normalizeVietnamese(trimmed);
  switch (normalized) {
    case "house":
    case "nha":
      return "Nhà";
    case "land":
    case "dat":
      return "Đất";
    default:
      return trimmed;
  }
}

/**
 * Normalizes a propertyType into a canonical grouping key according to Section 3.1:
 * normalizePropertyType() domain logic first -> trim -> collapse space -> lowercase.
 * Vietnamese diacritics are strictly preserved.
 */
export function toCanonicalPropertyTypeKey(raw: string | null | undefined): string {
  if (raw == null) return "";
  const domainNormalized = normalizePropertyType(raw);
  return domainNormalized
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export interface StatisticsFilterOptions {
  dateRange?: StatisticsDateRange;
  area?: string | null;
  propertyType?: string | null;
  status?: string | null;
  verifiedMode?: VerifiedMode;
  priceMin?: number | null;
  priceMax?: number | null;
  areaSizeMin?: number | null;
  areaSizeMax?: number | null;
  ownerId?: string | null;
}

export class StatisticsFilter {
  public readonly dateRange: StatisticsDateRange;
  public readonly area: string | null;
  public readonly propertyType: string | null;
  public readonly status: string | null;
  public readonly verifiedMode: VerifiedMode;
  public readonly priceMin: number | null;
  public readonly priceMax: number | null;
  public readonly areaSizeMin: number | null;
  public readonly areaSizeMax: number | null;
  public readonly ownerId: string | null;

  constructor(options: StatisticsFilterOptions = {}) {
    this.dateRange = options.dateRange ?? StatisticsDateRange.AllTime;
    this.area = options.area ?? null;
    this.propertyType = options.propertyType ?? null;
    this.status = options.status ?? null;
    this.verifiedMode = options.verifiedMode ?? VerifiedMode.ALL;
    this.priceMin = options.priceMin ?? null;
    this.priceMax = options.priceMax ?? null;
    this.areaSizeMin = options.areaSizeMin ?? null;
    this.areaSizeMax = options.areaSizeMax ?? null;
    this.ownerId = options.ownerId ?? null;

    if (this.priceMin != null) {
      if (!Number.isFinite(this.priceMin) || Number.isNaN(this.priceMin) || this.priceMin < 0.0) {
        throw new Error(
          `priceMin must be finite and non-negative, but was ${this.priceMin}`
        );
      }
    }
    if (this.priceMax != null) {
      if (!Number.isFinite(this.priceMax) || Number.isNaN(this.priceMax) || this.priceMax < 0.0) {
        throw new Error(
          `priceMax must be finite and non-negative, but was ${this.priceMax}`
        );
      }
    }
    if (this.priceMin != null && this.priceMax != null) {
      if (this.priceMin > this.priceMax) {
        throw new Error(
          `priceMin (${this.priceMin}) must not exceed priceMax (${this.priceMax})`
        );
      }
    }

    if (this.areaSizeMin != null) {
      if (
        !Number.isFinite(this.areaSizeMin) ||
        Number.isNaN(this.areaSizeMin) ||
        this.areaSizeMin < 0.0
      ) {
        throw new Error(
          `areaSizeMin must be finite and non-negative, but was ${this.areaSizeMin}`
        );
      }
    }
    if (this.areaSizeMax != null) {
      if (
        !Number.isFinite(this.areaSizeMax) ||
        Number.isNaN(this.areaSizeMax) ||
        this.areaSizeMax < 0.0
      ) {
        throw new Error(
          `areaSizeMax must be finite and non-negative, but was ${this.areaSizeMax}`
        );
      }
    }
    if (this.areaSizeMin != null && this.areaSizeMax != null) {
      if (this.areaSizeMin > this.areaSizeMax) {
        throw new Error(
          `areaSizeMin (${this.areaSizeMin}) must not exceed areaSizeMax (${this.areaSizeMax})`
        );
      }
    }
  }

  matches(
    property: Property,
    now: number | null = null,
    excludeDeleted: boolean = true,
    excludeDraft: boolean = true,
    checkDateWindow: boolean = true
  ): boolean {
    if (excludeDeleted && property.isDeleted) return false;
    if (excludeDraft && property.isDraft) return false;

    switch (this.verifiedMode) {
      case VerifiedMode.ALL:
        break;
      case VerifiedMode.VERIFIED_ONLY:
        if (!property.isVerified) return false;
        break;
      case VerifiedMode.UNVERIFIED_ONLY:
        if (property.isVerified) return false;
        break;
    }

    if (this.status != null && property.status !== this.status) {
      return false;
    }

    if (this.area != null && this.area.trim().length > 0) {
      const targetKey = toCanonicalAreaKey(this.area);
      if (targetKey.length > 0 && toCanonicalAreaKey(property.area) !== targetKey) {
        return false;
      }
    }

    if (this.propertyType != null && this.propertyType.trim().length > 0) {
      const targetKey = toCanonicalPropertyTypeKey(this.propertyType);
      if (targetKey.length > 0 && toCanonicalPropertyTypeKey(property.propertyType) !== targetKey) {
        return false;
      }
    }

    if (this.priceMin != null || this.priceMax != null) {
      if (!Number.isFinite(property.price) || Number.isNaN(property.price) || property.price <= 0.0) {
        return false;
      }
      if (this.priceMin != null && property.price < this.priceMin) return false;
      if (this.priceMax != null && property.price >= this.priceMax) return false;
    }

    if (this.areaSizeMin != null || this.areaSizeMax != null) {
      const size = property.areaSize;
      if (size == null || !Number.isFinite(size) || Number.isNaN(size) || size <= 0.0) {
        return false;
      }
      if (this.areaSizeMin != null && size < this.areaSizeMin) return false;
      if (this.areaSizeMax != null && size >= this.areaSizeMax) return false;
    }

    if (checkDateWindow && this.dateRange.type !== "ALL_TIME") {
      if (now == null) {
        throw new Error(
          `now parameter must be supplied when date filtering is enabled for non-AllTime dateRange (${this.dateRange.type})`
        );
      }
      const window = this.dateRange.resolveWindow(now);
      if (window != null && !window.contains(property.createdAt)) {
        return false;
      }
    }

    return true;
  }
}
