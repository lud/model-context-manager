import { vi } from "vitest"
import * as projectModule from "./project.js"
import type { ResolvedProject } from "./project.js"

export function mockProject(overrides: Partial<ResolvedProject> = {}): void {
  vi.spyOn(projectModule, "getProject").mockReturnValue({
    extend: false,
    doctypes: {},
    sync: [],
    projectFile: "/mock/.mcm.json",
    projectDir: "/mock",
    rawConfig: { extend: false, doctypes: {}, sync: [] },
    currentSubcontext: false,
    ...overrides,
  })
}
