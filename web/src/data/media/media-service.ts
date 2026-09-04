import { Property } from "../../core/models/property";
import { db } from "../local/db";
import {
  ALLOWED_MIME_TYPES,
  getMediaIdFromFileName,
  mergeR2MediaItems,
  parseR2MediaKeys,
  R2MediaItem,
  r2MediaSignClient,
  R2SlugUtils,
  serializeR2MediaKeys
} from "../remote/r2-media-client";
import { getSupabaseClient } from "../remote/supabase";
import { mediaOutbox } from "./media-outbox";

/**
 * Tính mã SHA-256 (64 ký tự hex viết thường) bằng Web Crypto API
 */
export async function calculateSha256(file: Blob): Promise<string> {
  const buffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Tạo mediaId duy nhất theo quy ước Native Android (e.g. IMG_abc123-xyz)
 */
export function generateMediaId(): string {
  const rand1 = Math.random().toString(16).slice(2, 8);
  const rand2 = Math.random().toString(36).slice(2, 5);
  return `IMG_${rand1}-${rand2}`;
}

export interface UploadProgressCallback {
  (current: number, total: number, message: string): void;
}

export class MediaService {
  /**
   * Upload danh sách file ảnh lên R2 và liên kết với Property trong Supabase & IndexedDB
   */
  async uploadPropertyImages(
    property: Property,
    files: File[],
    onProgress?: UploadProgressCallback
  ): Promise<{ success: boolean; uploadedCount: number; error?: string }> {
    if (!files || files.length === 0) {
      return { success: true, uploadedCount: 0 };
    }

    const folderPrefix = R2SlugUtils.getStableFolderPrefix(property);
    const newItems: R2MediaItem[] = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let contentType = (file.type || "").toLowerCase().trim();
        if (contentType === "image/jpg" || (!contentType && file.name.toLowerCase().endsWith(".jpg"))) {
          contentType = "image/jpeg";
        } else if (!contentType && file.name.toLowerCase().endsWith(".png")) {
          contentType = "image/png";
        } else if (!contentType && file.name.toLowerCase().endsWith(".mp4")) {
          contentType = "video/mp4";
        } else if (!contentType) {
          contentType = "image/jpeg";
        }

        if (!ALLOWED_MIME_TYPES.has(contentType)) {
          throw new Error(
            `Định dạng file không được hỗ trợ: ${file.type || "không xác định"}. Chỉ chấp nhận: JPEG, PNG, MP4.`
          );
        }

        if (onProgress) {
          onProgress(i + 1, files.length, `Đang xử lý ${file.name}...`);
        }

        const sha256 = await calculateSha256(file);
        const mediaId = generateMediaId();
        const ext = contentType === "image/png" ? "png" : contentType === "video/mp4" ? "mp4" : "jpg";
        const fileName = `${mediaId}.${ext}`;

        // 1. Xin Presigned PUT URL từ Edge Function
        if (onProgress) {
          onProgress(i + 1, files.length, `Đang xin URL tải lên cho ${file.name}...`);
        }

        const signed = await r2MediaSignClient.getPresignedUploadUrl({
          ownerType: "PROPERTY",
          ownerId: property.id,
          mediaId,
          fileName,
          contentType,
          sizeBytes: file.size,
          sha256,
          folderPrefix
        });

        if (!signed) {
          throw new Error(`Không thể xin presigned upload URL cho ${file.name}`);
        }

        // 2. Upload nhị phân trực tiếp lên R2
        if (onProgress) {
          onProgress(i + 1, files.length, `Đang tải lên Cloudflare R2 (${i + 1}/${files.length})...`);
        }

        const uploadOk = await r2MediaSignClient.uploadBinary(signed.uploadUrl, file, contentType);
        if (!uploadOk) {
          throw new Error(`Tải lên R2 thất bại cho ${file.name}`);
        }

        // 3. Đưa vào bảng media_orphans (để chống mồ côi nếu bước ghi DB sau đó bị gián đoạn)
        await mediaOutbox.addOrphan({
          propertyId: property.id,
          objectKey: signed.objectKey,
          mediaId,
          fileName,
          contentType
        });

        newItems.push({
          objectKey: signed.objectKey,
          fileName,
          contentType,
          sortOrder: newItems.length
        });
      }

      // 4. Cập nhật r2_media_keys lên Supabase với Concurrent Merge
      if (onProgress) {
        onProgress(files.length, files.length, "Đang đồng bộ dữ liệu ảnh...");
      }

      const supabase = getSupabaseClient();
      let latestRemoteItems: R2MediaItem[] = [];

      if (supabase) {
        const { data: remoteProp, error: fetchErr } = await supabase
          .from("properties")
          .select("r2_media_keys, updated_at")
          .eq("id", property.id)
          .maybeSingle();

        if (!fetchErr && remoteProp) {
          latestRemoteItems = parseR2MediaKeys(remoteProp.r2_media_keys);
        } else {
          latestRemoteItems = parseR2MediaKeys(property.r2MediaKeys);
        }
      } else {
        latestRemoteItems = parseR2MediaKeys(property.r2MediaKeys);
      }

      // Hợp nhất tránh nuốt ảnh
      const mergedItems = mergeR2MediaItems(latestRemoteItems, newItems);
      const serializedKeys = serializeR2MediaKeys(mergedItems);
      const newUpdatedAt = Date.now();

      if (supabase) {
        const { error: updateErr } = await supabase
          .from("properties")
          .update({
            r2_media_keys: serializedKeys,
            updated_at: newUpdatedAt
          })
          .eq("id", property.id);

        if (updateErr) {
          throw new Error(`Cập nhật Supabase r2_media_keys thất bại: ${updateErr.message}`);
        }

        // 5. Read-back verification
        const { data: verifyData, error: verifyErr } = await supabase
          .from("properties")
          .select("r2_media_keys")
          .eq("id", property.id)
          .single();

        if (verifyErr || !verifyData) {
          throw new Error("Không thể xác minh read-back sau khi cập nhật ảnh");
        }

        const verifiedItems = parseR2MediaKeys(verifyData.r2_media_keys);
        const verifiedKeysSet = new Set(verifiedItems.map((v) => v.objectKey));
        for (const item of newItems) {
          if (!verifiedKeysSet.has(item.objectKey)) {
            throw new Error(`Xác minh thất bại: objectKey ${item.objectKey} không có trong bản ghi remote`);
          }
        }
      }

      // 6. Sau khi verify thành công, xóa khỏi hàng đợi orphans
      for (const item of newItems) {
        await mediaOutbox.removeOrphanByKey(item.objectKey);
      }

      // 7. Cập nhật vào IndexedDB
      await db.properties.update(property.id, {
        r2MediaKeys: serializedKeys,
        updatedAt: newUpdatedAt,
        isTextSynced: true,
        isMediaSynced: true
      });

      return { success: true, uploadedCount: newItems.length };
    } catch (err: any) {
      console.error("[MediaService] Lỗi trong quá trình upload ảnh:", err);
      return {
        success: false,
        uploadedCount: newItems.length,
        error: err?.message || String(err)
      };
    }
  }

  /**
   * Xóa một ảnh khỏi Property (loại bỏ khỏi r2_media_keys cả trên Supabase và IndexedDB)
   */
  async deletePropertyImage(
    propertyId: string,
    objectKey: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const supabase = getSupabaseClient();
      let currentItems: R2MediaItem[] = [];

      if (supabase) {
        const { data, error } = await supabase
          .from("properties")
          .select("r2_media_keys")
          .eq("id", propertyId)
          .maybeSingle();

        if (!error && data?.r2_media_keys) {
          currentItems = parseR2MediaKeys(data.r2_media_keys);
        }
      }

      if (currentItems.length === 0) {
        const localProp = await db.properties.get(propertyId);
        if (localProp?.r2MediaKeys) {
          currentItems = parseR2MediaKeys(localProp.r2MediaKeys);
        }
      }

      // Lọc bỏ objectKey cần xóa
      const filtered = currentItems
        .filter((item) => item.objectKey !== objectKey)
        .map((item, idx) => ({ ...item, sortOrder: idx }));

      const serialized = serializeR2MediaKeys(filtered);
      const newUpdatedAt = Date.now();

      if (supabase) {
        const { error: updateErr } = await supabase
          .from("properties")
          .update({
            r2_media_keys: serialized,
            updated_at: newUpdatedAt
          })
          .eq("id", propertyId);

        if (updateErr) {
          throw new Error(`Cập nhật Supabase khi xóa ảnh thất bại: ${updateErr.message}`);
        }
      }

      await db.properties.update(propertyId, {
        r2MediaKeys: serialized,
        updatedAt: newUpdatedAt,
        isTextSynced: true
      });

      return { success: true };
    } catch (err: any) {
      console.error("[MediaService] Lỗi khi xóa ảnh:", err);
      return { success: false, error: err?.message || String(err) };
    }
  }

  /**
   * Lấy URL hiển thị ảnh (ưu tiên ký URL từ R2, có fallback)
   */
  async resolveImageUrl(propertyId: string, item: R2MediaItem): Promise<string | null> {
    const mediaId = getMediaIdFromFileName(item.fileName);
    return await r2MediaSignClient.getPresignedDownloadUrl({
      ownerType: "PROPERTY",
      ownerId: propertyId,
      mediaId,
      objectKey: item.objectKey
    });
  }

  /**
   * Reconcile các media mồ côi (orphans) chưa được link vào properties
   */
  async reconcileOrphans(): Promise<number> {
    const orphans = await mediaOutbox.getPendingOrphans();
    if (orphans.length === 0) return 0;

    let reconciledCount = 0;
    const supabase = getSupabaseClient();
    if (!supabase) return 0;

    // Nhóm orphan theo propertyId
    const grouped = new Map<string, typeof orphans>();
    for (const orphan of orphans) {
      const list = grouped.get(orphan.propertyId) || [];
      list.push(orphan);
      grouped.set(orphan.propertyId, list);
    }

    for (const [propId, propOrphans] of grouped.entries()) {
      try {
        const { data: propData } = await supabase
          .from("properties")
          .select("r2_media_keys")
          .eq("id", propId)
          .maybeSingle();

        if (!propData) continue;

        const currentItems = parseR2MediaKeys(propData.r2_media_keys);
        const orphanItems: R2MediaItem[] = propOrphans.map((o, idx) => ({
          objectKey: o.objectKey,
          fileName: o.fileName,
          contentType: o.contentType,
          sortOrder: currentItems.length + idx
        }));

        const merged = mergeR2MediaItems(currentItems, orphanItems);
        const serialized = serializeR2MediaKeys(merged);
        const now = Date.now();

        await supabase
          .from("properties")
          .update({
            r2_media_keys: serialized,
            updated_at: now
          })
          .eq("id", propId);

        await db.properties.update(propId, {
          r2MediaKeys: serialized,
          updatedAt: now,
          isTextSynced: true
        });

        for (const orphan of propOrphans) {
          if (orphan.id) {
            await mediaOutbox.removeOrphan(orphan.id);
            reconciledCount++;
          }
        }
      } catch (err) {
        console.error(`[MediaService] Reconcile thất bại cho property ${propId}:`, err);
      }
    }

    return reconciledCount;
  }
}

export const mediaService = new MediaService();
