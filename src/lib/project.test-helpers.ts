import { vi } from "vitest"
import * as projectModule from "./project.js"
import type { ResolvedProject } from "./project.js"

export function mockProject(overrides: Partial<ResolvedProject> = {}): void {
  vi.spyOn(projectModule, "getProject").mockReturnValue({
    extend: false,
    doctypes: {},
    projectFile: "/mock/.mcm.json",
    projectDir: "/mock",
    ...overrides,
  })
}
