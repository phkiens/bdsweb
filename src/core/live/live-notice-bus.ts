/** Tin "đã tải xong ảnh" cho lớp phủ livestream (chỉ giữ tin mới nhất). */
export interface MediaRestoredNotice {
  seq: number;
  successCount: number;
  totalCount: number;
}

export class LiveNoticeBus {
  private seqCounter = 0;
  private _mediaRestored: MediaRestoredNotice | null = null;
  private listeners = new Set<(notice: MediaRestoredNotice | null) => void>();

  get mediaRestored(): MediaRestoredNotice | null {
    return this._mediaRestored;
  }

  publishMediaRestored(successCount: number, totalCount: number): void {
    if (successCount <= 0) return;
    this._mediaRestored = {
      seq: ++this.seqCounter,
      successCount,
      totalCount,
    };
    this.notify();
  }

  subscribe(listener: (notice: MediaRestoredNotice | null) => void): () => void {
    this.listeners.add(listener);
    listener(this._mediaRestored);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener(this._mediaRestored);
    }
  }

  resetForTest(): void {
    this._mediaRestored = null;
    this.seqCounter = 0;
    this.notify();
  }
}

export const liveNoticeBus = new LiveNoticeBus();
