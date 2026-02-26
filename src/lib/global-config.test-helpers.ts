import { vi } from "vitest"
import type { GlobalConfig } from "./global-config.js"
import * as globalConfigModule from "./global-config.js"

export function mockGlobalConfig(overrides?: Partial<GlobalConfig>): void {
  vi.spyOn(globalConfigModule, "getGlobalConfig").mockReturnValue({
    githubTokens: {},
    ...overrides,
  })
}
