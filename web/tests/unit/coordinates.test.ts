import { describe, expect, it } from "vitest";
import {
  calculateDistanceKm,
  COORD_DELTA,
  extractMapLinkUrl,
  isInVietnam,
  parseVietnamCoordinates
} from "../../src/core/utils/coordinates";

describe("Coordinates Utils", () => {
  it("validates Vietnam bounding box", () => {
    expect(isInVietnam(10.7769, 106.7009)).toBe(true); // TP.HCM
    expect(isInVietnam(21.0285, 105.8542)).toBe(true); // Hà Nội
    expect(isInVietnam(35.6762, 139.6503)).toBe(false); // Tokyo
    expect(isInVietnam(0.0, 0.0)).toBe(false);
  });

  it("extracts Vietnam coordinates from text", () => {
    const text1 = "Bán nhà hẻm xe hơi, vị trí 10.7769, 106.7009 xem nhà ngay";
    const res1 = parseVietnamCoordinates(text1);
    expect(res1).not.toBeNull();
    expect(res1![0]).toBeCloseTo(10.7769, 4);
    expect(res1![1]).toBeCloseTo(106.7009, 4);

    const text2 = "Xem vị trí tại: https://maps.google.com/?q=10.8231,106.6297";
    const res2 = parseVietnamCoordinates(text2);
    expect(res2).not.toBeNull();
    expect(res2![0]).toBeCloseTo(10.8231, 4);
    expect(res2![1]).toBeCloseTo(106.6297, 4);
  });

  it("extracts Google Maps URLs", () => {
    const text = "Liên hệ chủ nhà, link map: https://maps.app.goo.gl/abcdef123 xem vị trí";
    expect(extractMapLinkUrl(text)).toBe("https://maps.app.goo.gl/abcdef123");
  });

  it("calculates haversine distance correctly", () => {
    // Distance between Bitexco (10.7715, 106.7042) and Landmark 81 (10.7951, 106.7218) ~ 3.2km
    const dist = calculateDistanceKm(10.7715, 106.7042, 10.7951, 106.7218);
    expect(dist).toBeGreaterThan(2.8);
    expect(dist).toBeLessThan(3.8);
  });

  it("has exact coordinate tolerance of 0.000005 (~1m)", () => {
    expect(COORD_DELTA).toBe(0.000005);
  });
});
