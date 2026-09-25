---
name: dagu
description: Operate a Dagu server through the dagu-cli command tree. Use when listing or changing DAGs, runs, webhooks, sync, wiki, profiles, queues, secrets, or admin resources. Do not use for authoring DAG YAML fields; use the official Dagu authoring skill for YAML syntax.
---

# dagu-cli

This file is the entry, not the command reference. The installed CLI is the source of the command tree.

```text
DAGU_BASE_URL   default http://127.0.0.1:8080
DAGU_API_KEY    bearer token; DAGU_API_TOKEN is accepted
```

The base URL is the server origin. `/api/v1` is appended unless it is already present. Do not put the key in the URL, flags, or command output.

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
dagu-cli dag get <fileName>
dagu-cli dag start <fileName> --body '<json>'
dagu-cli run log <name> <dagRunId>
```

Optional query parameters go in `--query '<json object>'`. JSON and form bodies go in `--body` or `--body-file`. `wiki attachment put` requires `--body-file` and sends raw bytes. `webhook trigger <fileName> --token <webhook-token>` uses the webhook token, not `DAGU_API_KEY`. Add `--signature` and `--profile` only when that webhook requires them.

Stdout is JSON. Exit `0` on success, `2` on usage or config errors, and `1` on HTTP or transport failures. `GET` is safe when the user asked to inspect. Run `POST`, `PUT`, `PATCH`, and `DELETE` only when the user named that effect.
