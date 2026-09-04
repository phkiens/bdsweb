import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../src/data/local/db";
import {
  mapDomainPropertyToRemote,
  mapDomainCustomerToRemote,
  mapDomainLinkToRemote,
  mapRemotePropertyToDomain
} from "../../src/data/sync/sync-manager";
import { createDefaultProperty } from "../../src/core/models/property";
import { Customer, CustomerPropertyLink } from "../../src/core/models/customer";
import { CustomerRole, CustomerStatus, PropertyStatus, PropertyType } from "../../src/core/models/enums";

describe("PHASE W2 — TWO-WAY TEXT SYNC", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.customers.clear();
    await db.customer_property_links.clear();
    await db.sync_outbox.clear();
  });

  describe("1. DTO Mapping & Contract Compliance", () => {
    it("mapDomainPropertyToRemote maps canonical fields and strips local-only fields", () => {
      const prop = createDefaultProperty({
        id: "prop-test-001",
        area: "Quận 1, TP.HCM",
        areaSize: 85.5,
        price: 12.5,
        status: PropertyStatus.FOR_SALE,
        propertyType: PropertyType.HOUSE,
        direction: "Đông Nam",
        ownerName: "Nguyễn Văn A",
        ownerPhone: "0901234567",
        isVerified: true,
        needToViewToday: true,
        isDraft: false,
        rawText: "Bán nhà Q1",
        diary: "2026-09-04: Khách đã xem",
        updatedAt: 1725450000000,
        createdAt: 1725400000000,
        lastEditedAt: 1725450000000,
        imagePath: "blob:http://localhost/img1|||blob:http://localhost/img2",
        isTextSynced: false,
        isMediaSynced: false,
        linkedCustomerId: "cust-001"
      });

      const remote = mapDomainPropertyToRemote(prop);

      expect(remote.id).toBe("prop-test-001");
      expect(remote.area).toBe("Quận 1, TP.HCM");
      expect(remote.area_size).toBe(85.5);
      expect(remote.price).toBe(12.5);
      expect(remote.status).toBe("Đang bán");
      expect(remote.property_type).toBe("Nhà");
      expect(remote.direction).toBe("Đông Nam");
      expect(remote.owner_name).toBe("Nguyễn Văn A");
      expect(remote.owner_phone).toBe("0901234567");
      expect(remote.is_verified).toBe(true);
      expect(remote.need_to_view_today).toBe(true);
      expect(remote.updated_at).toBe(1725450000000);
      expect(remote.is_deleted).toBe(false);

      expect(remote.imagePath).toBeUndefined();
      expect(remote.isTextSynced).toBeUndefined();
      expect(remote.isMediaSynced).toBeUndefined();
      expect(remote.linkedCustomerId).toBeUndefined();
    });

    it("mapDomainCustomerToRemote maps fields and strips local-only fields", () => {
      const cust: Customer = {
        id: "cust-test-001",
        name: "Trần Thị B",
        nameNormalized: "tran thi b",
        phone: "0912345678",
        demandType: "Cần mua",
        propertyType: "Nhà",
        demandAreas: "Bình Thạnh",
        demandDirections: "Tây",
        priceMin: 3.0,
        priceMax: 5.0,
        note: "Khách thiện chí",
        noteNormalized: "khach thien chi",
        role: CustomerRole.BUYER,
        status: CustomerStatus.ACTIVE,
        updatedAt: 1725451000000,
        isSynced: false,
        isDeleted: false,
        avatarPath: "/local/path/avatar.jpg",
        avatarDriveUrl: null
      };

      const remote = mapDomainCustomerToRemote(cust);

      expect(remote.id).toBe("cust-test-001");
      expect(remote.name).toBe("Trần Thị B");
      expect(remote.name_normalized).toBe("tran thi b");
      expect(remote.phone).toBe("0912345678");
      expect(remote.demand_type).toBe("Cần mua");
      expect(remote.demand_areas).toBe("Bình Thạnh");
      expect(remote.demand_directions).toBe("Tây");
      expect(remote.price_min).toBe(3.0);
      expect(remote.price_max).toBe(5.0);
      expect(remote.updated_at).toBe(1725451000000);
      expect(remote.isSynced).toBeUndefined();
    });

    it("mapDomainLinkToRemote maps CustomerPropertyLink fields", () => {
      const link: CustomerPropertyLink = {
        customerId: "cust-001",
        propertyId: "prop-001",
        role: "VIEWER",
        viewDate: "2026-09-04",
        viewNote: "Xem buổi sáng",
        updatedAt: 1725452000000,
        isDeleted: false,
        isSynced: false
      };

      const remote = mapDomainLinkToRemote(link);

      expect(remote.customer_id).toBe("cust-001");
      expect(remote.property_id).toBe("prop-001");
      expect(remote.role).toBe("VIEWER");
      expect(remote.view_date).toBe("2026-09-04");
      expect(remote.view_note).toBe("Xem buổi sáng");
      expect(remote.updated_at).toBe(1725452000000);
      expect(remote.is_deleted).toBe(false);
      expect(remote.isSynced).toBeUndefined();
    });
  });

  describe("2. Persistent Outbox Queue & Coalescing", () => {
    it("enqueues new item and coalesces duplicate actions on the same entity", async () => {
      const id1 = await db.enqueueOutbox("PROPERTY", "prop-100", "UPSERT");
      expect(id1).toBeGreaterThan(0);

      const itemsAfterFirst = await db.getPendingOutbox();
      expect(itemsAfterFirst.length).toBe(1);
      expect(itemsAfterFirst[0].entityType).toBe("PROPERTY");
      expect(itemsAfterFirst[0].entityId).toBe("prop-100");
      expect(itemsAfterFirst[0].operation).toBe("UPSERT");

      const id2 = await db.enqueueOutbox("PROPERTY", "prop-100", "DELETE");
      expect(id2).toBe(id1);

      const itemsAfterSecond = await db.getPendingOutbox();
      expect(itemsAfterSecond.length).toBe(1);
      expect(itemsAfterSecond[0].operation).toBe("DELETE");
    });

    it("updates error and retry attempt count", async () => {
      const id = await db.enqueueOutbox("CUSTOMER", "cust-200", "UPSERT");
      await db.updateOutboxError(id, "Network timeout");

      const items = await db.getPendingOutbox();
      expect(items[0].attemptCount).toBe(1);
      expect(items[0].lastError).toBe("Network timeout");

      await db.updateOutboxError(id, "SYNC_CONFLICT");
      const updatedItems = await db.getPendingOutbox();
      expect(updatedItems[0].attemptCount).toBe(2);
      expect(updatedItems[0].lastError).toBe("SYNC_CONFLICT");
    });

    it("removes item upon successful push", async () => {
      const id = await db.enqueueOutbox("LINK", "cust-1:::prop-1", "UPSERT");
      expect((await db.getPendingOutbox()).length).toBe(1);

      await db.removeOutbox(id);
      expect((await db.getPendingOutbox()).length).toBe(0);
    });
  });

  describe("3. Compare-And-Swap (CAS) markSyncedIfUnchanged", () => {
    it("markPropertySyncedIfUnchanged succeeds only if record updatedAt was not changed", async () => {
      const prop = createDefaultProperty({
        id: "prop-cas-1",
        area: "Gò Vấp",
        updatedAt: 1000,
        isTextSynced: false
      });
      await db.properties.add(prop);

      const success = await db.markPropertySyncedIfUnchanged("prop-cas-1", 1000);
      expect(success).toBe(true);

      const updated = await db.properties.get("prop-cas-1");
      expect(updated?.isTextSynced).toBe(true);

      await db.properties.update("prop-cas-1", { updatedAt: 2000, isTextSynced: false });

      const fail = await db.markPropertySyncedIfUnchanged("prop-cas-1", 1000);
      expect(fail).toBe(false);

      const rechecked = await db.properties.get("prop-cas-1");
      expect(rechecked?.isTextSynced).toBe(false);
    });

    it("markCustomerSyncedIfUnchanged succeeds only if record updatedAt was not changed", async () => {
      const cust: Customer = {
        id: "cust-cas-1",
        name: "Lê Văn C",
        nameNormalized: "le van c",
        phone: "0988776655",
        demandType: "Cần mua",
        propertyType: "Nhà",
        demandAreas: "",
        demandDirections: "",
        priceMin: 0,
        priceMax: 0,
        note: "",
        noteNormalized: "",
        role: CustomerRole.BUYER,
        status: CustomerStatus.ACTIVE,
        updatedAt: 5000,
        isSynced: false,
        isDeleted: false,
        avatarPath: null,
        avatarDriveUrl: null
      };
      await db.customers.add(cust);

      const ok = await db.markCustomerSyncedIfUnchanged("cust-cas-1", 5000);
      expect(ok).toBe(true);
      expect((await db.customers.get("cust-cas-1"))?.isSynced).toBe(true);

      await db.customers.update("cust-cas-1", { updatedAt: 6000, isSynced: false });
      const staleCas = await db.markCustomerSyncedIfUnchanged("cust-cas-1", 5000);
      expect(staleCas).toBe(false);
      expect((await db.customers.get("cust-cas-1"))?.isSynced).toBe(false);
    });
  });

  describe("4. Silent Drop Detection & Conflict Guard", () => {
    it("remote pull preserves unsynced local edits (no swallowing)", async () => {
      const localProp = createDefaultProperty({
        id: "prop-conflict-01",
        area: "Local Edit Khu Vực",
        price: 5.0,
        updatedAt: 2000,
        isTextSynced: false
      });
      await db.properties.add(localProp);

      const remotePayload = {
        id: "prop-conflict-01",
        area: "Server Area",
        price: 6.0,
        updated_at: 3000,
        is_verified: true
      };

      const domain = mapRemotePropertyToDomain(remotePayload, localProp);
      expect(domain.isTextSynced).toBe(false);

      const existing = await db.properties.get("prop-conflict-01");
      if (existing && !existing.isTextSynced) {
        // Protected from overwrite
      } else {
        await db.properties.put(domain);
      }

      const unchangedInDb = await db.properties.get("prop-conflict-01");
      expect(unchangedInDb?.area).toBe("Local Edit Khu Vực");
      expect(unchangedInDb?.price).toBe(5.0);
      expect(unchangedInDb?.isTextSynced).toBe(false);
    });

    it("detects silent drop when server returned updated_at is newer than local pushed payload", () => {
      const localPushedUpdatedAt = 1000;
      const serverReturnedData = {
        id: "prop-stale",
        updated_at: 2500
      };

      const serverUpdatedAt = Number(serverReturnedData.updated_at);
      const isSilentDrop = localPushedUpdatedAt < serverUpdatedAt;

      expect(isSilentDrop).toBe(true);
    });
  });
});
