import { readdirSync } from "node:fs"
import { join } from "node:path"
import { vi } from "vitest"
import * as projectModule from "./project.js"
import { DoctypeRole } from "./project.js"
import type { DoctypeFileEntry, ResolvedProject } from "./project.js"
import { abortError } from "./cli.js"
import { listBriefFiles, listSubcontexts } from "./subcontext.js"

// Real implementation of listDoctypeFilesAcrossSubcontexts for use in tests.
// The module is auto-mocked by vi.mock("./project.js"), so we provide the
// real logic here so commands work correctly under test.
function realListDoctypeFiles(
  project: ResolvedProject,
  doctypeKey: string,
): DoctypeFileEntry[] {
  const entry = project.doctypes[doctypeKey]

  if (entry.role === DoctypeRole.Subcontext) {
    return listBriefFiles(entry.dir)
  }

  if (entry.role !== DoctypeRole.Managed) {
    let files: string[] = []
    try {
      files = readdirSync(entry.dir)
    } catch {
      // treat missing dir as empty
    }
    return [{ dir: entry.dir, files }]
  }

  // managed doctype: scan across all subcontexts
  const subDoctypeKey = project.rawConfig.subcontextDoctype!
  const subEntry = project.doctypes[subDoctypeKey]
  const subcontextsAbsDir = subEntry.dir

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
    subcontextDoctype: undefined,
    managedDoctypes: [],
    projectFile: "/mock/.mcm.json",
    projectDir: "/mock",
    rawConfig: {
      extend: false,
      doctypes: {},
      sync: [],
      managedDoctypes: [],
    },
    currentSubcontext: false,
    ...overrides,
  })
  vi.spyOn(
    projectModule,
    "listDoctypeFilesAcrossSubcontexts",
  ).mockImplementation(realListDoctypeFiles)
  vi.spyOn(projectModule, "resolveDoctypeArg").mockImplementation(
    (project: ResolvedProject, doctype: string) => {
      if (doctype === "sub") {
        if (!project.rawConfig.subcontextDoctype) {
          abortError("No subcontext doctype configured")
        }
        return project.rawConfig.subcontextDoctype
      }
      return doctype
    },
  )
}
