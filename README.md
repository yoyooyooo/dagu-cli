# dagu-cli

[English](./README.md) | [中文](./README.zh-CN.md)

dagu-cli is a command-line client for a [Dagu](https://dagu.sh) server. You give it a base URL and an API key. It turns that server's REST API into named commands, so an agent can discover `dag`, `run`, or `webhook` without learning 227 operation ids.

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=<api-key>
dagu-cli dag list
```

Bun 1.3.14 or newer is required. Node cannot run the TypeScript bin. The current version is 0.1.3. Before 1.0.0, command names may change.

## The problem

Dagu's REST API is one HTTP surface with 227 operations. A generic `call <operationId>` client makes an agent reread the whole catalog before every action. The official `dagu` binary also does not cover this API. You still need a way to say "list DAGs" or "stop this run" and have the CLI fill in the method, path, and parameters.

## What you get

- A noun-and-verb tree. Root help shows `dag`, `run`, `webhook`, `sync`, `wiki`, `profile`, `notify`, `incident`, `queue`, `secret`, `search`, and `admin`.
- One command for every operation in the vendored OpenAPI document. The test suite rejects a missing or duplicate mapping.
- JSON on stdout. Exit `0` on success, `2` on usage or config errors, `1` on HTTP or transport failures.
- Agent skill text served by the CLI, so the instructions match the installed command tree.

This CLI does not author DAG YAML, schedule workflows, or replace the `dagu` binary.

## How it works

The CLI reads `spec/openapi.json` and `spec/commands.json`. A command such as `dag start <fileName>` is a fixed name for one operation. Positional arguments fill path parameters in the order shown by `--help`. `--query` and `--body` send optional JSON. The process then sends one HTTP request to `<DAGU_BASE_URL>/api/v1`.

`dagu-cli skills get core` returns only everyday `dag` and `run` commands. `skills get run` adds steps, sub-runs, human tasks, and artifacts. `skills get admin` adds users, API keys, workspaces, and system controls. Other nouns disclose themselves through `dagu-cli <noun> --help`.

## Install

Install Bun 1.3.14 or newer, clone this repository, then:

```bash
bun install --frozen-lockfile
bun run dagu-cli -- --help
```

The package is on the official npm registry. Bun still has to run the TypeScript bin:

```bash
bun install -g dagu-cli
dagu-cli --help
```

Source is at <https://github.com/yoyooyooo/dagu-cli>. `0.1.0` was published from a maintainer session and has no provenance. Later versions are published by the `v*` tag workflow.

## Quick start

From this repository, with Bun 1.3.14:

```bash
bun install --frozen-lockfile
bun run dagu-cli -- --help
bun run dagu-cli -- skills get core
```

Root help is JSON. The first command entry looks like this:

```json
{"command":"admin","usage":"dagu-cli admin","summary":"50 commands"}
```

`skills` is also listed. It does not call the server.

To call a server, create an API key in Dagu and export it in the shell. Do not put it in a file that you commit.

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=<api-key>
bun run dagu-cli -- dag list
```

`DAGU_API_TOKEN` is accepted as an alias. If the base URL already ends in `/api/v1`, that path is not appended twice. Do not put `/mcp` or the key on the URL.

Use **contexts** for connection targets such as `local`, `box`, `mini`, `pro`, and `imile-win`. A **profile** is a Dagu runtime profile: the 18 `dagu-cli profile ...` commands and webhook `--profile` / `x-dagu-profile` behavior are unchanged. A profile never selects a connection.

```bash
# The key file must already exist, contain only the key, and be mode 600.
dagu-cli context add mini --base-url https://dagu.example --api-key-file /absolute/path/to/key
dagu-cli context use mini
dagu-cli dag list
dagu-cli --context box dag list
dagu-cli -c mini dag params demo
dagu-cli context ls
dagu-cli context show mini
dagu-cli context use -       # clear the current context
dagu-cli context rm mini
```

`context show [name]` uses the explicit name or selected context and redacts `apiKey` as `[redacted]`. It only displays stored settings, never resolves key files or displays environment connection values. `ls` reports stored names and the persisted current context. `add` refuses duplicates; to replace a connection, switch/clear the current context, remove it, and add it again. `rm` refuses the current context and removes only its configuration entry; it never touches the key file. Management commands make no server requests.

`context add/use/rm` serialize the full read–validate–write transaction with an exclusive `~/.config/dagu-cli/contexts.json.lock` file, then atomically replace the config with mode 0600. Concurrent successful changes are preserved. Waiting for the lock fails with a configuration error after 5 seconds; read-only commands do not wait. If a writer crashes, confirm no context writer is running before moving the leftover lock to the system trash and retrying.

The single config file is `~/.config/dagu-cli/contexts.json`. Schema:

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

Connection precedence:

1. `--base-url <url>` overrides the URL from any source below, while retaining that connection's key.
2. Global `--context <name>` / `-c <name>` selects a named connection. It works before or after the command; `--context=<name>` also works.
3. Non-empty `DAGU_CONTEXT` selects a named connection.
4. Persisted `currentContext` selects a named connection.
5. Without a selected context, `DAGU_BASE_URL` and `DAGU_API_KEY` (or `DAGU_API_TOKEN`) supply connection fields.
6. Missing fields fall back to optional `~/.config/dagu/automation.json` (`DAGU_CONFIG_FILE` overrides this legacy path): `baseUrl` and non-empty `key` (otherwise `apiKey`). The final URL default is `http://127.0.0.1:8080`; API calls require a key except webhook triggers.

**Migration:** environment connection values now precede the legacy automation file. The legacy file is never rewritten. A selected context supplies both URL and key; unknown/invalid contexts and missing/unsafe key files fail instead of borrowing credentials from env or the legacy file. `--base-url` deliberately retains the selected key, so use it only when that credential belongs at the overridden origin. `context use -` clears the persisted selection but does not override `DAGU_CONTEXT`.

The Multica comparison used its installed CLI and [GitHub main config implementation](https://github.com/yoyooyooo/multica/blob/43b0571f992567a919c7f1f699ff160922594b94/server/internal/cli/config.go) plus [selection logic](https://github.com/yoyooyooo/multica/blob/43b0571f992567a919c7f1f699ff160922594b94/server/cmd/multica/cmd_agent.go). Multica has a global profile selector, independent `profiles/<name>/config.json` files, and `config show/set`; that version has no top-level profile-management group or env/current profile selection chain. dagu-cli adapts the named-target and explicit-selection UX as `context` with a single file and the precedence above, preserving Dagu's existing runtime-profile vocabulary.

A successful response has `"ok": true` and a `status` of 200. The DAG array is at `result.body`. The exact server payload depends on your Dagu version.

Inspect the next layer before changing anything:

```bash
bun run dagu-cli -- dag --help
bun run dagu-cli -- dag start --help
```

`dag start <fileName>` is POST `/dags/{fileName}/start`. Pass a JSON body with `--body` only when you intend to start a run.

## Commands you will hit next

Path parameters are positional. Filters go in `--query '<json object>'` or `--<name> <value>`, for example `--limit 5` or `--q <text>`. `-q` is not accepted. `run step log` sends `stream=false` unless `--stream` is set. JSON bodies go in `--body` or `--body-file`. `dag enqueue`, `dag start`, and `dag start sync` send `{}` when that body is omitted, so the server keeps the DAG `defaultParams`. An explicit `params` value overrides them.

```text
dagu-cli dag params <fileName>
dagu-cli dag get <fileName>
dagu-cli dag spec get <fileName>
dagu-cli run list
dagu-cli run get <name> <dagRunId>
dagu-cli run log <name> <dagRunId>
dagu-cli webhook trigger <fileName> --token <webhook-token>
dagu-cli wiki attachment put --body-file <path> --query '<json>'
```

`dag params` prints the parameter contract (`result.params` and a small header). `dag get` stays the full ops view. Descriptions that start with `Deprecated` are omitted unless `--include-deprecated true`; `required: true` is never omitted. `--remoteNode` is the only server query. The result is the synced catalog, not an unpublished automation checkout.

`webhook trigger` does not use `DAGU_API_KEY`. It sends `--token` as the bearer token. Add `--signature` and `--profile` only when that webhook requires them.

`wiki attachment put` is the one command that sends raw bytes. `run step logs form` and `run sub step logs form` send `--body` as `application/x-www-form-urlencoded`.

The full tree is the CLI help, not this page. Start with `skills/dagu-cli/SKILL.md` if you are an agent. The skill name is `dagu-cli`, not `dagu`.

## Security and privacy

The CLI sends the API key only to the base URL you set. It reads `--body-file` from the local path you pass. It reads context configuration and the selected private key file, or falls back to the optional legacy `~/.config/dagu/automation.json`. Only `context add/use/rm` write connection configuration. It does not send data anywhere else. `context show` redacts credentials; server responses redact active API keys, webhook tokens, and signatures too. Transport errors use fixed text rather than echoing a URL, environment value, or credential.

There is no second confirmation prompt. A command whose HTTP method is POST, PUT, PATCH, or DELETE changes the server. Run those only when that effect is intended.

See [SECURITY.md](./SECURITY.md). A private vulnerability contact is not published yet.

## Limits

- The command tree matches the vendored `spec/openapi.json` (`info.version` 1.0.0). A newer or older Dagu server can reject commands or add operations this release does not name.
- Node, Deno, and browsers are not supported hosts.
- Windows was not part of the local check. The verified host is Bun 1.3.14.
- `0.1.0` has no npm provenance. Provenance starts with the tag workflow.
- The OpenAPI document and the derived command map are GPL-3.0-or-later works from Dagu. See [NOTICE](./NOTICE).

## Development

See [CONTRIBUTING.md](./CONTRIBUTING.md). The check command is `bun run check`.

License: [GPL-3.0-or-later](./LICENSE).
