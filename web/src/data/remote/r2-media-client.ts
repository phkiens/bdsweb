import { normalizeVietnamese } from "../../core/utils/vietnamese";

export const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "video/mp4"]);

export interface R2MediaItem {
  objectKey: string;
  fileName: string;
  contentType: string;
  sortOrder: number;
}

export interface R2SignedUpload {
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
}

const INSTALLATION_ID_STORAGE_KEY = "bds_web_installation_id";

/**
 * Lấy hoặc tạo UUID installationId ổn định trên Web (lưu localStorage)
 * Khớp định dạng /^[a-zA-Z0-9_-]{8,128}$/ mà Edge Function yêu cầu
 */
export function getWebInstallationId(): string {
  if (typeof localStorage !== "undefined") {
    let id = localStorage.getItem(INSTALLATION_ID_STORAGE_KEY);
    if (!id || !/^[a-zA-Z0-9_-]{8,128}$/.test(id)) {
      const rand = Math.random().toString(36).slice(2, 10);
      id = `web_${Date.now()}_${rand}`;
      localStorage.setItem(INSTALLATION_ID_STORAGE_KEY, id);
    }
    return id;
  }
  return `web_${Date.now()}_default`;
}

/**
 * Trích xuất mediaId từ fileName (ví dụ "IMG_6f075568-f03.jpg" -> "IMG_6f075568-f03")
 */
export function getMediaIdFromFileName(fileName: string): string {
  const lastDot = fileName.lastIndexOf(".");
  return lastDot > 0 ? fileName.substring(0, lastDot) : fileName;
}

/**
 * Trích xuất mediaId từ objectKey hoặc fallback sang fileName
 * Khớp 100% logic của Native Android (R2MediaItem.mediaId() tại R2MediaMetadata.kt:31)
 * và đảm bảo vượt qua xác thực của Edge Function r2-media-sign (media-sign-helpers.ts:180).
 */
export function getMediaIdFromObjectKey(objectKey?: string | null, fallbackFileName?: string | null): string {
  if (objectKey && objectKey.trim()) {
    const keyFileName = objectKey.split("/").pop()?.split("\\").pop() || "";
    const lastDot = keyFileName.lastIndexOf(".");
    const fromKey = lastDot > 0 ? keyFileName.substring(0, lastDot) : keyFileName;
    if (fromKey.trim()) return fromKey.trim();
  }
  return getMediaIdFromFileName(fallbackFileName || "");
}

/**
 * Tiện ích tạo slug và folderPrefix khớp 100% logic của Native Android (R2SlugUtils.kt)
 */
export const R2SlugUtils = {
  toSlug(input: string | null | undefined, fallback: string, maxLength: number = 40): string {
    if (!input || !input.trim()) return fallback;
    const normalized = normalizeVietnamese(input);
    const withHyphens = normalized.replace(/[^a-z0-9]+/g, "-");
    const collapsed = withHyphens.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
    const truncated =
      collapsed.length > maxLength
        ? collapsed.substring(0, maxLength).replace(/-+$/, "")
        : collapsed;
    return truncated.trim() ? truncated : fallback;
  },

  formatPriceSlug(price: number | null | undefined): string {
    if (price == null || price <= 0) return "unknown-price";
    if (price >= 1.0) {
      const formatted =
        price % 1.0 === 0
          ? `${Math.floor(price)}`
          : price.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", "-");
      return `${formatted}-ty`;
    } else {
      const trieu = Math.round(price * 1000);
      return `${trieu}-trieu`;
    }
  },

  buildFolderPrefix(
    propertyId: string,
    area: string | null | undefined,
    ownerName: string | null | undefined,
    price: number | null | undefined
  ): string {
    const areaSlug = this.toSlug(area, "unknown-area", 40);
    const ownerSlug = this.toSlug(ownerName, "unknown-owner", 40);
    const priceSlug = this.formatPriceSlug(price);
    return `${propertyId}__${areaSlug}__${ownerSlug}__${priceSlug}`;
  },

  extractExistingFolderPrefix(r2MediaKeysJson: string | null | undefined): string | null {
    if (!r2MediaKeysJson || !r2MediaKeysJson.trim() || r2MediaKeysJson === "null" || r2MediaKeysJson === "[]") {
      return null;
    }
    try {
      const items = parseR2MediaKeys(r2MediaKeysJson);
      for (const item of items) {
        const parts = item.objectKey.split("/");
        if (parts.length >= 3 && parts[0] === "properties") {
          const folder = parts[1].trim();
          if (folder) return folder;
        }
      }
    } catch {
      // safe fallback
    }
    return null;
  },

  getStableFolderPrefix(property: {
    id: string;
    area?: string;
    ownerName?: string;
    price?: number;
    r2MediaKeys?: string | null;
  }): string {
    return (
      this.extractExistingFolderPrefix(property.r2MediaKeys) ||
      this.buildFolderPrefix(property.id, property.area, property.ownerName, property.price)
    );
  }
};

/**
 * Parse JSON r2_media_keys từ Supabase / Android Room
 */
export function parseR2MediaKeys(jsonString: string | null | undefined): R2MediaItem[] {
  if (!jsonString || !jsonString.trim() || jsonString === "null" || jsonString === "[]") {
    return [];
  }
  try {
    const raw = JSON.parse(jsonString);
    if (!Array.isArray(raw)) return [];
    const items: R2MediaItem[] = [];
    for (const item of raw) {
      if (
        item &&
        typeof item.objectKey === "string" &&
        item.objectKey.trim() &&
        !item.objectKey.includes("..") &&
        !item.objectKey.startsWith("/") &&
        typeof item.fileName === "string" &&
        item.fileName.trim() &&
        !item.fileName.includes("/") &&
        !item.fileName.includes("\\")
      ) {
        items.push({
          objectKey: item.objectKey.trim(),
          fileName: item.fileName.trim(),
          contentType:
            typeof item.contentType === "string"
              ? item.contentType.trim().toLowerCase()
              : "image/jpeg",
          sortOrder: typeof item.sortOrder === "number" ? item.sortOrder : items.length
        });
      }
    }
    return items.sort((a, b) => a.sortOrder - b.sortOrder);
  } catch {
    return [];
  }
}

/**
 * Serialize danh sách R2MediaItem thành chuỗi JSON chuẩn
 */
export function serializeR2MediaKeys(items: R2MediaItem[]): string {
  if (!items || items.length === 0) return "[]";
  const valid = items
    .filter((i) => i.objectKey && i.fileName)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((item, idx) => ({
      objectKey: item.objectKey,
      fileName: item.fileName,
      contentType: item.contentType || "image/jpeg",
      sortOrder: idx
    }));
  return JSON.stringify(valid);
}

/**
 * Hợp nhất đồng thời (Concurrent Merge) hai danh sách R2MediaItem
 * Bảo vệ: Nếu remote có thêm ảnh từ Native thì không bao giờ bị nuốt mất ảnh
 */
export function mergeR2MediaItems(
  existingRemoteItems: R2MediaItem[],
  newItems: R2MediaItem[]
): R2MediaItem[] {
  const merged: R2MediaItem[] = [...existingRemoteItems];
  const seenKeys = new Set(existingRemoteItems.map((i) => i.objectKey));
  const seenFileNames = new Set(existingRemoteItems.map((i) => i.fileName));
  const seenMediaIds = new Set(existingRemoteItems.map((i) => getMediaIdFromObjectKey(i.objectKey, i.fileName)));

  for (const item of newItems) {
    const mediaId = getMediaIdFromObjectKey(item.objectKey, item.fileName);
    if (
      !seenKeys.has(item.objectKey) &&
      !seenFileNames.has(item.fileName) &&
      !seenMediaIds.has(mediaId)
    ) {
      merged.push(item);
      seenKeys.add(item.objectKey);
      seenFileNames.add(item.fileName);
      seenMediaIds.add(mediaId);
    }
  }

  return merged.map((item, idx) => ({
    ...item,
    sortOrder: idx
  }));
}

/**
 * Client giao tiếp với Supabase Edge Function r2-media-sign
 */
export class R2MediaSignClient {
  private cache = new Map<string, { url: string; expiresAt: number }>();

  private getFunctionUrl(): string {
    const base = (
      (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_URL) ||
      (typeof process !== "undefined" && process.env?.VITE_SUPABASE_URL) ||
      "https://bijfdqzbpjcprhttrgmv.supabase.co"
    ).replace(/\/+$/, "");
    return `${base}/functions/v1/r2-media-sign`;
  }

  private getPublishableKey(): string {
    return (
      (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_ACTIVATION_PUBLISHABLE_KEY) ||
      (typeof process !== "undefined" && process.env?.VITE_ACTIVATION_PUBLISHABLE_KEY) ||
      (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
      (typeof process !== "undefined" && process.env?.VITE_SUPABASE_PUBLISHABLE_KEY) ||
      ""
    ).trim();
  }

  /**
   * Xin Presigned PUT URL từ Edge Function để upload file lên R2
   */
  async getPresignedUploadUrl(params: {
    ownerType: "PROPERTY" | "CUSTOMER";
    ownerId: string;
    mediaId: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    sha256: string;
    folderPrefix?: string;
  }): Promise<R2SignedUpload | null> {
    const publishableKey = this.getPublishableKey();
    if (!publishableKey) {
      console.error("[R2MediaSignClient] Thiếu VITE_ACTIVATION_PUBLISHABLE_KEY");
      return null;
    }

    const installationId = getWebInstallationId();
    const payload = {
      action: "sign_put",
      installationId,
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      mediaId: params.mediaId,
      fileName: params.fileName,
      contentType: params.contentType,
      sizeBytes: params.sizeBytes,
      sha256: params.sha256,
      folderPrefix: params.folderPrefix
    };

    try {
      const res = await fetch(this.getFunctionUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[R2MediaSignClient] sign_put lỗi HTTP ${res.status}:`, errText);
        return null;
      }

      const json = await res.json();
      if (json.ok && json.uploadUrl && json.objectKey) {
        return {
          uploadUrl: json.uploadUrl,
          objectKey: json.objectKey,
          expiresInSeconds: json.expiresInSeconds || 600
        };
      }
      return null;
    } catch (err) {
      console.error("[R2MediaSignClient] Ngoại lệ sign_put:", err);
      return null;
    }
  }

  /**
   * Upload nhị phân (binary PUT) trực tiếp lên R2 thông qua presigned URL
   * Trong môi trường Browser, định tuyến qua proxy nội bộ `/r2-proxy` để tránh lỗi CORS
   * do Cloudflare R2 bucket chưa được cấu hình preflight OPTIONS
   */
  async uploadBinary(signedUrl: string, fileOrBlob: Blob, contentType: string): Promise<boolean> {
    try {
      let targetUrl = signedUrl;
      if (typeof window !== "undefined" && window.location) {
        const parsed = new URL(signedUrl);
        targetUrl = `/r2-proxy${parsed.pathname}${parsed.search}`;
      }

      const res = await fetch(targetUrl, {
        method: "PUT",
        headers: {
          "Content-Type": contentType
        },
        body: fileOrBlob
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error(`[R2MediaSignClient] uploadBinary R2 thất bại: HTTP ${res.status} ${res.statusText}`, errText);
      }

      return res.ok;
    } catch (err) {
      console.error("[R2MediaSignClient] Ngoại lệ uploadBinary R2:", err);
      return false;
    }
  }

  /**
   * Xin Presigned GET URL từ Edge Function để hiển thị hoặc tải ảnh từ R2
   * Có cache trong bộ nhớ (500 giây) để tránh spam request lên server
   */
  async getPresignedDownloadUrl(params: {
    ownerType: "PROPERTY" | "CUSTOMER";
    ownerId: string;
    mediaId: string;
    objectKey: string;
  }): Promise<string | null> {
    const cached = this.cache.get(params.objectKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.url;
    }

    const publishableKey = this.getPublishableKey();
    if (!publishableKey) {
      console.error("[R2MediaSignClient] Thiếu VITE_ACTIVATION_PUBLISHABLE_KEY");
      return null;
    }

    const installationId = getWebInstallationId();
    const payload = {
      action: "sign_get",
      installationId,
      ownerType: params.ownerType,
      ownerId: params.ownerId,
      mediaId: params.mediaId,
      objectKey: params.objectKey
    };

    try {
      const res = await fetch(this.getFunctionUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[R2MediaSignClient] sign_get lỗi HTTP ${res.status}:`, errText);
        return null;
      }

      const json = await res.json();
      if (json.ok && json.downloadUrl) {
        this.cache.set(params.objectKey, {
          url: json.downloadUrl,
          expiresAt: Date.now() + 500 * 1000
        });
        return json.downloadUrl;
      }
      return null;
    } catch (err) {
      console.error("[R2MediaSignClient] Ngoại lệ sign_get:", err);
      return null;
    }
  }
}

export const r2MediaSignClient = new R2MediaSignClient();
