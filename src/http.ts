import { Effect } from "effect";
import { apiRoot } from "./config.ts";
import { CliError } from "./errors.ts";
import type { Operation } from "./openapi.ts";

export type CallInput = {
  readonly baseUrl: string;
  readonly apiKey?: string;
  readonly operation: Operation;
  readonly path: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  readonly bodyKind: "json" | "form" | "bytes" | "none";
  readonly headers: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
};

const encode = (value: unknown): string => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
};

const encodeBody = (input: Pick<CallInput, "body" | "bodyKind" | "operation">): { readonly contentType: string; readonly body: BodyInit } | undefined => {
  if (input.body === undefined || input.operation.method === "GET" || input.bodyKind === "none") return undefined;
  if (input.bodyKind === "bytes") {
    if (!(input.body instanceof Uint8Array)) throw new CliError({ code: "USAGE", message: "This command requires --body-file.", retryable: false });
    const copy = new ArrayBuffer(input.body.byteLength);
    new Uint8Array(copy).set(input.body);
    return { contentType: "application/octet-stream", body: new Blob([copy]) };
  }
  if (input.bodyKind === "form") {
    if (input.body === null || typeof input.body !== "object" || Array.isArray(input.body)) {
      throw new CliError({ code: "USAGE", message: "Form commands require --body as a JSON object.", retryable: false });
    }
    const form = new URLSearchParams();
    for (const [key, value] of Object.entries(input.body)) form.set(key, encode(value));
    return { contentType: "application/x-www-form-urlencoded", body: form };
  }
  return { contentType: "application/json", body: JSON.stringify(input.body) };
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
      const encoded = encodeBody(input);
      const headers: Record<string, string> = { accept: "application/json", ...input.headers };
      if (input.apiKey && !headers.authorization && !headers.Authorization) headers.authorization = `Bearer ${input.apiKey}`;
      if (encoded) headers["content-type"] = encoded.contentType;
      const response = await fetch(url, {
        method: input.operation.method,
        headers,
        body: encoded?.body,
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
        message: cause instanceof Error ? cause.message.replaceAll(input.apiKey ?? "\0", "[redacted]") : "Request failed.",
        retryable: !(cause instanceof CliError),
      }),
  });
