import ansis from "ansis"

export function write(text: string): void {
  process.stdout.write(text)
}

export function writeln(text: string): void {
  process.stdout.write(text + "\n")
}

export function info(text: string): void {
  writeln(text)
}

export function warning(text: string): void {
  writeln(ansis.yellow(text))
}

export function error(message: string | { message: string }): void {
  const text = typeof message === "string" ? message : message.message
  writeln(ansis.red(text))
}

export function debug(text: string): void {
  writeln(ansis.cyan(text))
}

export function success(text: string): void {
  writeln(ansis.greenBright(text))
}

export function abort(code = 1): never {
  process.exit(code)
}

export function abortError(message: string, code = 1): never {
  error(message)
  process.exit(code)
}
