import { describe, it, expect } from "vitest";
import {
  R2SlugUtils,
  parseR2MediaKeys,
  serializeR2MediaKeys,
  mergeR2MediaItems,
  getMediaIdFromFileName,
  R2MediaItem
} from "../../src/data/remote/r2-media-client";

describe("R2 Media Integration Unit Tests", () => {
  describe("R2SlugUtils", () => {
    it("toSlug correctly strips Vietnamese accents and replaces special chars with hyphens", () => {
      expect(R2SlugUtils.toSlug("Đường Nguyễn Huệ, Quận 1", "unknown-area")).toBe(
        "duong-nguyen-hue-quan-1"
      );
      expect(R2SlugUtils.toSlug("Phạm Văn Đồng (Gần Gigamall)", "unknown-area")).toBe(
        "pham-van-dong-gan-gigamall"
      );
      expect(R2SlugUtils.toSlug("", "fallback-area")).toBe("fallback-area");
      expect(R2SlugUtils.toSlug(null, "fallback-area")).toBe("fallback-area");
    });

    it("toSlug truncates to maxLength and removes trailing hyphens", () => {
      const longText = "đây là một địa chỉ rất dài vượt quá độ dài tối đa cho phép bốn mươi ký tự";
      const slug = R2SlugUtils.toSlug(longText, "fallback", 30);
      expect(slug.length).toBeLessThanOrEqual(30);
      expect(slug).not.toMatch(/-$/);
    });

    it("formatPriceSlug handles billions and millions correctly", () => {
      expect(R2SlugUtils.formatPriceSlug(5.0)).toBe("5-ty");
      expect(R2SlugUtils.formatPriceSlug(5.5)).toBe("5-5-ty");
      expect(R2SlugUtils.formatPriceSlug(12.75)).toBe("12-75-ty");
      expect(R2SlugUtils.formatPriceSlug(0.85)).toBe("850-trieu");
      expect(R2SlugUtils.formatPriceSlug(0.05)).toBe("50-trieu");
      expect(R2SlugUtils.formatPriceSlug(0)).toBe("unknown-price");
      expect(R2SlugUtils.formatPriceSlug(null)).toBe("unknown-price");
    });

    it("buildFolderPrefix builds stable folder string matching Android R2SlugUtils", () => {
      const prefix = R2SlugUtils.buildFolderPrefix(
        "prop-123",
        "Trần Hưng Đạo",
        "Nguyễn Văn A",
        4.5
      );
      expect(prefix).toBe("prop-123__tran-hung-dao__nguyen-van-a__4-5-ty");
    });

    it("extractExistingFolderPrefix extracts folder prefix from existing r2MediaKeys JSON", () => {
      const json = JSON.stringify([
        {
          objectKey: "properties/prop-123__tran-hung-dao__nguyen-van-a__4-5-ty/IMG_001.jpg",
          fileName: "IMG_001.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        }
      ]);
      const extracted = R2SlugUtils.extractExistingFolderPrefix(json);
      expect(extracted).toBe("prop-123__tran-hung-dao__nguyen-van-a__4-5-ty");
    });
  });

  describe("parseR2MediaKeys and serializeR2MediaKeys", () => {
    it("handles null, empty or invalid strings safely", () => {
      expect(parseR2MediaKeys(null)).toEqual([]);
      expect(parseR2MediaKeys("")).toEqual([]);
      expect(parseR2MediaKeys("[]")).toEqual([]);
      expect(parseR2MediaKeys("invalid json")).toEqual([]);
    });

    it("parses valid media items and sanitizes paths", () => {
      const input = JSON.stringify([
        {
          objectKey: "properties/prefix/IMG_01.jpg",
          fileName: "IMG_01.jpg",
          contentType: "IMAGE/JPEG",
          sortOrder: 1
        },
        {
          objectKey: "properties/prefix/IMG_00.jpg",
          fileName: "IMG_00.jpg",
          contentType: "image/png",
          sortOrder: 0
        },
        {
          // Malicious traversal key - must be filtered out
          objectKey: "../../../etc/passwd",
          fileName: "passwd",
          contentType: "image/jpeg",
          sortOrder: 2
        }
      ]);

      const parsed = parseR2MediaKeys(input);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].fileName).toBe("IMG_00.jpg");
      expect(parsed[0].sortOrder).toBe(0);
      expect(parsed[1].fileName).toBe("IMG_01.jpg");
      expect(parsed[1].contentType).toBe("image/jpeg");
    });

    it("serializes media items correctly", () => {
      const items: R2MediaItem[] = [
        {
          objectKey: "properties/prefix/IMG_02.jpg",
          fileName: "IMG_02.jpg",
          contentType: "image/jpeg",
          sortOrder: 1
        },
        {
          objectKey: "properties/prefix/IMG_01.jpg",
          fileName: "IMG_01.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        }
      ];

      const serialized = serializeR2MediaKeys(items);
      const parsed = JSON.parse(serialized);
      expect(parsed).toHaveLength(2);
      expect(parsed[0].fileName).toBe("IMG_01.jpg");
      expect(parsed[0].sortOrder).toBe(0);
      expect(parsed[1].fileName).toBe("IMG_02.jpg");
      expect(parsed[1].sortOrder).toBe(1);
    });
  });

  describe("mergeR2MediaItems (Concurrent Merge)", () => {
    it("preserves remote items when merging local new items", () => {
      const remoteItems: R2MediaItem[] = [
        {
          objectKey: "properties/p1/IMG_remote1.jpg",
          fileName: "IMG_remote1.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        }
      ];

      const localNewItems: R2MediaItem[] = [
        {
          objectKey: "properties/p1/IMG_local1.jpg",
          fileName: "IMG_local1.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        }
      ];

      const merged = mergeR2MediaItems(remoteItems, localNewItems);
      expect(merged).toHaveLength(2);
      expect(merged[0].fileName).toBe("IMG_remote1.jpg");
      expect(merged[0].sortOrder).toBe(0);
      expect(merged[1].fileName).toBe("IMG_local1.jpg");
      expect(merged[1].sortOrder).toBe(1);
    });

    it("deduplicates identical media items by key and fileName", () => {
      const remoteItems: R2MediaItem[] = [
        {
          objectKey: "properties/p1/IMG_01.jpg",
          fileName: "IMG_01.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        }
      ];

      const duplicateItems: R2MediaItem[] = [
        {
          objectKey: "properties/p1/IMG_01.jpg",
          fileName: "IMG_01.jpg",
          contentType: "image/jpeg",
          sortOrder: 1
        }
      ];

      const merged = mergeR2MediaItems(remoteItems, duplicateItems);
      expect(merged).toHaveLength(1);
      expect(merged[0].fileName).toBe("IMG_01.jpg");
    });
  });

  describe("getMediaIdFromFileName", () => {
    it("extracts mediaId without extension", () => {
      expect(getMediaIdFromFileName("IMG_6f075568-f03.jpg")).toBe("IMG_6f075568-f03");
      expect(getMediaIdFromFileName("20260904-122342-c69r.jpg")).toBe("20260904-122342-c69r");
      expect(getMediaIdFromFileName("media_without_ext")).toBe("media_without_ext");
    });
  });
});
