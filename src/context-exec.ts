import { Effect } from "effect";
import { dirname, resolve } from "node:path";
import type { Config } from "./config.ts";
import { contextsPath, labelPairs, readContexts, selectContexts } from "./contexts.ts";
import { CliError, configError, usage } from "./errors.ts";
import { nonEmpty, readPrivateFile } from "./private-config.ts";
import type { Envelope } from "./program.ts";

export const MAX_CONTEXT_TIMEOUT_MS = 300_000;
/** Later than every admitted outer deadline, which owns timeout classification. */
export const CONTEXT_HTTP_FALLBACK_TIMEOUT_MS = MAX_CONTEXT_TIMEOUT_MS + 1;
export type PreparedContextCommand = {
  readonly command: string;
  readonly execute: (connection?: Config) => Effect.Effect<Envelope, CliError>;
};
export type ContextExecEntry = { readonly context: string; readonly outcome: "success" | "failed" | "timeout"; readonly response: Envelope };

export type ContextExecReport = {
  readonly summary: { readonly total: number; readonly success: number; readonly failed: number; readonly timeout: number };
  readonly results: readonly ContextExecEntry[];
};
export type ContextExecEnvelope = Envelope & { readonly result: ContextExecReport };

export const execContexts = (
  args: readonly string[],
  prepare: (argv: readonly string[]) => Effect.Effect<PreparedContextCommand, CliError>,
  file: string = contextsPath(),
): Effect.Effect<ContextExecEnvelope, CliError> => Effect.gen(function* () {
  const separator = args.indexOf("--");
  if (separator < 0 || separator === args.length - 1) return yield* Effect.fail(usage("context exec requires options -- <REST command>. Run: dagu-cli context exec --help"));
  const selectors: string[] = [];
  const seen = new Set<string>();
  let concurrency = 4;
  let timeoutMs = 30_000;
  for (let i = 0; i < separator; i++) {
    const flag = args[i]!;
    if (!["--selector", "--concurrency", "--timeout-ms"].includes(flag)) return yield* Effect.fail(usage("Expected --selector, --concurrency or --timeout-ms before --."));
    const value = args[++i];
    if (i >= separator || !value || value.startsWith("--")) return yield* Effect.fail(usage("context exec option needs a value."));
    if (flag === "--selector") { selectors.push(value); continue; }
    if (seen.has(flag)) return yield* Effect.fail(usage("context exec limit flags may only be passed once."));
    seen.add(flag);
    const limit = flag === "--concurrency" ? 32 : MAX_CONTEXT_TIMEOUT_MS;
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > limit) return yield* Effect.fail(usage(`${flag} must be an integer between 1 and ${limit}.`));
    if (flag === "--concurrency") concurrency = Number(value);
    else timeoutMs = Number(value);
  }
  if (selectors.length === 0) return yield* Effect.fail(usage("context exec requires at least one --selector key=value."));
  const selector = yield* Effect.try({ try: () => labelPairs(selectors), catch: (e) => e instanceof CliError ? e : usage("Invalid selector.") });
  const prepared = yield* prepare(args.slice(separator + 1));
  const stored = yield* Effect.tryPromise({ try: () => readContexts(file), catch: (e) => e instanceof CliError ? e : configError("Context configuration is unavailable.") });
  const names = selectContexts(stored, selector);
  if (names.length === 0) return yield* Effect.fail(configError("No contexts match the selector; no API requests were made."));
  // Freeze connections once; never reselect or borrow environment credentials mid-run.
  const directory = dirname(file);
  const results = yield* Effect.forEach(names, (name) => {
    const context = stored.contexts[name]!;
    const task = Effect.gen(function* () {
      const apiKey = yield* Effect.tryPromise({
        try: async () => {
          const key = nonEmpty(await readPrivateFile(resolve(directory, context.apiKeyFile)));
          if (!key) throw configError("Context API key file is missing or empty.");
          return key;
        },
        catch: (e) => e instanceof CliError ? e : configError("Context credentials are unavailable."),
      });
      return yield* prepared.execute({ baseUrl: context.baseUrl, apiKey });
    });
    return task.pipe(
      Effect.timeoutOrElse({ duration: timeoutMs, orElse: () => Effect.fail(new CliError({ code: "TIMEOUT", message: "Context deadline exceeded; remote outcome may be unknown. No retry was attempted.", retryable: false })) }),
      Effect.catch((error) => Effect.succeed({ ok: false, command: prepared.command, error: { code: error.code, message: error.message, retryable: error.retryable } } as Envelope)),
      Effect.map((response): ContextExecEntry => ({ context: name, outcome: response.ok ? "success" : response.error?.code === "TIMEOUT" ? "timeout" : "failed", response })),
    );
  }, { concurrency });
  const summary = { total: results.length, success: 0, failed: 0, timeout: 0 };
  for (const item of results) summary[item.outcome]++;
  const ok = summary.success === summary.total;
  return {
    ok, command: "context exec", result: { summary, results },
    ...(ok ? {} : { error: { code: "CONTEXT_EXEC_FAILED", message: "One or more contexts failed or timed out. See per-context results.", retryable: false } }),
  };
});
