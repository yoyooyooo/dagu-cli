# Tailscale OAuth CI

GitHub Actions 使用 TS_OAUTH_CLIENT_ID、TS_OAUTH_SECRET；与其他受管 CI 及 Cursor 共用一个 OAuth client。CI 只注册 tag:ci，网络仅允许 Dagu service TCP 443。Cursor 的 tag:cursor-cloud 授权由独立 policy grant 拥有。密钥不随工作流或 Git 分发。

只读 tailscale-oauth-verify.yml 校验注入的 client ID/generation、Online 与单 tag 身份、Dagu health，以及禁止的 SSH/AGS TCP 访问。该 canary 不触发业务 DAG。共享 client 轮换由 mini 的 Automation ts-authkey-rotate/shared-client-sinks.json 统一登记所有 sinks，逐一分发和消费验证；Cursor 控制台待确认时不得撤销旧 client。

迁移 PR 合并并完成 canary 前保留旧 auth-key Secret，不能把 gh secret set 成功当成已消费验证。Publish handoff 使用稳定 release run ID，并在重试前读回已有 run 与参数；结果未知不新建另一个业务运行。
