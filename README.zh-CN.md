# dagu-cli

[English](./README.md) | [中文](./README.zh-CN.md)

dagu-cli 是 [Dagu](https://dagu.sh) 服务器的命令行客户端。你提供基址和 API key，它把这台服务器的 REST API 变成有名字的命令。Agent 先看到 `dag`、`run`、`webhook`，而不是 227 个 operation id。

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
export DAGU_API_KEY=<api-key>
dagu-cli dag list
```

需要 Bun 1.3.14 或更新版本。Node 不能运行这个 TypeScript bin。当前版本是 0.2.0。1.0.0 之前，命令名可能变化。

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

`DAGU_API_TOKEN` 是 `DAGU_API_KEY` 的别名。基址如果已经以 `/api/v1` 结尾，不会再追加一次。不要在基址上加 `/mcp`，也不要把 key 放进 URL。

用 **context** 管理 `local`、`box`、`mini`、`pro`、`imile-win` 等连接目标。**profile** 表示 Dagu runtime profile：现有 18 条 `dagu-cli profile ...` 命令，以及 webhook 的 `--profile` / `x-dagu-profile` 行为保持不变。profile 不参与连接选择。

```bash
# 密钥文件须已存在，只含 key，权限为 600。
dagu-cli context add mini --base-url https://dagu.example --api-key-file /absolute/path/to/key
dagu-cli context use mini
dagu-cli dag list
dagu-cli --context box dag list
dagu-cli -c mini dag params demo
dagu-cli context ls
dagu-cli context show mini
dagu-cli context use -       # 清除当前 context
dagu-cli context rm mini
```

`context show [name]` 展示指定名称或当前选中的 context，`apiKey` 显示为 `[redacted]`。它只展示已保存配置，不读取密钥文件，也不展示环境变量中的连接值。`ls` 列出已保存名称和持久化的当前 context。`add` 拒绝重名；替换连接时，先切换或清除当前 context，再移除旧项并重新添加。`rm` 拒绝移除当前 context，且只移除配置项，不操作密钥文件。管理命令不访问服务器。

`context add/use/rm/labels` 使用排他锁文件 `~/.config/dagu-cli/contexts.json.lock` 串行执行完整的读取、校验和写入，再以 mode 0600 原子替换配置，保留并发成功的修改。等待锁超过 5 秒会返回配置错误；只读命令无需等待。如果写入进程崩溃，须先确认没有 context 写入进程运行，再将遗留锁移至系统废纸篓并重试。

唯一配置文件是 `~/.config/dagu-cli/contexts.json`。结构：

```json
{
  "currentContext": "mini",
  "contexts": {
    "mini": {
      "baseUrl": "https://dagu.example",
      "apiKeyFile": "/absolute/path/to/key"
    }
  }
}
```

Labels 是 context 上可选的字符串键值元数据，例如 `"labels": {"region": "west", "tier": "prod"}`。读取或合并设置：

```sh
dagu-cli context labels mini
dagu-cli context labels mini region=west tier=prod
dagu-cli context select region=west tier=prod
```

`labels <name>` 返回 `{name, labels}`，未设置时为 `{}`；传入键值只合并／替换指定键。`show` 也展示已有 labels。`select` 返回 `{contexts: [排序后的名称]}`，按**所有条件同时匹配**；无匹配时为空列表，退出码仍为 0。它不改变当前 context、不读密钥文件、不访问服务器、不执行命令。键不能为空，不能包含空白、逗号或 `=`；值为字符串，允许空字符串与 `=`。每个条件单独传参，shell 空白需引号；重复键、空 selector 均报错。配置写回保留顶层与各 context 的未知字段，但 `show` 不展示未知字段。Labels 是可见元数据，不应存秘密。版本发布独立于这些 CLI 命令。

### 有界多 context 执行

```sh
dagu-cli context exec --selector region=west --selector tier=prod \
  --concurrency 4 --timeout-ms 30000 -- dag list --perPage 2
```

`context exec` 一次性冻结匹配的 context，在同一进程内对每个目标执行相同的 REST API 叶命令。重复 `--selector key=value` 表示 AND 条件。必须提供 selector 与 `--` 分隔符；无匹配为配置错误（退出 2），不算全部成功。忽略当前 context 与环境变量连接默认值，不改配置。

- 并发默认 4，范围 1–32；单 context 超时默认 30000 ms，范围 1–300000 ms。从获得并发槽位起计时，包含密钥读取、HTTP 和响应体消费，超时会取消本地请求。
- 结果按 context 名称排序。`result.summary` 统计 `total/success/failed/timeout`；`result.results` 为逐项 `{context, outcome, response}`，`response` 是正常脱敏命令 envelope。单项失败不取消其他目标。
- 只有所有目标成功才退出 0；任一目标配置、传输、HTTP 失败或超时，在收齐结果后退出 1。全局配置／参数非法在请求前退出 2。超时不代表远端写入已回滚；**不自动重试**。
- 只接受有限的 catalog REST 命令，不接受本地 context/skills、派生的 dag params、嵌套 exec、shell 命令或流式请求（stream=true）。`--` 后拒绝 `--context`/`-c`、`--base-url`、webhook token/signature 覆盖与单命令 `--timeout-ms`，目标和期限由 exec 统一持有。拒绝 stdin params。body/params 文件在执行前只读一次，确保每个目标收到同一 payload。现有日志命令默认 `stream=false`。
- 只有所有选中目标均获授权时才能执行写 API。上例只读。不涉及发版；公开包 API 见下文。

### 公开 contexts API（Bun，0.3.0）

正式包入口为 `dagu-cli/contexts`，随包提供 TypeScript ESM，运行环境与 CLI 一致：**Bun >=1.3.14**。这不是编译后的 Node.js/CommonJS SDK；不支持深路径导入源码。只有版本真正发布后才安装／锁定该精确版本，仓库版本号本身不是发布证据。

```ts
import { readContexts, readContext, selectContexts, executeContexts, CliError } from "dagu-cli/contexts";

const file = "/absolute/path/to/contexts.json";
const stored = await readContexts(file); // 省略则使用 contextsPath()
const connection = await readContext("mini", file); // 仅元数据，不解析密钥内容
const names = selectContexts(stored, { region: "west", tier: "prod" });
const report = await executeContexts({
  configFile: file, selector: { region: "west", tier: "prod" },
  command: ["dag", "list", "--perPage", "2"], concurrency: 4, timeoutMs: 30000,
});
console.log(report.ok, report.result.summary);
```

`readContexts(file?)` 返回校验过的 `ContextsFile`，保留未知字段。`readContext(name, file?)` 返回 `Context` 元数据，包含密钥文件**路径**，不包含密钥内容。`selectContexts(stored, selector)` 是同步纯函数，AND 匹配并排序；`labelPairs(["key=value"])` 解析 CLI 键值条件。`contextsPath()` 返回默认路径。显式配置文件中的相对密钥路径相对于该文件解析，不依赖进程 cwd；文件权限检查与 CLI 相同。

`executeContexts(options)` 返回 `Promise<ContextExecEnvelope>`，提供 `ContextExecReport` / `ContextExecEntry` 类型，与 CLI exec 使用相同的上限、命令限制、确定性结果和不重试语义。不修改 `process.env`、`process.exitCode`、配置或当前选择。逐目标失败／超时记录在返回结果中，不抛出；调用方须检查 `report.ok` 与每项结果。全局参数／配置错误以导出的 `CliError`（code/message/retryable）拒绝 Promise。导入模块不会启动 CLI 或访问网络。公开类型可从同一子路径导入。

**校验边界：**在 selector 之前全量校验文件。任一畸形 context（即使未选中）都会在请求前拒绝整个操作（CLI exit 2），错误会定位到该 context。隔离畸形项需要另行调整合同，本次保留此限制。配置元数据／未知字段可能敏感，不要整体打印。

`currentContext` 可以省略或为 `null`。每个 context 必须提供 REST `baseUrl` 和 `apiKeyFile`；禁止内联 key。`add` 保存绝对路径；手写配置中的相对路径按 `contexts.json` 所在目录解析。配置与密钥文件必须是当前属主的普通文件，不允许 group/other 权限（mode 600），不能是符号链接。名称为 1–64 个字母、数字、下划线或连字符，以字母或数字开头。

连接优先级：

1. `--base-url <url>` 覆盖下面来源的 URL，沿用该连接的 key。
2. 全局 `--context <name>` / `-c <name>` 选择命名连接。可放在命令前后，也接受 `--context=<name>`。
3. 非空 `DAGU_CONTEXT` 选择命名连接。
4. 持久化的 `currentContext` 选择命名连接。
5. 未选中 context 时，由 `DAGU_BASE_URL` 和 `DAGU_API_KEY`（或 `DAGU_API_TOKEN`）提供连接字段。
6. 缺失字段回退到可选的 `~/.config/dagu/automation.json`（`DAGU_CONFIG_FILE` 覆盖这个旧文件路径）：读取 `baseUrl` 和非空 `key`（否则读 `apiKey`）。URL 最后默认 `http://127.0.0.1:8080`；除 webhook trigger 外，API 调用必须有 key。

**迁移：**环境变量中的连接值现在优先于旧 automation 文件。CLI 永不改写旧文件。选中的 context 完整提供 URL 和 key；名称不存在、配置非法或密钥文件缺失／不安全时直接报错，不借用环境变量或旧文件中的凭据。`--base-url` 会保留选中连接的 key，因此只应在该凭据确实属于覆盖后的目标时使用。`context use -` 清除持久选择，但不覆盖 `DAGU_CONTEXT`。

Multica 对照核对了已安装 CLI、[GitHub main 配置实现](https://github.com/yoyooyooo/multica/blob/43b0571f992567a919c7f1f699ff160922594b94/server/internal/cli/config.go)和[选择逻辑](https://github.com/yoyooyooo/multica/blob/43b0571f992567a919c7f1f699ff160922594b94/server/cmd/multica/cmd_agent.go)。Multica 提供全局 profile 选择、独立 `profiles/<name>/config.json` 文件和 `config show/set`；该版本没有顶层 profile 管理组，也没有环境变量／当前 profile 选择链。dagu-cli 将其命名目标与显式选择体验适配成 `context`，使用单文件和上述优先级，保留 Dagu 既有 runtime profile 术语。

成功时响应包含 `"ok": true` 和 `status` 200。DAG 数组在 `result.body`。具体字段取决于你的 Dagu 版本。

改任何东西之前先看下一层：

```bash
bun run dagu-cli -- dag --help
bun run dagu-cli -- dag start --help
```

`dag start <fileName>` 是 POST `/dags/{fileName}/start`。只有确实要启动一次运行时才传 `--body`。

## 接下来会用到的命令

路径参数是位置参数。过滤用 `--query '<json object>'` 或 `--<name> <value>`，例如 `--limit 5`、`--q <text>`。不接受 `-q`。`run step log` 默认发送 `stream=false`，除非另外传 `--stream`。JSON body 放在 `--body` 或 `--body-file`。`dag enqueue`、`dag start` 和 `dag start sync` 在省略 body 时发送 `{}`，让服务端保留 DAG 的 `defaultParams`。显式的 `params` 仍然覆盖默认值。

```text
dagu-cli dag params <fileName>
dagu-cli dag get <fileName>
dagu-cli dag spec get <fileName>
dagu-cli run list
dagu-cli run get <name> <dagRunId>
dagu-cli run log <name> <dagRunId>
dagu-cli webhook trigger <fileName> --token <webhook-token>
dagu-cli wiki attachment put --body-file <path> --query '<json>'
```

`dag params` 打印参数契约（`result.params` 和一个小头部）。`dag get` 仍是完整运维视图。description 以 `Deprecated` 开头的参数默认省略，除非 `--include-deprecated true`；`required: true` 永不省略。`--remoteNode` 是唯一会发给服务器的查询参数。结果来自已同步的目录，不是尚未发布的 automation 工作区。

`webhook trigger` 不用 `DAGU_API_KEY`。它把 `--token` 当作 bearer token。只有该 webhook 要求时才加 `--signature` 和 `--profile`。

`wiki attachment put` 是唯一发送原始字节的命令。`run step logs form` 和 `run sub step logs form` 把 `--body` 发成 `application/x-www-form-urlencoded`。

完整命令树以 CLI 帮助为准，不在这一页展开。Agent 从 `skills/dagu-cli/SKILL.md` 进入。skill 名是 `dagu-cli`，不是 `dagu`。

## 安全与隐私

CLI 只把 API key 发给你设置的基址。`--body-file` 只读取你传入的本地路径。CLI 读取 context 配置和选中的私有密钥文件，或回退到可选的旧 `~/.config/dagu/automation.json`。只有 `context add/use/rm/labels` 写入连接配置；CLI 不把数据发到其他地方。`context show` 对凭据脱敏；服务器响应中的当前 API key、webhook token 和签名也会脱敏。传输错误使用固定文本，不回显 URL、环境变量值或凭据。

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
