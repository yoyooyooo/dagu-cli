# dagu-cli

Agent-first CLI for the Dagu REST API. One API key and a base URL are enough. The command surface comes from the vendored OpenAPI document, not from a particular machine.

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=dagu_...
dagu-cli operations --tag dags
dagu-cli describe ListDAGs
dagu-cli call ListDAGs
```

`DAGU_API_TOKEN` is accepted as an alias of `DAGU_API_KEY`. If `DAGU_BASE_URL` already ends in `/api/v1`, it is used as the API root.

Stdout is JSON. The process exits `0` on success, `2` on usage or config errors, and `1` on HTTP or transport failures.

Agents should read `skills/dagu/SKILL.md`.
