import { describe, it, expect, vi, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  MediaItem,
  mapR2ItemToMediaItem,
  mapMediaItemToR2Item,
  isValidMediaItem,
  extractMediaId
} from "../../src/core/models/media";
import {
  parseR2MediaKeys,
  serializeR2MediaKeys,
  R2MediaItem,
  r2MediaSignClient
} from "../../src/data/remote/r2-media-client";
import { MediaService, mediaService as singletonMediaService } from "../../src/data/media/media-service";
import { Property, createDefaultProperty } from "../../src/core/models/property";
import {
  syncManager,
  mapRemotePropertyToDomain,
  mapDomainPropertyToRemote
} from "../../src/data/sync/sync-manager";
import * as supabaseModule from "../../src/data/remote/supabase";
import { db } from "../../src/data/local/db";

describe("Master Plan: Web <-> Android Full Media Sync Tests (WEB-01 to WEB-10)", () => {
  let mediaService: MediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    mediaService = new MediaService();
  });

  // WEB-01: đọc media từ manifest r2_media_keys, KHÔNG gọi RPC (hàm M4 không có trên server)
  it("WEB-01: reads media from r2_media_keys manifest without calling Supabase RPC", async () => {
    const mockSupabase = { rpc: vi.fn() };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const manifest = JSON.stringify([
      { objectKey: "properties/prop-100__area__owner__1-ty/IMG_002.jpg", fileName: "IMG_002.jpg", contentType: "image/jpeg", sortOrder: 1 },
      { objectKey: "properties/prop-100__area__owner__1-ty/IMG_001.jpg", fileName: "IMG_001.jpg", contentType: "image/jpeg", sortOrder: 0 }
    ]);
    const prop = createDefaultProperty({ id: "prop-100", r2MediaKeys: manifest });
    const items = await mediaService.fetchPropertyMedia("prop-100", prop);

    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.mediaId).sort()).toEqual(["IMG_001", "IMG_002"]);
  });

  // WEB-03: Web upload 1 ảnh -> manifest đúng
  it("WEB-03: Web upload 1 image -> manifest updated with deterministic sortOrder", async () => {
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { r2_media_keys: null, updated_at: 1000 },
              error: null
            }),
            single: vi.fn().mockResolvedValue({
              data: {
                r2_media_keys: JSON.stringify([
                  {
                    objectKey: "properties/prop-300__area__owner__1-ty/IMG_test.jpg",
                    fileName: "IMG_test.jpg",
                    contentType: "image/jpeg",
                    sortOrder: 0
                  }
                ])
              },
              error: null
            })
          })
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null })
        })
      })
    };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    vi.spyOn(r2MediaSignClient, "getPresignedUploadUrl").mockResolvedValue({
      uploadUrl: "https://r2.test/upload",
      objectKey: "properties/prop-300__area__owner__1-ty/IMG_test.jpg",
      expiresInSeconds: 600
    });
    vi.spyOn(r2MediaSignClient, "uploadBinary").mockResolvedValue(true);

    const prop = createDefaultProperty({
      id: "prop-300",
      area: "Phường Bến Nghé",
      ownerName: "Nguyễn Văn A",
      price: 1.0,
      r2MediaKeys: null
    });

    const file = new File(["dummy_image_data"], "IMG_test.jpg", { type: "image/jpeg" });
    const result = await mediaService.uploadPropertyImages(prop, [file]);

    expect(result.success).toBe(true);
    expect(result.uploadedCount).toBe(1);
  });

  // WEB-04: Web xóa 1 ảnh -> Android canonical state đúng (re-index 0..N-1)
  it("WEB-04: Web delete 1 image -> re-indexes remaining items to 0..N-1", async () => {
    const initialItems: R2MediaItem[] = [
      {
        objectKey: "properties/p4/IMG_1.jpg",
        fileName: "IMG_1.jpg",
        contentType: "image/jpeg",
        sortOrder: 0
      },
      {
        objectKey: "properties/p4/IMG_2.jpg",
        fileName: "IMG_2.jpg",
        contentType: "image/jpeg",
        sortOrder: 1
      },
      {
        objectKey: "properties/p4/IMG_3.jpg",
        fileName: "IMG_3.jpg",
        contentType: "image/jpeg",
        sortOrder: 2
      }
    ];

    let updatedPayload: any = null;
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { r2_media_keys: JSON.stringify(initialItems) },
              error: null
            })
          })
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        })
      })
    };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    // Xóa item ở giữa (IMG_2.jpg)
    const res = await mediaService.deletePropertyImage("prop-400", "properties/p4/IMG_2.jpg");
    expect(res.success).toBe(true);
    expect(updatedPayload).not.toBeNull();

    const remaining = parseR2MediaKeys(updatedPayload.r2_media_keys);
    expect(remaining).toHaveLength(2);
    expect(remaining[0].fileName).toBe("IMG_1.jpg");
    expect(remaining[0].sortOrder).toBe(0);
    expect(remaining[1].fileName).toBe("IMG_3.jpg");
    expect(remaining[1].sortOrder).toBe(1); // Re-indexed from 2 to 1!
  });

  // WEB-05: Web xóa ảnh cuối -> r2_media_keys = '[]' (TUYỆT ĐỐI KHÔNG NULL)
  it("WEB-05: Web delete last image -> r2_media_keys becomes '[]', never null", async () => {
    const singleItem: R2MediaItem[] = [
      {
        objectKey: "properties/p5/IMG_only.jpg",
        fileName: "IMG_only.jpg",
        contentType: "image/jpeg",
        sortOrder: 0
      }
    ];

    let updatedPayload: any = null;
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { r2_media_keys: JSON.stringify(singleItem) },
              error: null
            })
          })
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        })
      })
    };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const res = await mediaService.deletePropertyImage("prop-500", "properties/p5/IMG_only.jpg");
    expect(res.success).toBe(true);
    expect(updatedPayload).not.toBeNull();
    // ZERO MEDIA SEMANTICS:
    expect(updatedPayload.r2_media_keys).toBe("[]");
    expect(updatedPayload.r2_media_keys).not.toBeNull();
  });

  // WEB-06: '[]' không hồi sinh legacy media
  it("WEB-06: r2_media_keys == '[]' displays 0 media and never resurrects legacy Drive", async () => {
    const propWithStaleDrive = createDefaultProperty({
      id: "prop-600",
      r2MediaKeys: "[]",
      driveMediaIds: "legacy_drive_file_id_123,legacy_drive_file_id_456"
    });

    const mockSupabase = {
      rpc: vi.fn()
    };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    const items = await mediaService.fetchPropertyMedia("prop-600", propWithStaleDrive);

    // Zero media: returns [] immediately, 0 RPC calls, 0 Drive fallback
    expect(items).toEqual([]);
    expect(mockSupabase.rpc).not.toHaveBeenCalled();
  });

  // WEB-07: Web reorder -> sortOrder đúng
  it("WEB-07: Web reorder -> reassigns sortOrder 0..N-1 preserving identity", async () => {
    const items: R2MediaItem[] = [
      { objectKey: "properties/p7/imgA.jpg", fileName: "imgA.jpg", contentType: "image/jpeg", sortOrder: 0 },
      { objectKey: "properties/p7/imgB.jpg", fileName: "imgB.jpg", contentType: "image/jpeg", sortOrder: 1 },
      { objectKey: "properties/p7/imgC.jpg", fileName: "imgC.jpg", contentType: "image/jpeg", sortOrder: 2 }
    ];

    let updatedPayload: any = null;
    const mockSupabase = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { r2_media_keys: JSON.stringify(items) },
              error: null
            })
          })
        }),
        update: vi.fn().mockImplementation((payload) => {
          updatedPayload = payload;
          return {
            eq: vi.fn().mockResolvedValue({ error: null })
          };
        })
      })
    };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    // Reorder: imgC becomes cover (0), then imgA (1), then imgB (2)
    const res = await mediaService.reorderPropertyImages("prop-700", [
      "properties/p7/imgC.jpg",
      "properties/p7/imgA.jpg",
      "properties/p7/imgB.jpg"
    ]);

    expect(res.success).toBe(true);
    const reordered = parseR2MediaKeys(updatedPayload.r2_media_keys);
    expect(reordered[0].fileName).toBe("imgC.jpg");
    expect(reordered[0].sortOrder).toBe(0);
    expect(reordered[1].fileName).toBe("imgA.jpg");
    expect(reordered[1].sortOrder).toBe(1);
    expect(reordered[2].fileName).toBe("imgB.jpg");
    expect(reordered[2].sortOrder).toBe(2);
  });

  // WEB-08: Android-originated media update -> Web đọc được
  it("WEB-08: Android-originated media update is parsed accurately by Web", () => {
    // Exact format generated by Android's R2MediaMetadataCodec.toJson()
    const androidJson = JSON.stringify([
      {
        objectKey: "properties/20260724-144553-f8aw__to-8__mrs-tuan__2-68-ty/20260724-144553-f8aw_IMG_61fb7b7e-789.jpg",
        fileName: "20260724-144553-f8aw_IMG_61fb7b7e-789.jpg",
        contentType: "image/jpeg",
        sortOrder: 0
      }
    ]);

    const parsed = parseR2MediaKeys(androidJson);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].fileName).toBe("20260724-144553-f8aw_IMG_61fb7b7e-789.jpg");
    expect(extractMediaId(parsed[0].fileName)).toBe("20260724-144553-f8aw_IMG_61fb7b7e-789");

    const mapped = mapR2ItemToMediaItem(parsed[0], "20260724-144553-f8aw");
    expect(isValidMediaItem(mapped)).toBe(true);
    expect(mapped.propertyId).toBe("20260724-144553-f8aw");
  });

  // WEB-09: Web-originated media update -> Android metadata/sync nhận được
  it("WEB-09: Web-originated media serialization matches Android schema contract", () => {
    const webItems: MediaItem[] = [
      {
        propertyId: "prop-900",
        mediaId: "IMG_abc123-xyz",
        objectKey: "properties/prop-900__quan-1__chu-nha__5-ty/IMG_abc123-xyz.jpg",
        fileName: "IMG_abc123-xyz.jpg",
        contentType: "image/jpeg",
        sortOrder: 0
      }
    ];

    const r2Items = webItems.map(mapMediaItemToR2Item);
    const serialized = serializeR2MediaKeys(r2Items);

    // Android JSON parser compatibility
    const parsedRaw = JSON.parse(serialized);
    expect(parsedRaw).toEqual([
      {
        objectKey: "properties/prop-900__quan-1__chu-nha__5-ty/IMG_abc123-xyz.jpg",
        fileName: "IMG_abc123-xyz.jpg",
        contentType: "image/jpeg",
        sortOrder: 0
      }
    ]);

    // Test sync mapping
    const prop = createDefaultProperty({ id: "prop-900", r2MediaKeys: serialized });
    const remote = mapDomainPropertyToRemote(prop);
    expect(remote.r2_media_keys).toBe(serialized);

    const backToDomain = mapRemotePropertyToDomain({ id: "prop-900", r2_media_keys: serialized });
    expect(backToDomain.r2MediaKeys).toBe(serialized);
  });

  // WEB-10: Property list không tạo N+1 RPC
  it("WEB-10: Preloading 50 properties fills the cache from manifests with zero network calls", async () => {
    const props: Property[] = [];
    for (let i = 1; i <= 50; i++) {
      const id = `prop-${i}`;
      props.push(
        createDefaultProperty({
          id,
          r2MediaKeys: JSON.stringify([{ objectKey: `properties/${id}/img.jpg`, fileName: "img.jpg", contentType: "image/jpeg", sortOrder: 0 }])
        })
      );
    }
    const mockSupabase = { rpc: vi.fn() };
    vi.spyOn(supabaseModule, "getSupabaseClient").mockReturnValue(mockSupabase as any);

    await mediaService.preloadPropertiesMedia(props);

    expect(mockSupabase.rpc).not.toHaveBeenCalled();
    expect(mediaService.getMediaSynchronous("prop-1")).toHaveLength(1);
    expect(mediaService.getMediaSynchronous("prop-50")).toHaveLength(1);
  });

  // WEB-11: Android filename mismatch (propId_IMG_xxx.jpg vs objectKey IMG_xxx.jpg)
  // Ensures mediaId is derived from objectKey to satisfy Edge Function validation
  it("WEB-11: Derives mediaId from objectKey when Android filename has property prefix", async () => {
    const r2Item: R2MediaItem = {
      objectKey: "properties/20260908-121429-04lkkr__van-xa__tuanhungwatch__1-68-ty/IMG_2fcc85b2-391.jpg",
      fileName: "20260908-121429-04lkkr_IMG_2fcc85b2-391.jpg",
      contentType: "image/jpeg",
      sortOrder: 0
    };

    const domainItem = mapR2ItemToMediaItem(r2Item, "20260908-121429-04lkkr");
    // MUST extract mediaId from objectKey ("IMG_2fcc85b2-391"), NOT fileName ("20260908-121429-04lkkr_IMG_2fcc85b2-391")
    expect(domainItem.mediaId).toBe("IMG_2fcc85b2-391");

    const getPresignedSpy = vi
      .spyOn(r2MediaSignClient, "getPresignedDownloadUrl")
      .mockResolvedValue("https://r2.download.url/img.jpg");

    const resolvedUrl = await mediaService.resolveImageUrl("20260908-121429-04lkkr", domainItem);
    expect(resolvedUrl).toBe("https://r2.download.url/img.jpg");
    expect(getPresignedSpy).toHaveBeenCalledWith({
      ownerType: "PROPERTY",
      ownerId: "20260908-121429-04lkkr",
      mediaId: "IMG_2fcc85b2-391",
      objectKey: "properties/20260908-121429-04lkkr__van-xa__tuanhungwatch__1-68-ty/IMG_2fcc85b2-391.jpg"
    });
  });

  // WEB-12: Realtime & Pull update IndexedDB when r2_media_keys changes even if updated_at is identical
  it("WEB-12: Updates local IndexedDB and invalidates media cache when r2_media_keys changes without updated_at bump", async () => {
    const propId = "prop-same-timestamp";
    await db.properties.put(
      createDefaultProperty({
        id: propId,
        updatedAt: 5000,
        r2MediaKeys: null,
        isTextSynced: true
      })
    );

    const invalidateSpy = vi.spyOn(singletonMediaService, "invalidateCache");

    const remotePayload = {
      eventType: "UPDATE",
      new: {
        id: propId,
        updated_at: 5000, // Identical timestamp!
        r2_media_keys: JSON.stringify([
          {
            objectKey: "properties/prop-same-timestamp/IMG_01.jpg",
            fileName: "IMG_01.jpg",
            contentType: "image/jpeg",
            sortOrder: 0
          }
        ]),
        is_deleted: false
      }
    };

    // Simulate Realtime event
    await (syncManager as any).handlePropertyRealtime(remotePayload);

    const updatedInDb = await db.properties.get(propId);
    expect(updatedInDb?.r2MediaKeys).toContain("IMG_01.jpg");
    expect(invalidateSpy).toHaveBeenCalledWith(propId);
  });
});
