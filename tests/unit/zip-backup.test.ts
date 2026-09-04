import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import JSZip from "jszip";
import { AppDatabase } from "../../src/data/local/db";
import { exportDatabaseToZip, importDatabaseFromZip } from "../../src/core/utils/zip-backup";
import { PropertyStatus } from "../../src/core/models/enums";

describe("ZIP BACKUP & RESTORE (TƯƠNG THÍCH HOÀN TOÀN VỚI ANDROID ZIPHELPER)", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.properties.clear();
    await db.customers.clear();
    await db.customer_property_links.clear();
  });

  it("xuất cơ sở dữ liệu thành tệp ZIP chuẩn với các tệp JSON và thư mục images/", async () => {
    // Thêm 1 BĐS chính thức có ảnh Data URL
    await db.properties.add({
      id: "prop-zip-001",
      area: "Phường 25, Bình Thạnh",
      latitude: 10.801,
      longitude: 106.712,
      imagePath: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", // mẫu data URL hợp lệ
      driveMediaIds: null,
      documentUrl: null,
      areaSize: 85,
      price: 6.8,
      description: "Nhà đẹp hẻm xe hơi",
      status: PropertyStatus.FOR_SALE,
      surveyDate: "2026-09-01",
      direction: "Đông",
      ownerName: "Anh Tuấn",
      ownerPhone: "0909111222",
      propertyType: "Nhà",
      needToViewToday: false,
      isDraft: false,
      rawText: "",
      diary: "",
      updatedAt: 1000,
      lastEditedAt: 1000,
      createdAt: 1000,
      isVerified: true,
      isDeleted: false,
      isTextSynced: true,
      isMediaSynced: true,
      linkedCustomerId: null,
      title: null,
      mapLink: null,
      extractedBy: null,
      r2MediaKeys: null
    });

    // Thêm 1 khách hàng
    await db.customers.add({
      id: "cust-zip-001",
      name: "Chị Hạnh",
      nameNormalized: "chi hanh",
      phone: "0912345678",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "Bình Thạnh",
      demandDirections: "Đông",
      priceMin: 5,
      priceMax: 8,
      note: "Khách VIP",
      noteNormalized: "khach vip",
      role: "BUYER",
      status: "ACTIVE",
      avatarPath: null,
      avatarDriveUrl: null,
      updatedAt: 1000,
      isSynced: true,
      isDeleted: false
    });

    // Xuất ZIP
    const zipBlob = await exportDatabaseToZip(db);
    expect(zipBlob).toBeDefined();
    expect(zipBlob.size).toBeGreaterThan(0);

    // Đọc lại tệp ZIP vừa tạo để kiểm tra cấu trúc
    const zip = await JSZip.loadAsync(await zipBlob.arrayBuffer());
    expect(zip.file("properties.json")).toBeDefined();
    expect(zip.file("unverified_properties.json")).toBeDefined();
    expect(zip.file("customers.json")).toBeDefined();
    expect(zip.file("customer_property_links.json")).toBeDefined();
    expect(zip.file("settings.json")).toBeDefined();

    // Kiểm tra ảnh đã được đưa vào thư mục images/
    const imgFile = zip.file("images/prop_prop-zip-001.jpg");
    expect(imgFile).toBeDefined();

    // Kiểm tra nội dung properties.json
    const propJsonText = await zip.file("properties.json")!.async("string");
    const parsedProps = JSON.parse(propJsonText);
    expect(parsedProps.length).toBe(1);
    expect(parsedProps[0].id).toBe("prop-zip-001");
    expect(parsedProps[0].imagePath).toBe("images/prop_prop-zip-001.jpg");
  });

  it("nhập tệp ZIP chuẩn của Android, phục hồi hình ảnh và nạp đúng vào IndexedDB", async () => {
    // Tạo 1 tệp ZIP giả lập từ Android ZipHelper
    const androidZip = new JSZip();
    androidZip.file(
      "properties.json",
      JSON.stringify([
        {
          id: "android-prop-001",
          area: "Phường Đa Kao, Quận 1",
          price: 12.5,
          imagePath: "images/android_house.jpg",
          isVerified: true,
          isDeleted: false,
          updatedAt: 2000
        }
      ])
    );
    androidZip.file(
      "customers.json",
      JSON.stringify([
        {
          id: "android-cust-001",
          name: "Bác Hùng",
          phone: "0988776655",
          demandType: "Cần mua",
          isDeleted: false,
          updatedAt: 2000
        }
      ])
    );
    androidZip.file("customer_property_links.json", JSON.stringify([]));

    // Giả lập file ảnh vật lý trong images/
    const dummyImageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    androidZip.file("images/android_house.jpg", dummyImageBytes);

    const zipBlob = await androidZip.generateAsync({ type: "blob" });
    const file = new File([zipBlob], "android_backup.zip", { type: "application/zip" });

    // Khôi phục vào DB
    const result = await importDatabaseFromZip(file, db);
    expect(result.propertiesCount).toBe(1);
    expect(result.customersCount).toBe(1);
    expect(result.imagesCount).toBe(1);

    // Kiểm tra dữ liệu trong IndexedDB
    const restoredProp = await db.properties.get("android-prop-001");
    expect(restoredProp).toBeDefined();
    expect(restoredProp?.area).toBe("Phường Đa Kao, Quận 1");
    // Kiểm tra đường dẫn ảnh đã được chuyển thành Data URL Base64 để hiển thị trực tiếp trên web
    expect(restoredProp?.imagePath?.startsWith("data:")).toBe(true);

    const restoredCust = await db.customers.get("android-cust-001");
    expect(restoredCust).toBeDefined();
    expect(restoredCust?.name).toBe("Bác Hùng");
  });

  it("nhập unverified_properties.json từ Android và ánh xạ đúng address -> area và area -> areaSize", async () => {
    const androidZip = new JSZip();
    androidZip.file("properties.json", JSON.stringify([]));
    androidZip.file("customers.json", JSON.stringify([]));
    androidZip.file("customer_property_links.json", JSON.stringify([]));
    androidZip.file(
      "unverified_properties.json",
      JSON.stringify([
        {
          id: "android-unv-001",
          rawText: "Chào bán nhà Mỹ Tranh 42m2 giá 1.95 tỷ",
          address: "Mỹ Tranh",
          area: 42, // Trong Android UnverifiedProperty, area là số thực Double diện tích m²
          price: 1.95,
          ownerPhone: "0904274143"
        }
      ])
    );

    const zipBlob = await androidZip.generateAsync({ type: "blob" });
    const file = new File([zipBlob], "android_unv_backup.zip", { type: "application/zip" });

    const result = await importDatabaseFromZip(file, db);
    expect(result.propertiesCount).toBe(1);

    const restored = await db.properties.get("android-unv-001");
    expect(restored).toBeDefined();
    // Địa chỉ phải là "Mỹ Tranh", không được là "42"
    expect(restored?.area).toBe("Mỹ Tranh");
    // Diện tích m² phải là 42
    expect(restored?.areaSize).toBe(42);
    expect(restored?.isVerified).toBe(false);
  });
});
