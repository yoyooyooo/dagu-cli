# Changelog

This project uses semantic versioning. Before 1.0.0, minor versions may change command names or JSON fields.

## Unreleased

- `dag params <fileName>` projects the parameter contract from `GetDAGDetails` (`paramDefs`, or `paramSchema` when definitions are absent). `dag get` is unchanged. Descriptions that start with `Deprecated` are omitted unless `--include-deprecated true`. A parameter with `required: true` is never omitted.

## 0.1.2

- Read optional `~/.config/dagu/automation.json` (`key`, optional `baseUrl`) before `DAGU_API_KEY` / `DAGU_BASE_URL`. This is the automation catalog credential file, not a second secret store. The CLI still does not write it.
- `dag start`, `dag start sync`, `dag enqueue`, `run start spec`, and `run enqueue spec` accept repeatable `--param key=value` and one `--params-file <object.json>`. Scalar values are stringified into `body.params`. Other body fields stay on `--body`.

## 0.1.1

- Publish from the `v*` tag workflow in `.github/workflows/publish.yml`.
- Record the GitHub repository in the package manifest.

## 0.1.0

First public source release. Published from a maintainer session, without provenance.

- One named command for each of the 227 operations in the vendored OpenAPI document.
- Root help lists nouns. `dagu-cli skills get <name>` loads one layer of the tree.
- `webhook trigger` uses `--token`, not `DAGU_API_KEY`.
- `wiki attachment put` sends `--body-file` as raw bytes. Two step-log commands send a form body.
