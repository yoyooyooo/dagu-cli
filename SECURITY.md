# Security

## Supported versions

Security fixes apply to the current `main` branch and to the latest `0.1.x` source tag once tags exist. Older snapshots are not supported. No package has been published to a registry.

## Reporting

This repository does not yet have a public remote or a published private contact. Do not open a public issue, pull request, or chat message that contains vulnerability details, tokens, or server data.

Until a private contact is published, keep the report off public channels. The missing contact is an open gap, not an invitation to post the report publicly.

## What this CLI does

The CLI reads `DAGU_API_KEY` or `DAGU_API_TOKEN` from the environment, unless `~/.config/dagu/automation.json` (or `DAGU_CONFIG_FILE`) contains `key`. That file is the same private credential file the automation catalog client uses. Optional `baseUrl` in the file overrides `DAGU_BASE_URL`. `--base-url` still wins. The default origin is `http://127.0.0.1:8080`. The file must be a regular file owned by the current user with mode 600; a symlink or a wider mode is refused and its contents are not logged. `webhook trigger` sends `--token` instead, plus `--signature` and `--profile` when you pass them.

It does not write a config file, does not phone home, and does not log the key. Error text replaces the API key with `[redacted]`. `--body-file` reads the path you pass. Every other request goes only to the Dagu server you configured.

Commands that use POST, PUT, PATCH, or DELETE change that server. The CLI does not ask for a second confirmation.
