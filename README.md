# Codesign

A Tauri 2 desktop starter using React 19, TypeScript, Tailwind CSS 4, shadcn/ui, and Bun.

## Prerequisites

- [Bun](https://bun.sh/)
- [Rust](https://rustup.rs/)
- [Tauri system dependencies](https://v2.tauri.app/start/prerequisites/)

## Development

```bash
bun install
bun run tauri dev
```

Run only the browser frontend with `bun run dev`.

## Production builds

```bash
bun run build
bun run tauri build
```

Add more shadcn components with `bunx --bun shadcn@latest add <component>`.
