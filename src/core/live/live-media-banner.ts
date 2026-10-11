/**
 * Banner "ảnh mới chưa tải" hiện khi số ảnh chờ tải TĂNG so với lần người dùng đã thấy/đóng.
 * Ảnh tải bớt (số giảm) thì hạ mốc theo, để lần tăng sau vẫn báo.
 */
export const LiveMediaBanner = {
  shouldShow(pendingCount: number, acknowledgedCount: number): boolean {
    return pendingCount > acknowledgedCount;
  },
  lowerAck(pendingCount: number, acknowledgedCount: number): number {
    return Math.min(pendingCount, acknowledgedCount);
  },
};
