import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PropertyTextExtractor,
  UnverifiedPropertyType
} from "../../src/core/engine/property-text-extractor";
import {
  canonicalizeVietnamesePhone,
  normalizeSearch
} from "../../src/core/utils/vietnamese";

function locate(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "../build/regex-eval.jsonl"),
    path.resolve(process.cwd(), "build/regex-eval.jsonl"),
    path.resolve(__dirname, "../../../build/regex-eval.jsonl")
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) {
      return c;
    }
  }
  return null;
}

const file = locate();
const testOrSkip = file ? it : it.skip;

describe("PropertyTextExtractor Eval Test (Chấm điểm tin thật giống Android)", () => {
  testOrSkip("accuracy on verified listings does not regress", () => {
    if (!file) return;

    const content = fs.readFileSync(file, "utf-8");
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    const firstObj = JSON.parse(lines[0]);
    const areas: string[] = Array.isArray(firstObj.areas) ? firstObj.areas : [];

    const stats: Record<string, [number, number]> = {
      price: [0, 0],
      size: [0, 0],
      phone: [0, 0],
      dir: [0, 0],
      type: [0, 0],
      area: [0, 0]
    };

    function count(key: string, have: boolean, ok: boolean) {
      if (!have) return;
      stats[key][1]++;
      if (ok) stats[key][0]++;
    }

    for (let i = 1; i < lines.length; i++) {
      const o = JSON.parse(lines[i]);
      const rawText: string = typeof o.rawText === "string" ? o.rawText : "";
      const r = PropertyTextExtractor.parseWithRegex(rawText, areas);

      const price = typeof o.price === "number" ? o.price : null;
      count(
        "price",
        price !== null && price > 0,
        r.price !== null && price !== null && Math.abs(r.price - price) < 0.011
      );

      const size = typeof o.size === "number" ? o.size : null;
      count(
        "size",
        size !== null && size > 0,
        r.area !== null && size !== null && Math.abs(r.area - size) < 0.51
      );

      const phone = typeof o.phone === "string" ? o.phone : "";
      count(
        "phone",
        /\d/.test(phone),
        Boolean(r.ownerPhone && r.ownerPhone === canonicalizeVietnamesePhone(phone))
      );

      const dirStr = typeof o.dir === "string" ? o.dir : "";
      const dirs = new Set(
        dirStr
          .split("|||")
          .map((d) => d.trim())
          .filter((d) => d.length > 0)
      );
      count("dir", dirs.size > 0, Boolean(r.direction && dirs.has(r.direction)));

      const type = typeof o.type === "string" ? o.type : "";
      const gotType = r.propertyType === UnverifiedPropertyType.LAND ? "Đất" : "Nhà";
      count("type", type.trim().length > 0, gotType === type);

      const area = typeof o.area === "string" ? o.area : "";
      count(
        "area",
        area.trim().length > 0,
        Boolean(r.address && normalizeSearch(r.address) === normalizeSearch(area))
      );
    }

    const reportLines: string[] = [`samples=${lines.length - 1}`];
    for (const [k, v] of Object.entries(stats)) {
      const pct = (100.0 * v[0]) / Math.max(v[1], 1);
      reportLines.push(
        `${k.padEnd(6)} ${String(v[0]).padStart(4)}/${String(v[1]).padEnd(4)} = ${pct
          .toFixed(1)
          .padStart(5)}%`
      );
    }
    const report = reportLines.join("\n");
    console.log(report);

    try {
      const reportFile = path.resolve(path.dirname(file), "regex-eval-report.txt");
      fs.writeFileSync(reportFile, report, "utf-8");
    } catch {
      // Bỏ qua lỗi ghi file nếu thư mục chỉ đọc
    }

    // Ngưỡng = kết quả đo 30/09/2026 trừ ~2 điểm (trần thực tế: giá 83%, diện tích 87%, SĐT 71%)
    const min: Record<string, number> = {
      price: 0.77,
      size: 0.82,
      phone: 0.66,
      dir: 0.82,
      type: 0.92,
      area: 0.82
    };

    for (const [k, threshold] of Object.entries(min)) {
      const [ok, n] = stats[k];
      const ratio = n === 0 ? 1 : ok / n;
      expect(
        ratio >= threshold,
        `${k}: ${ok}/${n} dưới ngưỡng ${threshold}\n${report}`
      ).toBe(true);
    }
  });
});
