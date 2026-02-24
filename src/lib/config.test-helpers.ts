import { vi } from "vitest"
import * as configModule from "./config.js"
import type { ResolvedConfig } from "./config.js"

export function mockConfig(overrides: Partial<ResolvedConfig> = {}): void {
  vi.spyOn(configModule, "getConfig").mockReturnValue({
    extend: false,
    doctypes: {},
    configFile: "/mock/.mcm.json",
    configDir: "/mock",
    ...overrides,
  })
}
