import { describe, it, expect } from "vitest";
import { clampPan, zoomAt, IDENTITY_ZOOM, MAX_ZOOM } from "../../src/core/utils/zoom-pan";

describe("zoom-pan (trình xem ảnh phóng to)", () => {
  it("phóng to quanh một điểm giữ điểm đó đứng yên trên màn hình", () => {
    const z = zoomAt(IDENTITY_ZOOM, 2, 100, 50);
    // Điểm ảnh tại (100, 50) sau transform vẫn nằm ở (100, 50)
    expect(100 * z.scale + z.x).toBeCloseTo(100 * 2 - 100);
    expect(z).toEqual({ scale: 2, x: -100, y: -50 });
  });

  it("giới hạn mức zoom trong [1, MAX_ZOOM] và về 1 thì bỏ dịch chuyển", () => {
    expect(zoomAt(IDENTITY_ZOOM, 99, 0, 0).scale).toBe(MAX_ZOOM);
    expect(zoomAt({ scale: 3, x: 40, y: -20 }, 0.5, 10, 10)).toEqual(IDENTITY_ZOOM);
  });

  it("không cho kéo ảnh ra khỏi khung", () => {
    // Ảnh 400x300 zoom 2 → 800x600 trong khung 500x500: kéo tối đa 150 ngang, 50 dọc
    expect(clampPan({ scale: 2, x: 999, y: -999 }, 400, 300, 500, 500)).toEqual({ scale: 2, x: 150, y: -50 });
  });

  it("ảnh nhỏ hơn khung thì luôn ở giữa", () => {
    expect(clampPan({ scale: 1, x: 30, y: 30 }, 400, 300, 500, 500)).toEqual({ scale: 1, x: 0, y: 0 });
  });
});
