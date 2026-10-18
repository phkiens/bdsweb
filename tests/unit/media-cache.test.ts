import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Module under test keeps module-level Maps (objectUrls, inflight), so every test
// re-imports it after vi.resetModules() to avoid state leaking between tests.
const MODULE_PATH = "../../src/data/media/media-cache";
const CACHE_NAME = "bds-media-v1";
const OBJECT_KEY = "properties/a/m1.jpg";
const SIGNED_URL = "https://bucket.r2.cloudflarestorage.com/properties/a/m1.jpg?X-Amz-Signature=abc";
const PROXY_URL = "/r2-proxy/properties/a/m1.jpg?X-Amz-Signature=abc";
const CACHE_KEY = "/__media-cache/" + encodeURIComponent(OBJECT_KEY);

type MediaCacheModule = typeof import("../../src/data/media/media-cache");

interface FakeCaches {
  entries: Map<string, Response>;
  opened: string[];
  cache: {
    match: ReturnType<typeof vi.fn>;
    put: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  open: ReturnType<typeof vi.fn>;
}

/** In-memory stand-in for Cache Storage (`caches`). Responses are cloned on match so bodies stay readable. */
function createFakeCaches(): FakeCaches {
  const entries = new Map<string, Response>();
  const opened: string[] = [];
  const cache = {
    match: vi.fn(async (key: string) => {
      const stored = entries.get(key);
      return stored ? stored.clone() : undefined;
    }),
    put: vi.fn(async (key: string, res: Response) => {
      entries.set(key, res);
    }),
    delete: vi.fn(async (key: string) => entries.delete(key)),
  };
  const open = vi.fn(async (name: string) => {
    opened.push(name);
    return cache;
  });
  return { entries, opened, cache, open };
}

function imageResponse(bytes = "fake-jpeg-bytes", contentType = "image/jpeg"): Response {
  return new Response(new Blob([bytes]), { status: 200, headers: { "content-type": contentType } });
}

async function loadModule(): Promise<MediaCacheModule> {
  vi.resetModules();
  return import(MODULE_PATH);
}

describe("media-cache", () => {
  let fakeCaches: FakeCaches;
  let fetchMock: ReturnType<typeof vi.fn>;
  let urlSeq = 0;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    urlSeq = 0;
    fakeCaches = createFakeCaches();
    fetchMock = vi.fn();

    // The module only uses the cache when running in a browser-like environment.
    vi.stubGlobal("window", {});
    vi.stubGlobal("caches", fakeCaches);
    vi.stubGlobal("fetch", fetchMock);

    createObjectURLSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation(() => `blob:test/${++urlSeq}`);
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("downloadAndCacheMedia fetches through /r2-proxy, returns a blob URL, and stores it in memory and Cache Storage", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());
    const mod = await loadModule();

    const url = await mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(PROXY_URL);
    expect(url).toMatch(/^blob:/);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBe(url);
    expect(fakeCaches.opened).toContain(CACHE_NAME);
    expect(fakeCaches.entries.has(CACHE_KEY)).toBe(true);
  });

  it("getCachedMediaUrl returns a blob URL from Cache Storage after a fresh module import (page reload) without fetching", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());
    const firstLoad = await loadModule();
    await firstLoad.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);

    // Simulate a page reload: in-memory state is gone, Cache Storage survives.
    const reloaded = await loadModule();
    expect(reloaded.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
    fetchMock.mockClear();

    const url = await reloaded.getCachedMediaUrl(OBJECT_KEY);

    expect(url).toMatch(/^blob:/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reloaded.peekCachedMediaUrl(OBJECT_KEY)).toBe(url);
  });

  it("downloadAndCacheMedia returns null and stores nothing when the proxy responds with text/html", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<!doctype html><html></html>", { status: 200, headers: { "content-type": "text/html" } })
    );
    const mod = await loadModule();

    const url = await mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);

    expect(url).toBeNull();
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
    expect(fakeCaches.cache.put).not.toHaveBeenCalled();
    expect(fakeCaches.entries.size).toBe(0);
    expect(createObjectURLSpy).not.toHaveBeenCalled();
  });

  it("downloadAndCacheMedia returns null when the proxy responds 404 with application/xml", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<Error><Code>NoSuchKey</Code></Error>", {
        status: 404,
        headers: { "content-type": "application/xml" },
      })
    );
    const mod = await loadModule();

    const url = await mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);

    expect(url).toBeNull();
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
    expect(fakeCaches.cache.put).not.toHaveBeenCalled();
    expect(fakeCaches.entries.size).toBe(0);
  });

  it("downloadAndCacheMedia resolves null without throwing when fetch rejects", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const mod = await loadModule();

    await expect(mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL)).resolves.toBeNull();
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
    expect(fakeCaches.entries.size).toBe(0);
  });

  it("concurrent downloadAndCacheMedia calls for the same key share one fetch and resolve to the same blob URL", async () => {
    fetchMock.mockImplementation(async () => imageResponse());
    const mod = await loadModule();

    const [first, second] = await Promise.all([
      mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL),
      mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toMatch(/^blob:/);
    expect(second).toBe(first);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
  });

  it("downloadAndCacheMedia still returns a blob URL for this session when cache.put throws (quota exceeded)", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());
    fakeCaches.cache.put.mockRejectedValueOnce(new DOMException("Quota exceeded", "QuotaExceededError"));
    const mod = await loadModule();

    const url = await mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);

    expect(url).toMatch(/^blob:/);
    expect(fakeCaches.cache.put).toHaveBeenCalledTimes(1);
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBe(url);
    expect(fakeCaches.entries.has(CACHE_KEY)).toBe(false);
  });

  it("removeCachedMedia revokes the blob URL, clears the in-session entry, and deletes the Cache Storage entry", async () => {
    fetchMock.mockResolvedValueOnce(imageResponse());
    const mod = await loadModule();
    const url = await mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);
    expect(url).toMatch(/^blob:/);
    expect(fakeCaches.entries.has(CACHE_KEY)).toBe(true);

    await mod.removeCachedMedia(OBJECT_KEY);

    expect(revokeObjectURLSpy).toHaveBeenCalledWith(url);
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
    expect(fakeCaches.cache.delete).toHaveBeenCalledWith(CACHE_KEY);
    expect(fakeCaches.entries.has(CACHE_KEY)).toBe(false);
    await expect(mod.getCachedMediaUrl(OBJECT_KEY)).resolves.toBeNull();
  });

  it("downloadAndCacheMedia and getCachedMediaUrl return null and never fetch when caches is unavailable", async () => {
    vi.stubGlobal("caches", undefined);
    const mod = await loadModule();

    await expect(mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL)).resolves.toBeNull();
    await expect(mod.getCachedMediaUrl(OBJECT_KEY)).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
  });

  it("removeCachedMedia during an in-flight download keeps the removed image out of the cache", async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValueOnce(new Promise<Response>((r) => (release = r)));
    const mod = await loadModule();

    const pending = mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL);
    await mod.removeCachedMedia(OBJECT_KEY);
    release(imageResponse());

    await expect(pending).resolves.toBeNull();
    expect(mod.peekCachedMediaUrl(OBJECT_KEY)).toBeUndefined();
    expect(fakeCaches.entries.has(CACHE_KEY)).toBe(false);

    // Lượt tải sau (không bị xoá giữa chừng) lưu bình thường
    fetchMock.mockResolvedValueOnce(imageResponse());
    await expect(mod.downloadAndCacheMedia(OBJECT_KEY, SIGNED_URL)).resolves.toMatch(/^blob:/);
    expect(fakeCaches.entries.has(CACHE_KEY)).toBe(true);
  });
});
