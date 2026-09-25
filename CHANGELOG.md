# Changelog

This project uses semantic versioning. Before 1.0.0, minor versions may change command names or JSON fields.

## 0.1.1

- Publish from the `v*` tag workflow in `.github/workflows/publish.yml`.
- Record the GitHub repository in the package manifest.

## 0.1.0

First public source release. Published from a maintainer session, without provenance.

- One named command for each of the 227 operations in the vendored OpenAPI document.
- Root help lists nouns. `dagu-cli skills get <name>` loads one layer of the tree.
- `webhook trigger` uses `--token`, not `DAGU_API_KEY`.
- `wiki attachment put` sends `--body-file` as raw bytes. Two step-log commands send a form body.
