import { FilterMode, MapZoomScope, PropertyStatus } from "../../core/models/enums";

export { FilterMode, MapZoomScope, PropertyStatus };

export const ZOOM_KEEP_CURRENT = -1.0;

export interface MapZoomScopeItem {
  key: string;
  minZoom: number;
  displayName: string;
  hint: string;
}

export const MAP_ZOOM_SCOPES: MapZoomScopeItem[] = [
  { key: "WARD", minZoom: 14.0, displayName: "Phường/xã", hint: "Thu nhỏ vừa đủ 1 phường/xã (~10 km) — nhẹ máy nhất" },
  { key: "DISTRICT", minZoom: 12.0, displayName: "Quận/huyện", hint: "Bao quát 1 quận/huyện (~40 km) — cân bằng" },
  { key: "PROVINCE", minZoom: 10.0, displayName: "Tỉnh/thành", hint: "Thấy cả tỉnh/thành (~160 km) — tải tile nhiều hơn" }
];

export function getMapZoomScope(key?: string | null): MapZoomScopeItem {
  return MAP_ZOOM_SCOPES.find((s) => s.key === key) ?? MAP_ZOOM_SCOPES[1]; // default DISTRICT (12.0)
}

export interface MapRadiusDefaultItem {
  key: string;
  radiusKm: number | null;
  displayName: string;
}

export const MAP_RADIUS_DEFAULTS: MapRadiusDefaultItem[] = [
  { key: "all", radiusKm: null, displayName: "Tất cả" },
  { key: "1km", radiusKm: 1.0, displayName: "1 km" },
  { key: "2km", radiusKm: 2.0, displayName: "2 km" },
  { key: "5km", radiusKm: 5.0, displayName: "5 km" },
  { key: "10km", radiusKm: 10.0, displayName: "10 km" }
];

export function getMapRadiusDefault(radiusKm: number | null | undefined): MapRadiusDefaultItem {
  return MAP_RADIUS_DEFAULTS.find((r) => r.radiusKm === (radiusKm ?? null)) ?? MAP_RADIUS_DEFAULTS[0];
}

export interface GpsLocateZoomItem {
  zoom: number;
  displayName: string;
  hint: string;
}

export const GPS_LOCATE_ZOOM_LIST: GpsLocateZoomItem[] = [
  { zoom: 15.0, displayName: "15 — Khu vực", hint: "Bao quát cụm BĐS trên diện rộng" },
  { zoom: 16.0, displayName: "16 — Đường phố", hint: "Thấy rõ các tuyến đường chính xung quanh" },
  { zoom: 17.0, displayName: "17 — Ngõ / khu lân cận", hint: "Thấy rõ các nhánh ngõ và khu đất lân cận" },
  { zoom: 18.0, displayName: "18 — Từng căn nhà", hint: "Phóng to sâu, thấy rõ vị trí từng căn nhà (Khuyên dùng)" },
  { zoom: 19.0, displayName: "19 — Cận cảnh", hint: "Mức phóng to chi tiết tối đa của bản đồ" }
];

export function getGpsLocateZoom(zoom: number): GpsLocateZoomItem {
  return GPS_LOCATE_ZOOM_LIST.find((z) => z.zoom === zoom) ?? GPS_LOCATE_ZOOM_LIST[3]; // default 18
}

export const SUPPORTED_NEARBY_ZOOMS = new Set([ZOOM_KEEP_CURRENT, 15.0, 16.0, 17.0, 18.0, 19.0]);

export function normalizeConfiguredZoom(raw: number, fallback: number): number {
  if (isNaN(raw) || !isFinite(raw) || !SUPPORTED_NEARBY_ZOOMS.has(raw)) {
    return fallback;
  }
  return raw;
}

export const MAP_ZOOM_SCOPE_OPTIONS: number[] = [10, 12, 14];
export const MAP_RADIUS_DEFAULT_OPTIONS: (number | null)[] = [null, 1.0, 2.0, 5.0, 10.0];
export const GPS_LOCATE_ZOOM_OPTIONS: number[] = [15.0, 16.0, 17.0, 18.0, 19.0];
export const NEARBY_ZOOM_OPTIONS: number[] = [ZOOM_KEEP_CURRENT, 15.0, 16.0, 17.0, 18.0, 19.0];

export type MapZoomScopeOption = number | string;
export type MapRadiusDefaultOption = number | null;
export type ZoomChoiceOption = number;

export function formatZoomDisplayLabel(zoom: number): string {
  if (zoom === ZOOM_KEEP_CURRENT || zoom < 0) {
    return "Giữ nguyên góc nhìn";
  }
  return getGpsLocateZoom(zoom).displayName;
}

export const DEFAULT_EXTRACTION_REGEX_JSON = JSON.stringify(
  {
    REGEX_PHONE: "\\b0[35789](?:[.\\s-]*\\d){8}\\b",
    REGEX_AREA: "(\\d+(?:[.,]\\d+)?)\\s*(m2|m²)",
    REGEX_PRICE: "(\\d+(?:[.,]\\d+)?)\\s*(tỷ|ty|triệu|tr)",
    MAP_LINK_PATTERN: "(https?://\\S*maps\\S*|https?://goo\\.gl/\\S*)",
    phonePattern: "\\b0[35789](?:[.\\s-]*\\d){8}\\b",
    areaPattern: "(\\d+(?:[.,]\\d+)?)\\s*(m2|m²)",
    pricePattern: "(\\d+(?:[.,]\\d+)?)\\s*(tỷ|ty|triệu|tr)"
  },
  null,
  2
);

export interface SettingsState {
  hasShownOnboarding: boolean;
  autoSyncEnabled: boolean;
  syncTime: string;
  wifiOnlyForMedia: boolean;
  filterMode: FilterMode;
  rememberLastFilter: boolean;
  defaultPropertyType: string;
  defaultStatus: string;
  mapZoomScope?: MapZoomScope | string;
  mapMinZoomScope: string;
  mapMinZoomLevel: number;
  mapDefaultRadius: number | null;
  gpsLocateZoom: number;
  coordinatePickerZoom: number;
  propertyNearbyZoom: number;
  mapLinkNearbyZoom: number;
  customExtractionRegex: string | null;
  fabOnLeft: boolean;
  lastZipExportTime: string | null;
  lastZipImportTime: string | null;
  livestreamMode: boolean;
  liveHotlineText: string;
  liveHiddenItems: string[] | null;
  liveHotlineFx: number;
  liveHotlineFy: number;
}

const STORAGE_KEY = "bds_web_settings";

const defaultSettings: SettingsState = {
  hasShownOnboarding: false,
  autoSyncEnabled: true,
  syncTime: "12:00",
  wifiOnlyForMedia: false,
  filterMode: FilterMode.ALL,
  rememberLastFilter: false,
  defaultPropertyType: "",
  defaultStatus: "",
  mapZoomScope: "DISTRICT",
  mapMinZoomScope: "DISTRICT",
  mapMinZoomLevel: 12,
  mapDefaultRadius: null,
  gpsLocateZoom: 18,
  coordinatePickerZoom: 18,
  propertyNearbyZoom: 16,
  mapLinkNearbyZoom: ZOOM_KEEP_CURRENT,
  customExtractionRegex: null,
  fabOnLeft: false,
  lastZipExportTime: null,
  lastZipImportTime: null,
  livestreamMode: false,
  liveHotlineText: "",
  liveHiddenItems: null,
  liveHotlineFx: 1,
  liveHotlineFy: 0.25
};

export class SettingsManager {
  private state: SettingsState;
  private listeners: Set<(s: SettingsState) => void> = new Set();

  constructor() {
    this.state = this.load();
  }

  public load(): SettingsState {
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          // Dọn các khoá cũ khỏi bds_web_settings giống Android dọn khoá cũ khi khởi động
          const legacyKeys = ["supabaseUrl", "supabaseAnonKey", "geminiApiKey", "geminiModel"];
          let cleaned = false;
          for (const k of legacyKeys) {
            if (k in parsed) {
              delete parsed[k];
              cleaned = true;
            }
          }
          if (cleaned) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
          }
          this.state = { ...defaultSettings, ...parsed };
          if (this.state.mapMinZoomScope) {
            this.state.mapMinZoomLevel = getMapZoomScope(this.state.mapMinZoomScope).minZoom;
          }
          return { ...this.state };
        }
      }
    } catch (e) {
      console.error("Failed to load settings from localStorage", e);
    }
    this.state = { ...defaultSettings };
    return { ...this.state };
  }

  public reset(): void {
    this.state = { ...defaultSettings };
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch (e) {
      console.error("Failed to reset settings in localStorage", e);
    }
    this.notify();
  }

  public getSettings(): SettingsState {
    return { ...this.state };
  }

  public update(partial: Partial<SettingsState>): void {
    const updated = { ...this.state, ...partial };
    if (partial.mapMinZoomScope && partial.mapMinZoomLevel === undefined) {
      updated.mapMinZoomLevel = getMapZoomScope(partial.mapMinZoomScope).minZoom;
    } else if (partial.mapMinZoomLevel !== undefined && !partial.mapMinZoomScope) {
      const matched = MAP_ZOOM_SCOPES.find((s) => s.minZoom === partial.mapMinZoomLevel);
      if (matched) {
        updated.mapMinZoomScope = matched.key;
      }
    }
    if (partial.propertyNearbyZoom !== undefined) {
      updated.propertyNearbyZoom = normalizeConfiguredZoom(partial.propertyNearbyZoom, 16.0);
    }
    if (partial.mapLinkNearbyZoom !== undefined) {
      updated.mapLinkNearbyZoom = normalizeConfiguredZoom(partial.mapLinkNearbyZoom, ZOOM_KEEP_CURRENT);
    }
    if (partial.gpsLocateZoom !== undefined) {
      updated.gpsLocateZoom = getGpsLocateZoom(partial.gpsLocateZoom).zoom;
    }
    if (partial.coordinatePickerZoom !== undefined) {
      updated.coordinatePickerZoom = getGpsLocateZoom(partial.coordinatePickerZoom).zoom;
    }
    this.state = updated;
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
      }
    } catch (e) {
      console.error("Failed to save settings to localStorage", e);
    }
    this.notify();
  }

  public subscribe(listener: (s: SettingsState) => void): () => void {
    this.listeners.add(listener);
    listener(this.getSettings());
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const current = this.getSettings();
    for (const listener of this.listeners) {
      listener(current);
    }
  }

  public getMapMinZoomLevel(): number {
    if (this.state.mapMinZoomScope) {
      return getMapZoomScope(this.state.mapMinZoomScope).minZoom;
    }
    return this.state.mapMinZoomLevel ?? 12;
  }

  public getMapDefaultRadius(): number | null {
    return this.state.mapDefaultRadius ?? null;
  }

  public getDefaultRegexJson(): string {
    return DEFAULT_EXTRACTION_REGEX_JSON;
  }

  public getActiveRegexJson(): string {
    const custom = this.state.customExtractionRegex;
    return custom && custom.trim().length > 0 ? custom : this.getDefaultRegexJson();
  }

  public validateRegexJson(jsonStr: string): { valid: boolean; success: boolean; error?: string } {
    try {
      const parsed = JSON.parse(jsonStr);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        return { valid: false, success: false, error: "Nội dung JSON phải là một đối tượng (object)." };
      }
      const keys = ["REGEX_PHONE", "REGEX_AREA", "REGEX_PRICE", "MAP_LINK_PATTERN", "phonePattern", "areaPattern", "pricePattern"];
      for (const key of keys) {
        if (key in parsed) {
          const patternStr = String(parsed[key]);
          new RegExp(patternStr);
        }
      }
      return { valid: true, success: true };
    } catch (e: any) {
      return { valid: false, success: false, error: e.message || "Cú pháp JSON hoặc biểu thức chính quy không hợp lệ." };
    }
  }

  public saveCustomRegex(jsonStr: string): void {
    this.update({ customExtractionRegex: jsonStr });
  }

  public restoreDefaultRegex(): string {
    this.update({ customExtractionRegex: null });
    return this.getDefaultRegexJson();
  }

  public updateFilterMode(mode: FilterMode, defaultPropertyType: string = "", defaultStatus: string = ""): void {
    this.update({
      filterMode: mode,
      rememberLastFilter: mode === FilterMode.LAST_USED,
      defaultPropertyType: mode === FilterMode.FIXED ? defaultPropertyType : "",
      defaultStatus: mode === FilterMode.FIXED ? defaultStatus : ""
    });
  }

  public updateLastZipExportTime(time: Date | string = new Date()): void {
    const formatted = time instanceof Date ? time.toISOString() : String(time);
    this.update({ lastZipExportTime: formatted });
  }

  public updateLastZipImportTime(time: Date | string = new Date()): void {
    const formatted = time instanceof Date ? time.toISOString() : String(time);
    this.update({ lastZipImportTime: formatted });
  }

  public setLivestreamMode(enabled: boolean): void {
    this.update({ livestreamMode: enabled });
  }

  public setLiveHotlineText(text: string): void {
    this.update({ liveHotlineText: text.slice(0, 40) });
  }

  public setLiveHidden(items: string[]): void {
    this.update({ liveHiddenItems: items });
  }

  public setLiveHotlinePosition(fx: number, fy: number): void {
    this.update({ liveHotlineFx: fx, liveHotlineFy: fy });
  }
}

export const settingsManager = new SettingsManager();
