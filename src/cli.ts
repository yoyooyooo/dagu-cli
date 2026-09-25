#!/usr/bin/env bun
import { Effect } from "effect";
import { CliError } from "./errors.ts";
import { run, toEnvelope } from "./program.ts";

const envelope = await Effect.runPromise(
  run(process.argv.slice(2)).pipe(Effect.catch((error) => Effect.succeed(toEnvelope(error instanceof CliError ? error : new CliError({ code: "INTERNAL", message: "Internal error.", retryable: false }))))),
);
process.stdout.write(`${JSON.stringify(envelope)}\n`);
process.exitCode = envelope.ok ? 0 : envelope.error?.code === "USAGE" || envelope.error?.code === "CONFIG" ? 2 : 1;
