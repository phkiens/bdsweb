import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Environment configuration requirements", () => {
  it("verifies .env.example exists in web/ and contains required keys", () => {
    const envExamplePath = path.resolve(__dirname, "../../.env.example");
    expect(fs.existsSync(envExamplePath)).toBe(true);

    const content = fs.readFileSync(envExamplePath, "utf-8");
    expect(content).toContain("VITE_SUPABASE_URL=");
    expect(content).toContain("VITE_SUPABASE_ANON_KEY=");
    expect(content).toContain("VITE_GEMINI_API_KEY=");
  });
});
