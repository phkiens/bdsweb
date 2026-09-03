import { describe, expect, it } from "vitest";
import {
  canonicalizeVietnamesePhone,
  matchesArea,
  normalizeVietnamese,
  toTitleCase
} from "../../src/core/utils/vietnamese";

describe("Vietnamese string normalization", () => {
  it("removes diacritics, maps d/D, and lowercases", () => {
    expect(normalizeVietnamese("Đất Mặt Tiền Quận 1")).toBe("dat mat tien quan 1");
    expect(normalizeVietnamese("Phường Bến Nghé")).toBe("phuong ben nghe");
    expect(normalizeVietnamese("  HẺM XE HƠI  ")).toBe("hem xe hoi");
  });
});

describe("Vietnamese phone canonicalization", () => {
  it("converts +84 to 0", () => {
    expect(canonicalizeVietnamesePhone("+84901234567")).toBe("0901234567");
    expect(canonicalizeVietnamesePhone("84912345678")).toBe("0912345678");
  });

  it("adds leading 0 for 9-digit mobile numbers", () => {
    expect(canonicalizeVietnamesePhone("987654321")).toBe("0987654321");
    expect(canonicalizeVietnamesePhone("388123456")).toBe("0388123456");
  });

  it("keeps standard 10-digit number intact", () => {
    expect(canonicalizeVietnamesePhone("0909123456")).toBe("0909123456");
  });

  it("handles spaces, dots, dashes", () => {
    expect(canonicalizeVietnamesePhone("090.123-4567")).toBe("0901234567");
    expect(canonicalizeVietnamesePhone("090 123 4567")).toBe("0901234567");
  });
});

describe("Title Case conversion", () => {
  it("capitalizes first letter of each word", () => {
    expect(toTitleCase("phường bến nghé")).toBe("Phường Bến Nghé");
    expect(toTitleCase("QUẬN BÌNH THẠNH")).toBe("Quận Bình Thạnh");
  });
});

describe("Area matching filter", () => {
  it("correctly matches substrings in area", () => {
    expect(matchesArea("Quận 1, TP.HCM", ["Quận 1"])).toBe(true);
    expect(matchesArea("Bình Thạnh", ["Quận 1", "Bình Thạnh"])).toBe(true);
    expect(matchesArea("Gò Vấp", ["Quận 1"])).toBe(false);
  });
});
