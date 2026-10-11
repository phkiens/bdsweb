import { describe, it, expect, beforeEach } from "vitest";
import {
  settingsManager,
  FilterMode,
  formatZoomDisplayLabel,
  ZOOM_KEEP_CURRENT,
  MAP_ZOOM_SCOPES,
  MAP_RADIUS_DEFAULTS,
  GPS_LOCATE_ZOOM_LIST,
  MAP_ZOOM_SCOPE_OPTIONS,
  MAP_RADIUS_DEFAULT_OPTIONS,
  GPS_LOCATE_ZOOM_OPTIONS,
  NEARBY_ZOOM_OPTIONS
} from "../../src/data/local/settings-manager";
import {
  loadPropertyListState,
  savePropertyListState,
  createDefaultPropertyListState
} from "../../src/core/utils/property-list-state";
import { PropertyStatus } from "../../src/core/models/enums";

if (typeof localStorage === "undefined") {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
    get length() {
      return store.size;
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null
  };
}

describe("Settings Parity (Android Parity Edition)", () => {
  beforeEach(() => {
    localStorage.clear();
    settingsManager.reset();
  });

  describe("1. Default Settings Values", () => {
    it("khởi tạo các giá trị mặc định chính xác theo Android", () => {
      const s = settingsManager.getSettings();

      expect(s.rememberLastFilter).toBe(false);
      expect(s.filterMode).toBe(FilterMode.ALL);
      expect(s.defaultPropertyType).toBe("");
      expect(s.defaultStatus).toBe("");

      expect(s.mapMinZoomLevel).toBe(12);
      expect(s.mapMinZoomScope).toBe("DISTRICT");
      expect(s.mapDefaultRadius).toBeNull();
      expect(s.gpsLocateZoom).toBe(18);
      expect(s.coordinatePickerZoom).toBe(18);
      expect(s.propertyNearbyZoom).toBe(16);
      expect(s.mapLinkNearbyZoom).toBe(ZOOM_KEEP_CURRENT);

      expect(s.customExtractionRegex).toBeNull();
      expect(s.lastZipExportTime).toBeNull();
      expect(s.lastZipImportTime).toBeNull();
    });

    it("không còn chứa các trường API nhạy cảm legacy trong SettingsState", () => {
      const s = settingsManager.getSettings() as any;
      expect(s.supabaseUrl).toBeUndefined();
      expect(s.supabaseAnonKey).toBeUndefined();
      expect(s.geminiApiKey).toBeUndefined();
      expect(s.geminiModel).toBeUndefined();
    });
  });

  describe("2. Legacy Settings Cleanup", () => {
    it("tự động dọn sạch các khóa API legacy từ localStorage khi nạp settings", () => {
      const legacySettings = {
        hasShownOnboarding: true,
        supabaseUrl: "https://legacy.supabase.co",
        supabaseAnonKey: "eyJhbGciOi...",
        geminiApiKey: "AIzaSyLegacyKey...",
        geminiModel: "gemini-1.5-flash",
        mapDefaultRadius: 3.0
      };
      localStorage.setItem("bds_web_settings", JSON.stringify(legacySettings));

      const loaded = settingsManager.load();
      expect(loaded.mapDefaultRadius).toBe(3.0);
      expect((loaded as any).supabaseUrl).toBeUndefined();
      expect((loaded as any).geminiApiKey).toBeUndefined();

      // Kiểm tra trong localStorage đã được ghi đè và loại bỏ các khóa legacy
      const rawStored = JSON.parse(localStorage.getItem("bds_web_settings")!);
      expect(rawStored.supabaseUrl).toBeUndefined();
      expect(rawStored.geminiApiKey).toBeUndefined();
    });
  });

  describe("3. Map Zoom Helpers & Labels", () => {
    it("formatZoomDisplayLabel hiển thị đúng nhãn giữ nguyên góc nhìn và GpsLocateZoom", () => {
      expect(formatZoomDisplayLabel(ZOOM_KEEP_CURRENT)).toBe("Giữ nguyên góc nhìn");
      expect(formatZoomDisplayLabel(-1)).toBe("Giữ nguyên góc nhìn");
      expect(formatZoomDisplayLabel(15)).toBe("15 — Khu vực");
      expect(formatZoomDisplayLabel(16)).toBe("16 — Đường phố");
      expect(formatZoomDisplayLabel(17)).toBe("17 — Ngõ / khu lân cận");
      expect(formatZoomDisplayLabel(18)).toBe("18 — Từng căn nhà");
      expect(formatZoomDisplayLabel(19)).toBe("19 — Cận cảnh");
    });

    it("getMapMinZoomLevel và getMapDefaultRadius trả về giá trị hợp lệ", () => {
      expect(settingsManager.getMapMinZoomLevel()).toBe(12);
      expect(settingsManager.getMapDefaultRadius()).toBeNull();

      settingsManager.update({ mapMinZoomScope: "WARD", mapDefaultRadius: 5.0 });
      expect(settingsManager.getMapMinZoomLevel()).toBe(14);
      expect(settingsManager.getMapDefaultRadius()).toBe(5.0);
    });

    it("danh sách options zoom và bán kính khớp cấu hình chuẩn Android", () => {
      expect(MAP_ZOOM_SCOPE_OPTIONS).toEqual([10, 12, 14]);
      expect(MAP_RADIUS_DEFAULT_OPTIONS).toEqual([null, 1.0, 2.0, 5.0, 10.0]);
      expect(GPS_LOCATE_ZOOM_OPTIONS).toEqual([15.0, 16.0, 17.0, 18.0, 19.0]);
      expect(NEARBY_ZOOM_OPTIONS).toEqual([-1.0, 15.0, 16.0, 17.0, 18.0, 19.0]);
    });

    it("danh sách chi tiết MapZoomScope, MapRadiusDefault, GpsLocateZoom khớp Android", () => {
      expect(MAP_ZOOM_SCOPES.map((s) => s.key)).toEqual(["WARD", "DISTRICT", "PROVINCE"]);
      expect(MAP_ZOOM_SCOPES.map((s) => s.minZoom)).toEqual([14.0, 12.0, 10.0]);
      expect(MAP_RADIUS_DEFAULTS.map((r) => r.radiusKm)).toEqual([null, 1.0, 2.0, 5.0, 10.0]);
      expect(GPS_LOCATE_ZOOM_LIST.map((z) => z.zoom)).toEqual([15.0, 16.0, 17.0, 18.0, 19.0]);
    });
  });

  describe("4. Regex Configuration & Validation", () => {
    it("getDefaultRegexJson trả về JSON hợp lệ chứa các mẫu regex cốt lõi", () => {
      const def = settingsManager.getDefaultRegexJson();
      expect(def).toBeDefined();
      const parsed = JSON.parse(def);
      expect(parsed.phonePattern).toBeDefined();
      expect(parsed.pricePattern).toBeDefined();
      expect(parsed.areaPattern).toBeDefined();
    });

    it("validateRegexJson xác thực cú pháp JSON hợp lệ / không hợp lệ", () => {
      expect(settingsManager.validateRegexJson(settingsManager.getDefaultRegexJson()).valid).toBe(true);

      const invalidJson = "{ phonePattern: invalid, ";
      const invalidRes = settingsManager.validateRegexJson(invalidJson);
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.error).toBeDefined();

      const arrayJson = "[1, 2, 3]";
      const arrayRes = settingsManager.validateRegexJson(arrayJson);
      expect(arrayRes.valid).toBe(false);
    });

    it("saveCustomRegex lưu regex tùy chỉnh và restoreDefaultRegex khôi phục về mặc định", () => {
      const custom = JSON.stringify({ phonePattern: "09\\d{8}" });
      settingsManager.saveCustomRegex(custom);

      expect(settingsManager.getSettings().customExtractionRegex).toBe(custom);
      expect(settingsManager.getActiveRegexJson()).toBe(custom);

      const restored = settingsManager.restoreDefaultRegex();
      expect(settingsManager.getSettings().customExtractionRegex).toBeNull();
      expect(restored).toBe(settingsManager.getDefaultRegexJson());
    });
  });

  describe("5. Filter Mode & Opening List Integration", () => {
    it("khởi tạo mặc định trả về bộ lọc rỗng (hiển thị tất cả) khi loadPropertyListState", () => {
      const loadedState = loadPropertyListState();
      expect(loadedState.filterState.propertyTypes.size).toBe(0);
      expect(loadedState.filterState.statuses.size).toBe(0);
    });

    it("chế độ FIXED áp dụng loại BĐS và trạng thái mặc định khi loadPropertyListState", () => {
      settingsManager.updateFilterMode(FilterMode.FIXED, "Nhà", PropertyStatus.FOR_SALE);

      const loadedState = loadPropertyListState();
      expect(loadedState.filterState.propertyTypes.has("Nhà")).toBe(true);
      expect(loadedState.filterState.statuses.has(PropertyStatus.FOR_SALE)).toBe(true);
    });

    it("chế độ ALL trả về bộ lọc rỗng (hiển thị tất cả) khi loadPropertyListState", () => {
      settingsManager.updateFilterMode(FilterMode.ALL);

      const loadedState = loadPropertyListState();
      expect(loadedState.filterState.propertyTypes.size).toBe(0);
      expect(loadedState.filterState.statuses.size).toBe(0);
    });

    it("chế độ LAST_USED lưu và nạp lại chính xác từ storage", () => {
      settingsManager.updateFilterMode(FilterMode.LAST_USED);

      const customState = createDefaultPropertyListState();
      customState.searchQuery = "Biệt thự view sông";
      customState.filterState.propertyTypes = new Set(["Đất"]);

      savePropertyListState(customState);

      const loadedState = loadPropertyListState();
      expect(loadedState.searchQuery).toBe("Biệt thự view sông");
      expect(loadedState.filterState.propertyTypes.has("Đất")).toBe(true);
    });
  });
});
