import { Property } from "../models/property";

export class HasR2Media {
  readonly type = "HasR2Media" as const;
  constructor(public readonly count: number) {}
}

export const HasLocalMedia = Object.freeze({ type: "HasLocalMedia" as const });
export const CanonicalZeroMedia = Object.freeze({ type: "CanonicalZeroMedia" as const });
export const NoMediaReference = Object.freeze({ type: "NoMediaReference" as const });

export type MediaState =
  | HasR2Media
  | typeof HasLocalMedia
  | typeof CanonicalZeroMedia
  | typeof NoMediaReference;

export const MediaState = {
  HasR2Media: (count: number) => new HasR2Media(count),
  HasLocalMedia,
  CanonicalZeroMedia,
  NoMediaReference
};

export interface R2MediaItem {
  objectKey: string;
  fileName: string;
  contentType?: string;
  sortOrder?: number;
  sha256?: string | null;
}

export function isR2MediaItemValid(item: any): boolean {
  if (!item || typeof item !== "object") return false;
  const objectKey = typeof item.objectKey === "string" ? item.objectKey.trim() : "";
  const fileName = typeof item.fileName === "string" ? item.fileName.trim() : "";
  const sortOrder = typeof item.sortOrder === "number" ? item.sortOrder : 0;
  const rawContentType = typeof item.contentType === "string" ? item.contentType.trim().toLowerCase() : "image/jpeg";

  if (!objectKey || objectKey.includes("..") || objectKey.startsWith("/")) return false;
  if (!fileName || fileName.includes("..") || fileName.includes("/") || fileName.includes("\\")) return false;
  if (sortOrder < 0) return false;
  return rawContentType === "image/jpeg" || rawContentType === "image/png" || rawContentType === "video/mp4";
}

/**
 * Pure evaluation function for property media state.
 *
 * Precedence: R2 -> Local -> No Media Reference.
 * - Inspects only string reference fields on property.
 */
export function evaluateMediaState(property: Property): MediaState {
  // 1. Cloudflare R2 branch has highest precedence
  if (property.r2MediaKeys != null) {
    const r2Json = property.r2MediaKeys.trim();
    if (r2Json.length === 0 || r2Json === "null" || r2Json === "[]" || r2Json === "{}") {
      // R2 canonical zero media: user deleted all photos in R2
      return MediaState.CanonicalZeroMedia;
    }

    let items: R2MediaItem[] = [];
    try {
      const parsed = JSON.parse(r2Json);
      if (Array.isArray(parsed)) {
        items = parsed.filter(isR2MediaItemValid);
      }
    } catch {
      items = [];
    }

    if (items.length > 0) {
      return MediaState.HasR2Media(items.length);
    } else {
      return MediaState.CanonicalZeroMedia;
    }
  }

  // 2. Local Thumbnail Path (supports multiple paths delimited by "|||")
  const localPaths = property.imagePath
    ? property.imagePath
        .split("|||")
        .map((it) => it.trim())
        .filter((it) => it.length > 0 && it !== "null")
    : [];

  if (localPaths.length > 0) {
    return MediaState.HasLocalMedia;
  }

  // 3. No media reference of any kind
  return MediaState.NoMediaReference;
}
