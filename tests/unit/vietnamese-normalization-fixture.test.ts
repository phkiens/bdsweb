import { describe, it, expect } from "vitest";
import fixture from "../fixtures/vietnamese-normalization.v1.json";
import { normalizeVietnamese, canonicalizeVietnamesePhone } from "../../src/core/utils/vietnamese";

describe("CANONICAL FIXTURE TEST: Vietnamese & Phone Normalization (TASK 14)", () => {
  it("toàn vẹn cấu trúc file fixture (integrity check)", () => {
    expect(fixture.version).toBe("1.0");
    expect(fixture.contract).toBe("vietnamese-normalization");
    expect(fixture.name_cases.length).toBeGreaterThan(0);
    expect(fixture.phone_cases.length).toBeGreaterThan(0);
  });

  describe("Chuẩn hóa tên / chuỗi tiếng Việt (normalizeVietnamese)", () => {
    for (const testCase of fixture.name_cases) {
      it(`[${testCase.id}] ${testCase.description}: "${testCase.input}" -> "${testCase.expected}"`, () => {
        const actual = normalizeVietnamese(testCase.input);
        expect(actual).toBe(testCase.expected);
      });
    }
  });

  describe("Chuẩn hóa số điện thoại Việt Nam (canonicalizeVietnamesePhone)", () => {
    for (const testCase of fixture.phone_cases) {
      it(`[${testCase.id}] ${testCase.description}: "${testCase.input}" -> "${testCase.expected}"`, () => {
        const actual = canonicalizeVietnamesePhone(testCase.input);
        expect(actual).toBe(testCase.expected);
      });
    }
  });
});
