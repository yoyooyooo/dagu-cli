import { Data } from "effect";

export class CliError extends Data.TaggedError("CliError")<{
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly status?: number;
}> {}

export const usage = (message: string): CliError =>
  new CliError({ code: "USAGE", message, retryable: false });

export const configError = (message: string): CliError =>
  new CliError({ code: "CONFIG", message, retryable: false });
