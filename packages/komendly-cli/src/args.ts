/** Tiny argv parser: `--flag`, `--flag value`, `--flag=value`, repeatable string flags, `--` ends flags. */
export interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Record<string, string | boolean>;
  files: string[];
}

export type ParseResult = { ok: true; args: ParsedArgs } | { ok: false; error: string };

const BOOLEAN_FLAGS = new Set(["json", "wait", "animated", "help", "version", "no-wait"]);
const STRING_FLAGS = new Set(["key", "out", "file", "type", "session", "limit", "base-url", "timeout"]);
const SHORT: Record<string, string> = { h: "help", v: "version", o: "out", f: "file", w: "wait" };

export function parseArgs(argv: readonly string[]): ParseResult {
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};
  const files: string[] = [];
  let i = 0;
  let rest = false;
  while (i < argv.length) {
    const token = argv[i] ?? "";
    i += 1;
    if (rest || token === "-" || !token.startsWith("-")) {
      positionals.push(token);
      continue;
    }
    if (token === "--") {
      rest = true;
      continue;
    }
    let name: string;
    let inline: string | undefined;
    if (token.startsWith("--")) {
      const eq = token.indexOf("=");
      name = eq === -1 ? token.slice(2) : token.slice(2, eq);
      inline = eq === -1 ? undefined : token.slice(eq + 1);
    } else {
      const long = SHORT[token.slice(1)];
      if (!long) return { ok: false, error: `Unknown option ${token}` };
      name = long;
    }
    if (BOOLEAN_FLAGS.has(name)) {
      if (inline !== undefined) return { ok: false, error: `--${name} doesn't take a value` };
      flags[name] = true;
      continue;
    }
    if (!STRING_FLAGS.has(name)) return { ok: false, error: `Unknown option --${name}` };
    let value = inline;
    if (value === undefined) {
      value = argv[i];
      i += 1;
    }
    if (value === undefined || value === "") return { ok: false, error: `--${name} needs a value` };
    if (name === "file") files.push(value);
    else flags[name] = value;
  }
  const [command, ...pos] = positionals;
  return { ok: true, args: { command, positionals: pos, flags, files } };
}

export function flagString(args: ParsedArgs, name: string): string | undefined {
  const v = args.flags[name];
  return typeof v === "string" ? v : undefined;
}

export function flagBool(args: ParsedArgs, name: string): boolean {
  return args.flags[name] === true;
}
