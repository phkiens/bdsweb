import { LiveFeedBuilder } from "./live-feed";

/**
 * Quản lý các tin đã ẩn trong màn Tin mới.
 * Lưu vào localStorage với khoá riêng, định dạng key@at, prune sau 7 ngày.
 */
export class LiveFeedPrefs {
  private readonly storageKey: string;

  constructor(storageKey: string = "live_feed_prefs") {
    this.storageKey = storageKey;
  }

  private getRawEntries(): string[] {
    try {
      if (typeof localStorage === "undefined") return [];
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private saveRawEntries(entries: string[]): void {
    try {
      if (typeof localStorage === "undefined") return;
      localStorage.setItem(this.storageKey, JSON.stringify(entries));
    } catch {
      // ignore
    }
  }

  hiddenKeys(): Set<string> {
    const entries = this.getRawEntries();
    const result = new Set<string>();
    for (const entry of entries) {
      const idx = entry.indexOf("@");
      const key = idx >= 0 ? entry.substring(0, idx) : entry;
      if (key) result.add(key);
    }
    return result;
  }

  hide(key: string, at: number): void {
    const entries = this.getRawEntries().filter((it) => !it.startsWith(`${key}@`));
    entries.push(`${key}@${at}`);
    this.saveRawEntries(entries);
  }

  unhide(key: string): void {
    const beforeCount = this.getRawEntries().length;
    const filtered = this.getRawEntries().filter((it) => !it.startsWith(`${key}@`));
    if (filtered.length !== beforeCount) {
      this.saveRawEntries(filtered);
    }
  }

  prune(now: number): void {
    const entries = this.getRawEntries();
    const limit = now - LiveFeedBuilder.WINDOW_MS;
    const filtered = entries.filter((entry) => {
      const idx = entry.indexOf("@");
      if (idx < 0) return false;
      const atStr = entry.substring(idx + 1);
      const at = Number(atStr) || 0;
      return at >= limit;
    });
    if (filtered.length !== entries.length) {
      this.saveRawEntries(filtered);
    }
  }
}

export const liveFeedPrefs = new LiveFeedPrefs();
