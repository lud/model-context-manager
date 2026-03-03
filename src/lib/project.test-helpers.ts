import { readdirSync } from "node:fs"
import { isAbsolute, join } from "node:path"
import { vi } from "vitest"
import * as projectModule from "./project.js"
import type { DoctypeFileEntry, ResolvedProject } from "./project.js"
import { listSubcontexts } from "./subcontext.js"

// Real implementation of listDoctypeFilesAcrossSubcontexts for use in tests.
// The module is auto-mocked by vi.mock("./project.js"), so we provide the
// real logic here so commands work correctly under test.
function realListDoctypeFiles(
  project: ResolvedProject,
  doctypeKey: string,
): DoctypeFileEntry[] {
  const entry = project.doctypes[doctypeKey]
  if (!entry.inSubcontext) {
    let files: string[] = []
    try {
      files = readdirSync(entry.dir)
    } catch {
      // treat missing dir as empty
    }
    return [{ dir: entry.dir, files }]
  }
  const rawSubcontextsDir = project.rawConfig.subcontexts!.dir
  const subcontextsAbsDir = isAbsolute(rawSubcontextsDir)
    ? rawSubcontextsDir
    : join(project.projectDir, rawSubcontextsDir)
  const subDirs = listSubcontexts(subcontextsAbsDir)
  const rawDoctypeDir = project.rawConfig.doctypes[doctypeKey].dir
  return subDirs.map((subDir) => {
    const dir = join(subcontextsAbsDir, subDir, rawDoctypeDir)
    let files: string[] = []
    try {
      files = readdirSync(dir)
    } catch {
      // silently skip missing dirs
    }
    return { dir, files }
  })
}

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
  vi.spyOn(
    projectModule,
    "listDoctypeFilesAcrossSubcontexts",
  ).mockImplementation(realListDoctypeFiles)
}
