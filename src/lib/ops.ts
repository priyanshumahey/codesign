import { invoke } from "@tauri-apps/api/core"

import type { IconEntry } from "@/components/space/types"
import type { SpaceDocument } from "./spaces"

/**
 * Ops are defined in Rust (`codesign-core`) and constructed by the agent, so
 * the webview only ever passes them through — there is no TypeScript mirror of
 * the op schema to drift.
 */
export type SpaceOp = Record<string, unknown>

export type OpOutcome = {
  op: string
  ids: string[]
  message: string
}

export type ApplyResult = {
  document: SpaceDocument
  outcomes: OpOutcome[]
  summary: string
}

export const applyOps = (document: SpaceDocument, ops: SpaceOp[]) =>
  invoke<ApplyResult>("apply_ops", { document, ops })

/** Hands the generated manifest to the Rust side, which cannot read bundled assets. */
export const primeIconIndex = (json: string) =>
  invoke<number>("load_icon_manifest", { json })

export const searchIcons = (query: string, limit?: number) =>
  invoke<IconEntry[]>("search_icons", { query, limit })

export const summarizeDocument = (document: SpaceDocument) =>
  invoke<string>("summarize_document", { document })

export type McpConfig = {
  json: string
  serverName: string
  binary: string
  ready: boolean
  hint: string | null
}

export const mcpConfig = (path: string, name: string) =>
  invoke<McpConfig>("mcp_config", { path, name })
