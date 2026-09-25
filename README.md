# dagu-cli

Agent-first command tree for the Dagu REST API. One API key and a base URL are enough. Every vendored OpenAPI operation has one named command.

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=dagu_...
dagu-cli --help
dagu-cli dag list
dagu-cli dag get demo.yaml
dagu-cli skills get core
```

`DAGU_API_TOKEN` is accepted as an alias of `DAGU_API_KEY`. If `DAGU_BASE_URL` already ends in `/api/v1`, it is used as the API root.

Stdout is JSON. The process exits `0` on success, `2` on usage or config errors, and `1` on HTTP or transport failures.

Agents should start at `skills/dagu/SKILL.md`, then load only the skill or noun they need.
