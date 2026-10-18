/**
 * Bộ đệm ảnh trong máy theo objectKey (không theo URL đã ký).
 *
 * URL ký của R2 đổi mỗi lần ký lại (hết hạn ~10 phút, F5 mất cache bộ nhớ) nên trình duyệt
 * coi là ảnh khác và tải lại ảnh gốc. Ảnh trên R2 không bao giờ bị ghi đè (mỗi lần tải lên
 * là một mediaId mới) nên lưu vĩnh viễn theo objectKey là an toàn.
 *
 * R2 không bật CORS nên tải qua proxy cùng origin `/r2-proxy` (rewrite trên Vercel) để đọc
 * được nội dung và lưu vào Cache Storage. Mọi lỗi đều trả null để nơi gọi dùng URL ký như cũ.
 */

const CACHE_NAME = "bds-media-v1";
const CACHE_KEY_PREFIX = "/__media-cache/";

/** objectKey -> blob URL đã tạo trong phiên này (đọc đồng bộ để hiện ảnh ngay, không chớp loading) */
const objectUrls = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();
/** objectKey bị xoá khi đang tải: lượt tải đó không được lưu lại */
const removedWhileLoading = new Set<string>();

function cacheKey(objectKey: string): string {
  return CACHE_KEY_PREFIX + encodeURIComponent(objectKey);
}

function cacheAvailable(): boolean {
  return typeof window !== "undefined" && typeof caches !== "undefined" && typeof URL.createObjectURL === "function";
}

function rememberBlob(objectKey: string, blob: Blob): string {
  const existing = objectUrls.get(objectKey);
  if (existing) return existing;
  const url = URL.createObjectURL(blob);
  objectUrls.set(objectKey, url);
  return url;
}

/** URL ảnh đã có sẵn trong phiên (đồng bộ), hoặc undefined */
export function peekCachedMediaUrl(objectKey: string): string | undefined {
  return objectUrls.get(objectKey);
}

/** Đọc ảnh đã lưu trong máy (Cache Storage). Không gọi mạng. */
export async function getCachedMediaUrl(objectKey: string): Promise<string | null> {
  const mem = objectUrls.get(objectKey);
  if (mem) return mem;
  if (!cacheAvailable()) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const res = await cache.match(cacheKey(objectKey));
    if (!res) return null;
    return rememberBlob(objectKey, await res.blob());
  } catch {
    return null;
  }
}

/**
 * Tải ảnh từ URL ký qua proxy cùng origin rồi lưu vào máy. Trả blob URL, hoặc null nếu không
 * tải/lưu được (khi đó dùng thẳng URL ký).
 */
export function downloadAndCacheMedia(objectKey: string, signedUrl: string): Promise<string | null> {
  const mem = objectUrls.get(objectKey);
  if (mem) return Promise.resolve(mem);
  if (!cacheAvailable()) return Promise.resolve(null);

  const pending = inflight.get(objectKey);
  if (pending) return pending;

  const promise = (async () => {
    try {
      const parsed = new URL(signedUrl);
      const res = await fetch(`/r2-proxy${parsed.pathname}${parsed.search}`);
      const type = res.headers.get("content-type") || "";
      // Proxy chưa cấu hình (dev) trả index.html; lỗi R2 trả XML — đều không lưu
      if (!res.ok || !type.startsWith("image/")) return null;
      const blob = await res.blob();
      if (removedWhileLoading.has(objectKey)) return null;
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(
          cacheKey(objectKey),
          new Response(blob, { headers: { "Content-Type": type, "Content-Length": String(blob.size) } })
        );
      } catch {
        // Hết dung lượng / chế độ ẩn danh: vẫn hiện ảnh trong phiên này
      }
      if (removedWhileLoading.has(objectKey)) {
        await caches.open(CACHE_NAME).then((c) => c.delete(cacheKey(objectKey))).catch(() => {});
        return null;
      }
      return rememberBlob(objectKey, blob);
    } catch {
      return null;
    } finally {
      inflight.delete(objectKey);
      removedWhileLoading.delete(objectKey);
    }
  })();

  inflight.set(objectKey, promise);
  return promise;
}

/** Xoá ảnh khỏi bộ đệm (khi xoá ảnh khỏi BĐS, hoặc ảnh lưu bị hỏng) */
export async function removeCachedMedia(objectKey: string): Promise<void> {
  if (inflight.has(objectKey)) removedWhileLoading.add(objectKey);
  const url = objectUrls.get(objectKey);
  if (url) {
    objectUrls.delete(objectKey);
    URL.revokeObjectURL(url);
  }
  if (!cacheAvailable()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.delete(cacheKey(objectKey));
  } catch {
    // bỏ qua
  }
}
