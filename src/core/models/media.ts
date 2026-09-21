import { R2MediaItem } from "../../data/remote/r2-media-client";

/**
 * Canonical Web Media Item model.
 * Exactly matches:
 * 1. properties.r2_media_keys schema: { objectKey, fileName, contentType, sortOrder, sha256? }
 * 2. M4 Read RPCs schema (fn_get_property_media, fn_get_properties_media_batch):
 *    { id, property_id, object_key, file_name, content_type, sort_order, sha256 }
 */
export interface MediaItem {
  id?: string;
  propertyId: string;
  mediaId: string;
  objectKey: string;
  fileName: string;
  contentType: string;
  sortOrder: number;
  sha256?: string | null;
}

/**
 * Raw DTO returned from Supabase M4 RPCs (public.fn_get_property_media, public.fn_get_properties_media_batch)
 */
export interface SupabaseMediaObjectRow {
  id: string;
  property_id: string;
  object_key: string;
  file_name: string;
  content_type: string;
  sort_order: number;
  sha256: string | null;
}

/**
 * Extract mediaId from fileName or objectKey (e.g. "IMG_6f075568-f03.jpg" -> "IMG_6f075568-f03")
 */
export function extractMediaId(fileNameOrKey: string): string {
  const fileName = fileNameOrKey.split("/").pop()?.split("\\").pop() || fileNameOrKey;
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
}

/**
 * Validate a MediaItem ensuring no path traversals or malformed keys
 */
export function isValidMediaItem(item: Partial<MediaItem>): boolean {
  if (!item.objectKey || item.objectKey.trim() === "") return false;
  if (item.objectKey.includes("..") || item.objectKey.startsWith("/")) return false;
  if (!item.fileName || item.fileName.trim() === "") return false;
  if (item.fileName.includes("/") || item.fileName.includes("\\")) return false;
  if (item.sortOrder === undefined || item.sortOrder === null || item.sortOrder < 0) return false;
  const cType = (item.contentType || "").trim().toLowerCase();
  return cType === "image/jpeg" || cType === "image/png" || cType === "video/mp4";
}

/**
 * Maps an RPC row from Supabase (M4 Read Surface) to domain MediaItem
 */
export function mapRpcRowToMediaItem(row: SupabaseMediaObjectRow): MediaItem {
  return {
    id: row.id,
    propertyId: row.property_id,
    mediaId: extractMediaId(row.object_key || row.file_name),
    objectKey: row.object_key,
    fileName: row.file_name,
    contentType: row.content_type?.toLowerCase() || "image/jpeg",
    sortOrder: typeof row.sort_order === "number" ? row.sort_order : 0,
    sha256: row.sha256 || null
  };
}

/**
 * Maps an R2MediaItem (from properties.r2_media_keys JSON) to domain MediaItem
 * Strictly prioritizes objectKey for mediaId (matching Android Native R2MediaItem.mediaId()
 * and Supabase Edge Function r2-media-sign requirement).
 */
export function mapR2ItemToMediaItem(r2Item: R2MediaItem, propertyId: string): MediaItem {
  return {
    propertyId,
    mediaId: extractMediaId(r2Item.objectKey || r2Item.fileName),
    objectKey: r2Item.objectKey,
    fileName: r2Item.fileName,
    contentType: r2Item.contentType?.toLowerCase() || "image/jpeg",
    sortOrder: typeof r2Item.sortOrder === "number" ? r2Item.sortOrder : 0,
    sha256: (r2Item as any).sha256 || null
  };
}

/**
 * Maps a domain MediaItem back to R2MediaItem for writing to properties.r2_media_keys
 */
export function mapMediaItemToR2Item(item: MediaItem): R2MediaItem {
  return {
    objectKey: item.objectKey,
    fileName: item.fileName,
    contentType: item.contentType,
    sortOrder: item.sortOrder
  };
}
