import Dexie, { Table } from "dexie";
import { Customer, CustomerPropertyLink } from "../../core/models/customer";
import { SyncStatus, SyncType } from "../../core/models/enums";
import { Property } from "../../core/models/property";

export interface SyncLog {
  id?: number;
  timestamp: number;
  type: SyncType | string;
  status: SyncStatus | string;
  tag: string;
  message: string;
  itemCount?: number;
  totalCount?: number;
}

export class AppDatabase extends Dexie {
  properties!: Table<Property, string>;
  customers!: Table<Customer, string>;
  customer_property_links!: Table<CustomerPropertyLink, [string, string]>;
  sync_logs!: Table<SyncLog, number>;

  constructor() {
    super("bds_collector_web_db");

    // Phiên bản 1 của Dexie tương ứng với Room v30
    this.version(1).stores({
      properties:
        "id, area, price, status, propertyType, needToViewToday, isVerified, isDeleted, isTextSynced, isMediaSynced, updatedAt, lastEditedAt, [isDeleted+isVerified]",
      customers:
        "id, phone, role, status, isSynced, isDeleted, updatedAt, [isDeleted+status]",
      customer_property_links:
        "[customerId+propertyId], customerId, propertyId, role, isSynced, isDeleted, updatedAt",
      sync_logs:
        "++id, timestamp, type, status"
    });
  }

  /**
   * Đánh dấu bản ghi đã đồng bộ với kiểm tra CAS (Compare-And-Swap)
   * Giống hệt PropertyDao.markSyncedIfUnchanged(id, pushedUpdatedAt)
   */
  async markPropertySyncedIfUnchanged(id: string, pushedUpdatedAt: number): Promise<boolean> {
    return await this.transaction("rw", this.properties, async () => {
      const existing = await this.properties.get(id);
      if (existing && existing.updatedAt === pushedUpdatedAt) {
        await this.properties.update(id, { isTextSynced: true });
        return true;
      }
      return false;
    });
  }

  async markCustomerSyncedIfUnchanged(id: string, pushedUpdatedAt: number): Promise<boolean> {
    return await this.transaction("rw", this.customers, async () => {
      const existing = await this.customers.get(id);
      if (existing && existing.updatedAt === pushedUpdatedAt) {
        await this.customers.update(id, { isSynced: true });
        return true;
      }
      return false;
    });
  }

  async markLinkSyncedIfUnchanged(
    customerId: string,
    propertyId: string,
    pushedUpdatedAt: number
  ): Promise<boolean> {
    return await this.transaction("rw", this.customer_property_links, async () => {
      const existing = await this.customer_property_links.get([customerId, propertyId]);
      if (existing && existing.updatedAt === pushedUpdatedAt) {
        await this.customer_property_links.update([customerId, propertyId], { isSynced: true });
        return true;
      }
      return false;
    });
  }

  /**
   * Xóa vĩnh viễn (Hard delete) các record đã soft-delete quá 30 ngày
   * Khớp với PurgeWorker trong Android
   */
  async purgeDeletedOlderThan(cutoffTimestamp: number): Promise<number> {
    let purgedCount = 0;
    await this.transaction("rw", [this.properties, this.customers, this.customer_property_links], async () => {
      const oldProperties = await this.properties
        .filter((p) => p.isDeleted && p.updatedAt < cutoffTimestamp)
        .toArray();
      await this.properties.bulkDelete(oldProperties.map((p) => p.id));
      purgedCount += oldProperties.length;

      const oldCustomers = await this.customers
        .filter((c) => c.isDeleted && c.updatedAt < cutoffTimestamp)
        .toArray();
      await this.customers.bulkDelete(oldCustomers.map((c) => c.id));
      purgedCount += oldCustomers.length;

      const oldLinks = await this.customer_property_links
        .filter((l) => l.isDeleted && l.updatedAt < cutoffTimestamp)
        .toArray();
      await this.customer_property_links.bulkDelete(oldLinks.map((l) => [l.customerId, l.propertyId]));
      purgedCount += oldLinks.length;
    });
    return purgedCount;
  }
}

export const db = new AppDatabase();
