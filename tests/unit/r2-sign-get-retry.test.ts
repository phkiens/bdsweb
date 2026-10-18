import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { R2MediaSignClient } from "../../src/data/remote/r2-media-client";
import { mediaService } from "../../src/data/media/media-service";

const params = (n: number) => ({
  ownerType: "PROPERTY" as const,
  ownerId: "prop-x",
  mediaId: `m${n}`,
  objectKey: `properties/prop-x__a__b__1-ty/m${n}.jpg`
});

const okResponse = (url: string) =>
  new Response(JSON.stringify({ ok: true, downloadUrl: url, expiresInSeconds: 600 }), { status: 200 });

describe("R2MediaSignClient.getPresignedDownloadUrl — tự thử lại khi lỗi tạm thời", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_ACTIVATION_PUBLISHABLE_KEY", "sb_publishable_test");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("lỗi server 5xx rồi thành công → trả URL sau khi thử lại", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("boot error", { status: 503 }))
      .mockResolvedValueOnce(okResponse("https://r2/ok.jpg"));
    const client = new R2MediaSignClient();
    const p = client.getPresignedDownloadUrl(params(1));
    await vi.runAllTimersAsync();
    expect(await p).toBe("https://r2/ok.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(client.getLastDownloadError(params(1).objectKey)).toBeUndefined();
  });

  it("mất mạng cả 3 lần → null kèm lý do 'Mất kết nối mạng'", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const client = new R2MediaSignClient();
    const p = client.getPresignedDownloadUrl(params(2));
    await vi.runAllTimersAsync();
    expect(await p).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(client.getLastDownloadError(params(2).objectKey)).toBe("Mất kết nối mạng");
  });

  it("lỗi 4xx (key sai) không thử lại và giữ thông báo của server", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: "objectKey does not match expected identity path" }), {
        status: 400
      })
    );
    const client = new R2MediaSignClient();
    expect(await client.getPresignedDownloadUrl(params(3))).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(client.getLastDownloadError(params(3).objectKey)).toBe(
      "HTTP 400: objectKey does not match expected identity path"
    );
  });

  it("gộp các request trùng objectKey đang chạy, sau đó dùng cache", async () => {
    fetchMock.mockImplementation(async () => okResponse("https://r2/shared.jpg"));
    const client = new R2MediaSignClient();
    const [a, b] = await Promise.all([
      client.getPresignedDownloadUrl(params(4)),
      client.getPresignedDownloadUrl(params(4))
    ]);
    expect(a).toBe("https://r2/shared.jpg");
    expect(b).toBe("https://r2/shared.jpg");
    expect(await client.getPresignedDownloadUrl(params(4))).toBe("https://r2/shared.jpg");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    client.invalidateDownloadUrl(params(4).objectKey);
    await client.getPresignedDownloadUrl(params(4));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("mediaService.resolveImageUrl — ảnh Google Drive cũ", () => {
  it("không gọi Edge Function, trả link ảnh Drive", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const url = await mediaService.resolveImageUrl("prop-x", {
      propertyId: "prop-x",
      mediaId: "drive_abc123",
      objectKey: "legacy/drive/abc123",
      fileName: "drive_abc123.jpg",
      contentType: "image/jpeg",
      sortOrder: 0
    });
    expect(url).toBe("https://drive.google.com/thumbnail?sz=w2000&id=abc123");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
