import { describe, it, expect } from "vitest";
import { formatPropertyPrice } from "../../src/core/utils/property-price";

describe("formatPropertyPrice (Pure Unit Tests)", () => {
  it("loại bỏ float noise IEEE 754 (2.78999996185303 => 2.79 tỷ)", () => {
    expect(formatPropertyPrice(2.78999996185303)).toBe("2.79 tỷ");
  });

  it("bảo toàn độ chính xác triệu với 3 chữ số thập phân (2.499 => 2.499 tỷ, 3.368 => 3.368 tỷ)", () => {
    expect(formatPropertyPrice(2.499)).toBe("2.499 tỷ");
    expect(formatPropertyPrice(3.368)).toBe("3.368 tỷ");
  });

  it("loại bỏ số 0 vô nghĩa ở phần thập phân (3 => 3 tỷ, 15.5 => 15.5 tỷ)", () => {
    expect(formatPropertyPrice(3)).toBe("3 tỷ");
    expect(formatPropertyPrice(15.5)).toBe("15.5 tỷ");
  });

  it("giá dưới 1 tỷ hiển thị triệu làm tròn (0.85 => 850 triệu, 0.9500000001 => 950 triệu)", () => {
    expect(formatPropertyPrice(0.85)).toBe("850 triệu");
    expect(formatPropertyPrice(0.9500000001)).toBe("950 triệu");
  });

  it("làm tròn triệu đạt ngưỡng 1000 triệu thì chuyển thành 1 tỷ (0.999999999 => 1 tỷ)", () => {
    expect(formatPropertyPrice(0.999999999)).toBe("1 tỷ");
  });

  it("giá trị 0, null, undefined, NaN, Infinity, -Infinity và số âm trả về null", () => {
    expect(formatPropertyPrice(0)).toBeNull();
    expect(formatPropertyPrice(null)).toBeNull();
    expect(formatPropertyPrice(undefined)).toBeNull();
    expect(formatPropertyPrice(NaN)).toBeNull();
    expect(formatPropertyPrice(Infinity)).toBeNull();
    expect(formatPropertyPrice(-Infinity)).toBeNull();
    expect(formatPropertyPrice(-1)).toBeNull();
    expect(formatPropertyPrice(-0.5)).toBeNull();
  });

  it("giữ nguyên giá trị nguồn lớn không tự động đoán sai đơn vị (850 => 850 tỷ)", () => {
    expect(formatPropertyPrice(850)).toBe("850 tỷ");
  });

  it("không làm thay đổi đối tượng hoặc thuộc tính đầu vào sau khi format", () => {
    const mockProperty = { id: "p1", price: 2.78999996185303 };
    const formatted = formatPropertyPrice(mockProperty.price);
    expect(formatted).toBe("2.79 tỷ");
    expect(mockProperty.price).toBe(2.78999996185303);
  });
});
