import { vi } from "vitest"
import * as configModule from "./config.js"
import type { Config } from "./config.js"

export function mockConfig(overrides: Partial<Config> = {}): void {
  vi.spyOn(configModule, "getConfig").mockReturnValue({
    extend: false,
    ...overrides,
  })
}
