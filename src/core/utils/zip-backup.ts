import JSZip from "jszip";
import { AppDatabase } from "../../data/local/db";
import { Property } from "../../core/models/property";
import { Customer } from "../../core/models/customer";
import { CustomerPropertyLink } from "../../core/models/customer";

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
 * Chuyển đổi Uint8Array từ tệp ZIP sang Data URL (Base64) để lưu vào IndexedDB của Web
 */
function binaryToDataUrl(bytes: Uint8Array, mimeType: string = "image/jpeg"): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
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
    // Nếu có ảnh Data URL trong imagePath
    if (copy.imagePath && copy.imagePath.startsWith("data:")) {
      const bin = dataUrlToBinary(copy.imagePath);
      if (bin && imgFolder) {
        const filename = `prop_${p.id}.jpg`;
        imgFolder.file(filename, bin);
        exportedImagesCount++;
        copy.imagePath = `images/${filename}`;
      }
    }
    return copy;
  });

  const processedUnverified = unverifiedProperties.map((u) => {
    const copy = { ...u };
    if (copy.imagePath && copy.imagePath.startsWith("data:")) {
      const bin = dataUrlToBinary(copy.imagePath);
      if (bin && imgFolder) {
        const filename = `unverified_${u.id}.jpg`;
        imgFolder.file(filename, bin);
        exportedImagesCount++;
        copy.imagePath = `images/${filename}`;
      }
    }
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

  // 1. Đọc toàn bộ ảnh từ thư mục images/ trong tệp ZIP
  const imageMap = new Map<string, string>();
  const imageEntries: { name: string; file: JSZip.JSZipObject }[] = [];

  zip.forEach((relativePath, zipEntry) => {
    if (!zipEntry.dir && relativePath.startsWith("images/")) {
      imageEntries.push({ name: relativePath, file: zipEntry });
    }
  });

  onProgress?.(`Đang giải nén ${imageEntries.length} hình ảnh...`);
  for (const entry of imageEntries) {
    const bytes = await entry.file.async("uint8array");
    const mime = entry.name.endsWith(".png") ? "image/png" : "image/jpeg";
    const dataUrl = await binaryToDataUrl(bytes, mime);

    // Lưu với cả đường dẫn đầy đủ và chỉ tên file để tra cứu linh hoạt
    imageMap.set(entry.name, dataUrl);
    const baseName = entry.name.replace("images/", "");
    imageMap.set(baseName, dataUrl);
  }

  // 2. Giải nén và đọc properties.json (hoặc fallback data.json)
  let propertiesCount = 0;
  const propFile = zip.file("properties.json") || zip.file("data.json");
  if (propFile) {
    onProgress?.("Đang đọc dữ liệu Bất động sản chính thức...");
    const propText = await propFile.async("string");
    const rawList: Property[] = JSON.parse(propText);

    if (Array.isArray(rawList)) {
      const restoredProps = rawList.map((p) => {
        let restoredImage = p.imagePath;
        if (p.imagePath) {
          const matched = imageMap.get(p.imagePath) || imageMap.get(p.imagePath.replace(/^.*[\\/]/, ""));
          if (matched) {
            restoredImage = matched;
          }
        }
        return {
          ...p,
          imagePath: restoredImage,
          isVerified: true
        };
      });

      await db.properties.bulkPut(restoredProps);
      propertiesCount += restoredProps.length;
    }
  }

  // 3. Giải nén và đọc unverified_properties.json
  const unverifiedFile = zip.file("unverified_properties.json");
  if (unverifiedFile) {
    onProgress?.("Đang đọc dữ liệu Tin chờ khảo sát...");
    const unverifiedText = await unverifiedFile.async("string");
    const rawList: any[] = JSON.parse(unverifiedText);

    if (Array.isArray(rawList)) {
      const restoredUnverified: Property[] = rawList.map((u) => {
        let restoredImage = u.imagePath;
        if (u.imagePath) {
          const matched = imageMap.get(u.imagePath) || imageMap.get(u.imagePath.replace(/^.*[\\/]/, ""));
          if (matched) {
            restoredImage = matched;
          }
        }
        return {
          id: u.id || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          area: u.area || u.address || "Tin chờ khảo sát",
          latitude: u.latitude ?? null,
          longitude: u.longitude ?? null,
          imagePath: restoredImage || null,
          driveMediaIds: u.driveMediaIds || null,
          driveFolderId: u.driveFolderId || null,
          priceAtFolderCreation: u.priceAtFolderCreation ?? null,
          documentUrl: u.documentUrl || "",
          areaSize: u.areaSize ?? null,
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
          rawText: u.rawText || "",
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
        };
      });

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
      const restoredCustomers = rawList.map((c) => {
        let restoredAvatar = c.avatarPath;
        if (c.avatarPath) {
          const matched = imageMap.get(c.avatarPath) || imageMap.get(c.avatarPath.replace(/^.*[\\/]/, ""));
          if (matched) {
            restoredAvatar = matched;
          }
        }
        return {
          ...c,
          avatarPath: restoredAvatar
        };
      });

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
    }
  }

  onProgress?.("Hoàn tất khôi phục!");
  return {
    propertiesCount,
    customersCount,
    linksCount,
    imagesCount: imageEntries.length
  };
}
