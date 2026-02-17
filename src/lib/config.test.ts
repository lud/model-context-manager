import { afterAll, describe, expect, it } from "vitest";
import { locateConfigFile } from "./config.js";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const fixtures = join(import.meta.dirname, "../../test/fixtures", "config-lookup");

describe("locateConfigFile", () => {
  it("finds .mcm.json in cwd", () => {
    const start = join(fixtures, "with-config");
    console.log(`start`, start)
    expect(locateConfigFile(start)).toBe(join(start, ".mcm.json"));
  });

  it("finds .mcm.json in ancestor directory", () => {
    const start = join(fixtures, "with-config", "nested", "deeply");
    expect(locateConfigFile(start)).toBe(
      join(fixtures, "with-config", ".mcm.json"),
    );
  });

  it("returns null when no config exists", () => {
    const start = join(fixtures, "without-config", "nested", "deeply");
    expect(locateConfigFile(start)).toBeNull();
  });

  const isRoot = process.getuid?.() === 0;
  const tmp = !isRoot ? mkdtempSync(join(tmpdir(), "mcm-test-")) : null;

  afterAll(() => {
    if (tmp) {
      chmodSync(join(tmp, "no-access"), 0o755);
      rmSync(tmp, { recursive: true });
    }
  });

  it.skipIf(isRoot)("returns null on permission error", () => {
    const noAccess = join(tmp!, "no-access");
    const child = join(noAccess, "child");
    mkdirSync(child, { recursive: true });
    chmodSync(noAccess, 0o000);

    expect(locateConfigFile(child)).toBeNull();
  });
});
