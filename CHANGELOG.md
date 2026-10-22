# Changelog

This project uses semantic versioning. Before 1.0.0, minor versions may change command names or JSON fields.

## Unreleased

## 0.3.0 (prepared; not yet published)

- C3: add the supported Bun/TypeScript ESM `dagu-cli/contexts` package export: `readContexts`, `readContext`, `selectContexts`, `labelPairs`, `contextsPath`, Promise-based `executeContexts`, `CliError` and public result/options types. Explicit config files avoid process-global mutation; packaged consumer import is regression-tested. This version is prepared for a future exact V_ctx release, not published by this change.
- C1: optional context labels, `context labels` read/merge and AND `context select`; parser/writer preserve unknown root and context fields.
- Replace the exec HTTP timeout magic number with named deadline constants; normalize failure response command names to the REST leaf. Keep whole-file context validation, with an error identifying the invalid context.

- Add `context exec --selector key=value [--selector key=value ...] [--concurrency 1-32] [--timeout-ms 1-300000] -- <REST command>`: bounded in-process parallel execution over a frozen context selection, with per-context success/failed/timeout envelopes and an aggregate exit code. Defaults are 4 workers and 30000 ms per context; all results are collected, with no retries. Reject local/derived/streaming commands and connection overrides. Timed-out remote writes can have unknown outcomes.
- Document the preceding C1 context labels/AND selector and preservation of unknown configuration fields in the shipped skill.

## 0.2.0

- Add connection contexts: `context ls/show/add/use/rm`, global `--context <name>` (`-c`), and `DAGU_CONTEXT`. Store the current context and named `baseUrl` / `apiKeyFile` references in `~/.config/dagu-cli/contexts.json` (mode 0600). Inline keys are rejected; `show` redacts credentials.
- Serialize concurrent context mutations across processes, re-reading and validating under an exclusive lock before the atomic mode-0600 commit. Lock waits fail clearly after 5 seconds.
- Connection precedence: `--base-url` > context flag > `DAGU_CONTEXT` > current context > connection env > legacy automation config. **Migration:** env now overrides the legacy file. Named contexts never borrow credentials from env/legacy on failure. The legacy file is never rewritten.
- Preserve all 18 Dagu runtime `profile` commands and webhook `--profile` / `x-dagu-profile` behavior. `--profile` never selects a connection.
- Redact active API keys, webhook tokens and signatures reflected in server responses; transport errors no longer echo exception details.

## 0.1.3

- `dag enqueue`, `dag start`, and `dag start sync` send `{}` when no `--body`, `--body-file`, `--param`, or `--params-file` is given. Dagu 2.17 panics on a missing required JSON body, so the empty object is what lets the server apply `defaultParams`. An explicit `params` value still overrides them. Other commands do not gain this body.
- `dag params <fileName>` projects the parameter contract from `GetDAGDetails` (`paramDefs`, or `paramSchema` when definitions are absent). `dag get` is unchanged. Descriptions that start with `Deprecated` are omitted unless `--include-deprecated true`. A parameter with `required: true` is never omitted.

## 0.1.2

- Read optional `~/.config/dagu/automation.json` (`key`, optional `baseUrl`) before `DAGU_API_KEY` / `DAGU_BASE_URL`. This is the automation catalog credential file, not a second secret store. The CLI still does not write it.
- `dag start`, `dag start sync`, `dag enqueue`, `run start spec`, and `run enqueue spec` accept repeatable `--param key=value` and one `--params-file <object.json>`. Scalar values are stringified into `body.params`. Other body fields stay on `--body`.

## 0.1.1

- Publish from the `v*` tag workflow in `.github/workflows/publish.yml`.
- Record the GitHub repository in the package manifest.

## 0.1.0

First public source release. Published from a maintainer session, without provenance.

- One named command for each of the 227 operations in the vendored OpenAPI document.
- Root help lists nouns. `dagu-cli skills get <name>` loads one layer of the tree.
- `webhook trigger` uses `--token`, not `DAGU_API_KEY`.
- `wiki attachment put` sends `--body-file` as raw bytes. Two step-log commands send a form body.
