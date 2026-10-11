import { describe, it, expect } from "vitest";
import {
  createDefaultPropertyListState,
  createDefaultFilterState,
  loadPropertyListState,
  savePropertyListState,
  PROPERTY_LIST_VIEW_STATE_KEY,
  PROPERTY_LIST_VIEW_STATE_VERSION,
  StorageLike,
  PropertyListViewState
} from "../../src/core/utils/property-list-state";
import {
  PropertyStatus,
  PropertySortType,
  FilterScope
} from "../../src/core/models/enums";

function createMemoryStorage(initialData: Record<string, string> = {}): StorageLike & { store: Map<string, string> } {
  const store = new Map<string, string>(Object.entries(initialData));
  return {
    store,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    }
  };
}

describe("property-list-state (W004 Unit Tests)", () => {
  it("khởi tạo trạng thái mặc định chính xác với fresh Sets", () => {
    const defaults = createDefaultPropertyListState();
    expect(defaults.searchQuery).toBe("");
    expect(defaults.viewTodayOnly).toBe(false);

    const fs = defaults.filterState;
    expect(fs.propertyTypes).toBeInstanceOf(Set);
    expect(fs.propertyTypes?.size).toBe(0);
    expect(fs.statuses).toBeInstanceOf(Set);
    expect(fs.statuses?.size).toBe(0);
    expect(fs.selectedPrices).toBeInstanceOf(Set);
    expect(fs.selectedPrices?.size).toBe(0);
    expect(fs.priceMin).toBeNull();
    expect(fs.priceMax).toBeNull();
    expect(fs.selectedSizes).toBeInstanceOf(Set);
    expect(fs.selectedSizes?.size).toBe(0);
    expect(fs.sizeMin).toBeNull();
    expect(fs.sizeMax).toBeNull();
    expect(fs.areas).toBeInstanceOf(Set);
    expect(fs.areas?.size).toBe(0);
    expect(fs.directions).toBeInstanceOf(Set);
    expect(fs.directions?.size).toBe(0);
    expect(fs.sortBy).toBe(PropertySortType.NEWEST);
    expect(fs.scope).toBe(FilterScope.CURRENT_TAB);
  });

  it("round trip tất cả 6 Sets bao gồm statuses + scope/sort + min/max bảo toàn kiểu Set và giá trị", () => {
    const storage = createMemoryStorage();
    const testState: PropertyListViewState = {
      searchQuery: "mặt tiền Nguyễn Văn Linh",
      viewTodayOnly: true,
      filterState: {
        propertyTypes: new Set(["Nhà", "Đất"]),
        statuses: new Set([PropertyStatus.FOR_SALE, PropertyStatus.PAUSED]),
        selectedPrices: new Set(["1-2", "2-3"]),
        priceMin: 1.5,
        priceMax: 3.5,
        selectedSizes: new Set(["30-50", "50-80"]),
        sizeMin: 45,
        sizeMax: 90,
        areas: new Set(["Hải Châu", "Thanh Khê"]),
        directions: new Set(["Đông", "Tây Nam"]),
        sortBy: PropertySortType.PRICE_DESC,
        scope: FilterScope.ALL
      }
    };

    savePropertyListState(testState, storage);
    const restored = loadPropertyListState(storage);

    expect(restored.searchQuery).toBe("mặt tiền Nguyễn Văn Linh");
    expect(restored.viewTodayOnly).toBe(true);

    const rfs = restored.filterState;
    expect(rfs.propertyTypes).toBeInstanceOf(Set);
    expect(Array.from(rfs.propertyTypes!)).toEqual(["Nhà", "Đất"]);

    expect(rfs.statuses).toBeInstanceOf(Set);
    expect(Array.from(rfs.statuses!)).toEqual([PropertyStatus.FOR_SALE, PropertyStatus.PAUSED]);

    expect(rfs.selectedPrices).toBeInstanceOf(Set);
    expect(Array.from(rfs.selectedPrices!)).toEqual(["1-2", "2-3"]);

    expect(rfs.priceMin).toBe(1.5);
    expect(rfs.priceMax).toBe(3.5);

    expect(rfs.selectedSizes).toBeInstanceOf(Set);
    expect(Array.from(rfs.selectedSizes!)).toEqual(["30-50", "50-80"]);

    expect(rfs.sizeMin).toBe(45);
    expect(rfs.sizeMax).toBe(90);

    expect(rfs.areas).toBeInstanceOf(Set);
    expect(Array.from(rfs.areas!)).toEqual(["Hải Châu", "Thanh Khê"]);

    expect(rfs.directions).toBeInstanceOf(Set);
    expect(Array.from(rfs.directions!)).toEqual(["Đông", "Tây Nam"]);

    expect(rfs.sortBy).toBe(PropertySortType.PRICE_DESC);
    expect(rfs.scope).toBe(FilterScope.ALL);
  });

  it("search query và Hôm nay sống sót qua save/load (remount/navigation)", () => {
    const storage = createMemoryStorage();
    savePropertyListState(
      {
        searchQuery: "SĐT 0905123456",
        viewTodayOnly: true,
        filterState: createDefaultFilterState()
      },
      storage
    );

    const restored = loadPropertyListState(storage);
    expect(restored.searchQuery).toBe("SĐT 0905123456");
    expect(restored.viewTodayOnly).toBe(true);
  });

  it("trả về defaults khi storage rỗng, JSON lỗi hoặc version lỗi thời", () => {
    const emptyStorage = createMemoryStorage();
    const fromEmpty = loadPropertyListState(emptyStorage);
    expect(fromEmpty.searchQuery).toBe("");
    expect(fromEmpty.viewTodayOnly).toBe(false);
    expect(fromEmpty.filterState.sortBy).toBe(PropertySortType.NEWEST);

    const corruptStorage = createMemoryStorage({
      [PROPERTY_LIST_VIEW_STATE_KEY]: "{ invalid json! {"
    });
    const fromCorrupt = loadPropertyListState(corruptStorage);
    expect(fromCorrupt.searchQuery).toBe("");
    expect(fromCorrupt.viewTodayOnly).toBe(false);

    const obsoleteVersionStorage = createMemoryStorage({
      [PROPERTY_LIST_VIEW_STATE_KEY]: JSON.stringify({
        version: 99,
        searchQuery: "old query",
        viewTodayOnly: true
      })
    });
    const fromObsolete = loadPropertyListState(obsoleteVersionStorage);
    expect(fromObsolete.searchQuery).toBe("");
    expect(fromObsolete.viewTodayOnly).toBe(false);

    const wrongShapeStorage = createMemoryStorage({
      [PROPERTY_LIST_VIEW_STATE_KEY]: JSON.stringify("not-an-object")
    });
    const fromWrongShape = loadPropertyListState(wrongShapeStorage);
    expect(fromWrongShape.searchQuery).toBe("");
  });

  it("xử lý an toàn bad enums, nonfinite range values và wrong-shaped fields mà không crash", () => {
    const storage = createMemoryStorage({
      [PROPERTY_LIST_VIEW_STATE_KEY]: JSON.stringify({
        version: PROPERTY_LIST_VIEW_STATE_VERSION,
        searchQuery: 12345, // invalid type
        viewTodayOnly: "yes", // invalid type
        filterState: {
          propertyTypes: "not-an-array",
          statuses: ["INVALID_ENUM_STATUS", PropertyStatus.FOR_SALE],
          selectedPrices: [123, null, "1-2"],
          priceMin: "not-a-number",
          priceMax: Infinity,
          selectedSizes: null,
          sizeMin: -Infinity,
          sizeMax: NaN,
          areas: ["Hải Châu", 456],
          directions: ["Đông", true],
          sortBy: "INVALID_SORT_ENUM",
          scope: "INVALID_SCOPE_ENUM"
        }
      })
    });

    const restored = loadPropertyListState(storage);
    expect(restored.searchQuery).toBe("");
    expect(restored.viewTodayOnly).toBe(false);

    const fs = restored.filterState;
    expect(fs.propertyTypes?.size).toBe(0);
    // Invalid status dropped, valid retained
    expect(Array.from(fs.statuses!)).toEqual([PropertyStatus.FOR_SALE]);
    expect(Array.from(fs.selectedPrices!)).toEqual(["1-2"]);
    // Nonfinite numbers converted to null
    expect(fs.priceMin).toBeNull();
    expect(fs.priceMax).toBeNull();
    expect(fs.sizeMin).toBeNull();
    expect(fs.sizeMax).toBeNull();
    expect(Array.from(fs.areas!)).toEqual(["Hải Châu"]);
    expect(Array.from(fs.directions!)).toEqual(["Đông"]);
    // Invalid enums safely fallback to defaults
    expect(fs.sortBy).toBe(PropertySortType.NEWEST);
    expect(fs.scope).toBe(FilterScope.CURRENT_TAB);
  });

  it("không bị crash khi storage getItem/setItem ném exception hoặc storage absent", () => {
    const throwingStorage: StorageLike = {
      getItem: () => {
        throw new Error("SecurityError: Access is denied");
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      }
    };

    expect(() => {
      const state = loadPropertyListState(throwingStorage);
      expect(state.searchQuery).toBe("");
    }).not.toThrow();

    expect(() => {
      savePropertyListState(createDefaultPropertyListState(), throwingStorage);
    }).not.toThrow();

    expect(() => {
      const state = loadPropertyListState(null);
      expect(state.searchQuery).toBe("");
      savePropertyListState(state, null);
    }).not.toThrow();
  });

  it("reset save/load trả về đúng defaults và xóa bỏ lựa chọn trước đó", () => {
    const storage = createMemoryStorage();
    // 1. Lưu custom state
    savePropertyListState(
      {
        searchQuery: "nhà mặt tiền",
        viewTodayOnly: true,
        filterState: {
          ...createDefaultFilterState(),
          areas: new Set(["Hòa Cường"]),
          priceMin: 2
        }
      },
      storage
    );
    expect(loadPropertyListState(storage).searchQuery).toBe("nhà mặt tiền");

    // 2. Thực hiện reset và lưu defaults
    savePropertyListState(createDefaultPropertyListState(), storage);
    const resetLoaded = loadPropertyListState(storage);

    expect(resetLoaded.searchQuery).toBe("");
    expect(resetLoaded.viewTodayOnly).toBe(false);
    expect(resetLoaded.filterState.areas?.size).toBe(0);
    expect(resetLoaded.filterState.priceMin).toBeNull();
  });

  it("trường tạm thời (selectedIds, isMultiSelect, records) không bị persist hay restore ngay cả khi có trong storage", () => {
    const storage = createMemoryStorage();

    // Thử persist object có chứa transient fields
    const dirtyState = {
      ...createDefaultPropertyListState(),
      searchQuery: "test",
      selectedIds: new Set(["prop-1", "prop-2"]),
      isMultiSelect: true,
      records: [{ id: "prop-1" }]
    } as unknown as PropertyListViewState;

    savePropertyListState(dirtyState, storage);

    const rawStored = storage.store.get(PROPERTY_LIST_VIEW_STATE_KEY)!;
    const parsedRaw = JSON.parse(rawStored);
    expect(parsedRaw.selectedIds).toBeUndefined();
    expect(parsedRaw.isMultiSelect).toBeUndefined();
    expect(parsedRaw.records).toBeUndefined();

    // Giả mạo storage chứa trường lạ từ bên ngoài
    storage.store.set(
      PROPERTY_LIST_VIEW_STATE_KEY,
      JSON.stringify({
        version: PROPERTY_LIST_VIEW_STATE_VERSION,
        searchQuery: "test2",
        viewTodayOnly: false,
        filterState: {},
        selectedIds: ["p1", "p2"],
        isMultiSelect: true,
        records: [{ id: "1" }],
        credentialToken: "secret"
      })
    );

    const loaded = loadPropertyListState(storage) as Record<string, unknown>;
    expect(loaded.searchQuery).toBe("test2");
    expect(loaded.selectedIds).toBeUndefined();
    expect(loaded.isMultiSelect).toBeUndefined();
    expect(loaded.records).toBeUndefined();
    expect(loaded.credentialToken).toBeUndefined();
  });

  it("các lần load hoặc default độc lập không dùng chung tham chiếu Set (tránh shared mutations)", () => {
    const storage = createMemoryStorage();
    savePropertyListState(createDefaultPropertyListState(), storage);

    const stateA = loadPropertyListState(storage);
    const stateB = loadPropertyListState(storage);

    expect(stateA.filterState.propertyTypes).not.toBe(stateB.filterState.propertyTypes);
    expect(stateA.filterState.areas).not.toBe(stateB.filterState.areas);

    stateA.filterState.propertyTypes?.add("Nhà");
    expect(stateB.filterState.propertyTypes?.has("Nhà")).toBe(false);

    const def1 = createDefaultPropertyListState();
    const def2 = createDefaultPropertyListState();
    expect(def1.filterState.propertyTypes).not.toBe(def2.filterState.propertyTypes);

    def1.filterState.propertyTypes?.add("Đất");
    expect(def2.filterState.propertyTypes?.has("Đất")).toBe(false);
  });
});
