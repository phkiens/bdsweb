import { Property } from "../models/property";
import {
  PropertyStatus,
  FilterScope,
  PropertySortType,
  PropertyListMode
} from "../models/enums";
import { normalizeVietnamese } from "../utils/vietnamese";

export interface RangeBucket {
  label: string;
  min: number | null;
  max: number | null;
}

export const PRICE_BUCKETS: RangeBucket[] = [
  { label: "<1", min: null, max: 1.0 },
  { label: "1-2", min: 1.0, max: 2.0 },
  { label: "2-3", min: 2.0, max: 3.0 },
  { label: "3-4", min: 3.0, max: 4.0 },
  { label: "4-5", min: 4.0, max: 5.0 },
  { label: "5-7", min: 5.0, max: 7.0 },
  { label: "7-10", min: 7.0, max: 10.0 },
  { label: ">10", min: 10.0, max: null }
];

export const SIZE_BUCKETS: RangeBucket[] = [
  { label: "<30", min: null, max: 30.0 },
  { label: "30-50", min: 30.0, max: 50.0 },
  { label: "50-80", min: 50.0, max: 80.0 },
  { label: "80-100", min: 80.0, max: 100.0 },
  { label: "100-150", min: 100.0, max: 150.0 },
  { label: ">150", min: 150.0, max: null }
];

/**
 * Checks if a value falls into ANY of the selected buckets (OR logic).
 * Returns true if:
 * - selectedLabels is empty
 * - value is null (missing field rule)
 * - value matches at least one selected bucket range
 */
export function matchesAnyBucket(
  value: number | null | undefined,
  selectedLabels: Set<string>,
  buckets: RangeBucket[]
): boolean {
  if (!selectedLabels || selectedLabels.size === 0 || value == null) return true;

  const activeBuckets = buckets.filter((b) => selectedLabels.has(b.label));
  if (activeBuckets.length === 0) return true;

  return activeBuckets.some((b) => {
    const minOk = b.min === null || value >= b.min;
    const maxOk = b.max === null || value <= b.max;
    return minOk && maxOk;
  });
}

export interface FilterState {
  propertyTypes?: Set<string>;
  statuses?: Set<PropertyStatus | string>;
  selectedPrices?: Set<string>;
  priceMin?: number | null;
  priceMax?: number | null;
  selectedSizes?: Set<string>;
  sizeMin?: number | null;
  sizeMax?: number | null;
  areas?: Set<string>;
  directions?: Set<string>;
  sortBy?: PropertySortType;
  scope?: FilterScope;
}

export function matchesQuery(p: Property, query: string): boolean {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return true;

  const cleanedQuery = trimmedQuery.replace(/,/g, ".");
  const doubleValue = Number(cleanedQuery);
  const isNumber = !isNaN(doubleValue) && cleanedQuery !== "";
  const digitsOnly = trimmedQuery.replace(/\D/g, "");
  const isPriceQuery =
    isNumber &&
    !(trimmedQuery.startsWith("0") && trimmedQuery.length >= 9) &&
    digitsOnly.length <= 5;

  if (isPriceQuery) {
    const normalized = Math.round(p.price * 100).toString();
    const normalizedDirect = p.price.toString().replace(/[.,]/g, "").replace(/^0+/, "");
    const qDigits = trimmedQuery.replace(/[.,]/g, "").replace(/^0+/, "");
    const matchDigits =
      normalized.startsWith(qDigits) ||
      normalized.replace(/^0+/, "").startsWith(qDigits) ||
      normalizedDirect.startsWith(qDigits);

    let matchValue = false;
    if (isNumber) {
      const diff = Math.abs(p.price - doubleValue);
      if (cleanedQuery.includes(".")) {
        const decimalPlaces = cleanedQuery.split(".")[1]?.length ?? 0;
        if (decimalPlaces === 1) {
          matchValue = p.price >= doubleValue && p.price < doubleValue + 0.1;
        } else {
          matchValue = diff < 0.015;
        }
      } else {
        if (doubleValue >= 100) {
          const valInBillion = doubleValue / 1000.0;
          matchValue = Math.abs(p.price - valInBillion) < 0.015;
        } else if (doubleValue >= 10) {
          const valInBillion = doubleValue / 10.0;
          matchValue = p.price >= valInBillion && p.price < valInBillion + 0.1;
        } else {
          matchValue = p.price >= doubleValue && p.price < doubleValue + 1.0;
        }
      }
    }
    return matchDigits || matchValue;
  } else {
    const q = normalizeVietnamese(trimmedQuery);
    return (
      normalizeVietnamese(p.area || "").includes(q) ||
      normalizeVietnamese(p.description || "").includes(q) ||
      normalizeVietnamese(p.rawText || "").includes(q) ||
      normalizeVietnamese(p.ownerName || "").includes(q) ||
      (p.ownerPhone || "").includes(trimmedQuery)
    );
  }
}

export const PropertyFilter = {
  isFilterActive(
    filter: FilterState,
    query: string = "",
    todayOnly: boolean = false
  ): boolean {
    if (query.trim().length > 0) return true;
    if (todayOnly) return true;
    if (filter.scope === FilterScope.ALL) return true;

    if (filter.propertyTypes && filter.propertyTypes.size > 0) return true;
    if (filter.statuses && filter.statuses.size > 0) return true;
    if (filter.selectedPrices && filter.selectedPrices.size > 0) return true;
    if (filter.priceMin != null || filter.priceMax != null) return true;
    if (filter.selectedSizes && filter.selectedSizes.size > 0) return true;
    if (filter.sizeMin != null || filter.sizeMax != null) return true;
    if (filter.areas && filter.areas.size > 0) return true;
    if (filter.directions && filter.directions.size > 0) return true;

    return false;
  },

  matches(
    p: Property,
    filter: FilterState,
    query: string = "",
    todayOnly: boolean = false,
    screenMode: PropertyListMode = PropertyListMode.VERIFIED
  ): boolean {
    // 0. Scope resolution
    const scope = filter.scope ?? FilterScope.CURRENT_TAB;
    if (scope === FilterScope.CURRENT_TAB) {
      if (screenMode === PropertyListMode.VERIFIED && !p.isVerified) return false;
      if (screenMode === PropertyListMode.UNVERIFIED && p.isVerified) return false;
    }

    // 1. PropertyType
    if (
      filter.propertyTypes &&
      filter.propertyTypes.size > 0 &&
      !filter.propertyTypes.has(p.propertyType)
    ) {
      return false;
    }

    // 2. Status (applies to verified properties)
    if (
      filter.statuses &&
      filter.statuses.size > 0 &&
      p.isVerified &&
      !filter.statuses.has(p.status)
    ) {
      return false;
    }

    // 3. Price (min/max or selectedPrices)
    if (filter.priceMin != null || filter.priceMax != null) {
      if (filter.priceMin != null && p.price < filter.priceMin) return false;
      if (filter.priceMax != null && p.price > filter.priceMax) return false;
    } else if (filter.selectedPrices && filter.selectedPrices.size > 0) {
      if (!matchesAnyBucket(p.price, filter.selectedPrices, PRICE_BUCKETS)) return false;
    }

    // 4. Size (min/max or selectedSizes)
    if (filter.sizeMin != null || filter.sizeMax != null) {
      if (filter.sizeMin != null && p.areaSize != null && p.areaSize < filter.sizeMin) return false;
      if (filter.sizeMax != null && p.areaSize != null && p.areaSize > filter.sizeMax) return false;
    } else if (filter.selectedSizes && filter.selectedSizes.size > 0) {
      if (!matchesAnyBucket(p.areaSize, filter.selectedSizes, SIZE_BUCKETS)) return false;
    }

    // 5. Area
    if (filter.areas && filter.areas.size > 0) {
      const matchArea = Array.from(filter.areas).some((a) =>
        normalizeVietnamese(p.area || "").includes(normalizeVietnamese(a))
      );
      if (!matchArea) return false;
    }

    // 6. Direction
    if (filter.directions && filter.directions.size > 0) {
      const dirs = (p.direction || "").split("|||");
      const matchDir = dirs.some((dir) =>
        Array.from(filter.directions!).some((d) =>
          dir.toLowerCase().includes(d.toLowerCase())
        )
      );
      if (!matchDir) return false;
    }

    // 7. Today only
    if (todayOnly && !p.needToViewToday) return false;

    // 8. Search query / Price query
    if (!matchesQuery(p, query)) return false;

    return true;
  }
};

export function sortProperties(
  properties: Property[],
  sortBy: PropertySortType = PropertySortType.NEWEST
): Property[] {
  const copy = [...properties];
  switch (sortBy) {
    case PropertySortType.PRICE_ASC:
      return copy.sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    case PropertySortType.PRICE_DESC:
      return copy.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    case PropertySortType.SIZE:
      return copy.sort((a, b) => (b.areaSize ?? 0) - (a.areaSize ?? 0));
    case PropertySortType.NEWEST:
    default:
      return copy.sort((a, b) => {
        const aEdit = a.lastEditedAt || a.updatedAt || 0;
        const bEdit = b.lastEditedAt || b.updatedAt || 0;
        if (bEdit !== aEdit) return bEdit - aEdit;
        const aCreate = a.createdAt || 0;
        const bCreate = b.createdAt || 0;
        if (bCreate !== aCreate) return bCreate - aCreate;
        return (b.id || "").localeCompare(a.id || "");
      });
  }
}
