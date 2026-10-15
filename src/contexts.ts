import { Effect } from "effect";
import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, rename } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { CliError, configError, usage } from "./errors.ts";
import { CONFIG_LIMIT, nonEmpty, parseConfigObject, readPrivateFile, validateBaseUrl } from "./private-config.ts";

export type Context = {
  readonly baseUrl: string;
  readonly apiKeyFile: string;
};

export type ContextsFile = {
  readonly currentContext: string | null;
  readonly contexts: Readonly<Record<string, Context>>;
};

export const contextsPath = (): string =>
  join(process.env.HOME || homedir(), ".config/dagu-cli/contexts.json");

const checkName = (name: string): string => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) {
    throw configError("Invalid context name; use 1–64 letters, digits, underscores, or hyphens, starting with a letter or digit.");
  }
  return name;
};

const parseContext = (value: unknown): Context => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw configError("Context must be an object.");
  const record = value as Record<string, unknown>;
  if (record.apiKey !== undefined || record.key !== undefined) throw configError("Contexts accept apiKeyFile references only; inline keys are not supported.");
  if (typeof record.baseUrl !== "string" || !nonEmpty(record.baseUrl)) throw configError("Context requires baseUrl.");
  if (typeof record.apiKeyFile !== "string" || !nonEmpty(record.apiKeyFile)) throw configError("Context requires an apiKeyFile reference.");
  return { baseUrl: validateBaseUrl(record.baseUrl), apiKeyFile: record.apiKeyFile };
};

export const readContexts = async (): Promise<ContextsFile> => {
  const text = await readPrivateFile(contextsPath());
  if (text === undefined) return { currentContext: null, contexts: {} };
  const record = parseConfigObject(text);
  if (record.currentContext !== undefined && record.currentContext !== null && typeof record.currentContext !== "string") {
    throw configError("currentContext must be a context name or null.");
  }
  if (record.contexts === null || typeof record.contexts !== "object" || Array.isArray(record.contexts)) {
    throw configError("contexts must be an object of named connections.");
  }
  const contexts = Object.fromEntries(Object.entries(record.contexts).map(([name, value]) => [checkName(name), parseContext(value)]));
  return { currentContext: typeof record.currentContext === "string" ? checkName(record.currentContext) : null, contexts };
};

const lookup = (stored: ContextsFile, name: string): Context => {
  checkName(name);
  const context = Object.hasOwn(stored.contexts, name) ? stored.contexts[name] : undefined;
  if (!context) throw configError("Context does not exist. Run: dagu-cli context ls");
  return context;
};

const selectedName = (stored: ContextsFile, override?: string): string | undefined => {
  const name = override ?? nonEmpty(process.env.DAGU_CONTEXT) ?? stored.currentContext ?? undefined;
  return name === undefined ? undefined : checkName(name);
};

export const contextConnection = async (override?: string): Promise<{ baseUrl: string; apiKey: string } | undefined> => {
  const stored = await readContexts();
  const name = selectedName(stored, override);
  if (name === undefined) return undefined;
  const context = lookup(stored, name);
  const apiKey = nonEmpty(await readPrivateFile(resolve(dirname(contextsPath()), context.apiKeyFile)));
  if (!apiKey) throw configError("Context API key file is missing or empty.");
  return { baseUrl: context.baseUrl, apiKey };
};

const saveContexts = async (stored: ContextsFile): Promise<void> => {
  const text = `${JSON.stringify(stored, null, 2)}\n`;
  if (Buffer.byteLength(text) > CONFIG_LIMIT) throw configError("Dagu config file is too large.");
  const directory = dirname(contextsPath());
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || (process.getuid && info.uid !== process.getuid()) || (info.mode & 0o022) !== 0) {
    throw configError("Context directory must be owned by the current user, not a symlink or writable by group/other.");
  }
  await readPrivateFile(contextsPath());
  const temp = join(directory, `.contexts-${randomUUID()}.tmp`);
  const handle = await open(temp, "wx", 0o600);
  try {
    await handle.writeFile(text);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temp, contextsPath());
};

export const contextCommands = [
  { command: "ls", usage: "dagu-cli context ls", summary: "List stored connection names and the current context" },
  { command: "show", usage: "dagu-cli context show [name]", summary: "Show stored configuration with keys redacted; never show environment connection values" },
  { command: "add", usage: "dagu-cli context add <name> --base-url <url> --api-key-file <path>", summary: "Add a named connection using a private key file reference" },
  { command: "use", usage: "dagu-cli context use <name|->", summary: "Set the current context; - clears it" },
  { command: "rm", usage: "dagu-cli context rm <name>", summary: "Remove a non-current connection without touching its key file" },
] as const;

export const contextHelp = (tokens: readonly string[]): unknown =>
  contextCommands.find((item) => item.command === tokens[1]) ?? {
    group: "context",
    commands: contextCommands,
    globalFlags: { "--context <name>, -c <name>": "Connection target: flag > DAGU_CONTEXT > current context; profile remains a Dagu runtime profile" },
  };

/** Storage-only views: key contents and environment connection values never enter output. */
export const manageContexts = (args: readonly string[], override?: string): Effect.Effect<unknown, CliError> =>
  Effect.tryPromise({
    try: async () => {
      const [action, ...rest] = args;
      if (!action) return contextHelp(["context"]);
      const stored = await readContexts();
      if (action === "ls" && rest.length === 0) {
        return { contexts: Object.keys(stored.contexts).sort(), currentContext: stored.currentContext };
      }
      if (action === "show" && rest.length <= 1) {
        const name = rest[0] ?? selectedName(stored, override);
        if (!name) throw configError("No context selected. Pass a name or run context use.");
        const context = lookup(stored, name);
        return { name, baseUrl: context.baseUrl, apiKey: "[redacted]", credentialSource: "file" };
      }
      if (action === "add") {
        const name = rest[0];
        if (!name) throw usage("Context name is required. Run: dagu-cli context add --help");
        checkName(name);
        if (Object.hasOwn(stored.contexts, name)) throw configError("Context already exists; remove it before adding a replacement.");
        const options: Record<string, string> = {};
        for (let index = 1; index < rest.length; index++) {
          const flag = rest[index]!;
          if (!["--base-url", "--api-key-file"].includes(flag) || Object.hasOwn(options, flag)) {
            throw usage("Expected --base-url and --api-key-file, each exactly once. Literal keys are not accepted.");
          }
          const value = rest[++index];
          if (!value || value.startsWith("--")) throw usage("Context option requires a value.");
          options[flag] = value;
        }
        const context = parseContext({ baseUrl: options["--base-url"], apiKeyFile: options["--api-key-file"] });
        const absolute = { ...context, apiKeyFile: resolve(context.apiKeyFile) };
        if (!nonEmpty(await readPrivateFile(absolute.apiKeyFile))) throw configError("Context API key file is missing or empty.");
        await saveContexts({ ...stored, contexts: { ...stored.contexts, [name]: absolute } });
        return { name, added: true };
      }
      if (action === "use" && rest.length === 1) {
        const name = rest[0]!;
        if (name !== "-") lookup(stored, name);
        await saveContexts({ ...stored, currentContext: name === "-" ? null : name });
        return { currentContext: name === "-" ? null : name };
      }
      if (action === "rm" && rest.length === 1) {
        const name = rest[0]!;
        lookup(stored, name);
        if (stored.currentContext === name) throw configError("Cannot remove the current context; use another context or use - first.");
        const contexts = Object.fromEntries(Object.entries(stored.contexts).filter(([key]) => key !== name));
        await saveContexts({ ...stored, contexts });
        return { name, removed: true };
      }
      throw usage("Usage: dagu-cli context ls|show|add|use|rm. Run: dagu-cli context --help");
    },
    catch: (cause) => cause instanceof CliError ? cause : configError("Context configuration is unavailable."),
  });
