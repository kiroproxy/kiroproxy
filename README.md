# KiroProxy

KiroProxy 是一个 Tauri 2 桌面客户端，把 [kiro2cc-proxy](https://github.com/TsinHzl/kiro2cc-proxy) 的代理能力包装成单窗口应用：账号、API Key、用量、日志、模型和设置都在应用内管理，Claude Code / Codex CLI / OpenAI SDK 仍通过本机 HTTP 端口接入。

## 功能

- 账号管理：KAM 导入、从本机 Kiro IDE 登录缓存导入、手动添加、启停、优先级、余额、模型探测、批量验活、账号详情
- API Key：创建/编辑/删除、USD / Credits 额度、懒激活有效期、绑定账号、明文复制、用量重置
- 用量：今日 / 7 天 / 30 天 / 自定义范围、按日汇总、调用记录
- 日志：实时运行日志、限流日志、失败日志、等级/搜索筛选、下载
- 模型：上游模型列表与按账号探测
- 设置：监听地址/端口、代理、负载均衡、RPM、功能开关、数据目录、外观、关于
- 客户端接入：Claude Code、Codex CLI、OpenAI SDK、cc-switch 片段生成

## 开发

要求：Rust 1.96+、Node.js 22+、pnpm 10+。

```bash
pnpm install
pnpm tauri dev
```

## 构建

```bash
pnpm tauri build
```

macOS 产物：

- `target/release/bundle/macos/KiroProxy.app`
- `target/release/bundle/dmg/KiroProxy_0.1.0_aarch64.dmg`

## 验证

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
pnpm --dir ui test
pnpm --dir ui build
```

## 运行时

- 默认监听 `127.0.0.1:5678`
- 数据目录：`~/Library/Application Support/com.pigcursor.kiroproxy/`
- 首次启动自动创建「本机默认」API Key
- 管理操作全部通过 Tauri `invoke`，不启动 Admin/User Web 页面

客户端接入示例：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:5678"
export ANTHROPIC_API_KEY="在「密钥」页复制的 Key"
```

## 许可与署名

MIT。代理核心基于 [kiro2cc-proxy](https://github.com/TsinHzl/kiro2cc-proxy)（MIT），上游基于 [kiro.rs](https://github.com/hank9999/kiro.rs)（MIT）。详见 [NOTICE](NOTICE) 与 [LICENSE](LICENSE)。
