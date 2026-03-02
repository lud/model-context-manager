import {
  readdirSync as _readdirSync,
  readFileSync as _readFileSync,
  writeFileSync as _writeFileSync,
} from "node:fs"
import type {
  Dirent,
  ObjectEncodingOptions,
  PathLike,
  PathOrFileDescriptor,
  WriteFileOptions,
} from "node:fs"
import { abortError } from "./cli.js"

function readdirErrorMessage(path: string, err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  switch (code) {
    case "ENOENT":
      return `directory not found: ${path}`
    case "EACCES":
      return `permission denied: ${path}`
    case "ENOTDIR":
      return `not a directory: ${path}`
    default:
      return `failed to read directory: ${path}`
  }
}

function readFileErrorMessage(path: string, err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  switch (code) {
    case "ENOENT":
      return `file not found: ${path}`
    case "EACCES":
      return `permission denied: ${path}`
    case "EISDIR":
      return `path is a directory: ${path}`
    default:
      return `failed to read file: ${path}`
  }
}

function writeFileErrorMessage(path: string, err: unknown): string {
  const code = (err as NodeJS.ErrnoException).code
  switch (code) {
    case "ENOENT":
      return `directory not found: ${path}`
    case "EACCES":
      return `permission denied to write: ${path}`
    case "EISDIR":
      return `path is a directory: ${path}`
    default:
      return `failed to write file: ${path}`
  }
}

export function readdirSyncOrAbort(
  path: PathLike,
  options: ObjectEncodingOptions & { withFileTypes: true },
): Dirent[]
export function readdirSyncOrAbort(
  path: PathLike,
  options?: BufferEncoding | null,
): string[]
export function readdirSyncOrAbort(path: PathLike, options?: unknown): unknown {
  try {
    return _readdirSync(path, options as never)
  } catch (err) {
    abortError(readdirErrorMessage(String(path), err))
  }
}

export function readFileSyncOrAbort(
  path: PathOrFileDescriptor,
  options: BufferEncoding | { encoding: BufferEncoding; flag?: string },
): string
export function readFileSyncOrAbort(
  path: PathOrFileDescriptor,
  options?: (ObjectEncodingOptions & { flag?: string }) | null,
): string | Buffer
export function readFileSyncOrAbort(
  path: PathOrFileDescriptor,
  options?: unknown,
): unknown {
  try {
    return _readFileSync(path, options as never)
  } catch (err) {
    abortError(readFileErrorMessage(String(path), err))
  }
}

export function writeFileSyncOrAbort(
  file: PathOrFileDescriptor,
  data: string | NodeJS.ArrayBufferView,
  options?: WriteFileOptions,
): void {
  try {
    _writeFileSync(file, data, options)
  } catch (err) {
    abortError(writeFileErrorMessage(String(file), err))
  }
}
