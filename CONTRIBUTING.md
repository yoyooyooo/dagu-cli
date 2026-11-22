# Contributing

You need [Bun](https://bun.sh) 1.3.14 or newer. Node is not a supported way to run this CLI. From a clone of this repository:

```bash
bun install --frozen-lockfile
bun run dagu-cli -- --help
bun run check
```

The help command is a local CLI check. It should print a JSON command tree without contacting Dagu. `bun run check` is the contribution gate: `tsc --noEmit`, then `bun test`. Both steps must pass. Tests must not call a live Dagu server or read a real API key. In the PR, state which checks ran and why any were skipped.

The [connection context reference](./docs/contexts.md) defines the schema, precedence, batch behavior, and package API. The implementation is in [`src/contexts.ts`](./src/contexts.ts), [`src/config.ts`](./src/config.ts), [`src/context-exec.ts`](./src/context-exec.ts), and [`src/contexts.public.ts`](./src/contexts.public.ts). Context tests spawn the actual CLI with isolated HOME and configuration, synthetic credentials, and a local mock HTTP server. Concurrency regressions use a test-only preload to pause a real CLI after its snapshot read and observe a competing commit or lock contention. Cover add/add, add/use, use/rm, timeout, and failure cleanup. Keep credential comparisons boolean so failed assertions cannot print keys. [`test/contexts-package.test.ts`](./test/contexts-package.test.ts) checks the packed `dagu-cli/contexts` import, not just the source export.

[`scripts/command-map.py`](./scripts/command-map.py) generates [`spec/commands.json`](./spec/commands.json) against [`spec/openapi.json`](./spec/openapi.json). After replacing the OpenAPI document, update the pairs in the script and run:

```bash
python3 scripts/command-map.py
bun test
```

The script fails if any operation is missing, duplicated, or mapped twice. Do not add a generic `call <operationId>` command.

Do not commit `.env` files, API keys, webhook tokens, or capture files from a real server. The vendored spec is a schema, not a transcript.

This program is GPL-3.0-or-later. By sending a contribution, you agree that it can be distributed under those terms. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).

Use [GitHub Issues](https://github.com/yoyooyooo/dagu-cli/issues) for ordinary command bugs. For vulnerability reports, follow the [security policy](./SECURITY.md).
