import JSZip from "jszip";
import { AppDatabase } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { Customer } from "../../core/models/customer";
import { CustomerPropertyLink } from "../../core/models/customer";
import { toTitleCase } from "./vietnamese";

export interface ZipImportResult {
  propertiesCount: number;
  customersCount: number;
  linksCount: number;
  imagesCount: number;
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

  // Tách BĐS chính thức (isVerified=true) và Tin chờ (isVerified=false) giống cấu trúc Android
  const officialProperties = allProperties.filter((p) => p.isVerified);
  const unverifiedProperties = allProperties.filter((p) => !p.isVerified);

  // 1. Gói images/
  const imgFolder = zip.folder("images");
  let exportedImagesCount = 0;

  onProgress?.("Đang trích xuất hình ảnh sang tệp nén...");
  const processedProperties = officialProperties.map((p) => {
    const copy = { ...p };
    if (copy.imagePath) {
      const parts = copy.imagePath.split("|||").filter(Boolean);
      const remapped: string[] = [];
      parts.forEach((part, idx) => {
        if (part.startsWith("data:")) {
          const bin = dataUrlToBinary(part);
          if (bin && imgFolder) {
            const filename = parts.length === 1 ? `prop_${p.id}.jpg` : `prop_${p.id}_${idx}.jpg`;
            imgFolder.file(filename, bin);
            exportedImagesCount++;
            remapped.push(`images/${filename}`);
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
    const copy: any = { ...u };
    const mediaPaths: string[] = [];
    if (copy.imagePath) {
      const parts = copy.imagePath.split("|||").filter(Boolean);
      parts.forEach((part: string, idx: number) => {
        if (part.startsWith("data:")) {
          const bin = dataUrlToBinary(part);
          if (bin && imgFolder) {
            const filename = parts.length === 1 ? `unverified_${u.id}.jpg` : `unverified_${u.id}_${idx}.jpg`;
            imgFolder.file(filename, bin);
            exportedImagesCount++;
            mediaPaths.push(`images/${filename}`);
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
  return await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}

/**
 * Nhập tệp ZIP chuẩn định dạng Android ZipHelper vào cơ sở dữ liệu IndexedDB của Web
 */
export async function importDatabaseFromZip(
  file: File,
  db: AppDatabase,
  onProgress?: (msg: string) => void
): Promise<ZipImportResult> {
  onProgress?.("Đang mở tệp ZIP sao lưu...");
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // 1. Nhận diện phiên bản sao lưu qua manifest.json
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

  // 2. Chỉ mục hóa các tệp ảnh trong thư mục images/ và media/ (không decode toàn bộ trước để tránh nghẽn RAM)
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

  // 3. Giải nén và đọc properties.json (hoặc fallback data.json)
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
          // V2: Canonical fields (areaName, landAreaM2) take precedence over legacy fields (area, areaSize)
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
          // V1: explicit mapping (source.area -> Web area, source.areaSize -> Web areaSize)
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
          isVerified: p.isVerified !== undefined ? Boolean(p.isVerified) : true
        });
      }

      await db.properties.bulkPut(restoredProps);
      propertiesCount += restoredProps.length;
    }
  }

  // 4. Giải nén và đọc unverified_properties.json
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
          // V2: Canonical fields (areaName, landAreaM2) are source of truth.
          // Legacy fields (address, area, areaSize) are only compatibility fallback.
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
          // V1 explicit mapping: source.address -> Web area, source.area -> Web areaSize
          // Không dùng heuristic (u.area || u.address, isNaN, typeof, rawText fallback)
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
          r2MediaKeys: null
        });
      }

      await db.properties.bulkPut(restoredUnverified);
      propertiesCount += restoredUnverified.length;
    }
  }

  // 4. Giải nén và đọc customers.json
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

  // 5. Giải nén và đọc customer_property_links.json
  let linksCount = 0;
  const linksFile = zip.file("customer_property_links.json");
  if (linksFile) {
    onProgress?.("Đang đọc dữ liệu Liên kết khách hàng...");
    const linksText = await linksFile.async("string");
    const rawList: CustomerPropertyLink[] = JSON.parse(linksText);

    if (Array.isArray(rawList)) {
      await db.customer_property_links.bulkPut(rawList);
      linksCount = rawList.length;

      // Cập nhật linkedCustomerId cho các BĐS có chủ nhà
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

  onProgress?.("Hoàn tất khôi phục!");
  return {
    propertiesCount,
    customersCount,
    linksCount,
    imagesCount: decodedImagesCount
  };
}
