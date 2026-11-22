# dagu-cli

[English](./README.md) | [中文](./README.zh-CN.md)

dagu-cli 是 [Dagu](https://dagu.sh) 服务器的命令行客户端。运维人员和 Agent 可从 `dag`、`run`、`sync`、`webhook` 找到具名操作，不用查 REST operation ID。它不编写 DAG YAML，不调度工作流，也不替代 `dagu` 二进制。

## 安装

需要 [Bun](https://bun.sh) 1.3.14 或更新版本。可执行入口是 TypeScript，不支持 Node.js、Deno 或浏览器。

```bash
bun install -g dagu-cli
dagu-cli --help
```

可安装版本见 [npm registry](https://www.npmjs.com/package/dagu-cli)，各版变更见[更新日志](./CHANGELOG.md)。1.0.0 之前，小版本可能改变命令名或 JSON 字段。

## 连接服务器

将基址设为你有权查看的 Dagu 服务器。通过已有的凭据来源在当前 shell 设置 `DAGU_API_KEY`，也可用别名 `DAGU_API_TOKEN`。不要提交 key，也不要放在 URL 里。基址不以 `/api/v1` 结尾时，CLI 会补上该路径。不要加 `/mcp`。

```bash
export DAGU_BASE_URL=http://127.0.0.1:8080
dagu-cli dag list
```

此例假定没有选中 context。若已保存目标连接，按下文显式选择。列表请求成功时，标准输出为 JSON，包含 `"ok": true`，服务端数据在 `result.body`。成功退出 `0`，用法或配置错误退出 `2`，HTTP 或传输失败退出 `1`。

需要指定连接时，用命名 **context**。密钥文件必须是当前用户拥有的普通文件，不允许组或其他用户访问（使用 `0600`），内容仅为 key。Dagu 运行时 **profile** 不负责选择连接。

```bash
dagu-cli context add example --base-url https://dagu.example --api-key-file /absolute/path/to/key
dagu-cli --context example dag list
```

配置优先级、标签、多连接有界执行和 Bun `dagu-cli/contexts` API 见[连接契约（英文）](https://github.com/yoyooyooo/dagu-cli/blob/main/docs/contexts.md)。

## 查找命令

```bash
dagu-cli dag --help
dagu-cli dag start --help
dagu-cli skills get core
```

以已安装版本的根帮助和具体命令帮助为准。`skills list` 列出命令分组；`skills get core` 提供日常 DAG 和运行命令。查步骤、子运行、人工任务或产物时读 `run`，查系统管理时读 `admin`。Agent 可从 [dagu-cli Skill](./skills/dagu-cli/SKILL.md) 开始。

路径参数按位置传入。过滤用 `--query '<json object>'` 或具体命令帮助列出的参数名。JSON 请求体用 `--body` 或 `--body-file`。`dag params <fileName>` 返回已同步的服务端参数契约，不是本地 YAML 的内容。

执行写命令之前，先确认方法、目标和参数。CLI 不做二次确认。例如，`dag start <fileName>` 会启动一次运行。`dag enqueue`、`dag start`、`dag start sync` 在省略请求体时发送 `{}`，以便 Dagu 使用 `defaultParams`。显式 `params` 会覆盖默认值。具体命令的帮助会列出是否接受 `--param` 或 `--params-file`。`webhook trigger` 使用 webhook token，而不是 `DAGU_API_KEY`。

命令树跟随仓库携带的 OpenAPI 文档。其他 Dagu 服务器版本可能拒绝这些命令，或提供 CLI 尚未命名的操作。

## 支持与开发

- 普通命令问题通过 [GitHub Issues](https://github.com/yoyooyooo/dagu-cli/issues) 报告，不要附凭据或真实服务端响应。漏洞报告及凭据处理见[安全政策](https://github.com/yoyooyooo/dagu-cli/blob/main/SECURITY.md)。
- 从源码开发、更新命令映射或查验证方法，读[贡献指南](https://github.com/yoyooyooo/dagu-cli/blob/main/CONTRIBUTING.md)。
- 许可证：[GPL-3.0-or-later](./LICENSE)。随仓库携带的 API 材料见 [NOTICE](./NOTICE)。
