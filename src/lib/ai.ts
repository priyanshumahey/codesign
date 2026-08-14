import { invoke } from "@tauri-apps/api/core"
import { Channel } from "@tauri-apps/api/core"

import type { SpaceDocument } from "./spaces"

export type AiStatus = {
  ready: boolean
  provider: string
  model: string
  location: string
  project: string | null
  detail: string | null
}

export type AiConfig = {
  provider: string
  model: string
  project: string | null
  location: string
}

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "toolCall"; name: string; args: Record<string, unknown> }
  | { type: "toolResult"; name: string; message: string; ok: boolean }
  | { type: "document"; document: SpaceDocument }
  | { type: "usage"; input: number; output: number }
  | { type: "error"; message: string }
  | { type: "done" }

export type ToolTrace = {
  name: string
  message: string
  ok: boolean
}

export type ConversationSummary = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  turns: number
}

export type Turn = {
  role: "user" | "assistant"
  text: string
  tools: ToolTrace[]
}

export const aiStatus = () => invoke<AiStatus>("ai_status")

export const aiModels = () => invoke<string[]>("ai_models")

export const aiConversations = (spaceId: string) =>
  invoke<ConversationSummary[]>("ai_conversations", { spaceId })

export const aiConversation = (spaceId: string, id: string) =>
  invoke<Turn[]>("ai_conversation", { spaceId, id })

export const aiDeleteConversation = (spaceId: string, id: string) =>
  invoke<void>("ai_delete_conversation", { spaceId, id })

export const aiSetConfig = (config: AiConfig) =>
  invoke<AiStatus>("ai_set_config", { config })

export function aiSend(
  args: {
    spaceId: string
    conversationId: string
    document: SpaceDocument
    message: string
    selection: string[]
  },
  onEvent: (event: AgentEvent) => void
) {
  const channel = new Channel<AgentEvent>()
  channel.onmessage = onEvent
  return invoke<void>("ai_send", { request: args, onEvent: channel })
}
