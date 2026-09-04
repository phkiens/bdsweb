import { describe, it, expect } from "vitest";
import { Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  filterMapProperties,
  getMarkerColorType,
  MapScanCenter
} from "../../../src/core/engine/map-survey-engine";

describe("FEATURE PARITY: MAP-SURVEY-GPS-001 (Bản đồ khảo sát: Lọc bán kính GPS và phân biệt màu ghim)", () => {
  const createMockProp = (overrides: Partial<Property>): Property => ({
    id: "prop-" + Math.random().toString(36).substring(2, 6),
    area: "TP.HCM",
    latitude: 10.7769,
    longitude: 106.7009,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    priceAtFolderCreation: null,
    documentUrl: "",
    areaSize: 50,
    price: 4.5,
    description: "",
    status: PropertyStatus.FOR_SALE,
    surveyDate: "2026-09-04",
    direction: "Đông Nam",
    ownerName: "Chủ nhà",
    ownerPhone: "0901234567",
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
    isMediaSynced: false,
    linkedCustomerId: null,
    title: null,
    mapLink: null,
    extractedBy: null,
    createdAt: 1000,
    isVerified: true,
    lastEditedAt: 1000,
    r2MediaKeys: null,
    ...overrides
  });

  // Tọa độ trung tâm Nhà thờ Đức Bà: 10.7798, 106.6990
  const userGps: MapScanCenter = {
    type: "GPS",
    latitude: 10.7798,
    longitude: 106.6990
  };

  it("Phân biệt màu sắc ghim: BĐS chính thức (Blue) vs Tin chờ khảo sát (Orange)", () => {
    const verifiedProp = createMockProp({ isVerified: true });
    const unverifiedProp = createMockProp({ isVerified: false });

    expect(getMarkerColorType(verifiedProp)).toBe("blue");
    expect(getMarkerColorType(unverifiedProp)).toBe("orange");
  });

  it("Lọc theo bán kính GPS (0.5km, 1km, 2km, 5km) và tính khoảng cách chính xác", () => {
    // 1. Gần ~200m: Bưu điện TP (10.7798, 106.6999)
    const p200m = createMockProp({ id: "p-200m", latitude: 10.7798, longitude: 106.6999 });
    // 2. Gần ~800m: Chợ Bến Thành (10.7725, 106.6980)
    const p800m = createMockProp({ id: "p-800m", latitude: 10.7725, longitude: 106.6980 });
    // 3. Gần ~1.8km: Thảo Cầm Viên (10.7875, 106.7053)
    const p1800m = createMockProp({ id: "p-1800m", latitude: 10.7875, longitude: 106.7053 });
    // 4. Xa ~4.5km: Landmark 81 (10.7951, 106.7218)
    const p4500m = createMockProp({ id: "p-4500m", latitude: 10.7951, longitude: 106.7218 });
    // 5. Rất xa ~10km: Sân bay Tân Sơn Nhất (10.8185, 106.6588)
    const p10km = createMockProp({ id: "p-10km", latitude: 10.8185, longitude: 106.6588 });

    const props = [p200m, p800m, p1800m, p4500m, p10km];

    // Bán kính 0.5km (500m): chỉ lấy p200m
    const within500m = filterMapProperties(props, userGps, 0.5);
    expect(within500m.map((p) => p.id)).toEqual(["p-200m"]);
    expect(within500m[0].distanceKm).toBeLessThan(0.5);

    // Bán kính 1.0km: lấy p200m và p800m
    const within1km = filterMapProperties(props, userGps, 1.0);
    expect(within1km.map((p) => p.id)).toEqual(["p-200m", "p-800m"]);

    // Bán kính 2.0km: lấy p200m, p800m, p1800m
    const within2km = filterMapProperties(props, userGps, 2.0);
    expect(within2km.map((p) => p.id)).toEqual(["p-200m", "p-800m", "p-1800m"]);

    // Bán kính 5.0km: lấy cả 4 BĐS trong 5km
    const within5km = filterMapProperties(props, userGps, 5.0);
    expect(within5km.map((p) => p.id)).toEqual(["p-200m", "p-800m", "p-1800m", "p-4500m"]);

    // Bán kính null (Tất cả): lấy toàn bộ 5 BĐS
    const all = filterMapProperties(props, userGps, null);
    expect(all.length).toBe(5);
  });

  it("Sắp xếp danh sách theo khoảng cách tăng dần khi có tâm quét", () => {
    const pFar = createMockProp({ id: "far", latitude: 10.7951, longitude: 106.7218 }); // ~4.5km
    const pNear = createMockProp({ id: "near", latitude: 10.7798, longitude: 106.6999 }); // ~200m
    const pMid = createMockProp({ id: "mid", latitude: 10.7725, longitude: 106.6980 }); // ~800m

    const sorted = filterMapProperties([pFar, pNear, pMid], userGps, null);
    expect(sorted.map((p) => p.id)).toEqual(["near", "mid", "far"]);
  });

  it("Loại bỏ BĐS có tọa độ null hoặc ngoài phạm vi Việt Nam", () => {
    const valid = createMockProp({ id: "valid", latitude: 10.7769, longitude: 106.7009 });
    const nullLat = createMockProp({ id: "null-lat", latitude: null, longitude: 106.7009 });
    const nullLng = createMockProp({ id: "null-lng", latitude: 10.7769, longitude: null });
    const outOfVn = createMockProp({ id: "out", latitude: 35.6762, longitude: 139.6503 }); // Tokyo

    const result = filterMapProperties([valid, nullLat, nullLng, outOfVn], null, null);
    expect(result.map((p) => p.id)).toEqual(["valid"]);
  });

  describe("PARITY-MAP-001: Horizontal Pager Carousel for Nearby Properties", () => {
    it("Cho phép duyệt mảng BĐS lân cận theo index, chỉ số trang và giới hạn biên", () => {
      const p1 = createMockProp({ id: "p1", latitude: 10.7798, longitude: 106.6999 });
      const p2 = createMockProp({ id: "p2", latitude: 10.7725, longitude: 106.6980 });
      const p3 = createMockProp({ id: "p3", latitude: 10.7875, longitude: 106.7053 });

      const filtered = filterMapProperties([p1, p2, p3], userGps, 2.0);
      expect(filtered.length).toBe(3);

      // Giả lập logic chọn index ban đầu và di chuyển
      let selectedPropertyId = "p1";
      let currentIndex = filtered.findIndex((p) => p.id === selectedPropertyId);
      expect(currentIndex).toBe(0);

      // Chuyển sang item tiếp theo
      if (currentIndex < filtered.length - 1) {
        currentIndex++;
        selectedPropertyId = filtered[currentIndex].id;
      }
      expect(currentIndex).toBe(1);
      expect(selectedPropertyId).toBe("p2");

      // Chuyển tiếp sang item cuối
      if (currentIndex < filtered.length - 1) {
        currentIndex++;
        selectedPropertyId = filtered[currentIndex].id;
      }
      expect(currentIndex).toBe(2);
      expect(selectedPropertyId).toBe("p3");

      // Không thể vượt quá biên cuối
      const canGoNext = currentIndex < filtered.length - 1;
      expect(canGoNext).toBe(false);

      // Quay lại item trước
      const canGoPrev = currentIndex > 0;
      expect(canGoPrev).toBe(true);
      if (canGoPrev) {
        currentIndex--;
        selectedPropertyId = filtered[currentIndex].id;
      }
      expect(currentIndex).toBe(1);
      expect(selectedPropertyId).toBe("p2");
    });
  });
});
