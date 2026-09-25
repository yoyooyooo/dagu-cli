import { Effect } from "effect";
import { apiRoot } from "./config.ts";
import { CliError } from "./errors.ts";
import type { Operation } from "./openapi.ts";

export type CallInput = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly operation: Operation;
  readonly path: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  readonly timeoutMs: number;
};

const encode = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

export const buildUrl = (input: Pick<CallInput, "baseUrl" | "operation" | "path" | "query">): string => {
  let path = input.operation.path;
  for (const parameter of input.operation.parameters) {
    if (parameter.location !== "path") continue;
    const value = input.path[parameter.name];
    if (value === undefined) throw new CliError({ code: "USAGE", message: `Missing path parameter ${parameter.name}.`, retryable: false });
    path = path.replaceAll(`{${parameter.name}}`, encodeURIComponent(value));
  }
  if (path.includes("{")) throw new CliError({ code: "USAGE", message: `Unresolved path parameter in ${input.operation.path}.`, retryable: false });
  const url = new URL(apiRoot(input.baseUrl) + path);
  for (const [key, value] of Object.entries(input.query)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, encode(item));
    } else {
      url.searchParams.set(key, encode(value));
    }
  }
  return url.toString();
};

export const callOperation = (input: CallInput): Effect.Effect<{ readonly status: number; readonly body: unknown }, CliError> =>
  Effect.tryPromise({
    try: async () => {
      const url = buildUrl(input);
      const hasBody = input.body !== undefined && input.operation.method !== "GET";
      const response = await fetch(url, {
        method: input.operation.method,
        headers: {
          accept: "application/json",
          authorization: `Bearer ${input.apiKey}`,
          ...(hasBody ? { "content-type": "application/json" } : {}),
        },
        body: hasBody ? JSON.stringify(input.body) : undefined,
        signal: AbortSignal.timeout(input.timeoutMs),
      });
      const text = await response.text();
      let body: unknown = text;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      } else {
        body = null;
      }
      return { status: response.status, body };
    },
    catch: (cause) =>
      new CliError({
        code: cause instanceof CliError ? cause.code : "TRANSPORT",
        message: cause instanceof Error ? cause.message.replace(input.apiKey, "[redacted]") : "Request failed.",
        retryable: !(cause instanceof CliError),
      }),
  });
