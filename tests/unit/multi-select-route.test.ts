import { describe, expect, it } from "vitest";
import {
  isValidCoordinate,
  MapSurveyRoute,
  getMapNavigationMessage,
  buildMapSurveyRoute,
  buildPickerCandidates,
  syncPriceDropSelection,
  PropertyPickerFormat
} from "../../src/core/engine/map-survey-route";
import { Property } from "../../src/core/models/property";

function createProperty(partial: Partial<Property> & { id: string }): Property {
  return {
    area: "Quận 1",
    latitude: 10.7769,
    longitude: 106.7009,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    priceAtFolderCreation: null,
    documentUrl: "",
    areaSize: 100,
    price: 5.0,
    description: "Mô tả",
    status: "Đang bán",
    surveyDate: "2026-10-01",
    direction: "",
    ownerName: "",
    ownerPhone: "",
    propertyType: "Nhà",
    needToViewToday: false,
    isDraft: false,
    isTextSynced: true,
    rawText: "",
    diary: "",
    updatedAt: 1000,
    isDeleted: false,
    propertyDetailJsonFileId: null,
    txtFileId: null,
    isMediaSynced: true,
    linkedCustomerId: null,
    title: null,
    mapLink: null,
    extractedBy: null,
    createdAt: 1000,
    isVerified: true,
    lastEditedAt: 1000,
    r2MediaKeys: null,
    soldAt: null,
    priceEditKind: null,
    priceEditAt: null,
    priceHistoryClearedRev: 0,
    ...partial
  };
}

describe("MapSurveyRoute & Coordinate Filtering", () => {
  it("isValidCoordinate correctly validates coordinates", () => {
    expect(isValidCoordinate(10.7769, 106.7009)).toBe(true);
    expect(isValidCoordinate(0, 0)).toBe(false);
    expect(isValidCoordinate(null, 106.7)).toBe(false);
    expect(isValidCoordinate(10.7, null)).toBe(false);
    expect(isValidCoordinate(NaN, 106.7)).toBe(false);
    expect(isValidCoordinate(95, 106.7)).toBe(false); // out of lat range [-90, 90]
    expect(isValidCoordinate(10.7, 190)).toBe(false); // out of lng range [-180, 180]
  });

  it("build preserves order and assigns official or unverified prefix based on isVerified", () => {
    const p1 = createProperty({ id: "p1", isVerified: true, latitude: 10.98, longitude: 106.65 });
    const p2 = createProperty({ id: "p2", isVerified: false, latitude: 10.99, longitude: 106.66 });
    const p3 = createProperty({ id: "p3", isVerified: true, latitude: 11.0, longitude: 106.67 });

    const result = MapSurveyRoute.build([p1, p2, p3]);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.skippedCount).toBe(0);
      expect(result.route).toBe("/map?selectedKeys=official_p1,unverified_p2,official_p3");
    }
  });

  it("build skips properties with null or zero coordinates and computes skippedCount correctly", () => {
    const valid1 = createProperty({ id: "v1", isVerified: true, latitude: 10.98, longitude: 106.65 });
    const nullCoord = createProperty({ id: "null_coord", isVerified: false, latitude: null, longitude: null });
    const zeroCoord = createProperty({ id: "zero_coord", isVerified: true, latitude: 0, longitude: 0 });
    const valid2 = createProperty({ id: "v2", isVerified: false, latitude: 10.99, longitude: 106.66 });

    const result = MapSurveyRoute.build([valid1, nullCoord, zeroCoord, valid2]);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.skippedCount).toBe(2);
      expect(result.route).toBe("/map?selectedKeys=official_v1,unverified_v2");
    }
  });

  it("build returns no_valid_coordinates when all properties lack valid coordinates", () => {
    const nullCoord1 = createProperty({ id: "null1", isVerified: true, latitude: null, longitude: null });
    const zeroCoord1 = createProperty({ id: "zero1", isVerified: false, latitude: 0, longitude: 0 });
    const nullCoord2 = createProperty({ id: "null2", isVerified: true, latitude: 10.98, longitude: null });

    const result = MapSurveyRoute.build([nullCoord1, zeroCoord1, nullCoord2]);

    expect(result.type).toBe("no_valid_coordinates");
    expect(result.skippedCount).toBe(3);
  });

  it("getMapNavigationMessage returns exact expected strings for all three result cases", () => {
    // Case 1: no_valid_coordinates
    const noCoords = getMapNavigationMessage({ type: "no_valid_coordinates", skippedCount: 3 });
    expect(noCoords).toBe("Không có căn nào có toạ độ để xem trên bản đồ");

    // Case 2: success with skippedCount > 0
    const successWithSkipped = getMapNavigationMessage({
      type: "success",
      route: "/map?selectedKeys=official_p1",
      skippedCount: 2
    });
    expect(successWithSkipped).toBe("2 căn bị bỏ qua do thiếu vị trí");

    // Case 3: success with skippedCount == 0 -> null
    const successNoSkipped = getMapNavigationMessage({
      type: "success",
      route: "/map?selectedKeys=official_p1",
      skippedCount: 0
    });
    expect(successNoSkipped).toBeNull();
  });
});

describe("buildMapSurveyRoute (PriceDrop with Extras)", () => {
  it("buildMapSurveyRoute with extras appends extra properties preserving order and official/unverified prefixes", () => {
    const dropA = { property: createProperty({ id: "A", isVerified: true, latitude: 10.7769, longitude: 106.7009 }) };
    const extraX = createProperty({ id: "X", isVerified: false, latitude: 10.777, longitude: 106.701 });
    const extraY = createProperty({ id: "Y", isVerified: true, latitude: 10.7771, longitude: 106.7011 });

    const result = buildMapSurveyRoute([dropA], new Set(["A"]), [extraX, extraY]);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.skippedCount).toBe(0);
      expect(result.route).toBe("/map?selectedKeys=official_A,unverified_X,official_Y");
    }
  });

  it("buildMapSurveyRoute deduplicates extra property if same id is already selected in price drops", () => {
    const dropA = { property: createProperty({ id: "A", isVerified: true, latitude: 10.7769, longitude: 106.7009 }) };
    const extraA = createProperty({ id: "A", isVerified: true, latitude: 10.7769, longitude: 106.7009 });
    const extraB = createProperty({ id: "B", isVerified: false, latitude: 10.7775, longitude: 106.7015 });

    const result = buildMapSurveyRoute([dropA], new Set(["A"]), [extraA, extraB]);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.skippedCount).toBe(0);
      expect(result.route).toBe("/map?selectedKeys=official_A,unverified_B");
    }
  });

  it("buildMapSurveyRoute counts extras without valid coordinates in skippedCount", () => {
    const dropA = { property: createProperty({ id: "A", isVerified: true, latitude: 10.7769, longitude: 106.7009 }) };
    const extraNoCoord = createProperty({ id: "NoCoord", isVerified: true, latitude: null, longitude: null });

    const result = buildMapSurveyRoute([dropA], new Set(["A"]), [extraNoCoord]);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.skippedCount).toBe(1);
      expect(result.route).toBe("/map?selectedKeys=official_A");
    }
  });

  it("buildMapSurveyRoute succeeds when only extras are provided with no drops selected", () => {
    const extraX = createProperty({ id: "X", isVerified: false, latitude: 10.777, longitude: 106.701 });

    const result = buildMapSurveyRoute([], new Set(), [extraX]);

    expect(result.type).toBe("success");
    if (result.type === "success") {
      expect(result.skippedCount).toBe(0);
      expect(result.route).toBe("/map?selectedKeys=unverified_X");
    }
  });
});

describe("syncPriceDropSelection (Rule 258ba25)", () => {
  it("moves selected items hidden by filter to extras, and returns them when visible again", () => {
    const p1 = createProperty({ id: "p1", area: "Quận 1" });
    const p2 = createProperty({ id: "p2", area: "Quận 2" });
    const propsMap = new Map([
      ["p1", p1],
      ["p2", p2]
    ]);

    // Initial state: both p1 and p2 in availableIds and selected
    let currentSelected = new Set(["p1", "p2"]);
    let currentExtras: string[] = [];
    let availableIds = new Set(["p1", "p2"]);

    // Filter applied: only p1 matches availableIds
    availableIds = new Set(["p1"]);
    const res1 = syncPriceDropSelection(currentSelected, currentExtras, availableIds, propsMap);

    // p2 is hidden by filter -> moved to extras, not dropped silently!
    expect(Array.from(res1.selectedIds)).toEqual(["p1"]);
    expect(res1.extraIds).toEqual(["p2"]);

    // Filter reset: both p1 and p2 back in availableIds
    currentSelected = res1.selectedIds;
    currentExtras = res1.extraIds;
    availableIds = new Set(["p1", "p2"]);

    const res2 = syncPriceDropSelection(currentSelected, currentExtras, availableIds, propsMap);

    // p2 moves back from extras into selectedIds!
    expect(res2.selectedIds.has("p1")).toBe(true);
    expect(res2.selectedIds.has("p2")).toBe(true);
    expect(res2.extraIds).toEqual([]);
  });

  it("prunes deleted properties not present in propertiesMap", () => {
    const p1 = createProperty({ id: "p1" });
    const propsMap = new Map([["p1", p1]]); // p2 was deleted from store

    const res = syncPriceDropSelection(
      new Set(["p1"]),
      ["p2"], // p2 was an extra, but deleted from database
      new Set(["p1"]),
      propsMap
    );

    expect(Array.from(res.selectedIds)).toEqual(["p1"]);
    expect(res.extraIds).toEqual([]); // p2 pruned
  });
});

describe("buildPickerCandidates", () => {
  it("empty query with anchor sorts by ascending distance with unlocated items at the end", () => {
    const anchor = createProperty({ id: "anchor", latitude: 10.7769, longitude: 106.7009 });
    const pClose = createProperty({ id: "close", latitude: 10.777, longitude: 106.701, updatedAt: 100 });
    const pFar = createProperty({ id: "far", latitude: 10.82, longitude: 106.65, updatedAt: 200 });
    const pNoCoord = createProperty({ id: "no_coord", latitude: null, longitude: null, updatedAt: 5000 });

    const pool = [pFar, pNoCoord, pClose];
    const candidates = buildPickerCandidates(pool, [anchor], "", true);

    expect(candidates).toHaveLength(3);
    // 1. Closest
    expect(candidates[0].property.id).toBe("close");
    expect(candidates[0].hasLocation).toBe(true);
    expect(candidates[0].distanceKm).not.toBeNull();

    // 2. Farther
    expect(candidates[1].property.id).toBe("far");
    expect(candidates[1].hasLocation).toBe(true);
    expect(candidates[1].distanceKm).not.toBeNull();
    expect(candidates[0].distanceKm!).toBeLessThan(candidates[1].distanceKm!);

    // 3. Unlocated at the end
    expect(candidates[2].property.id).toBe("no_coord");
    expect(candidates[2].hasLocation).toBe(false);
    expect(candidates[2].distanceKm).toBeNull();
  });

  it("no anchor sorts located items by updatedAt descending and distanceKm is null", () => {
    const pOldLocated = createProperty({ id: "old_located", latitude: 10.7769, longitude: 106.7009, updatedAt: 1000 });
    const pNewLocated = createProperty({ id: "new_located", latitude: 10.778, longitude: 106.702, updatedAt: 3000 });
    const pUnlocated = createProperty({ id: "unlocated", latitude: null, longitude: null, updatedAt: 2000 });

    const pool = [pOldLocated, pNewLocated, pUnlocated];
    const candidates = buildPickerCandidates(pool, [], "", true);

    expect(candidates).toHaveLength(3);
    // Located items first, ordered by updatedAt desc
    expect(candidates[0].property.id).toBe("new_located");
    expect(candidates[0].hasLocation).toBe(true);
    expect(candidates[0].distanceKm).toBeNull();

    expect(candidates[1].property.id).toBe("old_located");
    expect(candidates[1].hasLocation).toBe(true);
    expect(candidates[1].distanceKm).toBeNull();

    // Unlocated last
    expect(candidates[2].property.id).toBe("unlocated");
    expect(candidates[2].hasLocation).toBe(false);
    expect(candidates[2].distanceKm).toBeNull();
  });

  it("query filters correctly by area", () => {
    const p1 = createProperty({ id: "p1", area: "Quận 1" });
    const p2 = createProperty({ id: "p2", area: "Quận 7" });
    const p3 = createProperty({ id: "p3", area: "Bình Thạnh" });

    const candidates = buildPickerCandidates([p1, p2, p3], [], "Quận 7", true);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].property.id).toBe("p2");
  });

  it("allowOwnerIdentityMatch false with phone query matches nothing", () => {
    const p = createProperty({ id: "p", area: "Quận 1", ownerPhone: "0901234567" });

    const candidatesDisallowed = buildPickerCandidates([p], [], "0901234567", false);
    expect(candidatesDisallowed).toHaveLength(0);

    const candidatesAllowed = buildPickerCandidates([p], [], "0901234567", true);
    expect(candidatesAllowed).toHaveLength(1);
    expect(candidatesAllowed[0].property.id).toBe("p");
  });
});

describe("PropertyPickerFormat.detailLine", () => {
  it("formats price, areaSize, and valid direction properly", () => {
    const p1 = createProperty({
      id: "1",
      area: "Quận 1",
      price: 2.8,
      areaSize: 100,
      direction: "Đông Nam"
    });
    expect(PropertyPickerFormat.detailLine(p1)).toBe("2.8 tỷ · 100 m² · Đông Nam");
  });

  it("formats price only when areaSize is null and direction is empty", () => {
    const p2 = createProperty({
      id: "2",
      area: "Quận 2",
      price: 0.85,
      areaSize: null,
      direction: ""
    });
    expect(PropertyPickerFormat.detailLine(p2)).toBe("850 triệu");
  });

  it("omits unrecognized or invalid direction string", () => {
    const p3 = createProperty({
      id: "3",
      area: "Quận 3",
      price: 3.0,
      areaSize: 82.5,
      direction: "xyz"
    });
    expect(PropertyPickerFormat.detailLine(p3)).toBe("3 tỷ · 82.5 m²");
  });
});
