import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import { AppDatabase } from "../../../src/data/local/db";
import { Customer } from "../../../src/core/models/customer";
import { CustomerRole, CustomerStatus } from "../../../src/core/models/enums";
import { prepareCustomerForWrite } from "../../../src/core/services/customer-validator";

describe("FEATURE PARITY: CRM-PHONE-DUPLICATE-VALIDATION-001 (Chặn trùng lặp SĐT chuẩn hóa)", () => {
  let db: AppDatabase;

  beforeEach(async () => {
    db = new AppDatabase();
    await db.customers.clear();

    // Khách hàng hiện có trong DB
    await db.customers.add({
      id: "cust-tuan-001",
      name: "Anh Tuấn",
      nameNormalized: "anh tuan",
      phone: "0909112233",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "Bình Thạnh",
      demandDirections: "",
      priceMin: 3.0,
      priceMax: 5.0,
      note: "Khách VIP",
      noteNormalized: "khach vip",
      role: CustomerRole.BUYER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 1000,
      isSynced: true,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    });
  });

  it("[REPRODUCTION & VERIFICATION] Chặn tạo khách hàng mới khi SĐT trùng với khách hàng đã có", async () => {
    const newCustomer: Customer = {
      id: "cust-tuan-new",
      name: "Anh Tuấn Mới",
      nameNormalized: "anh tuan moi",
      phone: "0909112233",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.BUYER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 2000,
      isSynced: false,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    await expect(prepareCustomerForWrite(db, newCustomer)).rejects.toThrow(
      "Số điện thoại 0909112233 đã thuộc khách hàng 'Anh Tuấn'"
    );
  });

  it("[REPRODUCTION & VERIFICATION] Phát hiện trùng lặp ngay cả khi định dạng SĐT khác nhau (+84 vs 0)", async () => {
    const newCustomerVariant: Customer = {
      id: "cust-tuan-variant",
      name: "Anh Tuấn 2",
      nameNormalized: "anh tuan 2",
      phone: "+84 909 112 233", // Khớp canonical với 0909112233
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.BUYER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 2000,
      isSynced: false,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    await expect(prepareCustomerForWrite(db, newCustomerVariant)).rejects.toThrow(
      "Số điện thoại 0909112233 đã thuộc khách hàng 'Anh Tuấn'"
    );
  });

  it("Cho phép cập nhật thông tin của chính khách hàng mà không báo lỗi trùng SĐT", async () => {
    const currentCustomer = (await db.customers.get("cust-tuan-001"))!;
    const updatedCustomer: Customer = {
      ...currentCustomer,
      name: "Anh Tuấn (Đổi tên)",
      note: "Đã cập nhật ghi chú"
    };

    const result = await prepareCustomerForWrite(db, updatedCustomer);
    expect(result.name).toBe("Anh Tuấn (Đổi tên)");
    expect(result.phone).toBe("0909112233");
  });

  it("Cho phép tạo khách hàng mới nếu khách hàng trùng SĐT cũ đã bị xóa (isDeleted = true)", async () => {
    // Đánh dấu khách cũ bị xóa
    await db.customers.update("cust-tuan-001", { isDeleted: true });

    const newCustomer: Customer = {
      id: "cust-tuan-after-delete",
      name: "Anh Tuấn Mới",
      nameNormalized: "anh tuan moi",
      phone: "0909112233",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.BUYER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 3000,
      isSynced: false,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    const result = await prepareCustomerForWrite(db, newCustomer);
    expect(result.id).toBe("cust-tuan-after-delete");
    expect(result.phone).toBe("0909112233");
  });

  it("Cho phép tạo khách hàng khi không nhập SĐT", async () => {
    const noPhoneCustomer: Customer = {
      id: "cust-no-phone",
      name: "Khách Không Số",
      nameNormalized: "khach khong so",
      phone: "",
      demandType: "Cần mua",
      propertyType: "Nhà",
      demandAreas: "",
      demandDirections: "",
      priceMin: 0,
      priceMax: 0,
      note: "",
      noteNormalized: "",
      role: CustomerRole.BUYER,
      status: CustomerStatus.ACTIVE,
      updatedAt: 4000,
      isSynced: false,
      isDeleted: false,
      avatarPath: null,
      avatarDriveUrl: null
    };

    const result = await prepareCustomerForWrite(db, noPhoneCustomer);
    expect(result.phone).toBe("");
  });
});
