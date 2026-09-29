---
name: dagu-cli
description: Operate a Dagu server through the dagu-cli command tree. Use when listing or changing DAGs, runs, webhooks, sync, wiki, profiles, queues, secrets, or admin resources. Do not use for authoring DAG YAML fields; use the official Dagu authoring skill for YAML syntax.
---

# dagu-cli

This file is the entry, not the command reference. The installed CLI is the source of the command tree.

```text
DAGU_BASE_URL   default http://127.0.0.1:8080
DAGU_API_KEY    bearer token; DAGU_API_TOKEN is accepted
config file     ~/.config/dagu/automation.json (DAGU_CONFIG_FILE overrides the path)
```

The base URL is the server origin. `/api/v1` is appended unless it is already present. Do not append `/mcp`. Do not put the key in the URL, flags, or command output.

The config file is optional and is the same owner-private mode 600 file the automation catalog client uses (`key`, optional `baseUrl`). It is not a second secret channel. Priority is `--base-url`, then the file, then the environment, then the built-in default. A missing file is ignored. A symlink or a file readable by group/other is an error. The CLI does not write the file.

## Disclosure

```text
dagu-cli --help
dagu-cli <noun> --help
dagu-cli skills list
dagu-cli skills get core
dagu-cli skills get run
dagu-cli skills get admin
```

Load `core` before everyday DAG and run work. Load `run` only for steps, sub-runs, human tasks, and artifacts. Load `admin` only for users, API keys, workspaces, settings, and system controls. Other nouns (`webhook`, `sync`, `wiki`, `profile`, `notify`, `incident`, `queue`, `secret`, `search`) disclose themselves through `dagu-cli <noun> --help` or `dagu-cli skills get <noun>`.

## Calling

A leaf command takes path parameters as positionals, in the order shown by `--help`.

```text
dagu-cli dag list
dagu-cli dag params <fileName>
dagu-cli dag params <fileName> --remoteNode <id>
dagu-cli dag params <fileName> --include-deprecated true
dagu-cli dag get <fileName>
dagu-cli dag start <fileName> --body '<json>'
dagu-cli run log <name> <dagRunId>
```

`dag params <fileName>` is the parameter contract. `dag get` stays the ops view (spec, steps, latest run). Stdout `result` is `result.params` plus a small header (`name`, `type`, `description`, `labels`, `suspended`, `errors`), not `result.body.dag`. The catalog id is the same one `dag get` uses, without a `.yaml` suffix.

`--remoteNode` is passed through to `GetDAGDetails`. `--include-deprecated true` keeps parameters whose description starts with `Deprecated`. The default omits those aliases and lists their names in `result.omittedDeprecated`. A parameter with `required: true` is never omitted. Do not read `dag.params`; that list is legacy `name=value` text and hides required inputs that have no default.

This is the synced Coordinator catalog, the same snapshot as `dag get`. A dirty automation checkout is not visible until `dagu-automation` publishes it. Do not open `tasks/<task>/*.yaml` to recover the live parameter contract.

Filters are `--query '<json object>'` or a named flag `--<name> <value>` for a query parameter shown by `--help`. `--limit 5` and `--q <text>` work. `-q` does not. `run step log` and its download commands send `stream=false` unless you pass `--stream`. JSON and form bodies go in `--body` or `--body-file`. `wiki attachment put` requires `--body-file` and sends raw bytes. `webhook trigger <fileName> --token <webhook-token>` uses the webhook token, not `DAGU_API_KEY`. Add `--signature` and `--profile` only when that webhook requires them.

Stdout is JSON. Exit `0` on success, `2` on usage or config errors, and `1` on HTTP or transport failures. `GET` is safe when the user asked to inspect. Run `POST`, `PUT`, `PATCH`, and `DELETE` only when the user named that effect.
