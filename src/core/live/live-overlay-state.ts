import { liveEventBus } from "./live-event-bus";
import { liveNoticeBus } from "./live-notice-bus";

/**
 * Trạng thái "đã hiện/đã đóng" dùng chung cho mọi lớp phủ live.
 * Banner đã thấy/đã đóng ở chỗ này thì không hiện lại ở chỗ kia.
 */
class LiveOverlayStateManager {
  private _lastShownSeq = 0;
  private _mediaAck = 0;
  private _restoredAck = 0;
  private listeners = new Set<() => void>();

  get lastShownSeq(): number {
    return this._lastShownSeq;
  }

  set lastShownSeq(value: number) {
    if (this._lastShownSeq !== value) {
      this._lastShownSeq = value;
      this.notify();
    }
  }

  get mediaAck(): number {
    return this._mediaAck;
  }

  set mediaAck(value: number) {
    if (this._mediaAck !== value) {
      this._mediaAck = value;
      this.notify();
    }
  }

  get restoredAck(): number {
    return this._restoredAck;
  }

  set restoredAck(value: number) {
    if (this._restoredAck !== value) {
      this._restoredAck = value;
      this.notify();
    }
  }

  /** Gọi khi vừa bật Livestream: sự kiện cũ không hiện; ảnh chưa tải thì báo một lần. */
  reset(): void {
    this._lastShownSeq = liveEventBus.latestSeq();
    this._mediaAck = 0;
    this._restoredAck = liveNoticeBus.mediaRestored?.seq ?? 0;
    this.notify();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export const LiveOverlayState = new LiveOverlayStateManager();
