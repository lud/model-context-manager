import { execFileSync } from "node:child_process"

export type CloneResult =
  | { success: true; dir: string }
  | { success: false; exitCode: number; stderr: string }

export function cloneRepo(
  repo: string,
  targetDir: string,
  token?: string,
): CloneResult {
  const auth = token ? `x-access-token:${token}@` : ""
  const url = `https://${auth}github.com/${repo}.git`
  try {
    execFileSync("git", ["clone", "--depth", "1", "--", url, targetDir], {
      stdio: "pipe",
      timeout: 60_000,
    })
    return { success: true, dir: targetDir }
  } catch (err: unknown) {
    const e = err as { status?: number | null; stderr?: Buffer }
    return {
      success: false,
      exitCode: e.status ?? 1,
      stderr: e.stderr?.toString("utf-8") ?? "",
    }
  }
}
