# dagu-cli

[English](./README.md) | [中文](./README.zh-CN.md)

dagu-cli is a command-line client for a [Dagu](https://dagu.sh) server. Operators and agents can find named operations under `dag`, `run`, `sync`, and `webhook` without looking up REST operation IDs. The CLI does not author DAG YAML, schedule workflows, or replace the `dagu` binary.

## Install

Use [Bun](https://bun.sh) 1.3.14 or newer. The executable is TypeScript and does not support Node.js, Deno, or browsers.

```bash
bun install -g dagu-cli
dagu-cli --help
```

The [npm registry](https://www.npmjs.com/package/dagu-cli) lists installable versions. The [changelog](./CHANGELOG.md) explains changes. Before 1.0.0, minor releases may change command names or JSON fields.

## Connect to a server

Set the URL of a server you are authorized to inspect. Set `DAGU_API_KEY` in your shell through your normal secret source. `DAGU_API_TOKEN` is an alias. Do not commit the key or put it in the URL. The CLI adds `/api/v1` if the URL does not already end with it. Do not append `/mcp`.

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
dagu-cli dag list
```

This example assumes no context is selected. If you have a saved connection, select it explicitly as shown below. For a successful list request, stdout contains JSON with `"ok": true` and the server payload under `result.body`. The CLI exits `0` on success, `2` on usage or configuration errors, and `1` on HTTP or transport failures.

Use a named **context** when you need to select a particular connection. The key file must be a regular file owned by you, with no group or other access (use mode `0600`), and contain only the key. A Dagu runtime **profile** does not select a connection.

```bash
dagu-cli context add example --base-url https://dagu.example --api-key-file /absolute/path/to/key
dagu-cli --context example dag list
```

See the [connection context reference](https://github.com/yoyooyooo/dagu-cli/blob/main/docs/contexts.md) for configuration precedence, labels, bounded multi-context execution, and the Bun `dagu-cli/contexts` package API.

## Find a command

```bash
dagu-cli dag --help
dagu-cli dag start --help
dagu-cli skills get core
```

Root and leaf help describe the installed command tree. `skills list` lists command groups. `skills get core` describes everyday DAG and run commands. Load `run` for steps, sub-runs, human tasks, and artifacts, or `admin` for system controls. Agents can start with the [dagu-cli skill](./skills/dagu-cli/SKILL.md).

Path parameters are positional. Pass filters as `--query '<json object>'` or named flags listed by leaf help. Pass JSON with `--body` or `--body-file`. `dag params <fileName>` reports the parameter contract from the synced server catalog, not from a local YAML file.

Before using a command that writes to the server, check the method, target, and arguments. The CLI does not ask for a second confirmation. For example, `dag start <fileName>` starts a run. If you omit the body on `dag enqueue`, `dag start`, or `dag start sync`, the CLI sends `{}` so Dagu can use its `defaultParams`. Set explicit `params` to override those defaults. Leaf help lists which commands accept `--param` or `--params-file`. `webhook trigger` uses the webhook token, not `DAGU_API_KEY`.

The command tree follows the vendored OpenAPI document. A different Dagu server version can reject commands or offer operations that the CLI does not name.

## Support and development

- Report ordinary command bugs through [GitHub Issues](https://github.com/yoyooyooo/dagu-cli/issues). Do not include secrets or live server responses. For vulnerability reporting and credential handling, see the [security policy](https://github.com/yoyooyooo/dagu-cli/blob/main/SECURITY.md).
- To work from source, see the [contribution guide](https://github.com/yoyooyooo/dagu-cli/blob/main/CONTRIBUTING.md) for command mapping and verification.
- License: [GPL-3.0-or-later](./LICENSE). See [NOTICE](./NOTICE) for the vendored API materials.
