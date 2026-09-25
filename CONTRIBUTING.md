# Contributing

You need [Bun](https://bun.sh) 1.3.14 or newer. Node is not a supported way to run this CLI.

```bash
bun install --frozen-lockfile
bun run check
```

`bun run check` is the gate: `tsc --noEmit`, then `bun test`. Tests must not call a live Dagu server or read a real API key.

The command tree lives in `scripts/command-map.py`. After replacing `spec/openapi.json`, update the pairs in that script and run:

```bash
python3 scripts/command-map.py
bun test
```

The script fails if any operation is missing, duplicated, or mapped twice. Do not add a generic `call <operationId>` command.

Do not commit `.env` files, API keys, webhook tokens, or capture files from a real server. The vendored spec is a schema, not a transcript.

This program is GPL-3.0-or-later. By sending a contribution, you agree that it can be distributed under those terms. See `LICENSE` and `NOTICE`.

There is no public issue tracker yet. Do not send secrets in a bug report.
