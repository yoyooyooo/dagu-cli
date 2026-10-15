import { Effect } from "effect";
import { homedir } from "node:os";
import { join } from "node:path";
import { CliError, configError } from "./errors.ts";
import { nonEmpty, parseConfigObject, readPrivateFile, validateBaseUrl } from "./private-config.ts";
import { contextConnection } from "./contexts.ts";

export type Config = {
  readonly baseUrl: string;
  readonly apiKey: string;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";

export const defaultConfigPath = (): string =>
  join(process.env.HOME || homedir(), ".config/dagu/automation.json");

/** Legacy automation catalog config, below environment fallbacks when no context is selected. */
export const configPath = (): string => process.env.DAGU_CONFIG_FILE || defaultConfigPath();

export const apiRoot = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  return `${trimmed}/api/v1`;
};

const legacyConnection = async (): Promise<Partial<Config>> => {
  const text = await readPrivateFile(configPath());
  if (text === undefined) return {};
  const record = parseConfigObject(text);
  for (const field of ["key", "apiKey", "baseUrl"] as const) {
    if (record[field] !== undefined && typeof record[field] !== "string") {
      throw configError("Dagu config key, apiKey, and baseUrl must be strings.");
    }
  }
  return {
    apiKey: nonEmpty(record.key as string | undefined) ?? nonEmpty(record.apiKey as string | undefined),
    baseUrl: nonEmpty(record.baseUrl as string | undefined),
  };
};

export const loadConfig = (overrides: {
  readonly baseUrl?: string;
  readonly apiKey?: string;
  readonly context?: string;
  readonly requireApiKey?: boolean;
}): Effect.Effect<Config, CliError> =>
  Effect.tryPromise({
    try: async () => {
      // A named context is self-contained. Never borrow credentials from another server.
      const context = await contextConnection(overrides.context);
      const envUrl = nonEmpty(process.env.DAGU_BASE_URL);
      const envKey = nonEmpty(process.env.DAGU_API_KEY) ?? nonEmpty(process.env.DAGU_API_TOKEN);
      const legacy = context || ((nonEmpty(overrides.baseUrl) ?? envUrl) && (nonEmpty(overrides.apiKey) ?? envKey))
        ? {} : await legacyConnection();
      const baseUrl = nonEmpty(overrides.baseUrl) ?? context?.baseUrl ?? envUrl ?? legacy.baseUrl ?? DEFAULT_BASE_URL;
      const apiKey = nonEmpty(overrides.apiKey) ?? context?.apiKey ?? envKey ?? legacy.apiKey ?? "";
      if (!apiKey && overrides.requireApiKey !== false) {
        throw configError("Select a context, set DAGU_API_KEY / DAGU_API_TOKEN, or configure key in ~/.config/dagu/automation.json (mode 600).");
      }
      return { baseUrl: apiRoot(validateBaseUrl(baseUrl)), apiKey };
    },
    catch: (cause) => cause instanceof CliError ? cause : configError("Dagu configuration is unavailable."),
  });
