export interface IntRange {
  start: number;
  end: number;
  first: number;
  last: number;
  count: number;
  indices: number[];
}

export function createIntRange(start: number, end: number): IntRange {
  const indices: number[] = [];
  for (let i = start; i <= end; i++) {
    indices.push(i);
  }
  return {
    start,
    end,
    first: start,
    last: end,
    count: Math.max(0, end - start + 1),
    indices
  };
}

/**
 * Tính toán cột và hàng cho giao diện hiển thị khi live.
 * Chuẩn 100% Native Android LiveGrid.kt.
 */
export const LiveGrid = {
  /** Số cột theo bề rộng cửa sổ (CSS px = dp): điện thoại 1, K Pad dọc 2, K Pad ngang 3. */
  listColumns(widthDp: number): number {
    if (widthDp >= 840) return 3;
    if (widthDp >= 600) return 2;
    return 1;
  },

  /** Màn Tin mới: 1 cột trên điện thoại, 2 cột trên máy tính bảng. */
  feedColumns(widthDp: number): number {
    return widthDp >= 600 ? 2 : 1;
  },

  /** Chia [count] chỉ số thành các hàng [columns] ô; không hàng nào vắt qua [breakAt] (tiêu đề nhóm "trùng chủ").
   *  breakAt < 0 hoặc ≥ count = không có điểm ngắt. */
  rows(count: number, columns: number, breakAt: number = -1): IntRange[] {
    if (count <= 0) return [];
    const result: IntRange[] = [];
    let start = 0;

    while (start < count) {
      const endPoint = breakAt > start && breakAt < count ? breakAt : count;
      while (start < endPoint) {
        const end = Math.min(start + columns - 1, endPoint - 1);
        result.push(createIntRange(start, end));
        start = end + 1;
      }
    }
    return result;
  }
};
