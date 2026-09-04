import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  buildVerifiedProperty,
  checkVerificationReadiness
} from "../../../src/core/engine/verification-engine";
import { Property } from "../../../src/core/models/property";
import { PropertyStatus, PropertyType, CustomerPropertyRole } from "../../../src/core/models/enums";
import { AppDatabase } from "../../../src/data/local/db";
import { ensureCustomerForProperty } from "../../../src/core/services/customer-linker";

describe("UNVERIFIED-VERIFY-WIZARD-001: Verification Wizard Engine & CRM Sync", () => {
  let db: AppDatabase;
  const sampleUnverified: Property = {
    id: "prop-unverified-1",
    area: "123 Hoàng Hoa Thám, Bình Thạnh",
    latitude: null,
    longitude: null,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    documentUrl: null,
    areaSize: 55,
    price: 4.8,
    description: "Nhà 1 trệt 2 lầu",
    status: PropertyStatus.PENDING_SURVEY,
    direction: "Đông Nam",
    ownerName: "Anh Minh",
    ownerPhone: "0987654321",
    propertyType: PropertyType.HOUSE,
    needToViewToday: false,
    isTextSynced: true,
    isMediaSynced: true,
    rawText: "Bán nhà Hoàng Hoa Thám 4.8 tỷ LH Minh 0987654321",
    extractedBy: "REGEX",
    updatedAt: 1000,
    lastEditedAt: 1000,
    surveyDate: null,
    isVerified: false,
    linkedCustomerId: null
  };

  describe("buildVerifiedProperty", () => {
    it("should promote isVerified to true and PENDING_SURVEY to FOR_SALE", () => {
      const verified = buildVerifiedProperty(sampleUnverified);

      expect(verified.isVerified).toBe(true);
      expect(verified.status).toBe(PropertyStatus.FOR_SALE);
      expect(verified.isTextSynced).toBe(false);
      expect(verified.updatedAt).toBeGreaterThan(sampleUnverified.updatedAt);
      expect(verified.lastEditedAt).toBeGreaterThan(sampleUnverified.lastEditedAt);
    });

    it("should accept overrides for GPS, photos, and price during wizard review", () => {
      const verified = buildVerifiedProperty(sampleUnverified, {
        latitude: 10.8012,
        longitude: 106.6915,
        imagePath: "img1.jpg|||img2.jpg",
        price: 4.6
      });

      expect(verified.isVerified).toBe(true);
      expect(verified.latitude).toBe(10.8012);
      expect(verified.longitude).toBe(106.6915);
      expect(verified.imagePath).toBe("img1.jpg|||img2.jpg");
      expect(verified.price).toBe(4.6);
    });

    it("should preserve status if not PENDING_SURVEY (e.g. PAUSED)", () => {
      const pausedUnverified: Property = {
        ...sampleUnverified,
        status: PropertyStatus.PAUSED
      };
      const verified = buildVerifiedProperty(pausedUnverified);
      expect(verified.isVerified).toBe(true);
      expect(verified.status).toBe(PropertyStatus.PAUSED);
    });
  });

  describe("checkVerificationReadiness", () => {
    it("should report warnings when critical broker fields are missing", () => {
      const incomplete: Property = {
        ...sampleUnverified,
        area: "",
        latitude: null,
        longitude: null,
        ownerPhone: "",
        price: 0
      };

      const { isReady, warnings } = checkVerificationReadiness(incomplete);
      expect(isReady).toBe(false);
      expect(warnings.length).toBeGreaterThanOrEqual(4);
    });

    it("should pass readiness when all essential fields are filled", () => {
      const complete: Property = {
        ...sampleUnverified,
        latitude: 10.7769,
        longitude: 106.7009
      };

      const { isReady, warnings } = checkVerificationReadiness(complete);
      expect(isReady).toBe(true);
      expect(warnings).toHaveLength(0);
    });
  });

  describe("Integration: Verification promotes property and syncs OWNER to CRM", () => {
    beforeEach(async () => {
      db = new AppDatabase();
      await db.properties.clear();
      await db.customers.clear();
      await db.customer_property_links.clear();
    });

    it("should create OWNER customer in db.customers and link in db.customer_property_links when approved", async () => {
      // 1. Lưu bản ghi tin chờ
      await db.properties.put(sampleUnverified);

      // 2. Chạy hàm phê duyệt qua buildVerifiedProperty
      const approved = buildVerifiedProperty(sampleUnverified, {
        latitude: 10.8012,
        longitude: 106.6915
      });
      await db.properties.put(approved);

      // 3. Đồng bộ chủ nhà vào CRM
      await ensureCustomerForProperty(db, approved);

      // 4. Kiểm chứng DB
      const dbProp = await db.properties.get(sampleUnverified.id);
      expect(dbProp?.isVerified).toBe(true);
      expect(dbProp?.status).toBe(PropertyStatus.FOR_SALE);
      expect(dbProp?.latitude).toBe(10.8012);

      const ownerCust = await db.customers.where("phone").equals("0987654321").first();
      expect(ownerCust).toBeDefined();
      expect(ownerCust?.name).toBe("Anh Minh");
      expect(ownerCust?.role).toBe("OWNER");

      const link = await db.customer_property_links
        .where("propertyId")
        .equals(sampleUnverified.id)
        .first();
      expect(link).toBeDefined();
      expect(link?.customerId).toBe(ownerCust?.id);
      expect(link?.role).toBe(CustomerPropertyRole.OWNER);
    });
  });
});
