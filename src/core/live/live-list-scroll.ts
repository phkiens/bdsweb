/**
 * Chỉ tự cuộn khi người dùng đang ở sát đầu danh sách và không tìm kiếm — không bao giờ giật chỗ đang xem.
 */
export const LiveListScroll = {
  TOP_TOLERANCE_PX: 24,

  shouldAutoScroll(scrollTop: number, searchQuery: string): boolean {
    return scrollTop <= LiveListScroll.TOP_TOLERANCE_PX && searchQuery.trim().length === 0;
  },
};
