import { db } from "../local/db";
import { getSupabaseClient } from "../remote/supabase";
import { SyncStatus, SyncType } from "../../core/models/enums";
import { Property } from "../../core/models/property";
import { Customer, CustomerPropertyLink } from "../../core/models/customer";

export type SyncState = "IDLE" | "SYNCING" | "CONFLICT" | "ERROR" | "OFFLINE";

/**
 * Ánh xạ bản ghi Supabase `properties` sang `Property` domain model của Web
 */
export function mapRemotePropertyToDomain(item: any, existing?: Property): Property {
  const remoteUpdatedAt = Number(item.updated_at) || Date.now();
  return {
    id: String(item.id),
    area: item.area || "",
    latitude: item.latitude !== undefined && item.latitude !== null ? Number(item.latitude) : null,
    longitude: item.longitude !== undefined && item.longitude !== null ? Number(item.longitude) : null,
    imagePath: existing?.imagePath || null,
    driveMediaIds: item.drive_media_ids || existing?.driveMediaIds || null,
    driveFolderId: item.drive_folder_id || null,
    priceAtFolderCreation: item.price_at_folder_creation != null ? Number(item.price_at_folder_creation) : null,
    documentUrl: item.document_url || "",
    areaSize: item.area_size != null ? Number(item.area_size) : null,
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
    // Bảo vệ trạng thái unsynced của local: nếu local đang chưa sync, giữ nguyên false
    isTextSynced: existing ? existing.isTextSynced : true,
    rawText: item.raw_text != null ? String(item.raw_text) : "",
    diary: item.diary || "",
    updatedAt: remoteUpdatedAt,
    isDeleted: Boolean(item.is_deleted),
    propertyDetailJsonFileId: item.property_detail_json_file_id || null,
    txtFileId: item.txt_file_id || null,
    isMediaSynced: existing?.isMediaSynced || false,
    linkedCustomerId: existing?.linkedCustomerId || null,
    title: item.title || null,
    mapLink: item.map_link || null,
    extractedBy: item.extractedBy || null,
    createdAt: Number(item.created_at) || remoteUpdatedAt,
    isVerified: item.is_verified !== undefined ? Boolean(item.is_verified) : true,
    lastEditedAt: Number(item.last_edited_at) || remoteUpdatedAt,
    r2MediaKeys: item.r2_media_keys || null
  };
}

/**
 * Ánh xạ domain Property sang remote Supabase payload (chuẩn Native Android)
 * Loại bỏ các trường chỉ tồn tại ở local (imagePath, isTextSynced, isMediaSynced, linkedCustomerId)
 */
export function mapDomainPropertyToRemote(prop: Property): Record<string, any> {
  return {
    id: prop.id,
    area: prop.area || "",
    latitude: prop.latitude !== undefined && prop.latitude !== null ? Number(prop.latitude) : null,
    longitude: prop.longitude !== undefined && prop.longitude !== null ? Number(prop.longitude) : null,
    drive_media_ids: prop.driveMediaIds || null,
    drive_folder_id: prop.driveFolderId || null,
    price_at_folder_creation:
      prop.priceAtFolderCreation !== undefined && prop.priceAtFolderCreation !== null
        ? Number(prop.priceAtFolderCreation)
        : null,
    document_url: prop.documentUrl || "",
    area_size: prop.areaSize !== undefined && prop.areaSize !== null ? Number(prop.areaSize) : null,
    price: Number(prop.price) || 0,
    description: prop.description || "",
    status: prop.status || "Đang bán",
    survey_date: prop.surveyDate || "",
    direction: prop.direction || "",
    owner_name: prop.ownerName || "",
    owner_phone: prop.ownerPhone || "",
    property_type: prop.propertyType || "Nhà",
    need_to_view_today: Boolean(prop.needToViewToday),
    is_draft: Boolean(prop.isDraft),
    raw_text: prop.rawText != null ? String(prop.rawText) : "",
    diary: prop.diary || "",
    updated_at: Number(prop.updatedAt) || Date.now(),
    is_deleted: Boolean(prop.isDeleted),
    title: prop.title || null,
    address: prop.area || "",
    map_link: prop.mapLink || null,
    extracted_by: prop.extractedBy || null,
    created_at: Number(prop.createdAt) || Number(prop.updatedAt) || Date.now(),
    is_verified: Boolean(prop.isVerified),
    r2_media_keys: prop.r2MediaKeys || null
  };
}

/**
 * Ánh xạ bản ghi Supabase `customers` sang `Customer` domain model của Web
 */
export function mapRemoteCustomerToDomain(item: any, existing?: Customer): Customer {
  const remoteUpdatedAt = Number(item.updated_at) || Date.now();
  return {
    id: String(item.id),
    name: item.name || "",
    nameNormalized: item.name_normalized || (item.name ? item.name.toLowerCase() : ""),
    phone: item.phone || "",
    demandType: item.demand_type || "Cần mua",
    propertyType: item.property_type || "Nhà",
    demandAreas: item.demand_areas || "",
    demandDirections: item.demand_directions || "",
    priceMin: Number(item.price_min) || 0,
    priceMax: Number(item.price_max) || 0,
    note: item.note || "",
    noteNormalized: item.note_normalized || (item.note ? item.note.toLowerCase() : ""),
    role: item.role || "BUYER",
    status: item.status || "ACTIVE",
    updatedAt: remoteUpdatedAt,
    isSynced: existing ? existing.isSynced : true,
    isDeleted: Boolean(item.is_deleted),
    avatarPath: existing?.avatarPath || item.avatar_path || null,
    avatarDriveUrl: item.avatar_drive_url || null
  };
}

/**
 * Ánh xạ domain Customer sang remote Supabase payload (chuẩn Native Android)
 * Loại bỏ các trường local-only (isSynced, avatarPath)
 */
export function mapDomainCustomerToRemote(cust: Customer): Record<string, any> {
  return {
    id: cust.id,
    name: cust.name || "",
    name_normalized: cust.nameNormalized || (cust.name ? cust.name.toLowerCase() : ""),
    phone: cust.phone || "",
    demand_type: cust.demandType || "Cần mua",
    property_type: cust.propertyType || "Nhà",
    demand_areas: cust.demandAreas || "",
    demand_directions: cust.demandDirections || "",
    price_min: Number(cust.priceMin) || 0,
    price_max: Number(cust.priceMax) || 0,
    note: cust.note || "",
    note_normalized: cust.noteNormalized || (cust.note ? cust.note.toLowerCase() : ""),
    role: cust.role || "BUYER",
    status: cust.status || "ACTIVE",
    updated_at: Number(cust.updatedAt) || Date.now(),
    is_deleted: Boolean(cust.isDeleted),
    avatar_path: cust.avatarPath || null,
    avatar_drive_url: cust.avatarDriveUrl || null
  };
}

/**
 * Ánh xạ bản ghi Supabase `customer_property_links` sang `CustomerPropertyLink` domain model của Web
 */
export function mapRemoteLinkToDomain(item: any, existing?: CustomerPropertyLink): CustomerPropertyLink {
  const remoteUpdatedAt = Number(item.updated_at) || Date.now();
  return {
    customerId: String(item.customer_id),
    propertyId: String(item.property_id),
    role: item.role || "VIEWER",
    viewDate: item.view_date || null,
    viewNote: item.view_note || null,
    updatedAt: remoteUpdatedAt,
    isDeleted: Boolean(item.is_deleted),
    isSynced: existing ? existing.isSynced : true
  };
}

/**
 * Ánh xạ domain CustomerPropertyLink sang remote Supabase payload
 */
export function mapDomainLinkToRemote(link: CustomerPropertyLink): Record<string, any> {
  return {
    customer_id: link.customerId,
    property_id: link.propertyId,
    role: link.role || "VIEWER",
    view_date: link.viewDate || null,
    view_note: link.viewNote || null,
    updated_at: Number(link.updatedAt) || Date.now(),
    is_deleted: Boolean(link.isDeleted)
  };
}

export function isOnline(): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }
  return true;
}

export class SyncManager {
  private syncState: SyncState = "IDLE";
  private listeners: Set<(state: SyncState, message?: string) => void> = new Set();
  private isRunning = false;
  private isPushing = false;
  private activeChannel: any = null;

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
   * Quét toàn bộ các bản ghi chưa đồng bộ trong IndexedDB và đưa vào persistent outbox
   * Đảm bảo không bao giờ bỏ sót bất kỳ thay đổi nào dù có refresh hoặc restart trình duyệt
   */
  public async collectUnsyncedIntoOutbox(): Promise<void> {
    try {
      // 1. Properties chưa sync
      const unsyncedProps = await db.properties
        .filter((p) => !p.isTextSynced)
        .toArray();
      for (const p of unsyncedProps) {
        await db.enqueueOutbox("PROPERTY", p.id, p.isDeleted ? "DELETE" : "UPSERT");
      }

      // 2. Customers chưa sync
      const unsyncedCusts = await db.customers
        .filter((c) => !c.isSynced)
        .toArray();
      for (const c of unsyncedCusts) {
        await db.enqueueOutbox("CUSTOMER", c.id, c.isDeleted ? "DELETE" : "UPSERT");
      }

      // 3. Links chưa sync
      const unsyncedLinks = await db.customer_property_links
        .filter((l) => !l.isSynced)
        .toArray();
      for (const l of unsyncedLinks) {
        await db.enqueueOutbox(
          "LINK",
          `${l.customerId}:::${l.propertyId}`,
          l.isDeleted ? "DELETE" : "UPSERT"
        );
      }
    } catch (err) {
      console.warn("[SyncManager] collectUnsyncedIntoOutbox warning:", err);
    }
  }

  /**
   * PHASE W2: Two-Way Text Push.
   * Đẩy các thay đổi từ hàng đợi Persistent Outbox lên Supabase với:
   * - Read-Back Verification (kiểm tra hàng đọc lại từ .select().single())
   * - Silent-Drop Detection (phát hiện trigger sync_guard trên Supabase trả về OLD do stale write)
   * - Compare-And-Swap (CAS) markSyncedIfUnchanged để chống race condition
   */
  public async pushChanges(): Promise<boolean> {
    if (this.isPushing) return false;
    if (!isOnline()) return false;
    const client = getSupabaseClient();
    if (!client) return false;

    this.isPushing = true;
    try {
      await this.collectUnsyncedIntoOutbox();
      const pendingItems = await db.getPendingOutbox();
      if (pendingItems.length === 0) return true;

      this.notify("SYNCING", "Đang đẩy dữ liệu lên máy chủ...");

      let pushSuccessCount = 0;

      for (const item of pendingItems) {
        if (!isOnline()) break;

        try {
          if (item.entityType === "PROPERTY") {
            const prop = await db.properties.get(item.entityId);
            if (!prop) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }
            if (prop.isTextSynced) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }

            const payload = mapDomainPropertyToRemote(prop);
            const { data, error } = await client
              .from("properties")
              .upsert(payload, { onConflict: "id" })
              .select()
              .single();

            if (error) {
              console.error(`[SyncManager] Lỗi đẩy BĐS ${prop.id}:`, error);
              if (item.id !== undefined) await db.updateOutboxError(item.id, error.message);
              continue;
            }

            // READ-BACK VERIFICATION: Phát hiện silent drop từ trigger sync_guard
            const serverUpdatedAt = Number(data?.updated_at) || 0;
            if (payload.updated_at < serverUpdatedAt) {
              console.warn(
                `[SyncManager] XUNG ĐỘT (Silent Drop): BĐS ${prop.id} bị máy chủ từ chối vì bản ghi server mới hơn (server: ${serverUpdatedAt}, local: ${payload.updated_at})`
              );
              if (item.id !== undefined) await db.updateOutboxError(item.id, "SYNC_CONFLICT");
              continue;
            }

            // Push thành công -> CAS
            await db.markPropertySyncedIfUnchanged(prop.id, payload.updated_at);
            if (item.id !== undefined) await db.removeOutbox(item.id);
            pushSuccessCount++;
          } else if (item.entityType === "CUSTOMER") {
            const cust = await db.customers.get(item.entityId);
            if (!cust) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }
            if (cust.isSynced) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }

            const payload = mapDomainCustomerToRemote(cust);
            const { data, error } = await client
              .from("customers")
              .upsert(payload, { onConflict: "id" })
              .select()
              .single();

            if (error) {
              console.error(`[SyncManager] Lỗi đẩy Khách hàng ${cust.id}:`, error);
              if (item.id !== undefined) await db.updateOutboxError(item.id, error.message);
              continue;
            }

            const serverUpdatedAt = Number(data?.updated_at) || 0;
            if (payload.updated_at < serverUpdatedAt) {
              console.warn(
                `[SyncManager] XUNG ĐỘT: Khách hàng ${cust.id} bị từ chối vì server có bản ghi mới hơn (server: ${serverUpdatedAt}, local: ${payload.updated_at})`
              );
              if (item.id !== undefined) await db.updateOutboxError(item.id, "SYNC_CONFLICT");
              continue;
            }

            await db.markCustomerSyncedIfUnchanged(cust.id, payload.updated_at);
            if (item.id !== undefined) await db.removeOutbox(item.id);
            pushSuccessCount++;
          } else if (item.entityType === "LINK") {
            const [customerId, propertyId] = item.entityId.split(":::");
            if (!customerId || !propertyId) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }

            const link = await db.customer_property_links.get([customerId, propertyId]);
            if (!link) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }
            if (link.isSynced) {
              if (item.id !== undefined) await db.removeOutbox(item.id);
              continue;
            }

            const payload = mapDomainLinkToRemote(link);
            const { data, error } = await client
              .from("customer_property_links")
              .upsert(payload, { onConflict: "customer_id,property_id" })
              .select()
              .single();

            if (error) {
              console.error(`[SyncManager] Lỗi đẩy Liên kết ${item.entityId}:`, error);
              if (item.id !== undefined) await db.updateOutboxError(item.id, error.message);
              continue;
            }

            const serverUpdatedAt = Number(data?.updated_at) || 0;
            if (payload.updated_at < serverUpdatedAt) {
              console.warn(
                `[SyncManager] XUNG ĐỘT: Liên kết ${item.entityId} bị từ chối vì server có bản ghi mới hơn (server: ${serverUpdatedAt}, local: ${payload.updated_at})`
              );
              if (item.id !== undefined) await db.updateOutboxError(item.id, "SYNC_CONFLICT");
              continue;
            }

            await db.markLinkSyncedIfUnchanged(customerId, propertyId, payload.updated_at);
            if (item.id !== undefined) await db.removeOutbox(item.id);
            pushSuccessCount++;
          }
        } catch (itemErr: any) {
          console.error(`[SyncManager] Ngoại lệ khi đẩy outbox item ${item.id}:`, itemErr);
          if (item.id !== undefined) {
            await db.updateOutboxError(item.id, itemErr.message || String(itemErr));
          }
        }
      }

      const remainingOutbox = await db.getPendingOutbox();
      const hasConflict = remainingOutbox.some((i) => i.lastError === "SYNC_CONFLICT");
      const hasError = remainingOutbox.some((i) => i.lastError && i.lastError !== "SYNC_CONFLICT");

      if (hasConflict) {
        this.notify("CONFLICT", "Xung đột: Máy chủ có bản ghi mới hơn");
        return false;
      } else if (hasError) {
        this.notify("ERROR", "Lỗi đẩy dữ liệu lên máy chủ");
        return false;
      } else {
        if (pushSuccessCount > 0) {
          console.log(`[SyncManager] Đã đẩy thành công ${pushSuccessCount} bản ghi lên Supabase.`);
        }
        return true;
      }
    } catch (e: any) {
      console.error("[SyncManager] Lỗi trong tiến trình pushChanges:", e);
      this.notify("ERROR", e.message || "Lỗi đẩy dữ liệu");
      return false;
    } finally {
      this.isPushing = false;
    }
  }

  /**
   * Kéo toàn bộ dữ liệu mới từ Supabase về IndexedDB theo hợp đồng Native (Initial Pull & CatchUp)
   */
  public async pullChanges(): Promise<boolean> {
    const client = getSupabaseClient();
    if (!client || !isOnline()) return false;

    const PULL_PAGE_SIZE = 500;

    try {
      // 1. Pull Properties (phân trang 500 dòng theo server_updated_at ASC)
      let propCursor = Number(localStorage.getItem("bds_last_pull_properties")) || 0;
      let totalPropsPulled = 0;

      while (true) {
        let query = client
          .from("properties")
          .select("*")
          .order("server_updated_at", { ascending: true })
          .limit(PULL_PAGE_SIZE);

        if (propCursor > 0) {
          query = query.gt("server_updated_at", propCursor);
        }

        const { data: page, error } = await query;
        if (error) throw error;
        if (!page || page.length === 0) break;

        await db.transaction("rw", db.properties, async () => {
          for (const item of page) {
            const existing = await db.properties.get(item.id);
            const remoteUpdatedAt = Number(item.updated_at) || 0;

            if (!existing) {
              await db.properties.put(mapRemotePropertyToDomain(item));
            } else {
              // Conflict guard: Nếu local có unsynced state thì KHÔNG overwrite
              if (!existing.isTextSynced) {
                continue;
              }
              // Chỉ overwrite nếu remote.updated_at > local.updatedAt
              if (remoteUpdatedAt > existing.updatedAt) {
                await db.properties.put(mapRemotePropertyToDomain(item, existing));
              }
            }
          }
        });

        totalPropsPulled += page.length;
        const lastServerUpdatedAt = Number(page[page.length - 1].server_updated_at);
        if (!isNaN(lastServerUpdatedAt) && lastServerUpdatedAt > 0) {
          propCursor = lastServerUpdatedAt;
          localStorage.setItem("bds_last_pull_properties", String(propCursor));
        }

        if (page.length < PULL_PAGE_SIZE) break;
      }

      // 2. Pull Customers (phân trang 500 dòng theo server_updated_at ASC)
      let custCursor = Number(localStorage.getItem("bds_last_pull_customers")) || 0;
      let totalCustsPulled = 0;

      while (true) {
        let query = client
          .from("customers")
          .select("*")
          .order("server_updated_at", { ascending: true })
          .limit(PULL_PAGE_SIZE);

        if (custCursor > 0) {
          query = query.gt("server_updated_at", custCursor);
        }

        const { data: page, error } = await query;
        if (error) throw error;
        if (!page || page.length === 0) break;

        await db.transaction("rw", db.customers, async () => {
          for (const item of page) {
            const existing = await db.customers.get(item.id);
            const remoteUpdatedAt = Number(item.updated_at) || 0;

            if (!existing) {
              await db.customers.put(mapRemoteCustomerToDomain(item));
            } else {
              if (!existing.isSynced) {
                continue;
              }
              if (remoteUpdatedAt > existing.updatedAt) {
                await db.customers.put(mapRemoteCustomerToDomain(item, existing));
              }
            }
          }
        });

        totalCustsPulled += page.length;
        const lastServerUpdatedAt = Number(page[page.length - 1].server_updated_at);
        if (!isNaN(lastServerUpdatedAt) && lastServerUpdatedAt > 0) {
          custCursor = lastServerUpdatedAt;
          localStorage.setItem("bds_last_pull_customers", String(custCursor));
        }

        if (page.length < PULL_PAGE_SIZE) break;
      }

      // 3. Pull Customer Property Links (phân trang 500 dòng theo server_updated_at ASC)
      let linkCursor = Number(localStorage.getItem("bds_last_pull_links")) || 0;
      let totalLinksPulled = 0;

      while (true) {
        let query = client
          .from("customer_property_links")
          .select("*")
          .order("server_updated_at", { ascending: true })
          .limit(PULL_PAGE_SIZE);

        if (linkCursor > 0) {
          query = query.gt("server_updated_at", linkCursor);
        }

        const { data: page, error } = await query;
        if (error) throw error;
        if (!page || page.length === 0) break;

        await db.transaction("rw", [db.customer_property_links, db.properties], async () => {
          for (const item of page) {
            const existing = await db.customer_property_links.get([item.customer_id, item.property_id]);
            const remoteUpdatedAt = Number(item.updated_at) || 0;

            if (!existing) {
              await db.customer_property_links.put(mapRemoteLinkToDomain(item));
            } else {
              if (!existing.isSynced) {
                continue;
              }
              if (remoteUpdatedAt > existing.updatedAt) {
                await db.customer_property_links.put(mapRemoteLinkToDomain(item, existing));
              }
            }

            // Gán linkedCustomerId cho BĐS nếu là chủ nhà (role === "OWNER")
            if (!item.is_deleted && item.role === "OWNER" && item.customer_id && item.property_id) {
              const prop = await db.properties.get(item.property_id);
              if (prop && !prop.linkedCustomerId) {
                await db.properties.update(item.property_id, { linkedCustomerId: item.customer_id });
              }
            }
          }
        });

        totalLinksPulled += page.length;
        const lastServerUpdatedAt = Number(page[page.length - 1].server_updated_at);
        if (!isNaN(lastServerUpdatedAt) && lastServerUpdatedAt > 0) {
          linkCursor = lastServerUpdatedAt;
          localStorage.setItem("bds_last_pull_links", String(linkCursor));
        }

        if (page.length < PULL_PAGE_SIZE) break;
      }

      console.log(`[SyncManager] Pull hoàn tất: ${totalPropsPulled} BĐS, ${totalCustsPulled} KH, ${totalLinksPulled} Links.`);
      return true;
    } catch (e: any) {
      console.error("[SyncManager] Lỗi khi kéo dữ liệu từ Supabase:", e);
      return false;
    }
  }

  /**
   * Kích hoạt chu kỳ đồng bộ hai chiều ("Đồng bộ ngay"): Đẩy (Push) trước, Kéo (Pull) sau
   */
  public async syncNow(): Promise<boolean> {
    if (this.isRunning) return false;
    if (!isOnline()) {
      this.notify("OFFLINE", "Không có kết nối mạng");
      return false;
    }

    this.isRunning = true;
    this.notify("SYNCING", "Đang đồng bộ dữ liệu...");

    try {
      // 1. Đẩy các thay đổi local lên trước (Push first)
      const pushOk = await this.pushChanges();

      // 2. Kéo dữ liệu mới nhất từ remote về (Pull next)
      const pullOk = await this.pullChanges();

      const remainingOutbox = await db.getPendingOutbox();
      const hasConflict = remainingOutbox.some((i) => i.lastError === "SYNC_CONFLICT");
      const hasError = remainingOutbox.some((i) => i.lastError && i.lastError !== "SYNC_CONFLICT");

      if (hasConflict) {
        this.notify("CONFLICT", "Xung đột: Máy chủ có bản ghi mới hơn");
        await db.sync_logs.add({
          timestamp: Date.now(),
          type: SyncType.PUSH_TEXT,
          status: SyncStatus.CONFLICT,
          tag: "SyncManager",
          message: "Phát hiện xung đột dữ liệu (bản ghi local cũ hơn server nên bị từ chối)"
        });
        return false;
      } else if (hasError || !pushOk || !pullOk) {
        this.notify("ERROR", "Đồng bộ gặp lỗi");
        await db.sync_logs.add({
          timestamp: Date.now(),
          type: SyncType.GENERAL,
          status: SyncStatus.FAILED,
          tag: "SyncManager",
          message: "Đồng bộ hai chiều gặp lỗi"
        });
        return false;
      } else {
        this.notify("IDLE", "Đã cập nhật");
        await db.sync_logs.add({
          timestamp: Date.now(),
          type: SyncType.GENERAL,
          status: SyncStatus.SUCCESS,
          tag: "SyncManager",
          message: "Đồng bộ hai chiều (Two-Way Sync) thành công"
        });
        return true;
      }
    } catch (e: any) {
      this.notify("ERROR", e.message || "Lỗi đồng bộ");
      return false;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Xử lý Realtime cho bảng properties
   */
  private async handlePropertyRealtime(payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === "DELETE") {
      // Hard delete từ remote -> chuyển thành soft delete tại local
      const id = oldRecord?.id;
      if (!id) return;
      const existing = await db.properties.get(id);
      if (existing) {
        await db.properties.update(id, {
          isDeleted: true,
          updatedAt: Date.now()
        });
      }
      return;
    }

    const item = newRecord;
    if (!item || !item.id) return;

    const existing = await db.properties.get(item.id);
    const remoteUpdatedAt = Number(item.updated_at) || 0;

    // Xử lý cờ xóa mềm (tombstone) từ remote
    if (item.is_deleted) {
      if (existing) {
        // Chặn tombstone cũ nếu local có thay đổi mới hơn
        if (!existing.isTextSynced && existing.updatedAt >= remoteUpdatedAt) {
          return;
        }
        await db.properties.update(item.id, {
          isDeleted: true,
          updatedAt: remoteUpdatedAt
        });
      }
      return;
    }

    if (!existing) {
      await db.properties.put(mapRemotePropertyToDomain(item));
    } else {
      // Bảo vệ local unsynced: Nếu local đang sửa dở chưa push thì KHÔNG overwrite
      if (!existing.isTextSynced) {
        return;
      }
      if (remoteUpdatedAt > existing.updatedAt) {
        await db.properties.put(mapRemotePropertyToDomain(item, existing));
      }
    }
  }

  /**
   * Xử lý Realtime cho bảng customers
   */
  private async handleCustomerRealtime(payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === "DELETE") {
      const id = oldRecord?.id;
      if (!id) return;
      const existing = await db.customers.get(id);
      if (existing) {
        await db.customers.update(id, {
          isDeleted: true,
          updatedAt: Date.now()
        });
      }
      return;
    }

    const item = newRecord;
    if (!item || !item.id) return;

    const existing = await db.customers.get(item.id);
    const remoteUpdatedAt = Number(item.updated_at) || 0;

    if (item.is_deleted) {
      if (existing) {
        if (!existing.isSynced && existing.updatedAt >= remoteUpdatedAt) {
          return;
        }
        await db.customers.update(item.id, {
          isDeleted: true,
          updatedAt: remoteUpdatedAt
        });
      }
      return;
    }

    if (!existing) {
      await db.customers.put(mapRemoteCustomerToDomain(item));
    } else {
      if (!existing.isSynced) {
        return;
      }
      if (remoteUpdatedAt > existing.updatedAt) {
        await db.customers.put(mapRemoteCustomerToDomain(item, existing));
      }
    }
  }

  /**
   * Xử lý Realtime cho bảng customer_property_links
   */
  private async handleLinkRealtime(payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;

    if (eventType === "DELETE") {
      const customerId = oldRecord?.customer_id;
      const propertyId = oldRecord?.property_id;
      if (!customerId || !propertyId) return;
      const existing = await db.customer_property_links.get([customerId, propertyId]);
      if (existing) {
        await db.customer_property_links.update([customerId, propertyId], {
          isDeleted: true,
          updatedAt: Date.now()
        });
      }
      return;
    }

    const item = newRecord;
    if (!item || !item.customer_id || !item.property_id) return;

    const existing = await db.customer_property_links.get([item.customer_id, item.property_id]);
    const remoteUpdatedAt = Number(item.updated_at) || 0;

    if (item.is_deleted) {
      if (existing) {
        if (!existing.isSynced && existing.updatedAt >= remoteUpdatedAt) {
          return;
        }
        await db.customer_property_links.update([item.customer_id, item.property_id], {
          isDeleted: true,
          updatedAt: remoteUpdatedAt
        });
      }
      return;
    }

    if (!existing) {
      await db.customer_property_links.put(mapRemoteLinkToDomain(item));
    } else {
      if (!existing.isSynced) {
        return;
      }
      if (remoteUpdatedAt > existing.updatedAt) {
        await db.customer_property_links.put(mapRemoteLinkToDomain(item, existing));
      }
    }

    // Tự động gán linkedCustomerId nếu là chủ nhà
    if (!item.is_deleted && item.role === "OWNER" && item.customer_id && item.property_id) {
      const prop = await db.properties.get(item.property_id);
      if (prop && !prop.linkedCustomerId) {
        await db.properties.update(item.property_id, { linkedCustomerId: item.customer_id });
      }
    }
  }

  /**
   * Đăng ký Realtime WebSocket channel cho 3 bảng
   */
  public startRealtime(): () => void {
    const client = getSupabaseClient();
    if (!client) return () => {};

    if (this.activeChannel) {
      client.removeChannel(this.activeChannel);
      this.activeChannel = null;
    }

    const channel = client
      .channel("realtime-sync-channel")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "properties" },
        async (payload) => {
          console.log("[Realtime] Thay đổi bảng properties:", payload);
          await this.handlePropertyRealtime(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers" },
        async (payload) => {
          console.log("[Realtime] Thay đổi bảng customers:", payload);
          await this.handleCustomerRealtime(payload);
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customer_property_links" },
        async (payload) => {
          console.log("[Realtime] Thay đổi bảng customer_property_links:", payload);
          await this.handleLinkRealtime(payload);
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[Realtime] Đã kết nối thành công tới channel realtime-sync-channel");
          this.notify("IDLE", "Realtime đã kết nối");
        } else if (status === "CHANNEL_ERROR") {
          console.error("[Realtime] Lỗi kết nối channel Realtime");
          this.notify("ERROR", "Lỗi kết nối Realtime");
        }
      });

    this.activeChannel = channel;

    return () => {
      if (this.activeChannel) {
        client.removeChannel(this.activeChannel);
        this.activeChannel = null;
      }
    };
  }

  /**
   * Thiết lập tự động kéo dữ liệu khi chuyển tab/focus hoặc khi có mạng trở lại
   */
  public setupAutoSync(): () => void {
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        this.syncNow().catch((err: unknown) => console.error("Auto sync on tab focus error:", err));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);
    window.addEventListener("online", handleVisibilityOrFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      window.removeEventListener("online", handleVisibilityOrFocus);
    };
  }
}

export const syncManager = new SyncManager();
