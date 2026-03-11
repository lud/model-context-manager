export type RawDoctypeEntry = {
  dir: string
  sequenceScheme?: string
  sequenceSeparator?: string
}

export type RawSubcontexts = {
  dir: string
  doctypes: string[]
}

export type RawConfig = {
  $schema?: string
  doctypes?: Record<string, RawDoctypeEntry>
  subcontexts?: RawSubcontexts
  sync?: unknown[]
}
