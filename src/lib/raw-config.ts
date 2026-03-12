export type RawDoctypeEntry = {
  dir: string
  sequenceScheme?: string
  sequenceSeparator?: string
}

export type RawConfig = {
  $schema?: string
  doctypes?: Record<string, RawDoctypeEntry>
  subcontextDoctype?: string
  managedDoctypes?: string[]
  sync?: unknown[]
}
