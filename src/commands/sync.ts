import { command } from "cleye"
import * as p from "@clack/prompts"
import { getProject } from "../lib/project.js"
import type { ResolvedSyncSpec } from "../lib/project.js"
import {
  getGlobalConfig,
  saveGlobalConfig,
  normalizeGithubUrl,
} from "../lib/global-config.js"
import type { GlobalConfig } from "../lib/global-config.js"
import {
  resolveLocalSource,
  resolveGitHubSource,
  applyCopy,
} from "../lib/sync.js"
import type {
  SyncResult,
  SyncReporter,
  SourceHandle,
  GitHubResolveResult,
} from "../lib/sync.js"

export const MAX_NETWORK_RETRIES = 3

function clackReporter(): SyncReporter {
  return {
    onCopied: (path) => p.log.step(`Copied ${path}`),
    onDeleted: (path) => p.log.warning(`Deleted ${path}`),
  }
}

function makeLabel(spec: ResolvedSyncSpec): string {
  if (spec.upstream.kind === "github") {
    return `${spec.upstream.repo}:${spec.upstream.path} → ${spec.local}`
  }
  return `${spec.upstream.path} → ${spec.local}`
}

export const syncCommand = command(
  {
    name: "sync",
    help: { description: "Sync files from upstream sources into the project" },
  },
  async () => {
    const project = getProject()

    if (project.sync.length === 0) {
      p.log.warning("No synchronisation is configured in .mcm.json")
      return
    }

    p.intro("Syncing files")

    const reporter = clackReporter()

    const resolvers: Record<
      string,
      (spec: ResolvedSyncSpec) => Promise<SourceHandle | null>
    > = {
      localfs: async (spec) =>
        resolveLocalSource(spec.upstream as { kind: "localfs"; path: string }),
      github: async (spec) => resolveGitHubWithAuth(spec),
    }

    for (const spec of project.sync) {
      const label = makeLabel(spec)
      p.log.info(`Syncing ${label} (${spec.mode})`)

      const resolve = resolvers[spec.upstream.kind]
      if (!resolve) {
        p.log.error(`Unknown upstream kind: ${spec.upstream.kind}`)
        continue
      }

      let handle: SourceHandle | null = null
      try {
        handle = await resolve(spec)
        if (!handle) continue
        const result = applyCopy(handle.source, spec.local, spec.mode, reporter)
        reportSyncResult(result, label, spec.local)
        if (result.status === "error") process.exit(1)
      } finally {
        handle?.cleanup?.()
      }
    }

    p.outro("Done")
  },
)

async function resolveGitHubWithAuth(
  spec: ResolvedSyncSpec,
): Promise<SourceHandle | null> {
  const upstream = spec.upstream as {
    kind: "github"
    repo: string
    path: string
  }
  const repoKey = normalizeGithubUrl(upstream.repo)
  const globalConfig = getGlobalConfig()
  let token: string | undefined = globalConfig.githubTokens[repoKey]

  let result: GitHubResolveResult = resolveGitHubSource(upstream, token)

  // Network error: auto-retry
  let retries = MAX_NETWORK_RETRIES
  while ("error" in result && result.error === "network_error" && retries > 0) {
    p.log.warning(`Network error, retrying...`)
    result = resolveGitHubSource(upstream, token)
    retries--
  }
  if ("error" in result && result.error === "network_error") {
    p.log.error(`Network error: ${result.message}`)
    return null
  }

  // Auth required: no token stored for this repo
  if ("error" in result && result.error === "auth_required") {
    const newToken = await promptToken(upstream.repo, globalConfig)
    if (newToken === null) return null
    token = newToken
    globalConfig.githubTokens[repoKey] = token
    saveGlobalConfig(globalConfig)
    result = resolveGitHubSource(upstream, token)
  }

  // Auth failed: stored/provided token was rejected
  if ("error" in result && result.error === "auth_failed") {
    p.log.error(`Authentication failed for ${upstream.repo}`)
    const action = await p.select({
      message: "What would you like to do?",
      options: [
        { value: "retry", label: "Enter a new token and retry" },
        { value: "skip", label: "Skip this sync" },
      ],
    })
    if (p.isCancel(action) || action === "skip") return null
    const newToken = await promptToken(upstream.repo, globalConfig)
    if (newToken === null) return null
    token = newToken
    globalConfig.githubTokens[repoKey] = token
    saveGlobalConfig(globalConfig)
    result = resolveGitHubSource(upstream, token)
  }

  // Catch any remaining GitHub-specific failures
  if ("error" in result) {
    p.log.error(`Could not sync: ${result.error}`)
    return null
  }

  return result
}

async function promptToken(
  repo: string,
  globalConfig: GlobalConfig,
): Promise<string | null> {
  const repoKey = normalizeGithubUrl(repo)
  const otherEntries = Object.entries(globalConfig.githubTokens).filter(
    ([url]) => url !== repoKey,
  )

  if (otherEntries.length > 0) {
    const selected = await p.select({
      message: `Select a token for ${repo}`,
      options: [
        ...otherEntries.map(([url]) => ({ value: url, label: url })),
        { value: "__new__", label: "Enter a new token" },
      ],
    })
    if (p.isCancel(selected)) return null
    if (selected !== "__new__") {
      return globalConfig.githubTokens[selected as string] ?? null
    }
  }

  p.note(
    `Create a token at:\nhttps://github.com/settings/personal-access-tokens/new\nGrant "Contents: read" access to ${repo}`,
  )
  const entered = await p.password({
    message: "Paste GitHub personal access token:",
  })
  if (p.isCancel(entered)) return null
  return entered as string
}

function reportSyncResult(
  result: SyncResult,
  label: string,
  local: string,
): void {
  switch (result.status) {
    case "synced":
      p.log.success(`Synced ${label}`)
      break
    case "skipped":
      p.log.warning(`Skipped: ${result.reason}`)
      break
    case "deleted_target":
      p.log.warning(`Deleted target: ${local}`)
      break
    case "error":
      p.log.error(result.message)
      break
  }
}
