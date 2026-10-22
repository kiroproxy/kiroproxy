# KiroProxy UI

KiroProxy 桌面应用的前端：React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui（Base UI）。
所有数据通过 Tauri `invoke` 调 Rust 层，不直接访问网络。

```bash
pnpm install
pnpm dev        # 浏览器预览（无 Tauri IPC，仅布局/组件）
pnpm test
pnpm build
```

组件规范与设计 token 见仓库根目录的 `docs/superpowers/specs/`（私有文档仓库）。
