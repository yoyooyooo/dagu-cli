# dagu-cli

[English](./README.md) | [中文](./README.zh-CN.md)

dagu-cli 是 [Dagu](https://dagu.sh) 服务器的命令行客户端。你提供基址和 API key，它把这台服务器的 REST API 变成有名字的命令。Agent 先看到 `dag`、`run`、`webhook`，而不是 227 个 operation id。

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=<api-key>
dagu-cli dag list
```

需要 Bun 1.3.14 或更新版本。Node 不能运行这个 TypeScript bin。当前版本是 0.1.1。1.0.0 之前，命令名可能变化。

## 解决的问题

Dagu 的 REST API 是一个 HTTP 面，里面有 227 个 operation。通用的 `call <operationId>` 让 Agent 每次行动前都要把整份目录再读一遍。官方 `dagu` 二进制也不覆盖这套 API。你需要的是直接说「列出 DAG」或「停止这次运行」，由 CLI 填上方法、路径和参数。

## 主要能力

- 名词加动词的命令树。根帮助列出 `dag`、`run`、`webhook`、`sync`、`wiki`、`profile`、`notify`、`incident`、`queue`、`secret`、`search`、`admin`。
- vendored OpenAPI 文档里的每个 operation 都有一条命令。测试不允许遗漏或重复。
- 标准输出是 JSON。成功退出 `0`，用法或配置错误退出 `2`，HTTP 或传输失败退出 `1`。
- skill 文本由 CLI 自己提供，所以说明和已安装的命令树一致。

这个 CLI 不负责编写 DAG YAML，不负责排期，也不替代 `dagu` 二进制。

## 工作原理

CLI 读取 `spec/openapi.json` 和 `spec/commands.json`。`dag start <fileName>` 这种命令是某个 operation 的固定名字。位置参数按 `--help` 的顺序填进路径参数。`--query` 和 `--body` 发送可选 JSON。进程随后向 `<DAGU_BASE_URL>/api/v1` 发一个 HTTP 请求。

`dagu-cli skills get core` 只返回日常的 `dag` 和 `run`。`skills get run` 才加入步骤、子运行、人工任务和 artifact。`skills get admin` 才加入用户、API key、workspace 和系统控制。其他名词用 `dagu-cli <noun> --help` 展开。

## 安装

安装 Bun 1.3.14 或更新版本，克隆本仓库，然后：

```bash
bun install --frozen-lockfile
bun run dagu-cli -- --help
```

包在官方 npm registry 上。TypeScript bin 仍然要用 Bun 运行：

```bash
bun install -g dagu-cli
dagu-cli --help
```

源码在 <https://github.com/yoyooyooo/dagu-cli>。`0.1.0` 由维护者本机发布，没有 provenance。之后的版本由 `v*` tag workflow 发布。

## 快速开始

在本仓库、Bun 1.3.14 下：

```bash
bun install --frozen-lockfile
bun run dagu-cli -- --help
bun run dagu-cli -- skills get core
```

根帮助是 JSON。第一条命令类似：

```json
{"command":"admin","usage":"dagu-cli admin","summary":"50 commands"}
```

其中也有 `skills`。它不会访问服务器。

要访问服务器，先在 Dagu 里创建 API key，再放到当前 shell 的环境变量里。不要写进会提交的文件。

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=<api-key>
bun run dagu-cli -- dag list
```

`DAGU_API_TOKEN` 是 `DAGU_API_KEY` 的别名。基址如果已经以 `/api/v1` 结尾，不会再追加一次。成功时响应包含 `"ok": true` 和 `status` 200。DAG 数组在 `result.body`。具体字段取决于你的 Dagu 版本。

改任何东西之前先看下一层：

```bash
bun run dagu-cli -- dag --help
bun run dagu-cli -- dag start --help
```

`dag start <fileName>` 是 POST `/dags/{fileName}/start`。只有确实要启动一次运行时才传 `--body`。

## 接下来会用到的命令

路径参数是位置参数。过滤用 `--query '<json object>'` 或 `--<name> <value>`，例如 `--limit 5`、`--q <text>`。不接受 `-q`。`run step log` 默认发送 `stream=false`，除非另外传 `--stream`。JSON body 放在 `--body` 或 `--body-file`。

```text
dagu-cli dag get <fileName>
dagu-cli dag spec get <fileName>
dagu-cli run list
dagu-cli run get <name> <dagRunId>
dagu-cli run log <name> <dagRunId>
dagu-cli webhook trigger <fileName> --token <webhook-token>
dagu-cli wiki attachment put --body-file <path> --query '<json>'
```

`webhook trigger` 不用 `DAGU_API_KEY`。它把 `--token` 当作 bearer token。只有该 webhook 要求时才加 `--signature` 和 `--profile`。

`wiki attachment put` 是唯一发送原始字节的命令。`run step logs form` 和 `run sub step logs form` 把 `--body` 发成 `application/x-www-form-urlencoded`。

完整命令树以 CLI 帮助为准，不在这一页展开。Agent 从 `skills/dagu/SKILL.md` 进入。

## 安全与隐私

CLI 只把 API key 发给你设置的基址。`--body-file` 只读取你传入的本地路径。它不写配置文件，也不把数据发到其他地方。错误文本会把 API key 替换成 `[redacted]`。

没有二次确认。HTTP 方法是 POST、PUT、PATCH 或 DELETE 的命令会修改服务器。只在确实需要这个效果时运行。

见 [SECURITY.md](./SECURITY.md)。私下的漏洞联系方式尚未公布。

## 限制

- 命令树对齐的是随仓库提供的 `spec/openapi.json`（`info.version` 为 1.0.0）。更新或更旧的 Dagu 服务器可能拒绝这些命令，也可能增加本版本没有命名的 operation。
- Node、Deno 和浏览器都不是支持的宿主。
- 本地检查没有覆盖 Windows。已核对的宿主是 Bun 1.3.14。
- `0.1.0` 没有 npm provenance。provenance 从 tag workflow 开始。
- OpenAPI 文档和由此生成的命令映射是 Dagu 的 GPL-3.0-or-later 材料。见 [NOTICE](./NOTICE)。

## 开发

见 [CONTRIBUTING.md](./CONTRIBUTING.md)。检查命令是 `bun run check`。

许可证：[GPL-3.0-or-later](./LICENSE)。
