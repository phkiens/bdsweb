import { LiveEvent } from "./live-event";

/**
 * Kênh sự kiện live dùng chung toàn app. Chỉ giữ MỘT nguồn: lịch sử các sự kiện gần nhất (mới nhất ở cuối).
 * Banner đọc các sự kiện có seq mới hơn lần hiện trước; hiệu ứng tại chỗ tìm sự kiện mới nhất của BĐS mình.
 */
export class LiveEventBus {
  static readonly HISTORY_LIMIT = 100;

  private seqCounter = 0;
  private _history: LiveEvent[] = [];
  private listeners = new Set<(history: readonly LiveEvent[]) => void>();

  get history(): readonly LiveEvent[] {
    return this._history;
  }

  publish(events: LiveEvent[], now: number = Date.now()): void {
    if (events.length === 0) return;
    const stamped = events.map((it) => ({
      ...it,
      seq: ++this.seqCounter,
      publishedAt: now,
      propertyId: it.after.id,
    }));
    this._history = [...this._history, ...stamped].slice(-LiveEventBus.HISTORY_LIMIT);
    this.notify();
  }

  /** seq lớn nhất đã phát (0 nếu chưa có). */
  latestSeq(): number {
    return this._history[this._history.length - 1]?.seq ?? 0;
  }

  subscribe(listener: (history: readonly LiveEvent[]) => void): () => void {
    this.listeners.add(listener);
    listener(this._history);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this._history);
    }
  }

  resetForTest(): void {
    this._history = [];
    this.seqCounter = 0;
    this.notify();
  }
}

export const liveEventBus = new LiveEventBus();
