---
name: dagu
description: Operate a Dagu server through the dagu-cli REST command. Use when listing, describing, or calling any Dagu REST operation, including DAGs, runs, sync, webhooks, and admin resources. Do not use for authoring DAG YAML fields; use the official Dagu authoring skill for YAML syntax.
---

# dagu-cli

Generic REST client for a Dagu server. It does not know which machine is local. Point it with environment variables.

```text
DAGU_BASE_URL   default http://127.0.0.1:8080
DAGU_API_KEY    required bearer token; DAGU_API_TOKEN is accepted
```

The base URL is the server origin. The CLI appends `/api/v1` unless the value already ends with that path. Do not put the key in the URL, flags, or command output.

## Commands

JSON is the default stdout. Diagnostics stay on the exit code and the `error` field.

```text
dagu-cli operations [--tag <tag>]
dagu-cli describe <operationId>
dagu-cli call <operationId> [--path JSON] [--query JSON] [--body JSON]
```

`--path` and `--query` are JSON objects. Path values fill `{placeholders}`. `--body` is the JSON request body.

A successful call:

```json
{"ok":true,"command":"call","status":200,"result":{"operationId":"ListDAGs","method":"GET","path":"/dags","body":{}}}
```

A failed call still returns JSON and a non-zero exit. HTTP error bodies are in `result.body`.

## Agent loop

1. `operations` to find the `operationId`. Filter with `--tag` when the area is known (`dags`, `dag-runs`, `sync`, `webhooks`).
2. `describe` before the first call. Read required path parameters and body properties.
3. `call` only the operation the user asked for.

`GET` is safe to run when the user asked to inspect. `POST`, `PUT`, `PATCH`, and `DELETE` change server state. Run those only when the user named that effect. Do not delete DAGs, API keys, secrets, or users as exploration.

The vendored spec is Dagu's OpenAPI document. It is not a promise that every server enables every route. Trust the HTTP status from `call`.
