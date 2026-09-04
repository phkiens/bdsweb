import { describe, it, expect } from "vitest";
import {
  getPropertySyncState,
  SyncState
} from "../../../src/components/properties/PropertyCard";
import { getAvatarColorHex } from "../../../src/components/customers/CustomerAvatar";
import { toTitleCase } from "../../../src/core/utils/vietnamese";
import { createDefaultProperty } from "../../../src/core/models/property";
import { serializeR2MediaKeys } from "../../../src/data/remote/r2-media-client";

describe("PARITY FOUNDATION & PROPERTY LIST: Unit Tests", () => {
  describe("1. getPropertySyncState (Native 1:1 Parity)", () => {
    it("should return NOT_SYNCED when isTextSynced is false regardless of images", () => {
      const prop = createDefaultProperty({
        isTextSynced: false,
        imagePath: null,
        r2MediaKeys: null
      });
      expect(getPropertySyncState(prop)).toBe(SyncState.NOT_SYNCED);
    });

    it("should return FULLY_SYNCED when isTextSynced is true and no images exist", () => {
      const prop = createDefaultProperty({
        isTextSynced: true,
        imagePath: null,
        r2MediaKeys: null
      });
      expect(getPropertySyncState(prop)).toBe(SyncState.FULLY_SYNCED);
    });

    it("should return FULLY_SYNCED when imagePath has only whitespace or empty separators", () => {
      const prop = createDefaultProperty({
        isTextSynced: true,
        imagePath: "   |||   ",
        r2MediaKeys: null
      });
      expect(getPropertySyncState(prop)).toBe(SyncState.FULLY_SYNCED);
    });

    it("should return PARTIALLY_SYNCED when local images exist but r2MediaKeys is empty", () => {
      const prop = createDefaultProperty({
        isTextSynced: true,
        imagePath: "/storage/emulated/0/DCIM/IMG_001.jpg|||/storage/emulated/0/DCIM/IMG_002.jpg",
        r2MediaKeys: null
      });
      expect(getPropertySyncState(prop)).toBe(SyncState.PARTIALLY_SYNCED);
    });

    it("should return PARTIALLY_SYNCED when some local images are missing from r2MediaKeys", () => {
      const r2Keys = serializeR2MediaKeys([
        {
          objectKey: "properties/p1/IMG_001.jpg",
          fileName: "IMG_001.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        }
      ]);

      const prop = createDefaultProperty({
        isTextSynced: true,
        imagePath: "blob:http://localhost/123/IMG_001.jpg|||blob:http://localhost/123/IMG_002.jpg",
        r2MediaKeys: r2Keys
      });
      expect(getPropertySyncState(prop)).toBe(SyncState.PARTIALLY_SYNCED);
    });

    it("should return FULLY_SYNCED when all local images match r2MediaKeys by fileName or mediaId", () => {
      const r2Keys = serializeR2MediaKeys([
        {
          objectKey: "properties/p1/IMG_001.jpg",
          fileName: "IMG_001.jpg",
          contentType: "image/jpeg",
          sortOrder: 0
        },
        {
          objectKey: "properties/p1/IMG_002.jpg",
          fileName: "IMG_002.jpg",
          contentType: "image/jpeg",
          sortOrder: 1
        }
      ]);

      const prop = createDefaultProperty({
        isTextSynced: true,
        imagePath: "/data/user/0/app/IMG_001.jpg|||/data/user/0/app/IMG_002.jpg",
        r2MediaKeys: r2Keys
      });
      expect(getPropertySyncState(prop)).toBe(SyncState.FULLY_SYNCED);
    });
  });

  describe("2. getAvatarColorHex (Native CustomerCard 1:1 Palette)", () => {
    it("should return consistent deterministic hex colors for identical names", () => {
      const color1 = getAvatarColorHex("Anh Nam");
      const color2 = getAvatarColorHex("Anh Nam");
      expect(color1).toBe(color2);
    });

    it("should pick from the exact 7-color palette from Native Android", () => {
      const expectedPalette = new Set([
        "#2563EB", // Blue
        "#059669", // Green
        "#D97706", // Amber
        "#DB2777", // Pink
        "#7C3AED", // Purple
        "#DC2626", // Red
        "#0891B2"  // Cyan
      ]);

      const testNames = ["Hùng", "Bình", "Châu", "Dung", "Lan", "Mai", "Tuấn", "Vy"];
      for (const name of testNames) {
        const hex = getAvatarColorHex(name);
        expect(expectedPalette.has(hex)).toBe(true);
      }
    });

    it("should handle empty or whitespace-only names gracefully with default color", () => {
      expect(getAvatarColorHex("")).toBe("#2563EB");
      expect(getAvatarColorHex("   ")).toBe("#2563EB");
    });
  });

  describe("3. toTitleCase formatting for Property Area", () => {
    it("should format lowercase areas to Title Case correctly", () => {
      expect(toTitleCase("bắc sơn")).toBe("Bắc Sơn");
      expect(toTitleCase("phường bến nghé, quận 1")).toBe("Phường Bến Nghé, Quận 1");
      expect(toTitleCase("AN DƯƠNG VƯƠNG")).toBe("An Dương Vương");
    });

    it("should return empty string for empty input", () => {
      expect(toTitleCase("")).toBe("");
      expect(toTitleCase("   ")).toBe("");
    });
  });
});
