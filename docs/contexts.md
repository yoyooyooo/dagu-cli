# Connection contexts

A context selects a Dagu server connection. A Dagu runtime `profile` and the webhook `--profile` option do not select a connection. For first-time setup, use the [README](../README.md#connect-to-a-server). For command syntax in your installed version, run `dagu-cli context --help` or `dagu-cli context exec --help`.

## Manage a connection

```sh
dagu-cli context ls
dagu-cli context show example
dagu-cli context use example
dagu-cli context use -
dagu-cli context rm example
```

`context show [name]` displays stored settings for the explicit name or selected context. It redacts `apiKey` as `[redacted]` and does not resolve key files or display environment connection values. `ls` reports stored names and the persisted current context. `add` refuses duplicates. To replace a connection, switch or clear the current context, remove the old entry, then add it again. `rm` refuses the current context. It removes only the configuration entry and never touches the key file. Management commands make no server requests.

`context add/use/rm/labels` serialize the full read–validate–write transaction with an exclusive `~/.config/dagu-cli/contexts.json.lock` file, then atomically replace the config with mode 0600. Concurrent successful changes are preserved. Waiting for the lock fails with a configuration error after 5 seconds; read-only commands do not wait. If a writer crashes, confirm no context writer is running before moving the leftover lock to the system trash and retrying.

## Configuration file

Named connections are stored in `~/.config/dagu-cli/contexts.json`. Schema:

```json
{
  "currentContext": "mini",
  "contexts": {
    "mini": {
      "baseUrl": "https://dagu.example",
      "apiKeyFile": "/absolute/path/to/key"
    }
  }
}
```

`currentContext` may be omitted or `null`. Each context requires a REST `baseUrl` and `apiKeyFile`; inline keys are rejected. `add` stores absolute key paths; a relative path in a hand-written file resolves against the directory containing `contexts.json`. The config and referenced key files must be regular files owned by the current user, without group/other permissions (mode 600); symlinks are refused. Context names use 1–64 letters, digits, underscores or hyphens, starting with a letter or digit.

The entire configuration is validated before selection. Malformed settings for any context, even one that does not match the selector, fail validation before any requests. Errors for malformed entries identify the context. The CLI resolves key file contents when it uses a connection, not when it validates the configuration. Treat stored metadata and unknown fields as private. Do not log the full configuration.

## Connection precedence

The following rules apply to single-target commands:

1. `--base-url <url>` overrides the URL from any source below, while retaining that connection's key.
2. Global `--context <name>` / `-c <name>` selects a named connection. It works before or after the command; `--context=<name>` also works.
3. Non-empty `DAGU_CONTEXT` selects a named connection.
4. Persisted `currentContext` selects a named connection.
5. Without a selected context, `DAGU_BASE_URL` and `DAGU_API_KEY` (or `DAGU_API_TOKEN`) supply connection fields.
6. Missing fields fall back to optional `~/.config/dagu/automation.json` (`DAGU_CONFIG_FILE` overrides this legacy path): `baseUrl` and non-empty `key` (otherwise `apiKey`). The final URL default is `http://127.0.0.1:8080`; API calls require a key except webhook triggers.

Since 0.2.0, environment connection values take precedence over the legacy automation file. The CLI never rewrites that file. A selected context supplies both URL and key. Unknown or invalid contexts and missing or unsafe key files fail instead of borrowing credentials from the environment or the legacy file. Use `--base-url` only when the selected credential belongs at the overridden origin. `context use -` clears the persisted selection but does not override `DAGU_CONTEXT`.

## Label and select contexts

Labels are optional string key/value metadata, e.g. `"labels": {"region": "west", "tier": "prod"}` on a context. Read or merge labels with:

```sh
dagu-cli context labels mini
dagu-cli context labels mini region=west tier=prod
dagu-cli context select region=west tier=prod
```

`labels <name>` returns `{name, labels}` (empty object when absent); supplying pairs merges/replaces only those keys. `show` also includes stored labels when present. `select` returns `{contexts: [sorted names]}` matching **all** pairs; no matches returns an empty list with exit 0. It does not change the current context, read key files, contact servers, or execute commands. Keys are non-empty and contain no whitespace, comma, or `=`; values are strings (including empty strings and `=`). Pass each pair as a separate argument and quote shell whitespace. Duplicate keys and empty selectors are rejected. Unknown top-level and per-context fields are preserved by configuration writes but are not exposed by `show`. Labels are user-visible metadata, not a place for secrets.

## Bounded multi-context execution

```sh
dagu-cli context exec --selector region=west --selector tier=prod \
  --concurrency 4 --timeout-ms 30000 -- dag list --perPage 2
```

`context exec` freezes matching contexts once and executes the same catalog REST API leaf command in-process on each target. Repeat `--selector key=value` for AND conditions. A selector and `--` separator are required; no matches is a config error (exit 2), not vacuous success. Current context and environment connection defaults are ignored. The config is never changed.

- Concurrency defaults to 4, allowed range 1–32. Per-context timeout defaults to 30000 ms, range 1–300000 ms. Its budget starts when a worker slot opens and covers key loading, HTTP and response body; expiry cancels the local request.
- Results stay sorted by context name. `result.summary` counts `total/success/failed/timeout`; `result.results` contains `{context, outcome, response}` for every target, where `response` is the normal redacted command envelope. A target failure never cancels siblings.
- Exit 0 means **all** targets succeeded. Any per-target config, transport or HTTP failure/timeout gives exit 1 after collecting results. Invalid overall config/arguments gives exit 2 before requests. Timeout does not prove a remote write was rolled back: there are **no retries**.
- Only finite catalog REST commands are supported, not local `context`/`skills`, derived `dag params`, nested exec, shell commands or streaming (`stream=true`). `--context`/`-c`, `--base-url`, webhook token/signature overrides and per-command `--timeout-ms` are refused after `--`; exec owns targets and deadlines. Stdin params are refused. Body/params files are loaded once before fanout, so each target receives the same payload. Existing log commands default to `stream=false`.
- Only use mutating REST commands when the effect is authorized for **every** selected target. The example above is read-only.

## Public contexts API

The supported package subpath is `dagu-cli/contexts`. It ships TypeScript ESM for **Bun >=1.3.14**, like the CLI; this is not a compiled Node.js/CommonJS SDK. Deep source imports are not supported. The subpath is available since [0.3.0](https://github.com/yoyooyooo/dagu-cli/releases/tag/v0.3.0). It uses the same whole-file validation and file privacy rules as the CLI.

```ts
import { readContexts, readContext, selectContexts, executeContexts, CliError } from "dagu-cli/contexts";

const file = "/absolute/path/to/contexts.json";
const stored = await readContexts(file); // no argument uses contextsPath()
const connection = await readContext("mini", file); // metadata only, no resolved secret
const names = selectContexts(stored, { region: "west", tier: "prod" });
const report = await executeContexts({
  configFile: file, selector: { region: "west", tier: "prod" },
  command: ["dag", "list", "--perPage", "2"], concurrency: 4, timeoutMs: 30000,
});
console.log(report.ok, report.result.summary);
```

`readContexts(file?)` returns the validated `ContextsFile`, preserving unknown fields. `readContext(name, file?)` returns stored `Context` metadata, including its key **path**, never key contents. `selectContexts(stored, selector)` is a synchronous pure AND selector returning sorted names; `labelPairs(["key=value"])` parses CLI-style pairs. `contextsPath()` exposes the default path. Caller-supplied config paths are explicit and relative key references resolve against that file, not the process cwd. File privacy checks are the same as the CLI.

`executeContexts(options)` returns `Promise<ContextExecEnvelope>` with typed `ContextExecReport` / `ContextExecEntry` and the same limits, command restrictions, deterministic results and no-retry semantics as `context exec`. It does not mutate `process.env`, `process.exitCode`, config, or current selection. Per-target failures/timeouts are returned, not thrown; inspect `report.ok` and every result. Overall usage/config failures reject with exported `CliError` (`code`, `message`, `retryable`); catch it explicitly. Importing the module performs no CLI execution or network calls. All exported types are available from the same subpath.

## Why context and profile are separate

The design comparison used an installed Multica CLI and the pinned [Multica config implementation](https://github.com/yoyooyooo/multica/blob/43b0571f992567a919c7f1f699ff160922594b94/server/internal/cli/config.go) plus [selection logic](https://github.com/yoyooyooo/multica/blob/43b0571f992567a919c7f1f699ff160922594b94/server/cmd/multica/cmd_agent.go). At that revision, Multica had a global profile selector, separate `profiles/<name>/config.json` files, and `config show/set`. It did not have a top-level profile-management group or an environment and stored profile selection chain. dagu-cli uses the same idea of explicitly selecting a named target, but stores all connections in one file and keeps `profile` for Dagu's runtime meaning.
