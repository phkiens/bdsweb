import { describe, it, expect } from "vitest";
import { Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";
import {
  getGeoClusteredProperties,
  getAreaClusteredProperties
} from "../../../src/pages/unverified/UnverifiedListPage";

describe("PARITY-UNVER-002: Unverified Properties Clustered View (Xem gom cụm)", () => {
  const createMockProp = (overrides: Partial<Property>): Property => ({
    id: "prop-" + Math.random().toString(36).substring(2, 6),
    area: "TP.HCM",
    latitude: null,
    longitude: null,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    priceAtFolderCreation: null,
    documentUrl: "",
    areaSize: 50,
    price: 3.5,
    description: "",
    status: PropertyStatus.PENDING_SURVEY,
    surveyDate: null,
    direction: "Đông",
    ownerName: "Chủ tin",
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
    isVerified: false,
    lastEditedAt: 1000,
    r2MediaKeys: null,
    ...overrides
  });

  describe("Geo-Clustering (Bán kính 2km)", () => {
    it("Gom cụm các tin chờ có tọa độ trong bán kính 2km thành từng nhóm", () => {
      // Điểm 1: Nhà thờ Đức Bà (10.7798, 106.6990)
      const p1 = createMockProp({ id: "p1", area: "Nhà thờ Đức Bà", latitude: 10.7798, longitude: 106.6990 });
      // Điểm 2: Chợ Bến Thành (10.7725, 106.6980) - cách p1 ~800m (< 2km)
      const p2 = createMockProp({ id: "p2", area: "Chợ Bến Thành", latitude: 10.7725, longitude: 106.6980 });
      // Điểm 3: Sân bay Tân Sơn Nhất (10.8185, 106.6588) - cách p1 ~6km (> 2km)
      const p3 = createMockProp({ id: "p3", area: "Sân bay Tân Sơn Nhất", latitude: 10.8185, longitude: 106.6588 });

      const clusters = getGeoClusteredProperties([p1, p2, p3]);

      expect(clusters.length).toBe(2);
      // Cụm 1 gồm p1 và p2
      expect(clusters[0].properties.map((p) => p.id)).toEqual(["p1", "p2"]);
      expect(clusters[0].center.id).toBe("p1");

      // Cụm 2 chỉ có p3
      expect(clusters[1].properties.map((p) => p.id)).toEqual(["p3"]);
      expect(clusters[1].center.id).toBe("p3");
    });

    it("Bỏ qua các tin không có tọa độ hoặc tọa độ ngoài Việt Nam", () => {
      const pValid = createMockProp({ id: "valid", latitude: 10.7798, longitude: 106.6990 });
      const pNoCoords = createMockProp({ id: "no-coords", latitude: null, longitude: null });
      const pForeign = createMockProp({ id: "foreign", latitude: 48.8566, longitude: 2.3522 }); // Paris

      const clusters = getGeoClusteredProperties([pValid, pNoCoords, pForeign]);
      expect(clusters.length).toBe(1);
      expect(clusters[0].properties.map((p) => p.id)).toEqual(["valid"]);
    });
  });

  describe("Area-Clustering (Phân nhóm theo tên khu vực/phường/đường)", () => {
    it("Gom các tin chưa có tọa độ theo tên khu vực và sắp xếp nhóm nhiều tin nhất lên trước", () => {
      const p1 = createMockProp({ id: "p1", area: "Phường Bến Nghé" });
      const p2 = createMockProp({ id: "p2", area: "Phường Bến Thành" });
      const p3 = createMockProp({ id: "p3", area: "Phường Bến Nghé" });
      const p4 = createMockProp({ id: "p4", area: "Phường Bến Nghé" });
      const p5 = createMockProp({ id: "p5", area: "" }); // Chưa rõ khu vực

      const groups = getAreaClusteredProperties([p1, p2, p3, p4, p5]);

      // Bến Nghé có 3 tin -> lên đầu
      expect(groups[0].areaName).toBe("Phường Bến Nghé");
      expect(groups[0].properties.length).toBe(3);

      // Bến Thành hoặc Chưa rõ có 1 tin
      const groupNames = groups.map((g) => g.areaName);
      expect(groupNames).toContain("Phường Bến Thành");
      expect(groupNames).toContain("Chưa rõ khu vực");
    });
  });
});
