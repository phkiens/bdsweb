import { describe, expect, it } from "vitest";
import {
  encodeListingTexts,
  decodeListingTexts,
  appendContactLine,
  buildPropertyShareBody,
  CONTACT_LINE,
  LISTING_TEXTS_PREFIX
} from "../../src/core/utils/listing-text";
import { Property } from "../../src/core/models/property";

describe("ListingTextCodec: encode & decode", () => {
  it("xử lý chuỗi thường: encode giữ nguyên, decode trả về first và second rỗng", () => {
    const raw = "Bán nhà hẻm 5m đường Xô Viết Nghệ Tĩnh";
    const encoded = encodeListingTexts(raw, "");
    expect(encoded).toBe(raw);

    const decoded = decodeListingTexts(raw);
    expect(decoded.first).toBe(raw);
    expect(decoded.second).toBe("");
  });

  it("xử lý có Tin 2: encode đóng gói tiền tố và JSON, decode đọc đủ 2 tin", () => {
    const tin1 = "Nội dung Tin 1 chi tiết";
    const tin2 = "Nội dung Tin 2 ngắn gọn đăng mạng";
    const encoded = encodeListingTexts(tin1, tin2);

    expect(encoded.startsWith(LISTING_TEXTS_PREFIX)).toBe(true);
    expect(encoded).toBe(`${LISTING_TEXTS_PREFIX}${JSON.stringify({ first: tin1, second: tin2 })}`);

    const decoded = decodeListingTexts(encoded);
    expect(decoded.first).toBe(tin1);
    expect(decoded.second).toBe(tin2);
  });

  it("xử lý chuỗi bắt đầu bằng tiền tố: luôn phải đóng gói JSON kể cả khi Tin 2 rỗng", () => {
    const prefixedFirst = `${LISTING_TEXTS_PREFIX} mẫu tin nhắn đặc biệt`;
    const encoded = encodeListingTexts(prefixedFirst, "");

    expect(encoded.startsWith(LISTING_TEXTS_PREFIX)).toBe(true);
    expect(encoded).toBe(`${LISTING_TEXTS_PREFIX}${JSON.stringify({ first: prefixedFirst, second: "" })}`);

    const decoded = decodeListingTexts(encoded);
    expect(decoded.first).toBe(prefixedFirst);
    expect(decoded.second).toBe("");
  });

  it("xử lý JSON hỏng: decode an toàn trả về first là chuỗi gốc và second rỗng", () => {
    const malformed = `${LISTING_TEXTS_PREFIX}{invalid: json content...`;
    const decoded = decodeListingTexts(malformed);

    expect(decoded.first).toBe(malformed);
    expect(decoded.second).toBe("");
  });

  it("xử lý thiếu trường hoặc sai kiểu: decode an toàn trả về first là chuỗi gốc và second rỗng", () => {
    const missingSecond = `${LISTING_TEXTS_PREFIX}{"first":"Tin một"}`;
    expect(decodeListingTexts(missingSecond)).toEqual({
      first: missingSecond,
      second: ""
    });

    const missingFirst = `${LISTING_TEXTS_PREFIX}{"second":"Tin hai"}`;
    expect(decodeListingTexts(missingFirst)).toEqual({
      first: missingFirst,
      second: ""
    });

    const wrongTypes = `${LISTING_TEXTS_PREFIX}{"first":12345,"second":"Tin hai"}`;
    expect(decodeListingTexts(wrongTypes)).toEqual({
      first: wrongTypes,
      second: ""
    });
  });

  it("xử lý chuỗi rỗng: encode và decode đều xử lý an toàn", () => {
    expect(decodeListingTexts("")).toEqual({ first: "", second: "" });
    expect(decodeListingTexts(null)).toEqual({ first: "", second: "" });
    expect(decodeListingTexts(undefined)).toEqual({ first: "", second: "" });

    expect(encodeListingTexts("", "")).toBe("");
  });
});

describe("ListingContactLine: appendContactLine", () => {
  it("đã có số dạng emoji: giữ nguyên text", () => {
    const textWithEmoji = `Cần bán nhà gấp\n${CONTACT_LINE}`;
    expect(appendContactLine(textWithEmoji)).toBe(textWithEmoji);
  });

  it("đã có số thường: giữ nguyên text", () => {
    const textWithPlainPhone = "Liên hệ chính chủ 0963722498 để xem nhà trực tiếp";
    expect(appendContactLine(textWithPlainPhone)).toBe(textWithPlainPhone);

    const textWithDotPhone = "Hotline tư vấn: 0963.722.498 gặp Mr. An";
    expect(appendContactLine(textWithDotPhone)).toBe(textWithDotPhone);
  });

  it("text rỗng: trả về đúng CONTACT_LINE", () => {
    expect(appendContactLine("")).toBe(CONTACT_LINE);
  });

  it("text có khoảng trắng cuối: trim khoảng trắng và xuống dòng gắn CONTACT_LINE", () => {
    const rawText = "Bán nhà mặt tiền hẻm xe hơi Quận Bình Thạnh   \n\t  ";
    const expected = `Bán nhà mặt tiền hẻm xe hơi Quận Bình Thạnh\n${CONTACT_LINE}`;
    expect(appendContactLine(rawText)).toBe(expected);
  });
});

describe("PropertyShare: buildPropertyShareBody", () => {
  const baseProperty: Partial<Property> = {
    area: "Phường 25, Quận Bình Thạnh",
    price: 4.5,
    areaSize: 65.5,
    propertyType: "Nhà",
    direction: "Đông Nam",
    ownerName: "Anh Nam",
    ownerPhone: "0901234567",
    latitude: 10.801234,
    longitude: 106.711234
  };

  it("mặc định không có SĐT chủ", () => {
    const shareBody = buildPropertyShareBody(baseProperty, "Nhà mới xây đẹp vào ở ngay", {
      includeBasic: true,
      includeDesc: true,
      includeLocation: false,
      includeOwner: false
    });

    expect(shareBody).toContain("📢 BĐS ĐẸP ĐANG BÁN:");
    expect(shareBody).toContain("📍 Khu vực: Phường 25, Quận Bình Thạnh");
    expect(shareBody).toContain("💰 Giá: 4.5 tỷ");
    expect(shareBody).toContain("📐 Diện tích: 65.5 m²");
    expect(shareBody).toContain("🏠 Loại hình: Nhà");
    expect(shareBody).toContain("🧭 Hướng: Đông Nam");
    expect(shareBody).toContain("📝 Mô tả: Nhà mới xây đẹp vào ở ngay");

    expect(shareBody).not.toContain("0901234567");
    expect(shareBody).not.toContain("Anh Nam");
    expect(shareBody).not.toContain("📞 Liên hệ:");
    expect(shareBody).not.toContain("📌 Định vị:");
  });

  it("bật Chủ nhà thì có 📞 Liên hệ: tên - SĐT", () => {
    const shareBody = buildPropertyShareBody(baseProperty, "Mô tả", {
      includeBasic: true,
      includeDesc: true,
      includeLocation: false,
      includeOwner: true
    });

    expect(shareBody).toContain("📞 Liên hệ: Anh Nam - 0901234567");
  });

  it("bật Định vị có link Google Maps", () => {
    const shareBody = buildPropertyShareBody(baseProperty, "Mô tả", {
      includeBasic: true,
      includeDesc: true,
      includeLocation: true,
      includeOwner: false
    });

    expect(shareBody).toContain(
      "📌 Định vị: https://www.google.com/maps/search/?api=1&query=10.801234,106.711234"
    );
  });

  it("hướng nhiều giá trị ||| chỉ lấy hướng đầu", () => {
    const multiDirProperty: Partial<Property> = {
      ...baseProperty,
      direction: "Đông Nam|||Tây Nam|||Chính Bắc"
    };

    const shareBody = buildPropertyShareBody(multiDirProperty, "Mô tả", {
      includeBasic: true,
      includeDesc: true,
      includeLocation: false,
      includeOwner: false
    });

    expect(shareBody).toContain("🧭 Hướng: Đông Nam");
    expect(shareBody).not.toContain("Tây Nam");
    expect(shareBody).not.toContain("Chính Bắc");
    expect(shareBody).not.toContain("|||");
  });
});
