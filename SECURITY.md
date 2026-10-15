# Security

## Supported versions

Security fixes apply to the current `main` branch and latest `0.1.x` release. Older snapshots are not supported. The package is published to npm by the Publish tag workflow, which then starts global-pkg-upgrade.

## Reporting

This repository does not yet have a published private vulnerability contact. Do not open a public issue, pull request, or chat message that contains vulnerability details, tokens, or server data.

Until a private contact is published, keep the report off public channels. The missing contact is an open gap, not an invitation to post the report publicly.

## What this CLI does

Contexts are connection targets. Dagu runtime profiles remain under `profile ...` and webhook `--profile` (`x-dagu-profile`); those do not select connections.

Connection precedence is `--base-url` > `--context` / `-c` > `DAGU_CONTEXT` > current context > `DAGU_BASE_URL` / `DAGU_API_KEY` (`DAGU_API_TOKEN` alias) > the optional legacy `~/.config/dagu/automation.json` (`DAGU_CONFIG_FILE` overrides). Environment values now precede the legacy file, which is never rewritten. `--base-url` retains the selected key: callers choose the origin receiving that credential. Selected contexts fail on unknown names or invalid/missing key files rather than borrowing another connection's key.

`~/.config/dagu-cli/contexts.json` stores `currentContext` and a `contexts` map of `baseUrl` / `apiKeyFile` references, never inline keys. Relative references resolve against its directory. Configs and referenced key files must be regular files owned by the current user, without group/other permissions (mode 600); symlinks are refused. `context add/use/rm` hold an exclusive mode-0600 `contexts.json.lock` across the full read–validate–write transaction and replace the config atomically with mode 0600. Lock acquisition times out with a configuration error after 5 seconds. A crashed writer can leave the lock behind; confirm no writer is running before moving a leftover lock to the system trash. `rm` removes only a configuration entry, never a key file. No context-management command requests a server.

`context show` displays stored settings with keys redacted and never resolves key files or displays environment connection values. Server responses redact active API keys, webhook tokens and signatures, including reflected strings and object keys. Transport errors use fixed text instead of exception details that may contain URLs or environment values. The CLI does not phone home. `--body-file` reads the path you pass. Requests go only to the configured Dagu server. See [README.md](./README.md) for schema and commands.

Commands that use POST, PUT, PATCH, or DELETE change that server. The CLI does not ask for a second confirmation.
