import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"
import type { GitHubUpstream, LocalFsUpstream } from "./project.js"
import { cloneRepo } from "./github.js"

export type SyncResult =
  | { status: "synced" }
  | { status: "skipped"; reason: string }
  | { status: "deleted_target" }
  | { status: "error"; message: string }

export interface SyncReporter {
  onCopied(path: string): void
  onDeleted(path: string): void
}

export type ResolvedSource =
  | { found: true; path: string; type: "file" | "directory" }
  | { found: false }

export type SourceHandle = {
  source: ResolvedSource
  cleanup?: () => void
}

export type GitHubSourceError = {
  error: "auth_required" | "auth_failed" | "network_error"
  repo: string
  message: string
}

export type GitHubResolveResult = SourceHandle | GitHubSourceError

// --- Resolvers ---

export function resolveLocalSource(upstream: LocalFsUpstream): SourceHandle {
  const sourcePath = upstream.path
  if (!existsSync(sourcePath)) {
    return { source: { found: false } }
  }
  const stat = statSync(sourcePath)
  return {
    source: {
      found: true,
      path: sourcePath,
      type: stat.isDirectory() ? "directory" : "file",
    },
  }
}

export function resolveGitHubSource(
  upstream: GitHubUpstream,
  token?: string,
): GitHubResolveResult {
  const tmpDir = mkdtempSync(join(tmpdir(), "mcm-github-"))
  const cloneResult = cloneRepo(upstream.repo, tmpDir, token)

  if (!cloneResult.success) {
    rmSync(tmpDir, { recursive: true, force: true })
    if (isNetworkError(cloneResult.stderr)) {
      return {
        error: "network_error",
        message: cloneResult.stderr,
        repo: upstream.repo,
      }
    }
    return token
      ? {
          error: "auth_failed",
          message: "Authentication error",
          repo: upstream.repo,
        }
      : {
          error: "auth_required",
          message: "Authentication error",
          repo: upstream.repo,
        }
  }

  rmSync(join(tmpDir, ".git"), { recursive: true, force: true })
  const sourcePath = join(tmpDir, upstream.path)

  const cleanup = () => rmSync(tmpDir, { recursive: true, force: true })

  if (!existsSync(sourcePath)) {
    return {
      source: { found: false },
      cleanup,
    }
  }

  const stat = statSync(sourcePath)
  return {
    source: {
      found: true,
      path: sourcePath,
      type: stat.isDirectory() ? "directory" : "file",
    },
    cleanup,
  }
}

// --- Copy engine ---

export function applyCopy(
  source: ResolvedSource,
  local: string,
  mode: "receive_merge" | "receive_mirror",
  reporter: SyncReporter,
): SyncResult {
  if (!source.found) {
    if (mode === "receive_merge") {
      return { status: "skipped", reason: "Source does not exist" }
    }
    if (existsSync(local)) {
      rmSync(local, { recursive: true, force: true })
      reporter.onDeleted(local)
      return { status: "deleted_target" }
    }
    return { status: "skipped", reason: "Source does not exist" }
  }

  if (
    source.type === "directory" &&
    existsSync(local) &&
    statSync(local).isFile()
  ) {
    return {
      status: "error",
      message: `Source is a directory but target is a file: ${local}`,
    }
  }

  if (source.type === "file") {
    mkdirSync(join(local, ".."), { recursive: true })
    copyFileSync(source.path, local)
    reporter.onCopied(local)
    return { status: "synced" }
  }

  copyDirContents(source.path, local, mode, reporter)
  return { status: "synced" }
}

function copyDirContents(
  sourceDir: string,
  targetDir: string,
  mode: "receive_merge" | "receive_mirror",
  reporter: SyncReporter,
): void {
  mkdirSync(targetDir, { recursive: true })

  const sourceEntries = new Set(readdirSync(sourceDir))

  for (const entry of sourceEntries) {
    const srcPath = join(sourceDir, entry)
    const dstPath = join(targetDir, entry)
    const srcStat = statSync(srcPath)

    if (srcStat.isDirectory()) {
      copyDirContents(srcPath, dstPath, mode, reporter)
    } else {
      copyFileSync(srcPath, dstPath)
      reporter.onCopied(dstPath)
    }
  }

  if (mode === "receive_mirror") {
    for (const entry of readdirSync(targetDir)) {
      if (!sourceEntries.has(entry)) {
        const dstPath = join(targetDir, entry)
        rmSync(dstPath, { recursive: true, force: true })
        reporter.onDeleted(dstPath)
      }
    }
  }
}

// --- Internal helpers ---

function isNetworkError(stderr: string): boolean {
  return (
    stderr.includes("Could not resolve host") ||
    stderr.includes("Failed to connect") ||
    stderr.includes("RPC failed") ||
    stderr.includes("Connection timed out") ||
    stderr.includes("SSL_ERROR")
  )
}
