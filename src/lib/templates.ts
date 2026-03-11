import type { RawConfig } from "./raw-config.js"

export type Template = {
  id: string
  label: string
  hint: string
  config: RawConfig
}

export function getTemplates (): Template[] {
  return [
    {
      id: "notes",
      label: "Notes",
      hint: "A single notes doctype",
      config: { doctypes: { notes: { dir: "notes" } } },
    },
    {
      id: "dev-project",
      label: "Feature project",
      hint: "Subcontexts for features with specs and tasks, and global ADRs",
      config: {
        doctypes: {
          adr: { dir: "context/adr" },
          specs: { dir: "specs" },
          tasks: { dir: "tasks" },
        },
        subcontexts: { dir: "features", doctypes: ["specs", "tasks"] },
      },
    },
  ]
}
