import JSZip from "jszip";
import { AppDatabase } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { Customer } from "../../core/models/customer";
import { CustomerPropertyLink } from "../../core/models/customer";
import { toTitleCase } from "./vietnamese";
import { settingsManager } from "../../data/local/settings-manager";
import { getSupabaseClient } from "../../data/remote/supabase";
import { syncManager } from "../../data/sync/sync-manager";

export interface ZipImportResult {
  propertiesCount: number;
  customersCount: number;
  linksCount: number;
  imagesCount: number;
  priceHistoriesCount?: number;
}

export interface ImageEntryPlan {
  files: string[];
  skippedNameClashes: string[];
}

/**
 * Lập kế hoạch loại trùng ảnh khi xuất ZIP (chuẩn Android ZipHelper.planImageEntries)
 */
export function planImageEntries(imagePaths: string[]): ImageEntryPlan {
  const byName = new Map<string, string>();
  const skipped: string[] = [];
  for (const path of imagePaths) {
    if (!path || !path.trim()) continue;
    const baseName = path.replace(/^.*[\\/]/, "");
    if (!baseName) continue;
    const kept = byName.get(baseName);
    if (!kept) {
      byName.set(baseName, path);
    } else if (kept !== path && !skipped.includes(path)) {
      skipped.push(path);
    }
  }
  return {
    files: Array.from(byName.values()),
    skippedNameClashes: skipped
  };
}

export interface ServerIds {
  propertyIds: Set<string>;
  customerIds: Set<string>;
  linkKeys: Set<string>; // "customerId:propertyId"
}

/**
 * Lấy danh sách ID hiện có trên máy chủ Supabase để không làm sống lại các bản ghi đã xoá
 */
export async function defaultFetchServerIds(): Promise<ServerIds> {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Cần mạng để nhập dữ liệu chữ — chưa ghi gì.");
  }
  try {
    const propIds = new Set<string>();
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from("properties")
        .select("id")
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        if (item.id) propIds.add(String(item.id));
      }
      if (data.length < 1000) break;
      from += data.length;
    }

    const custIds = new Set<string>();
    from = 0;
    while (true) {
      const { data, error } = await client
        .from("customers")
        .select("id")
        .order("id", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        if (item.id) custIds.add(String(item.id));
      }
      if (data.length < 1000) break;
      from += data.length;
    }

    const linkKeys = new Set<string>();
    from = 0;
    while (true) {
      const { data, error } = await client
        .from("customer_property_links")
        .select("customer_id, property_id")
        .order("customer_id", { ascending: true })
        .order("property_id", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        if (item.customer_id && item.property_id) {
          linkKeys.add(`${item.customer_id}:${item.property_id}`);
        }
      }
      if (data.length < 1000) break;
      from += data.length;
    }

    return {
      propertyIds: propIds,
      customerIds: custIds,
      linkKeys
    };
  } catch (err: any) {
    if (err?.message === "Cần mạng để nhập dữ liệu chữ — chưa ghi gì.") {
      throw err;
    }
    throw new Error("Cần mạng để nhập dữ liệu chữ — chưa ghi gì.");
  }
}

/**
 * Chuyển đổi Data URL (Base64) sang Uint8Array để nén vào ZIP
 */
function dataUrlToBinary(dataUrl: string): Uint8Array | null {
  try {
    const parts = dataUrl.split(",");
    if (parts.length < 2) return null;
    const base64 = parts[1];
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Xuất toàn bộ cơ sở dữ liệu thành tệp ZIP chuẩn định dạng Android ZipHelper
 * Bao gồm loại trùng ảnh (commit c616787)
 */
export async function exportDatabaseToZip(
  db: AppDatabase,
  onProgress?: (msg: string) => void
): Promise<Blob> {
  const zip = new JSZip();

  onProgress?.("Đang tải dữ liệu từ cơ sở dữ liệu IndexedDB...");
  const allProperties = await db.properties.toArray();
  const customers = await db.customers.toArray();
  const links = await db.customer_property_links.toArray();
  const priceHistories = await db.price_histories.toArray();

  // Tách BĐS chính thức (isVerified=true) và Tin chờ (isVerified=false) giống cấu trúc Android
  const officialProperties = allProperties.filter((p) => p.isVerified);
  const unverifiedProperties = allProperties.filter((p) => !p.isVerified);

  // 1. Gói images/ kèm khử trùng lặp (commit c616787)
  const imgFolder = zip.folder("images");
  let exportedImagesCount = 0;
  const addedZipImageEntries = new Set<string>();
  const dataUrlToEntryFilename = new Map<string, string>();

  onProgress?.("Đang trích xuất hình ảnh sang tệp nén...");
  const processedProperties = officialProperties.map((p) => {
    const copy = {
      ...p,
      soldAt: p.soldAt ?? null,
      priceEditKind: p.priceEditKind ?? null,
      priceEditAt: p.priceEditAt ?? null,
      priceHistoryClearedRev: p.priceHistoryClearedRev ?? 0
    };
    if (copy.imagePath) {
      const parts = copy.imagePath.split("|||").filter(Boolean);
      const remapped: string[] = [];
      parts.forEach((part, idx) => {
        if (part.startsWith("data:")) {
          if (dataUrlToEntryFilename.has(part)) {
            const reusedName = dataUrlToEntryFilename.get(part)!;
            remapped.push(`images/${reusedName}`);
          } else {
            const bin = dataUrlToBinary(part);
            if (bin && imgFolder) {
              const filename = parts.length === 1 ? `prop_${p.id}.jpg` : `prop_${p.id}_${idx}.jpg`;
              if (!addedZipImageEntries.has(filename)) {
                imgFolder.file(filename, bin);
                addedZipImageEntries.add(filename);
                exportedImagesCount++;
              }
              dataUrlToEntryFilename.set(part, filename);
              remapped.push(`images/${filename}`);
            }
          }
        } else {
          remapped.push(part);
        }
      });
      copy.imagePath = remapped.join("|||");
    }
    return copy;
  });

  const processedUnverified = unverifiedProperties.map((u) => {
    const copy: any = {
      ...u,
      soldAt: u.soldAt ?? null,
      priceEditKind: u.priceEditKind ?? null,
      priceEditAt: u.priceEditAt ?? null,
      priceHistoryClearedRev: u.priceHistoryClearedRev ?? 0
    };
    const mediaPaths: string[] = [];
    if (copy.imagePath) {
      const parts = copy.imagePath.split("|||").filter(Boolean);
      parts.forEach((part: string, idx: number) => {
        if (part.startsWith("data:")) {
          if (dataUrlToEntryFilename.has(part)) {
            const reusedName = dataUrlToEntryFilename.get(part)!;
            mediaPaths.push(`images/${reusedName}`);
          } else {
            const bin = dataUrlToBinary(part);
            if (bin && imgFolder) {
              const filename = parts.length === 1 ? `unverified_${u.id}.jpg` : `unverified_${u.id}_${idx}.jpg`;
              if (!addedZipImageEntries.has(filename)) {
                imgFolder.file(filename, bin);
                addedZipImageEntries.add(filename);
                exportedImagesCount++;
              }
              dataUrlToEntryFilename.set(part, filename);
              mediaPaths.push(`images/${filename}`);
            }
          }
        } else {
          mediaPaths.push(part);
        }
      });
    }
    copy.address = copy.address || copy.area;
    copy.area = copy.areaSize != null ? copy.areaSize : (typeof copy.area === "number" ? copy.area : 0);
    copy.mediaPaths = mediaPaths;
    return copy;
  });

  // 2. Thêm các tệp JSON chuẩn vào gốc file ZIP
  zip.file("properties.json", JSON.stringify(processedProperties, null, 2));
  zip.file("unverified_properties.json", JSON.stringify(processedUnverified, null, 2));
  zip.file("customers.json", JSON.stringify(customers, null, 2));
  zip.file("customer_property_links.json", JSON.stringify(links, null, 2));

  const serializedHistories = priceHistories.map((h) => ({
    id: h.id,
    propertyId: h.propertyId,
    changeType: h.changeType,
    previousPrice: h.previousPrice ?? null,
    currentPrice: h.currentPrice,
    previousAreaSize: h.previousAreaSize ?? null,
    currentAreaSize: h.currentAreaSize ?? null,
    previousPricePerM2: h.previousPricePerM2 ?? null,
    currentPricePerM2: h.currentPricePerM2 ?? null,
    recordedAt: h.recordedAt,
    revision: h.revision,
    editKind: h.editKind
  }));
  zip.file("price_histories.json", JSON.stringify(serializedHistories, null, 2));
  zip.file(
    "settings.json",
    JSON.stringify(
      {
        exportedAt: Date.now(),
        platform: "BDS_COLLECTOR_WEB",
        schemaVersion: 30,
        imagesCount: exportedImagesCount
      },
      null,
      2
    )
  );

  onProgress?.("Đang nén dữ liệu ZIP...");
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });

  settingsManager.updateLastZipExportTime(new Date());

  return blob;
}

/**
 * Nhập ảnh từ ZIP (chuẩn Android commit 7b81f08)
 * Chỉ đọc thư mục images/ và media/ trong ZIP, giải nén và cập nhật imagePath của BĐS theo id/tên file khớp,
 * KHÔNG đụng đến dữ liệu chữ hay watermark.
 */
export async function importPhotosFromZip(
  file: File,
  db: AppDatabase,
  onProgress?: (msg: string) => void
): Promise<{ imagesCount: number; updatedPropertiesCount: number; message: string }> {
  onProgress?.("Đang mở tệp ZIP ảnh...");
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const imageEntries = new Map<string, JSZip.JSZipObject>();
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && (relativePath.startsWith("images/") || relativePath.startsWith("media/"))) {
      const baseName = relativePath.replace(/^(images|media)\//, "");
      imageEntries.set(baseName, zipEntry);
      imageEntries.set(relativePath, zipEntry);
    }
  });

  const imageCache = new Map<string, string>();
  let decodedImagesCount = 0;

  async function resolveImage(path: string): Promise<string> {
    const baseName = path.replace(/^.*[\\/]/, "");
    if (imageCache.has(baseName)) {
      return imageCache.get(baseName)!;
    }
    const entry =
      imageEntries.get(baseName) ||
      imageEntries.get(`images/${baseName}`) ||
      imageEntries.get(`media/${baseName}`) ||
      imageEntries.get(path);
    if (!entry) return path;

    const lower = baseName.toLowerCase();
    const mime = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
    const b64 = await entry.async("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    imageCache.set(baseName, dataUrl);
    decodedImagesCount++;
    return dataUrl;
  }

  onProgress?.("Đang gắn ảnh vào BĐS...");
  const properties = await db.properties.toArray();
  let updatedCount = 0;

  for (const p of properties) {
    let changed = false;
    let newImagePath = p.imagePath;

    if (p.imagePath) {
      const parts = p.imagePath.split("|||").filter(Boolean);
      const resolvedParts: string[] = [];
      for (const part of parts) {
        if (!part.startsWith("data:")) {
          const resolved = await resolveImage(part);
          if (resolved !== part) {
            resolvedParts.push(resolved);
            changed = true;
          } else {
            resolvedParts.push(part);
          }
        } else {
          resolvedParts.push(part);
        }
      }
      if (changed) {
        newImagePath = resolvedParts.join("|||");
      }
    }

    if (!newImagePath) {
      const candidateNames = [
        `prop_${p.id}.jpg`,
        `prop_${p.id}.png`,
        `prop_${p.id}_0.jpg`,
        `unverified_${p.id}.jpg`,
        `unverified_${p.id}.png`,
        `unverified_${p.id}_0.jpg`
      ];
      for (const cand of candidateNames) {
        if (imageEntries.has(cand)) {
          const resolved = await resolveImage(cand);
          newImagePath = resolved;
          changed = true;
          break;
        }
      }
    }

    if (p.r2MediaKeys && !newImagePath) {
      const keys = p.r2MediaKeys.split(",").map((k) => k.trim()).filter(Boolean);
      const matchedParts: string[] = [];
      for (const key of keys) {
        const base = key.replace(/^.*[\\/]/, "");
        if (imageEntries.has(base)) {
          const resolved = await resolveImage(base);
          matchedParts.push(resolved);
        }
      }
      if (matchedParts.length > 0) {
        newImagePath = matchedParts.join("|||");
        changed = true;
      }
    }

    if (changed && newImagePath !== p.imagePath) {
      await db.properties.update(p.id, { imagePath: newImagePath });
      updatedCount++;
    }
  }

  const customers = await db.customers.toArray();
  for (const c of customers) {
    if (c.avatarPath && !c.avatarPath.startsWith("data:")) {
      const resolved = await resolveImage(c.avatarPath);
      if (resolved !== c.avatarPath) {
        await db.customers.update(c.id, { avatarPath: resolved });
      }
    }
  }

  settingsManager.updateLastZipImportTime(new Date());

  const message = `Đã nhập ${decodedImagesCount} ảnh, gắn vào ${updatedCount} BĐS ✓`;
  return {
    imagesCount: decodedImagesCount,
    updatedPropertiesCount: updatedCount,
    message
  };
}

/**
 * Nhập dữ liệu chữ từ ZIP (chuẩn Android commit 7b81f08)
 * 1. Bắt buộc có kết nối máy chủ để lấy serverIds (ném lỗi nếu mất mạng)
 * 2. Chỉ thêm bản ghi chưa có trên máy chủ và chưa có ở local
 * 3. Đánh dấu isTextSynced = false cho bản ghi mới thêm
 * 4. Bỏ qua hoàn toàn price_histories.json
 * 5. Reset watermark về 0 và kéo lại dữ liệu từ đầu
 */
export async function importTextFromZip(
  file: File,
  db: AppDatabase,
  options?: {
    fetchServerIds?: () => Promise<ServerIds>;
    onProgress?: (msg: string) => void;
    /** Kéo lại từ máy chủ sau khi nhập (mặc định syncManager.pullChanges; test truyền hàm giả) */
    pullAfterImport?: () => Promise<unknown>;
  }
): Promise<{ addedCount: number; message: string }> {
  const onProgress = options?.onProgress;
  onProgress?.("Đang chuẩn bị nhập dữ liệu từ tệp ZIP...");

  onProgress?.("Đang hỏi máy chủ dữ liệu hiện có...");
  let server: ServerIds;
  try {
    server = options?.fetchServerIds
      ? await options.fetchServerIds()
      : await defaultFetchServerIds();
  } catch {
    throw new Error("Cần mạng để nhập dữ liệu chữ — chưa ghi gì.");
  }

  onProgress?.("Đang giải nén tập tin...");
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let schemaVersion = 1;
  const manifestFile = zip.file("manifest.json");
  if (manifestFile) {
    try {
      const manifestText = await manifestFile.async("string");
      const manifest = JSON.parse(manifestText);
      if (manifest && typeof manifest.schemaVersion === "number") {
        schemaVersion = manifest.schemaVersion;
      } else if (manifest && manifest.schemaVersion != null) {
        const parsed = Number(manifest.schemaVersion);
        if (!isNaN(parsed)) {
          schemaVersion = parsed;
        }
      }
    } catch {
      schemaVersion = 1;
    }
  }
  const isV2 = schemaVersion >= 2;

  let added = 0;

  // 1. Properties
  const propFile = zip.file("properties.json") || zip.file("data.json");
  if (propFile) {
    onProgress?.("Đang kiểm tra BĐS...");
    try {
      const propText = await propFile.async("string");
      const rawList: any[] = JSON.parse(propText);
      if (Array.isArray(rawList)) {
        for (let i = 0; i < rawList.length; i++) {
          const p = rawList[i];
          if (p.id && !p.isDeleted && !server.propertyIds.has(String(p.id))) {
            const existing = await db.properties.get(String(p.id));
            if (!existing) {
              let resolvedArea: string;
              let resolvedAreaSize: number | null;
              if (isV2) {
                const rawArea =
                  p.areaName !== undefined && p.areaName !== null
                    ? String(p.areaName)
                    : p.area !== undefined && p.area !== null
                    ? String(p.area)
                    : "";
                resolvedArea = rawArea || "Chưa rõ khu vực";
                const rawSize =
                  p.landAreaM2 !== undefined && p.landAreaM2 !== null
                    ? Number(p.landAreaM2)
                    : p.areaSize !== undefined && p.areaSize !== null
                    ? Number(p.areaSize)
                    : null;
                resolvedAreaSize = rawSize != null && !isNaN(rawSize) ? rawSize : null;
              } else {
                resolvedArea = p.area ? String(p.area) : "Chưa rõ khu vực";
                resolvedAreaSize = p.areaSize != null && !isNaN(Number(p.areaSize)) ? Number(p.areaSize) : null;
              }

              await db.properties.put({
                ...p,
                id: String(p.id),
                area: toTitleCase(resolvedArea),
                areaSize: resolvedAreaSize,
                latitude: p.latitude !== undefined && p.latitude !== null ? Number(p.latitude) : null,
                longitude: p.longitude !== undefined && p.longitude !== null ? Number(p.longitude) : null,
                rawText: p.rawText !== undefined && p.rawText !== null ? String(p.rawText) : (p.rawText || ""),
                isVerified: true,
                isTextSynced: false,
                isDeleted: false,
                soldAt: p.soldAt != null ? Number(p.soldAt) : null,
                priceEditKind: p.priceEditKind != null ? String(p.priceEditKind) : null,
                priceEditAt: p.priceEditAt != null ? Number(p.priceEditAt) : null,
                priceHistoryClearedRev: Number(p.priceHistoryClearedRev) || 0
              });
              added++;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc properties.json:", e);
    }
  }

  // 2. Unverified Properties
  const unvFile = zip.file("unverified_properties.json");
  if (unvFile) {
    onProgress?.("Đang kiểm tra tin thô...");
    try {
      const unvText = await unvFile.async("string");
      const rawList: any[] = JSON.parse(unvText);
      if (Array.isArray(rawList)) {
        for (let i = 0; i < rawList.length; i++) {
          const u = rawList[i];
          if (u.id && !u.isDeleted && !server.propertyIds.has(String(u.id))) {
            const existing = await db.properties.get(String(u.id));
            if (!existing) {
              let resolvedArea: string;
              let resolvedAreaSize: number | null;
              if (isV2) {
                const rawArea =
                  u.areaName !== undefined && u.areaName !== null
                    ? String(u.areaName)
                    : u.address !== undefined && u.address !== null
                    ? String(u.address)
                    : u.area !== undefined && u.area !== null
                    ? String(u.area)
                    : "";
                resolvedArea = rawArea || "Tin chờ khảo sát";
                const rawSize =
                  u.landAreaM2 !== undefined && u.landAreaM2 !== null
                    ? Number(u.landAreaM2)
                    : u.areaSize !== undefined && u.areaSize !== null
                    ? Number(u.areaSize)
                    : u.area !== undefined && u.area !== null
                    ? Number(u.area)
                    : null;
                resolvedAreaSize = rawSize != null && !isNaN(rawSize) ? rawSize : null;
              } else {
                resolvedArea = u.address ? String(u.address) : "Tin chờ khảo sát";
                resolvedAreaSize = u.area != null && !isNaN(Number(u.area)) ? Number(u.area) : null;
              }

              await db.properties.put({
                id: String(u.id),
                area: toTitleCase(resolvedArea),
                latitude: u.latitude !== undefined && u.latitude !== null ? Number(u.latitude) : null,
                longitude: u.longitude !== undefined && u.longitude !== null ? Number(u.longitude) : null,
                imagePath: null,
                driveMediaIds: u.driveMediaIds || null,
                driveFolderId: u.driveFolderId || null,
                priceAtFolderCreation: u.priceAtFolderCreation ?? null,
                documentUrl: u.documentUrl || "",
                areaSize: resolvedAreaSize,
                price: u.price ?? 0,
                description: u.description || u.rawText || "",
                status: u.status || "Chờ duyệt",
                surveyDate: u.surveyDate || "",
                direction: u.direction || "",
                ownerName: u.ownerName || "",
                ownerPhone: u.ownerPhone || "",
                propertyType: u.propertyType || "Nhà",
                needToViewToday: Boolean(u.needToViewToday),
                isDraft: Boolean(u.isDraft),
                rawText: u.rawText !== undefined && u.rawText !== null ? String(u.rawText) : "",
                diary: u.diary || "",
                updatedAt: Number(u.updatedAt) || Date.now(),
                lastEditedAt: Number(u.lastEditedAt) || Date.now(),
                createdAt: Number(u.createdAt) || Date.now(),
                isVerified: false,
                isDeleted: false,
                isTextSynced: false,
                isMediaSynced: false,
                propertyDetailJsonFileId: u.propertyDetailJsonFileId || null,
                txtFileId: u.txtFileId || null,
                linkedCustomerId: null,
                title: u.title || null,
                mapLink: u.mapLink || null,
                extractedBy: u.extractedBy || "MANUAL",
                r2MediaKeys: null,
                soldAt: u.soldAt != null ? Number(u.soldAt) : null,
                priceEditKind: u.priceEditKind != null ? String(u.priceEditKind) : null,
                priceEditAt: u.priceEditAt != null ? Number(u.priceEditAt) : null,
                priceHistoryClearedRev: Number(u.priceHistoryClearedRev) || 0
              });
              added++;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc unverified_properties.json:", e);
    }
  }

  // 3. Customers
  const custFile = zip.file("customers.json");
  if (custFile) {
    onProgress?.("Đang kiểm tra Khách hàng...");
    try {
      const custText = await custFile.async("string");
      const rawList: any[] = JSON.parse(custText);
      if (Array.isArray(rawList)) {
        for (const c of rawList) {
          if (c.id && !c.isDeleted && !server.customerIds.has(String(c.id))) {
            const existing = await db.customers.get(String(c.id));
            if (!existing) {
              await db.customers.put({
                ...c,
                id: String(c.id),
                isSynced: false,
                isDeleted: false
              });
              added++;
            }
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc customers.json:", e);
    }
  }

  // 4. Links
  const linksFile = zip.file("customer_property_links.json");
  if (linksFile) {
    onProgress?.("Đang kiểm tra liên kết...");
    try {
      const linksText = await linksFile.async("string");
      const rawList: any[] = JSON.parse(linksText);
      if (Array.isArray(rawList)) {
        for (const link of rawList) {
          if (!link.isDeleted && link.customerId && link.propertyId) {
            const linkKey = `${link.customerId}:${link.propertyId}`;
            if (!server.linkKeys.has(linkKey)) {
              const existing = await db.customer_property_links
                .where({ customerId: link.customerId, propertyId: link.propertyId })
                .first();
              if (!existing) {
                await db.customer_property_links.put({
                  ...link,
                  isSynced: false,
                  isDeleted: false
                });
                added++;
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc customer_property_links.json:", e);
    }
  }

  // Commit 7b81f08: Bỏ qua hoàn toàn price_histories.json

  // Settings: khôi phục action positions nếu có
  const settingsFile = zip.file("settings.json");
  if (settingsFile) {
    try {
      const settingsText = await settingsFile.async("string");
      const sObj = JSON.parse(settingsText);
      if (sObj && typeof sObj === "object") {
        for (const key of Object.keys(sObj)) {
          if (key.startsWith("action_position_")) {
            localStorage.setItem(key, String(sObj[key]));
          }
        }
      }
    } catch (e) {
      console.warn("Lỗi đọc settings.json:", e);
    }
  }

  // Đẩy thay đổi mới lên máy chủ nếu có thêm mới
  if (added > 0) {
    try {
      await syncManager.pushChanges();
    } catch (e) {
      console.warn("Lỗi pushChanges sau text import:", e);
    }
  }

  // Đặt lại 3 con trỏ kéo (như Android: properties/customers/links) rồi kéo lại từ đầu
  try {
    localStorage.setItem("bds_last_pull_properties", "0");
    localStorage.setItem("bds_last_pull_customers", "0");
    localStorage.setItem("bds_last_pull_links", "0");
  } catch {
    // không có localStorage (môi trường test) ⇒ bỏ qua
  }

  onProgress?.("Đang tải lại dữ liệu từ máy chủ...");
  try {
    await (options?.pullAfterImport ?? (() => syncManager.pullChanges()))();
  } catch (e) {
    console.warn("Lỗi pullChanges sau text import:", e);
  }

  settingsManager.updateLastZipImportTime(new Date());

  const msg =
    added > 0
      ? `Đã thêm ${added} mục máy chủ chưa có và tải lại dữ liệu ✓`
      : "Máy chủ đã có đủ dữ liệu, đã kéo cập nhật mới nhất ✓";

  return { addedCount: added, message: msg };
}

/**
 * Nhập tệp ZIP chuẩn định dạng Android ZipHelper vào cơ sở dữ liệu IndexedDB của Web (Hàm tương thích cũ)
 */
export async function importDatabaseFromZip(
  file: File,
  db: AppDatabase,
  onProgress?: (msg: string) => void
): Promise<ZipImportResult> {
  onProgress?.("Đang mở tệp ZIP sao lưu...");
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  let schemaVersion = 1;
  const manifestFile = zip.file("manifest.json");
  if (manifestFile) {
    try {
      const manifestText = await manifestFile.async("string");
      const manifest = JSON.parse(manifestText);
      if (manifest && typeof manifest.schemaVersion === "number") {
        schemaVersion = manifest.schemaVersion;
      } else if (manifest && manifest.schemaVersion != null) {
        const parsed = Number(manifest.schemaVersion);
        if (!isNaN(parsed)) {
          schemaVersion = parsed;
        }
      }
    } catch {
      schemaVersion = 1;
    }
  }

  const isV2 = schemaVersion >= 2;

  const imageEntries = new Map<string, JSZip.JSZipObject>();
  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && (relativePath.startsWith("images/") || relativePath.startsWith("media/"))) {
      const baseName = relativePath.replace(/^(images|media)\//, "");
      imageEntries.set(baseName, zipEntry);
      imageEntries.set(relativePath, zipEntry);
    }
  });

  const imageCache = new Map<string, string>();
  let decodedImagesCount = 0;

  async function resolveImage(path: string): Promise<string> {
    const baseName = path.replace(/^.*[\\/]/, "");
    if (imageCache.has(baseName)) {
      return imageCache.get(baseName)!;
    }
    const entry =
      imageEntries.get(baseName) ||
      imageEntries.get(`images/${baseName}`) ||
      imageEntries.get(`media/${baseName}`) ||
      imageEntries.get(path);
    if (!entry) return path;

    const lower = baseName.toLowerCase();
    const mime = lower.endsWith(".png")
      ? "image/png"
      : lower.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";
    const b64 = await entry.async("base64");
    const dataUrl = `data:${mime};base64,${b64}`;
    imageCache.set(baseName, dataUrl);
    decodedImagesCount++;
    return dataUrl;
  }

  let propertiesCount = 0;
  const propFile = zip.file("properties.json") || zip.file("data.json");
  if (propFile) {
    onProgress?.("Đang đọc dữ liệu Bất động sản chính thức...");
    const propText = await propFile.async("string");
    const rawList: any[] = JSON.parse(propText);

    if (Array.isArray(rawList)) {
      const restoredProps: Property[] = [];
      for (let i = 0; i < rawList.length; i++) {
        const p = rawList[i];
        if (i % 25 === 0) {
          onProgress?.(`Đang khôi phục BĐS chính thức (${i + 1}/${rawList.length})...`);
        }
        let restoredImage: string | null = null;
        const mediaList: string[] = Array.isArray(p.mediaPaths)
          ? p.mediaPaths
          : typeof p.imagePath === "string"
          ? p.imagePath.split("|||").filter(Boolean)
          : [];

        if (mediaList.length > 0) {
          const resolvedParts: string[] = [];
          for (const part of mediaList) {
            if (typeof part === "string" && part.trim()) {
              const resolved = await resolveImage(part);
              resolvedParts.push(resolved);
            }
          }
          restoredImage = resolvedParts.length > 0 ? resolvedParts.join("|||") : null;
        }

        let resolvedArea: string;
        let resolvedAreaSize: number | null;

        if (isV2) {
          const rawArea =
            p.areaName !== undefined && p.areaName !== null
              ? String(p.areaName)
              : p.area !== undefined && p.area !== null
              ? String(p.area)
              : "";
          resolvedArea = rawArea || "Chưa rõ khu vực";

          const rawSize =
            p.landAreaM2 !== undefined && p.landAreaM2 !== null
              ? Number(p.landAreaM2)
              : p.areaSize !== undefined && p.areaSize !== null
              ? Number(p.areaSize)
              : null;
          resolvedAreaSize = rawSize != null && !isNaN(rawSize) ? rawSize : null;
        } else {
          resolvedArea = p.area ? String(p.area) : "Chưa rõ khu vực";
          resolvedAreaSize = p.areaSize != null && !isNaN(Number(p.areaSize)) ? Number(p.areaSize) : null;
        }

        restoredProps.push({
          ...p,
          area: toTitleCase(resolvedArea),
          areaSize: resolvedAreaSize,
          latitude: p.latitude !== undefined && p.latitude !== null ? Number(p.latitude) : null,
          longitude: p.longitude !== undefined && p.longitude !== null ? Number(p.longitude) : null,
          rawText: p.rawText !== undefined && p.rawText !== null ? String(p.rawText) : (p.rawText || ""),
          imagePath: restoredImage,
          isVerified: p.isVerified !== undefined ? Boolean(p.isVerified) : true,
          soldAt: p.soldAt != null ? Number(p.soldAt) : null,
          priceEditKind: p.priceEditKind != null ? String(p.priceEditKind) : null,
          priceEditAt: p.priceEditAt != null ? Number(p.priceEditAt) : null,
          priceHistoryClearedRev: Number(p.priceHistoryClearedRev) || 0
        });
      }

      await db.properties.bulkPut(restoredProps);
      propertiesCount += restoredProps.length;
    }
  }

  const unverifiedFile = zip.file("unverified_properties.json");
  if (unverifiedFile) {
    onProgress?.("Đang đọc dữ liệu Tin chờ khảo sát...");
    const unverifiedText = await unverifiedFile.async("string");
    const rawList: any[] = JSON.parse(unverifiedText);

    if (Array.isArray(rawList)) {
      const restoredUnverified: Property[] = [];
      for (let i = 0; i < rawList.length; i++) {
        const u = rawList[i];
        if (i % 25 === 0) {
          onProgress?.(`Đang khôi phục Tin chờ (${i + 1}/${rawList.length})...`);
        }

        let restoredImage: string | null = null;
        const mediaList: string[] = Array.isArray(u.mediaPaths)
          ? u.mediaPaths
          : typeof u.imagePath === "string"
          ? u.imagePath.split("|||").filter(Boolean)
          : [];

        if (mediaList.length > 0) {
          const resolvedParts: string[] = [];
          for (const part of mediaList) {
            if (typeof part === "string" && part.trim()) {
              const resolved = await resolveImage(part);
              resolvedParts.push(resolved);
            }
          }
          restoredImage = resolvedParts.length > 0 ? resolvedParts.join("|||") : null;
        }

        let resolvedArea: string;
        let resolvedAreaSize: number | null;

        if (isV2) {
          const rawArea =
            u.areaName !== undefined && u.areaName !== null
              ? String(u.areaName)
              : u.address !== undefined && u.address !== null
              ? String(u.address)
              : u.area !== undefined && u.area !== null
              ? String(u.area)
              : "";
          resolvedArea = rawArea || "Tin chờ khảo sát";

          const rawSize =
            u.landAreaM2 !== undefined && u.landAreaM2 !== null
              ? Number(u.landAreaM2)
              : u.areaSize !== undefined && u.areaSize !== null
              ? Number(u.areaSize)
              : u.area !== undefined && u.area !== null
              ? Number(u.area)
              : null;
          resolvedAreaSize = rawSize != null && !isNaN(rawSize) ? rawSize : null;
        } else {
          resolvedArea = u.address ? String(u.address) : "Tin chờ khảo sát";
          resolvedAreaSize = u.area != null && !isNaN(Number(u.area)) ? Number(u.area) : null;
        }

        restoredUnverified.push({
          id: u.id || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          area: toTitleCase(resolvedArea),
          latitude: u.latitude !== undefined && u.latitude !== null ? Number(u.latitude) : null,
          longitude: u.longitude !== undefined && u.longitude !== null ? Number(u.longitude) : null,
          imagePath: restoredImage,
          driveMediaIds: u.driveMediaIds || null,
          driveFolderId: u.driveFolderId || null,
          priceAtFolderCreation: u.priceAtFolderCreation ?? null,
          documentUrl: u.documentUrl || "",
          areaSize: resolvedAreaSize,
          price: u.price ?? 0,
          description: u.description || u.rawText || "",
          status: u.status || "Chờ duyệt",
          surveyDate: u.surveyDate || "",
          direction: u.direction || "",
          ownerName: u.ownerName || "",
          ownerPhone: u.ownerPhone || "",
          propertyType: u.propertyType || "Nhà",
          needToViewToday: Boolean(u.needToViewToday),
          isDraft: Boolean(u.isDraft),
          rawText: u.rawText !== undefined && u.rawText !== null ? String(u.rawText) : "",
          diary: u.diary || "",
          updatedAt: Number(u.updatedAt) || Date.now(),
          lastEditedAt: Number(u.lastEditedAt) || Date.now(),
          createdAt: Number(u.createdAt) || Date.now(),
          isVerified: false,
          isDeleted: Boolean(u.isDeleted),
          isTextSynced: false,
          isMediaSynced: false,
          propertyDetailJsonFileId: u.propertyDetailJsonFileId || null,
          txtFileId: u.txtFileId || null,
          linkedCustomerId: null,
          title: u.title || null,
          mapLink: u.mapLink || null,
          extractedBy: u.extractedBy || "MANUAL",
          r2MediaKeys: null,
          soldAt: u.soldAt != null ? Number(u.soldAt) : null,
          priceEditKind: u.priceEditKind != null ? String(u.priceEditKind) : null,
          priceEditAt: u.priceEditAt != null ? Number(u.priceEditAt) : null,
          priceHistoryClearedRev: Number(u.priceHistoryClearedRev) || 0
        });
      }

      await db.properties.bulkPut(restoredUnverified);
      propertiesCount += restoredUnverified.length;
    }
  }

  let customersCount = 0;
  const custFile = zip.file("customers.json");
  if (custFile) {
    onProgress?.("Đang đọc dữ liệu Khách hàng...");
    const custText = await custFile.async("string");
    const rawList: Customer[] = JSON.parse(custText);

    if (Array.isArray(rawList)) {
      const restoredCustomers: Customer[] = [];
      for (const c of rawList) {
        let restoredAvatar = c.avatarPath;
        if (c.avatarPath) {
          restoredAvatar = await resolveImage(c.avatarPath);
        }
        restoredCustomers.push({
          ...c,
          avatarPath: restoredAvatar
        });
      }

      await db.customers.bulkPut(restoredCustomers);
      customersCount = restoredCustomers.length;
    }
  }

  let linksCount = 0;
  const linksFile = zip.file("customer_property_links.json");
  if (linksFile) {
    onProgress?.("Đang đọc dữ liệu Liên kết khách hàng...");
    const linksText = await linksFile.async("string");
    const rawList: CustomerPropertyLink[] = JSON.parse(linksText);

    if (Array.isArray(rawList)) {
      await db.customer_property_links.bulkPut(rawList);
      linksCount = rawList.length;

      for (const link of rawList) {
        if (!link.isDeleted && link.role === "OWNER" && link.customerId && link.propertyId) {
          const prop = await db.properties.get(link.propertyId);
          if (prop && !prop.linkedCustomerId) {
            await db.properties.update(link.propertyId, { linkedCustomerId: link.customerId });
          }
        }
      }
    }
  }

  // Commit 7b81f08: Bỏ qua việc nhập lịch sử giá từ ZIP
  const priceHistoriesCount = 0;

  settingsManager.updateLastZipImportTime(new Date());

  onProgress?.("Hoàn tất khôi phục!");
  return {
    propertiesCount,
    customersCount,
    linksCount,
    imagesCount: decodedImagesCount,
    priceHistoriesCount
  };
}
