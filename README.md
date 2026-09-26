# dagu-cli

[English](./README.md) | [中文](./README.zh-CN.md)

dagu-cli is a command-line client for a [Dagu](https://dagu.sh) server. You give it a base URL and an API key. It turns that server's REST API into named commands, so an agent can discover `dag`, `run`, or `webhook` without learning 227 operation ids.

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=<api-key>
dagu-cli dag list
```

Bun 1.3.14 or newer is required. Node cannot run the TypeScript bin. The current version is 0.1.1. Before 1.0.0, command names may change.

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

Optional config file: `~/.config/dagu/automation.json` (override the path with `DAGU_CONFIG_FILE`). This is the same owner-private mode 600 file the automation catalog client uses, not a second secret store. `key` is the bearer (`apiKey` is accepted only when `key` is absent). Optional `baseUrl` is the REST origin. Priority is `--base-url`, then the file, then `DAGU_BASE_URL` / `DAGU_API_KEY`, then `http://127.0.0.1:8080`. A missing file changes nothing. The CLI does not write the file.

A successful response has `"ok": true` and a `status` of 200. The DAG array is at `result.body`. The exact server payload depends on your Dagu version.

Inspect the next layer before changing anything:

```bash
bun run dagu-cli -- dag --help
bun run dagu-cli -- dag start --help
```

`dag start <fileName>` is POST `/dags/{fileName}/start`. Pass a JSON body with `--body` only when you intend to start a run.

## Commands you will hit next

Path parameters are positional. Filters go in `--query '<json object>'` or `--<name> <value>`, for example `--limit 5` or `--q <text>`. `-q` is not accepted. `run step log` sends `stream=false` unless `--stream` is set. JSON bodies go in `--body` or `--body-file`.

```text
dagu-cli dag get <fileName>
dagu-cli dag spec get <fileName>
dagu-cli run list
dagu-cli run get <name> <dagRunId>
dagu-cli run log <name> <dagRunId>
dagu-cli webhook trigger <fileName> --token <webhook-token>
dagu-cli wiki attachment put --body-file <path> --query '<json>'
```

`webhook trigger` does not use `DAGU_API_KEY`. It sends `--token` as the bearer token. Add `--signature` and `--profile` only when that webhook requires them.

`wiki attachment put` is the one command that sends raw bytes. `run step logs form` and `run sub step logs form` send `--body` as `application/x-www-form-urlencoded`.

The full tree is the CLI help, not this page. Start with `skills/dagu-cli/SKILL.md` if you are an agent. The skill name is `dagu-cli`, not `dagu`.

## Security and privacy

The CLI sends the API key only to the base URL you set. It reads `--body-file` from the local path you pass. It may read `~/.config/dagu/automation.json` when that file is an owner-private regular file; it does not write a config file and does not send data anywhere else. Error text replaces the API key with `[redacted]` and does not print the file.

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
