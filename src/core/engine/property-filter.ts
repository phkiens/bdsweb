import { Property } from "../models/property";
import {
  PropertyStatus,
  FilterScope,
  PropertySortType,
  PropertyListMode
} from "../models/enums";
import { containsWholeWords, normalizeSearch, normalizeVietnamese } from "../utils/vietnamese";
import {
  isPhoneQuery,
  normalizePhone,
  normalizePhoneQuery
} from "./customer-filter";

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

// "2 tỷ", "2.5ty" → tìm theo giá như "2", "2.5"
export const PRICE_UNIT_SUFFIX_REGEX = /\s*(tỷ|tỉ|ty|ti)$/i;

/** Chuỗi số bắt đầu bằng "0<số>" (>= 3 chữ số) hoặc "+" là SĐT, không phải giá ("0905" ≠ 0,905 tỷ; "0.95" vẫn là giá). */
export function isOwnerPhoneQuery(query: string): boolean {
  if (!isPhoneQuery(query)) return false;
  if (query.startsWith("+")) return true;
  return (
    query.length >= 2 &&
    query[0] === "0" &&
    query[1] >= "0" &&
    query[1] <= "9" &&
    (query.match(/\d/g) || []).length >= 3
  );
}

export function isPriceQuery(trimmedQuery: string): boolean {
  const cleanedQuery = trimmedQuery.replace(PRICE_UNIT_SUFFIX_REGEX, "").replace(/,/g, ".");
  const doubleValue = Number(cleanedQuery);
  const isNumber = !isNaN(doubleValue) && cleanedQuery.trim() !== "";
  const digitsOnly = trimmedQuery.replace(/\D/g, "");
  return (
    isNumber &&
    !(trimmedQuery.startsWith("0") && trimmedQuery.length >= 9) &&
    digitsOnly.length <= 5
  );
}

function matchesPhoneQuery(p: Property, query: string): boolean {
  const normQuery = normalizePhoneQuery(query);
  if (!normQuery) return true; // đang gõ dở "+84" → chưa lọc
  return normalizePhone(p.ownerPhone || "").includes(normQuery);
}

function searchFields(p: Property, allowOwnerIdentityMatch: boolean): string[] {
  const fields = [p.area || ""];
  if (allowOwnerIdentityMatch) {
    if (p.ownerName) fields.push(p.ownerName);
    if (p.ownerPhone) fields.push(p.ownerPhone);
  }
  return fields;
}

function accentFold(text: string): string {
  return (text || "").normalize("NFC").toLowerCase();
}

export interface RankedResults {
  items: Property[];
  ownerMatchStart: number;
}

/**
 * Xếp kết quả tìm (đã lọc bằng matchesQuery): tin khớp KHU VỰC lên trước, tin chỉ khớp nhờ chủ xuống
 * sau (tên người hay có "Văn", "Thị"… nên gõ "văn" dễ lẫn chủ). Trong mỗi nhóm, khớp ĐÚNG DẤU lên trước
 * ("văn" → "Văn" trước "Vân"). Sắp xếp ổn định → giữ thứ tự đã sắp trong từng nhóm. SĐT / giá → giữ nguyên.
 */
export function rankSearchResults(
  properties: Property[],
  query: string,
  allowOwnerIdentityMatch: boolean = true
): RankedResults {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0 || isOwnerPhoneQuery(trimmedQuery) || isPriceQuery(trimmedQuery)) {
    return { items: properties, ownerMatchStart: -1 };
  }
  const plain = normalizeSearch(trimmedQuery);
  const plainWords = plain.split(" ").filter((it) => it.length > 0);
  const folded = accentFold(trimmedQuery);
  const accentWords = folded === plain ? [] : folded.split(" ").filter((it) => it.length > 0);

  function group(p: Property): number {
    const area = normalizeSearch(p.area || "");
    const areaMatch = plainWords.every((it) => area.includes(it));
    const fields = areaMatch ? [p.area || ""] : searchFields(p, allowOwnerIdentityMatch);
    const haystack = fields.map(accentFold).join("\n");
    const exactAccent = accentWords.length > 0 && accentWords.every((it) => haystack.includes(it));
    return (areaMatch ? 0 : 2) + (exactAccent ? 0 : 1);
  }

  const ranked = properties
    .map((p, idx) => ({ p, g: group(p), idx }))
    .sort((a, b) => a.g - b.g || a.idx - b.idx);

  const ownerMatchStart = ranked.findIndex((r) => r.g >= 2);
  return {
    items: ranked.map((r) => r.p),
    ownerMatchStart
  };
}

export function matchesQuery(
  p: Property,
  query: string,
  allowOwnerIdentityMatch: boolean = true
): boolean {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) return true;

  if (isOwnerPhoneQuery(trimmedQuery)) {
    return allowOwnerIdentityMatch && matchesPhoneQuery(p, trimmedQuery);
  }

  if (isPriceQuery(trimmedQuery)) {
    const cleanedQuery = trimmedQuery.replace(PRICE_UNIT_SUFFIX_REGEX, "").replace(/,/g, ".");
    const doubleValue = Number(cleanedQuery);
    const normalized = Math.round(p.price * 100).toString();
    const normalizedDirect = p.price.toString().replace(/[.,]/g, "").replace(/^0+/, "");
    const qDigits = cleanedQuery.replace(/[.]/g, "").replace(/^0+/, "");
    const matchDigits =
      normalized.startsWith(qDigits) ||
      normalized.replace(/^0+/, "").startsWith(qDigits) ||
      normalizedDirect.startsWith(qDigits);

    let matchValue = false;
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
    return matchDigits || matchValue;
  } else {
    // Bỏ dấu ("hoa xuan" = "Hòa Xuân" = "Hoà Xuân") và mỗi từ chỉ cần có ở một ô, không cần đúng thứ tự.
    // Chỉ tìm trong KHU VỰC + tên/SĐT chủ — KHÔNG tìm trong mô tả/tin gốc/tiêu đề.
    const queryWords = normalizeSearch(trimmedQuery).split(" ").filter((it) => it.length > 0);
    const haystack = searchFields(p, allowOwnerIdentityMatch).map(normalizeSearch).join("\n");
    return queryWords.every((it) => haystack.includes(it));
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
    screenMode: PropertyListMode = PropertyListMode.VERIFIED,
    allowOwnerIdentityMatch: boolean = true
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

    // 5. Area — bỏ dấu ("Hòa" = "Hoà") và khớp nguyên từ ("Quận 1" không khớp "Quận 10")
    if (filter.areas && filter.areas.size > 0) {
      const area = normalizeSearch(p.area || "");
      const matchArea = Array.from(filter.areas).some((a) =>
        containsWholeWords(area, normalizeSearch(a))
      );
      if (!matchArea) return false;
    }

    // 6. Direction
    if (filter.directions && filter.directions.size > 0) {
      const selectedNorms = new Set(
        Array.from(filter.directions)
          .map((d) => normalizeVietnamese(d))
          .filter((d) => d.length > 0)
      );
      if (selectedNorms.size > 0) {
        if (!p.direction || !p.direction.trim()) return false;
        const dirs = p.direction.split("|||");
        const matchDir = dirs.some((dir) => {
          const norm = normalizeVietnamese(dir);
          return norm.length > 0 && selectedNorms.has(norm);
        });
        if (!matchDir) return false;
      }
    }

    // 7. Today only
    if (todayOnly && !p.needToViewToday) return false;

    // 8. Search query / Price query / Phone query
    if (!matchesQuery(p, query, allowOwnerIdentityMatch)) return false;

    return true;
  },

  matchesQuery,
  rankSearchResults
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
