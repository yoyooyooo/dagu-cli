---
name: dagu-cli
description: Operate a Dagu server through the dagu-cli command tree. Use when listing or changing DAGs, runs, webhooks, sync, wiki, profiles, queues, secrets, or admin resources. Do not use for authoring DAG YAML fields; use the official Dagu authoring skill for YAML syntax.
---

# dagu-cli

This file is the entry, not the command reference. The installed CLI is the source of the command tree.

```text
DAGU_BASE_URL   default http://127.0.0.1:8080
DAGU_API_KEY    bearer token; DAGU_API_TOKEN is accepted
DAGU_CONTEXT   optional connection context selector
contexts file  ~/.config/dagu-cli/contexts.json (mode 0600)
legacy config  ~/.config/dagu/automation.json (DAGU_CONFIG_FILE overrides)
```

The base URL is the server origin. `/api/v1` is appended unless it is already present. Do not append `/mcp`. Do not put the key in the URL, flags, or command output.

**Context = connection target; profile = Dagu runtime profile.** The 18 `profile ...` API commands and webhook `--profile` (`x-dagu-profile` header) keep their existing behavior. `--profile` never selects a context.

Connection precedence: `--base-url` > global `--context <name>` / `-c <name>` > non-empty `DAGU_CONTEXT` > stored `currentContext` > `DAGU_BASE_URL` / `DAGU_API_KEY` (`DAGU_API_TOKEN` alias) > legacy automation config. Flags work before or after the command; `--context=<name>` also works. `--base-url` changes only the URL, retaining the selected key: use only when that credential belongs at the overridden origin. A selected context is self-contained; missing/invalid contexts or key files fail without borrowing credentials.

Schema: `{"currentContext":"mini","contexts":{"mini":{"baseUrl":"https://dagu.example","apiKeyFile":"/absolute/path/to/key"}}}`. `currentContext` can be omitted or null. Contexts store file references only; inline keys are rejected. Relative references in hand-written config resolve against `contexts.json`; `add` stores absolute paths. Config/key files must be owner-private regular files (mode 600), not symlinks.

```text
dagu-cli context ls
dagu-cli context show [name]
dagu-cli context add <name> --base-url <url> --api-key-file <path>
dagu-cli context use <name|->
dagu-cli context rm <name>
dagu-cli -c mini dag list
```

`show` displays stored settings with keys redacted, never environment connection values or resolved key contents. `add/use/rm` atomically write `contexts.json` with mode 0600. `add` refuses duplicates; replace a connection by clearing/switching the current context, removing it, then adding it again. `rm` refuses the current context and never touches key files. Management is local; no server request is made. `use -` clears the persisted selection but does not override `DAGU_CONTEXT`.

Without a selected context, missing URL/key fields fall back from env to the optional legacy automation config (`baseUrl`, non-empty `key` or `apiKey`), then to the loopback URL default. **Migration:** env now precedes that legacy file. The CLI never rewrites it. See the repository README for the Multica comparison and complete precedence.

## Disclosure

```text
dagu-cli --help
dagu-cli context --help
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

Filters are `--query '<json object>'` or a named flag `--<name> <value>` for a query parameter shown by `--help`. `--limit 5` and `--q <text>` work. `-q` does not. `run step log` and its download commands send `stream=false` unless you pass `--stream`. JSON and form bodies go in `--body` or `--body-file`. `dag enqueue`, `dag start`, and `dag start sync` send `{}` when the body is omitted, which leaves `params` unset so Dagu applies the DAG `defaultParams`. Pass `--param`, `--params-file`, or `--body` to override. Do not omit the body on other JSON commands; this empty object is not applied to them. `wiki attachment put` requires `--body-file` and sends raw bytes. `webhook trigger <fileName> --token <webhook-token>` uses the webhook token, not `DAGU_API_KEY`. Add `--signature` and `--profile` only when that webhook requires them.

Stdout is JSON. Exit `0` on success, `2` on usage or config errors, and `1` on HTTP or transport failures. `GET` is safe when the user asked to inspect. Run `POST`, `PUT`, `PATCH`, and `DELETE` only when the user named that effect.
