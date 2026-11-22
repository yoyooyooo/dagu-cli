# Security

## Supported versions

Security fixes apply to the current `main` branch and latest `0.1.x` release. Older snapshots are not supported. A version's presence on npm does not establish security support for that version.

## Reporting

This repository does not yet have a published private vulnerability contact. Do not open a public issue, pull request, or chat message that contains vulnerability details, tokens, or server data.

Until a private contact is published, keep the report off public channels. The missing contact is an open gap, not an invitation to post the report publicly.

## What this CLI does

Contexts are connection targets. Dagu runtime profiles remain under `profile ...` and webhook `--profile` (`x-dagu-profile`); those do not select connections.

See the [connection context reference](./docs/contexts.md) for credential selection, file permissions, and configuration writes. A named context stores a key file path, not the key. A failed named connection does not borrow another connection's credentials. `--base-url` retains the selected key. Use it only when that credential belongs at the overridden origin.

`context show` displays stored settings with keys redacted. It does not resolve key files or display connection values from the environment. The CLI redacts active API keys, webhook tokens, and signatures from response bodies, including reflected strings and object keys. Transport errors use fixed text instead of exception details that may contain URLs or environment values. `--body-file` reads the path you pass. Use a Dagu URL you trust.

Check write methods such as POST, PUT, PATCH, and DELETE before running a command. The CLI does not ask for a second confirmation. For `context exec`, confirm that the action is authorized on every selected target. A timeout does not prove that a remote write failed, and the CLI does not retry it.
