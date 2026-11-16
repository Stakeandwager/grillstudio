import { describe, it, expect } from "vitest";
import { scan, scanText } from "../../scripts/check-secrets.mjs";

describe("secret scanner", () => {
  it("detects known credential shapes", () => {
    expect(scanText(`const k = "sk-ant-api03-${"a".repeat(40)}"`)).toContain("Anthropic API key");
    expect(scanText(`AIza${"B".repeat(35)}`)).toContain("Google API key");
    expect(scanText(`ghp_${"c".repeat(36)}`)).toContain("GitHub token");
    expect(scanText("-----BEGIN PRIVATE KEY-----")).toContain("Private key block");
  });

  it("does not flag placeholders used in the UI", () => {
    expect(scanText('placeholder="YouTube Data API key (AIza…)"')).toEqual([]);
    expect(scanText("process.env.ANTHROPIC_API_KEY")).toEqual([]);
  });

  it("finds no credentials in the repository", () => {
    expect(scan()).toEqual([]);
  });
});
