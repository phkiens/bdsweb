import { describe, it, expect } from "vitest";
import { Customer } from "../../../src/core/models/customer";
import { CustomerRole, CustomerStatus } from "../../../src/core/models/enums";
import { isBuyerSide, isEligibleForMatching } from "../../../src/core/models/customer";
import { MatchEngine } from "../../../src/core/engine/match-engine";
import { Property } from "../../../src/core/models/property";
import { PropertyStatus } from "../../../src/core/models/enums";

describe("FEATURE PARITY: CRM-OWNER-DETAIL-003 (Chủ nhà OWNER không chạy gợi ý mua nhà)", () => {
  const ownerCustomer: Customer = {
    id: "owner-detail-001",
    name: "Bác Hùng (Chủ nhà)",
    nameNormalized: "bac hung chu nha",
    phone: "0908889999",
    demandType: "Ký gửi BĐS",
    propertyType: "Nhà",
    demandAreas: "Bình Thạnh",
    demandDirections: "Đông",
    priceMin: 5.0,
    priceMax: 5.0,
    note: "Ký gửi nhà phố",
    noteNormalized: "ky gui nha pho",
    role: CustomerRole.OWNER,
    status: CustomerStatus.ACTIVE,
    updatedAt: 1000,
    isSynced: true,
    isDeleted: false,
    avatarPath: null,
    avatarDriveUrl: null
  };

  const buyerCustomer: Customer = {
    id: "buyer-detail-001",
    name: "Anh Tuấn (Khách mua)",
    nameNormalized: "anh tuan khach mua",
    phone: "0901112222",
    demandType: "Cần mua",
    propertyType: "Nhà",
    demandAreas: "Bình Thạnh",
    demandDirections: "Đông",
    priceMin: 4.0,
    priceMax: 6.0,
    note: "Tìm mua nhà ở ngay",
    noteNormalized: "tim mua nha o ngay",
    role: CustomerRole.BUYER,
    status: CustomerStatus.ACTIVE,
    updatedAt: 1000,
    isSynced: true,
    isDeleted: false,
    avatarPath: null,
    avatarDriveUrl: null
  };

  const sampleProperty: Property = {
    id: "prop-001",
    area: "123 Lê Quang Định, Bình Thạnh",
    latitude: 10.801,
    longitude: 106.699,
    imagePath: null,
    driveMediaIds: null,
    driveFolderId: null,
    priceAtFolderCreation: null,
    documentUrl: "",
    areaSize: 60,
    price: 5.2,
    description: "Nhà đẹp",
    status: PropertyStatus.FOR_SALE,
    surveyDate: "2026-09-04",
    direction: "Đông",
    ownerName: "Bác Hùng",
    ownerPhone: "0908889999",
    propertyType: "Nhà",
    needToViewToday: false,
    isDraft: false,
    isTextSynced: false,
    rawText: "",
    diary: "",
    updatedAt: 1000,
    isDeleted: false,
    propertyDetailJsonFileId: null,
    txtFileId: null,
    isMediaSynced: false,
    linkedCustomerId: null,
    title: null,
    mapLink: null,
    extractedBy: null,
    createdAt: 1000,
    isVerified: true,
    lastEditedAt: 1000,
    r2MediaKeys: null
  };

  it("isEligibleForMatching trả về false cho OWNER và true cho BUYER", () => {
    expect(isBuyerSide(ownerCustomer)).toBe(false);
    expect(isEligibleForMatching(ownerCustomer)).toBe(false);

    expect(isBuyerSide(buyerCustomer)).toBe(true);
    expect(isEligibleForMatching(buyerCustomer)).toBe(true);
  });

  it("Khách hàng OWNER không được tính điểm MatchEngine gợi ý mua nhà", () => {
    const matchEngine = new MatchEngine();

    // Đối với BUYER: tính toán điểm bình thường
    const buyerScore = matchEngine.score(buyerCustomer, sampleProperty);
    expect(buyerScore.score).toBeGreaterThan(0);

    // Đối với OWNER: kiểm tra điều kiện bảo vệ (guard check)
    const eligible = isEligibleForMatching(ownerCustomer);
    expect(eligible).toBe(false);

    // Nếu không đủ điều kiện (eligible == false), danh sách gợi ý phải rỗng
    const matchesForOwner = eligible ? [matchEngine.score(ownerCustomer, sampleProperty)] : [];
    expect(matchesForOwner.length).toBe(0);
  });
});
