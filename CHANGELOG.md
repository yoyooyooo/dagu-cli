# Changelog

This project uses semantic versioning. Before 1.0.0, minor versions may change command names or JSON fields.

## 0.1.0

First public-ready source release. Not published to a package registry.

- One named command for each of the 227 operations in the vendored OpenAPI document.
- Root help lists nouns. `dagu-cli skills get <name>` loads one layer of the tree.
- `webhook trigger` uses `--token`, not `DAGU_API_KEY`.
- `wiki attachment put` sends `--body-file` as raw bytes. Two step-log commands send a form body.
