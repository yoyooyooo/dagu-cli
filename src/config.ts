import { Effect } from "effect";
import { lstat, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CliError, configError } from "./errors.ts";

export type Config = {
  readonly baseUrl: string;
  readonly apiKey: string;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";
const CONFIG_LIMIT = 65536;

export const defaultConfigPath = (): string =>
  join(process.env.HOME || homedir(), ".config/dagu/automation.json");

/** Same private file the automation catalog client reads. DAGU_CONFIG_FILE overrides the path. */
export const configPath = (): string => process.env.DAGU_CONFIG_FILE || defaultConfigPath();

export const apiRoot = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  return `${trimmed}/api/v1`;
};

type FileConfig = {
  readonly baseUrl?: string;
  readonly apiKey?: string;
};

const isNodeError = (cause: unknown, code: string): boolean =>
  typeof cause === "object" && cause !== null && "code" in cause && cause.code === code;

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

const readFileConfig = (file: string): Effect.Effect<FileConfig | undefined, CliError> =>
  Effect.tryPromise({
    try: async () => {
      let info;
      try {
        info = await lstat(file);
      } catch (cause) {
        if (isNodeError(cause, "ENOENT")) return undefined;
        throw configError("Dagu config file is unavailable.");
      }
      const uid = process.getuid?.();
      if (
        !info.isFile() ||
        info.isSymbolicLink() ||
        (uid !== undefined && info.uid !== uid) ||
        (info.mode & 0o077) !== 0
      ) {
        throw configError(
          "Dagu config must be an owner-private regular file (mode 600), not a symlink.",
        );
      }
      const text = await readFile(file, "utf8");
      if (text.length > CONFIG_LIMIT) throw configError("Dagu config file is too large.");
      let value: unknown;
      try {
        value = JSON.parse(text);
      } catch {
        throw configError("Dagu config file is not JSON.");
      }
      if (value === null || typeof value !== "object" || Array.isArray(value)) {
        throw configError("Dagu config file must be a JSON object.");
      }
      const record = value as Record<string, unknown>;
      if (record.key !== undefined && typeof record.key !== "string")
        throw configError("Dagu config key must be a string.");
      if (record.apiKey !== undefined && typeof record.apiKey !== "string")
        throw configError("Dagu config apiKey must be a string.");
      if (record.baseUrl !== undefined && typeof record.baseUrl !== "string")
        throw configError("Dagu config baseUrl must be a string.");
      const apiKey =
        nonEmpty(typeof record.key === "string" ? record.key : undefined) ??
        nonEmpty(typeof record.apiKey === "string" ? record.apiKey : undefined);
      const baseUrl = nonEmpty(typeof record.baseUrl === "string" ? record.baseUrl : undefined);
      return { ...(apiKey ? { apiKey } : {}), ...(baseUrl ? { baseUrl } : {}) };
    },
    catch: (cause) =>
      cause instanceof CliError ? cause : configError("Dagu config file is unavailable."),
  });

export const loadConfig = (overrides: {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly requireApiKey?: boolean;
}): Effect.Effect<Config, CliError> =>
  Effect.gen(function* () {
    const stored = yield* readFileConfig(configPath());
    const baseUrl =
      nonEmpty(overrides.baseUrl) ??
      stored?.baseUrl ??
      nonEmpty(process.env.DAGU_BASE_URL) ??
      DEFAULT_BASE_URL;
    const apiKey =
      nonEmpty(overrides.apiKey) ??
      stored?.apiKey ??
      nonEmpty(process.env.DAGU_API_KEY) ??
      nonEmpty(process.env.DAGU_API_TOKEN) ??
      "";
    if (!apiKey && overrides.requireApiKey !== false) {
      return yield* Effect.fail(
        configError(
          "Set DAGU_API_KEY, or key in ~/.config/dagu/automation.json (mode 600). DAGU_API_TOKEN is also accepted. DAGU_BASE_URL defaults to http://127.0.0.1:8080.",
        ),
      );
    }
    let url: URL;
    try {
      url = new URL(baseUrl);
    } catch {
      return yield* Effect.fail(configError("DAGU_BASE_URL must be an absolute URL."));
    }
    const pathname = url.pathname.replace(/\/+$/, "");
    if (url.username || url.password) {
      return yield* Effect.fail(configError("Put the credential in DAGU_API_KEY, not in the URL."));
    }
    if (pathname === "/mcp" || pathname.endsWith("/mcp")) {
      return yield* Effect.fail(configError("DAGU_BASE_URL must be the REST origin, not /mcp."));
    }
    let root: URL;
    try {
      root = new URL(apiRoot(baseUrl));
    } catch {
      return yield* Effect.fail(configError("DAGU_BASE_URL must be an absolute URL."));
    }
    return { baseUrl: root.origin + root.pathname.replace(/\/+$/, ""), apiKey };
  });
