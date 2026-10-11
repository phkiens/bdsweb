export const LiveHotlineLayout = {
  MAX_LEN: 40,

  toFraction(pos: number, badge: number, container: number): number {
    const free = container - badge;
    if (free <= 0) return 0;
    const ratio = pos / free;
    return Math.min(Math.max(ratio, 0), 1);
  },

  fromFraction(fraction: number, badge: number, container: number): number {
    const free = Math.max(container - badge, 0);
    const clampedFraction = Math.min(Math.max(fraction, 0), 1);
    return clampedFraction * free;
  },

  clamp(pos: number, badge: number, container: number): number {
    const maxPos = Math.max(container - badge, 0);
    return Math.min(Math.max(pos, 0), maxPos);
  },

  snapX(x: number, badge: number, container: number, snapPx: number): number {
    const clamped = this.clamp(x, badge, container);
    const maxPos = Math.max(container - badge, 0);
    if (clamped < snapPx) return 0;
    if (maxPos - clamped < snapPx) return maxPos;
    return clamped;
  },
};
