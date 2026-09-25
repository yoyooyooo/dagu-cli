import { Effect } from "effect";
import { configError } from "./errors.ts";

export type Config = {
  readonly baseUrl: string;
  readonly apiKey: string;
};

const DEFAULT_BASE_URL = "http://127.0.0.1:8080";

export const apiRoot = (baseUrl: string): string => {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed.endsWith("/api/v1")) return trimmed;
  return `${trimmed}/api/v1`;
};

export const loadConfig = (overrides: { readonly baseUrl?: string; readonly apiKey?: string }): Effect.Effect<Config, import("./errors.ts").CliError> =>
  Effect.gen(function* () {
    const baseUrl = overrides.baseUrl ?? process.env.DAGU_BASE_URL ?? DEFAULT_BASE_URL;
    const apiKey = overrides.apiKey ?? process.env.DAGU_API_KEY ?? process.env.DAGU_API_TOKEN ?? "";
    if (!apiKey) {
      return yield* Effect.fail(configError("Set DAGU_API_KEY. DAGU_API_TOKEN is also accepted. DAGU_BASE_URL defaults to http://127.0.0.1:8080."));
    }
    let url: URL;
    try {
      url = new URL(apiRoot(baseUrl));
    } catch {
      return yield* Effect.fail(configError("DAGU_BASE_URL must be an absolute URL."));
    }
    if (url.username || url.password) {
      return yield* Effect.fail(configError("Put the credential in DAGU_API_KEY, not in the URL."));
    }
    return { baseUrl: url.origin + url.pathname.replace(/\/+$/, ""), apiKey };
  });
