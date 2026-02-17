export interface Prompts {
  intro(title: string): void;
  outro(message: string): void;
  cancel(message: string): void;
  select<T>(opts: {
    message: string;
    options: { value: T; label?: string; hint?: string; disabled?: boolean; }[];
  }): Promise<T | symbol>;
  text(opts: { message: string; validate?: (value?: string) => string | undefined; }): Promise<string | symbol>;
  isCancel(value: unknown): value is symbol;
}
