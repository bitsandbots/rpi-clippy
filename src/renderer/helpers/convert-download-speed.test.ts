import { describe, it, expect } from "vitest";
import { prettyDownloadSpeed } from "./convert-download-speed";

describe("prettyDownloadSpeed", () => {
  it("formats 0 bytes/s", () => {
    expect(prettyDownloadSpeed(0)).toBe("0.00 B");
  });

  it("formats sub-kilobyte values as bytes", () => {
    expect(prettyDownloadSpeed(512)).toBe("512.00 B");
    expect(prettyDownloadSpeed(1023)).toBe("1023.00 B");
  });

  it("formats exactly 1 KB", () => {
    expect(prettyDownloadSpeed(1024)).toBe("1.00 KB");
  });

  it("formats fractional KB", () => {
    expect(prettyDownloadSpeed(1536)).toBe("1.50 KB");
  });

  it("formats exactly 1 MB", () => {
    expect(prettyDownloadSpeed(1024 * 1024)).toBe("1.00 MB");
  });

  it("formats fractional MB", () => {
    expect(prettyDownloadSpeed(1.5 * 1024 * 1024)).toBe("1.50 MB");
  });

  it("formats exactly 1 GB", () => {
    expect(prettyDownloadSpeed(1024 ** 3)).toBe("1.00 GB");
  });

  it("formats exactly 1 TB", () => {
    expect(prettyDownloadSpeed(1024 ** 4)).toBe("1.00 TB");
  });

  it("always uses two decimal places", () => {
    const result = prettyDownloadSpeed(1000);
    expect(result).toMatch(/\d+\.\d{2} \w+/);
  });
});
