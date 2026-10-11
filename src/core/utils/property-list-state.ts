import { FilterState } from "../engine/property-filter";
import {
  PropertyStatus,
  PropertySortType,
  FilterScope
} from "../models/enums";
import { settingsManager, FilterMode } from "../../data/local/settings-manager";

export const PROPERTY_LIST_VIEW_STATE_KEY = "bds_property_list_view_state";
export const PROPERTY_LIST_VIEW_STATE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PropertyListViewState {
  searchQuery: string;
  viewTodayOnly: boolean;
  filterState: FilterState;
}

export function createDefaultFilterState(): FilterState {
  return {
    propertyTypes: new Set(),
    statuses: new Set(),
    selectedPrices: new Set(),
    priceMin: null,
    priceMax: null,
    selectedSizes: new Set(),
    sizeMin: null,
    sizeMax: null,
    areas: new Set(),
    directions: new Set(),
    sortBy: PropertySortType.NEWEST,
    scope: FilterScope.CURRENT_TAB
  };
}

export function createDefaultPropertyListState(): PropertyListViewState {
  return {
    searchQuery: "",
    viewTodayOnly: false,
    filterState: createDefaultFilterState()
  };
}

const VALID_STATUSES = new Set<string>(Object.values(PropertyStatus));
const VALID_SORT_TYPES = new Set<string>(Object.values(PropertySortType));
const VALID_SCOPES = new Set<string>(Object.values(FilterScope));

function sanitizeRangeNumber(val: unknown): number | null {
  if (typeof val === "number" && Number.isFinite(val)) {
    return val;
  }
  return null;
}

function sanitizeStringSet(raw: unknown): Set<string> {
  if (!Array.isArray(raw)) return new Set();
  const set = new Set<string>();
  for (const item of raw) {
    if (typeof item === "string" && item.trim().length > 0) {
      set.add(item);
    }
  }
  return set;
}

function sanitizeStatusSet(raw: unknown): Set<PropertyStatus | string> {
  if (!Array.isArray(raw)) return new Set();
  const set = new Set<PropertyStatus | string>();
  for (const item of raw) {
    if (typeof item === "string" && VALID_STATUSES.has(item)) {
      set.add(item as PropertyStatus);
    }
  }
  return set;
}

function sanitizeSortBy(val: unknown): PropertySortType {
  if (typeof val === "string" && VALID_SORT_TYPES.has(val)) {
    return val as PropertySortType;
  }
  return PropertySortType.NEWEST;
}

function sanitizeScope(val: unknown): FilterScope {
  if (typeof val === "string" && VALID_SCOPES.has(val)) {
    return val as FilterScope;
  }
  return FilterScope.CURRENT_TAB;
}

function getBrowserStorage(): StorageLike | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof localStorage !== "undefined") {
      return localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function loadPropertyListState(storage?: StorageLike | null): PropertyListViewState {
  const settings = settingsManager.getSettings();
  const filterMode =
    settings.filterMode ??
    (settings.rememberLastFilter ? FilterMode.LAST_USED : FilterMode.ALL);

  if (storage === undefined) {
    if (filterMode === FilterMode.ALL) {
      return createDefaultPropertyListState();
    }

    if (filterMode === FilterMode.FIXED) {
      const fixedState = createDefaultPropertyListState();
      if (settings.defaultPropertyType && settings.defaultPropertyType.trim()) {
        fixedState.filterState.propertyTypes = new Set([settings.defaultPropertyType.trim()]);
      }
      if (settings.defaultStatus && settings.defaultStatus.trim()) {
        fixedState.filterState.statuses = new Set([settings.defaultStatus.trim()]);
      }
      return fixedState;
    }
  }

  const targetStorage = storage !== undefined ? storage : getBrowserStorage();
  if (!targetStorage) {
    return createDefaultPropertyListState();
  }
  try {
    const raw = targetStorage.getItem(PROPERTY_LIST_VIEW_STATE_KEY);
    if (!raw) {
      return createDefaultPropertyListState();
    }

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return createDefaultPropertyListState();
    }

    if (parsed.version !== PROPERTY_LIST_VIEW_STATE_VERSION) {
      return createDefaultPropertyListState();
    }

    const searchQuery = typeof parsed.searchQuery === "string" ? parsed.searchQuery : "";
    const viewTodayOnly = typeof parsed.viewTodayOnly === "boolean" ? parsed.viewTodayOnly : false;

    const rawFilter =
      parsed.filterState &&
      typeof parsed.filterState === "object" &&
      !Array.isArray(parsed.filterState)
        ? parsed.filterState
        : {};

    const filterState: FilterState = {
      propertyTypes: sanitizeStringSet(rawFilter.propertyTypes),
      statuses: sanitizeStatusSet(rawFilter.statuses),
      selectedPrices: sanitizeStringSet(rawFilter.selectedPrices),
      priceMin: sanitizeRangeNumber(rawFilter.priceMin),
      priceMax: sanitizeRangeNumber(rawFilter.priceMax),
      selectedSizes: sanitizeStringSet(rawFilter.selectedSizes),
      sizeMin: sanitizeRangeNumber(rawFilter.sizeMin),
      sizeMax: sanitizeRangeNumber(rawFilter.sizeMax),
      areas: sanitizeStringSet(rawFilter.areas),
      directions: sanitizeStringSet(rawFilter.directions),
      sortBy: sanitizeSortBy(rawFilter.sortBy),
      scope: sanitizeScope(rawFilter.scope)
    };

    return {
      searchQuery,
      viewTodayOnly,
      filterState
    };
  } catch {
    return createDefaultPropertyListState();
  }
}

export function savePropertyListState(
  state: PropertyListViewState,
  storage?: StorageLike | null
): void {
  const targetStorage = storage !== undefined ? storage : getBrowserStorage();
  if (!targetStorage) {
    return;
  }

  try {
    const fs = state.filterState || {};
    const serialized = {
      version: PROPERTY_LIST_VIEW_STATE_VERSION,
      searchQuery: typeof state.searchQuery === "string" ? state.searchQuery : "",
      viewTodayOnly: Boolean(state.viewTodayOnly),
      filterState: {
        propertyTypes: fs.propertyTypes ? Array.from(fs.propertyTypes) : [],
        statuses: fs.statuses ? Array.from(fs.statuses) : [],
        selectedPrices: fs.selectedPrices ? Array.from(fs.selectedPrices) : [],
        priceMin: sanitizeRangeNumber(fs.priceMin),
        priceMax: sanitizeRangeNumber(fs.priceMax),
        selectedSizes: fs.selectedSizes ? Array.from(fs.selectedSizes) : [],
        sizeMin: sanitizeRangeNumber(fs.sizeMin),
        sizeMax: sanitizeRangeNumber(fs.sizeMax),
        areas: fs.areas ? Array.from(fs.areas) : [],
        directions: fs.directions ? Array.from(fs.directions) : [],
        sortBy: sanitizeSortBy(fs.sortBy),
        scope: sanitizeScope(fs.scope)
      }
    };

    targetStorage.setItem(PROPERTY_LIST_VIEW_STATE_KEY, JSON.stringify(serialized));
  } catch {
    // Storage quota exceeded or disabled - silently ignore
  }
}

