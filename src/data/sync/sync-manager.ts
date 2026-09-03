import { db } from "../local/db";
import { getSupabaseClient } from "../remote/supabase";
import { SyncStatus, SyncType } from "../../core/models/enums";
import { Property } from "../../core/models/property";

export type SyncState = "IDLE" | "SYNCING" | "ERROR" | "OFFLINE";

export class SyncManager {
  private syncState: SyncState = "IDLE";
  private listeners: Set<(state: SyncState, message?: string) => void> = new Set();
  private isRunning = false;

  public getState(): SyncState {
    return this.syncState;
  }

  public subscribe(listener: (state: SyncState, message?: string) => void): () => void {
    this.listeners.add(listener);
    listener(this.syncState);
    return () => this.listeners.delete(listener);
  }

  private notify(state: SyncState, message?: string) {
    this.syncState = state;
    for (const listener of this.listeners) {
      listener(state, message);
    }
  }

  /**
   * Đẩy các bản ghi local chưa đồng bộ lên Supabase với CAS verification
   */
  public async pushChanges(): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client) return false;
    if (!navigator.onLine) return false;

    let hasErrors = false;

    try {
      // 1. Push Properties
      const unsyncedProps = await db.properties
        .where("isTextSynced")
        .equals(0 as any)
        .toArray();

      for (const prop of unsyncedProps) {
        const pushedUpdatedAt = prop.updatedAt;
        const payload = {
          id: prop.id,
          area: prop.area,
          latitude: prop.latitude,
          longitude: prop.longitude,
          area_size: prop.areaSize,
          price: prop.price,
          description: prop.description,
          status: prop.status,
          survey_date: prop.surveyDate,
          direction: prop.direction,
          owner_name: prop.ownerName,
          owner_phone: prop.ownerPhone,
          property_type: prop.propertyType,
          need_to_view_today: prop.needToViewToday,
          is_draft: prop.isDraft,
          raw_text: prop.rawText,
          diary: prop.diary,
          updated_at: prop.updatedAt,
          is_deleted: prop.isDeleted,
          is_verified: prop.isVerified,
          last_edited_at: prop.lastEditedAt
        };

        const { error } = await client.from("properties").upsert(payload, { onConflict: "id" });
        if (!error) {
          await db.markPropertySyncedIfUnchanged(prop.id, pushedUpdatedAt);
        } else {
          console.error("Failed to push property:", prop.id, error);
          hasErrors = true;
        }
      }

      // 2. Push Customers
      const unsyncedCustomers = await db.customers
        .where("isSynced")
        .equals(0 as any)
        .toArray();

      for (const cust of unsyncedCustomers) {
        const pushedUpdatedAt = cust.updatedAt;
        const payload = {
          id: cust.id,
          name: cust.name,
          phone: cust.phone,
          demand_type: cust.demandType,
          property_type: cust.propertyType,
          demand_areas: cust.demandAreas,
          demand_directions: cust.demandDirections,
          price_min: cust.priceMin,
          price_max: cust.priceMax,
          note: cust.note,
          role: cust.role,
          status: cust.status,
          updated_at: cust.updatedAt,
          is_deleted: cust.isDeleted
        };

        const { error } = await client.from("customers").upsert(payload, { onConflict: "id" });
        if (!error) {
          await db.markCustomerSyncedIfUnchanged(cust.id, pushedUpdatedAt);
        } else {
          console.error("Failed to push customer:", cust.id, error);
          hasErrors = true;
        }
      }

      // 3. Push Links
      const unsyncedLinks = await db.customer_property_links
        .where("isSynced")
        .equals(0 as any)
        .toArray();

      for (const link of unsyncedLinks) {
        const pushedUpdatedAt = link.updatedAt;
        const payload = {
          customer_id: link.customerId,
          property_id: link.propertyId,
          role: link.role,
          updated_at: link.updatedAt,
          is_deleted: link.isDeleted
        };

        const { error } = await client
          .from("customer_properties")
          .upsert(payload, { onConflict: "customer_id,property_id" });
        if (!error) {
          await db.markLinkSyncedIfUnchanged(link.customerId, link.propertyId, pushedUpdatedAt);
        } else {
          console.error("Failed to push link:", link, error);
          hasErrors = true;
        }
      }
    } catch (e) {
      console.error("Error during pushChanges", e);
      return false;
    }

    return !hasErrors;
  }

  /**
   * Kéo dữ liệu delta mới từ Supabase về IndexedDB
   */
  public async pullChanges(): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !navigator.onLine) return false;

    try {
      // Pull properties
      const { data: remoteProps, error: propErr } = await client
        .from("properties")
        .select("*")
        .order("server_updated_at", { ascending: true })
        .limit(500);

      if (propErr) throw propErr;

      if (remoteProps && remoteProps.length > 0) {
        await db.transaction("rw", db.properties, async () => {
          for (const item of remoteProps) {
            const existing = await db.properties.get(item.id);
            const remoteUpdatedAt = Number(item.updated_at) || 0;

            if (!existing || remoteUpdatedAt > existing.updatedAt) {
              const mapped: Property = {
                id: item.id,
                area: item.area || "",
                latitude: item.latitude,
                longitude: item.longitude,
                imagePath: existing?.imagePath || null,
                driveMediaIds: null,
                driveFolderId: null,
                priceAtFolderCreation: null,
                documentUrl: item.document_url || "",
                areaSize: item.area_size,
                price: Number(item.price) || 0,
                description: item.description || "",
                status: item.status || "Đang bán",
                surveyDate: item.survey_date || "",
                direction: item.direction || "",
                ownerName: item.owner_name || "",
                ownerPhone: item.owner_phone || "",
                propertyType: item.property_type || "Nhà",
                needToViewToday: Boolean(item.need_to_view_today),
                isDraft: Boolean(item.is_draft),
                // Giữ nguyên cờ local isTextSynced để không làm mất thay đổi chưa đẩy
                isTextSynced: existing ? existing.isTextSynced : true,
                rawText: item.raw_text || "",
                diary: item.diary || "",
                updatedAt: remoteUpdatedAt,
                isDeleted: Boolean(item.is_deleted),
                propertyDetailJsonFileId: null,
                txtFileId: null,
                isMediaSynced: existing?.isMediaSynced || false,
                linkedCustomerId: null,
                title: item.title || null,
                mapLink: item.map_link || null,
                extractedBy: item.extracted_by || null,
                createdAt: Number(item.created_at) || remoteUpdatedAt,
                isVerified: item.is_verified !== undefined ? Boolean(item.is_verified) : true,
                lastEditedAt: Number(item.last_edited_at) || remoteUpdatedAt,
                r2MediaKeys: item.r2_media_keys || null
              };

              await db.properties.put(mapped);
            }
          }
        });
      }
      return true;
    } catch (e) {
      console.error("Error during pullChanges", e);
      return false;
    }
  }

  /**
   * Kích hoạt chu kỳ đồng bộ thủ công ("Đồng bộ ngay")
   */
  public async syncNow(): Promise<boolean> {
    if (this.isRunning) return false;
    if (!navigator.onLine) {
      this.notify("OFFLINE", "Không có kết nối mạng");
      return false;
    }

    this.isRunning = true;
    this.notify("SYNCING", "Đang đồng bộ dữ liệu...");

    try {
      const pushOk = await this.pushChanges();
      const pullOk = await this.pullChanges();

      if (pushOk && pullOk) {
        this.notify("IDLE", "Đồng bộ thành công");
        await db.sync_logs.add({
          timestamp: Date.now(),
          type: SyncType.GENERAL,
          status: SyncStatus.SUCCESS,
          tag: "SyncManager",
          message: "Đồng bộ hai chiều Supabase thành công"
        });
        return true;
      } else {
        this.notify("ERROR", "Đồng bộ có lỗi");
        return false;
      }
    } catch (e: any) {
      this.notify("ERROR", e.message || "Lỗi đồng bộ");
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Đăng ký Realtime WebSocket khi app đang mở
   */
  public startRealtime(): () => void {
    const client = getSupabaseClient();
    if (!client) return () => {};

    const channel = client
      .channel("bds_realtime_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "properties" },
        async (payload) => {
          console.log("Realtime property update:", payload);
          await this.pullChanges();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        async (payload) => {
          console.log("Realtime customer update:", payload);
          await this.pullChanges();
        }
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }
}

export const syncManager = new SyncManager();
