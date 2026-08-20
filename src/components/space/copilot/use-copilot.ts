import { useCallback, useEffect, useRef, useState } from "react"

import {
  aiConversation,
  aiConversations,
  aiDeleteConversation,
  aiModels,
  aiSend,
  aiSetConfig,
  aiStatus,
  type AgentEvent,
  type AiStatus,
  type ConversationSummary,
} from "@/lib/ai"
import type { SpaceDocument } from "@/lib/spaces"
import { diffDocuments, type DiagramChange } from "./document-diff"

export type ToolTrace = {
  name: string
  message: string
  ok: boolean
  status?: "running" | "completed" | "failed"
  args?: Record<string, unknown>
}

export type SendOptions = {
  review?: boolean
}

export type ChangeProposal = {
  baseDocument: SpaceDocument
  document: SpaceDocument
  changes: DiagramChange[]
  builtFromScratch: boolean
  status: "pending" | "applied" | "dismissed" | "stale"
}

function settleTool(
  tools: ToolTrace[],
  result: { name: string; message: string; ok: boolean }
) {
  const pendingIndex = tools.findIndex(
    (tool) => tool.name === result.name && tool.status === "running"
  )
  const settled: ToolTrace = {
    ...(pendingIndex >= 0 ? tools[pendingIndex] : {}),
    ...result,
    status: result.ok ? "completed" : "failed",
  }

  if (pendingIndex < 0) return [...tools, settled]
  return tools.map((tool, index) => (index === pendingIndex ? settled : tool))
}

export type ChatMessage = {
  id: string
  role: "user" | "assistant"
  text: string
  tools: ToolTrace[]
  proposal?: ChangeProposal
  changes?: DiagramChange[]
  usage?: { input: number; output: number }
  durationMs?: number
  /** Set once the turn finishes, so a reply can be undone as a unit. */
  changed?: boolean
  error?: string
}

let counter = 0
const nextId = () => `m${counter++}`
const newConversationId = () => crypto.randomUUID()

export function useCopilot({
  spaceId,
  getDocument,
  getSelection,
  onDocument,
  onTurnStart,
  onTurnEnd,
}: {
  spaceId: string
  getDocument: () => SpaceDocument
  getSelection: () => string[]
  onDocument: (document: SpaceDocument) => void
  onTurnStart: () => void
  onTurnEnd: (result: { changed: boolean; builtFromScratch: boolean }) => void
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<AiStatus | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [conversationId, setConversationId] = useState<string>(newConversationId)

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const statusRef = useRef<AiStatus | null>(null)
  statusRef.current = status

  const conversationRef = useRef(conversationId)
  conversationRef.current = conversationId

  const busyRef = useRef(false)
  busyRef.current = busy

  // Handlers are called from a Tauri channel, so read the live callbacks.
  const latest = useRef({
    spaceId,
    getDocument,
    getSelection,
    onDocument,
    onTurnStart,
    onTurnEnd,
  })
  latest.current = {
    spaceId,
    getDocument,
    getSelection,
    onDocument,
    onTurnStart,
    onTurnEnd,
  }

  useEffect(() => {
    aiStatus()
      .then(setStatus)
      .catch((error) =>
        setStatus({
          ready: false,
          provider: "vertex",
          model: "",
          location: "",
          project: null,
          detail: String(error),
        })
      )
    // Best effort: the picker falls back to whatever is configured.
    aiModels().then(setModels).catch(() => {})
  }, [])

  const refreshConversations = useCallback(async (space: string) => {
    try {
      setConversations(await aiConversations(space))
    } catch {
      setConversations([])
    }
  }, [])

  // Each space keeps its own chats, and opening one starts on a blank thread.
  useEffect(() => {
    setMessages([])
    setConversationId(newConversationId())
    void refreshConversations(spaceId)
  }, [spaceId, refreshConversations])

  const openConversation = useCallback(
    async (id: string) => {
      if (busyRef.current) return
      setConversationId(id)
      try {
        const turns = await aiConversation(latest.current.spaceId, id)
        setMessages(
          turns.map((turn) => ({
            id: nextId(),
            role: turn.role,
            text: turn.text,
            tools: turn.tools,
          }))
        )
      } catch {
        setMessages([])
      }
    },
    []
  )

  const newConversation = useCallback(() => {
    if (busyRef.current) return
    setConversationId(newConversationId())
    setMessages([])
  }, [])

  const deleteConversation = useCallback(
    async (id: string) => {
      const space = latest.current.spaceId
      await aiDeleteConversation(space, id).catch(() => {})
      if (id === conversationRef.current) {
        setConversationId(newConversationId())
        setMessages([])
      }
      void refreshConversations(space)
    },
    [refreshConversations]
  )

  const send = useCallback(async (text: string, options: SendOptions = {}) => {
    const prompt = text.trim()
    if (!prompt || busyRef.current) return
    const review = options.review === true

    busyRef.current = true
    const startedAt = performance.now()
    const replyId = nextId()
    setBusy(true)
    setMessages((current) => [
      ...current,
      { id: nextId(), role: "user", text: prompt, tools: [] },
      { id: replyId, role: "assistant", text: "", tools: [] },
    ])

    const patch = (change: (message: ChatMessage) => ChatMessage) =>
      setMessages((current) =>
        current.map((message) => (message.id === replyId ? change(message) : message))
      )

    let touched = false
    const beforeDocument = latest.current.getDocument()
    let finalDocument = beforeDocument
    const startedEmpty = beforeDocument.nodes.length === 0

    const handle = (event: AgentEvent) => {
      switch (event.type) {
        case "text":
          patch((message) => ({ ...message, text: message.text + event.delta }))
          break
        case "toolCall":
          patch((message) => ({
            ...message,
            tools: [
              ...message.tools,
              {
                name: event.name,
                message: "Running",
                ok: true,
                status: "running",
                args: event.args,
              },
            ],
          }))
          break
        case "toolResult":
          patch((message) => ({
            ...message,
            tools: settleTool(message.tools, event),
          }))
          break
        case "document": {
          if (JSON.stringify(finalDocument) === JSON.stringify(event.document)) break
          // Checkpoint immediately before the first real edit so the whole
          // streamed turn collapses into one undo step.
          if (!touched && !review) latest.current.onTurnStart()
          touched = true
          finalDocument = event.document
          if (!review) latest.current.onDocument(event.document)
          break
        }
        case "usage":
          patch((message) => ({
            ...message,
            usage: {
              input: (message.usage?.input ?? 0) + event.input,
              output: (message.usage?.output ?? 0) + event.output,
            },
          }))
          break
        case "error":
          patch((message) => ({ ...message, error: event.message }))
          break
        default:
          break
      }
    }

    try {
      await aiSend(
        {
          spaceId: latest.current.spaceId,
          conversationId: conversationRef.current,
          document: latest.current.getDocument(),
          message: prompt,
          selection: latest.current.getSelection(),
        },
        handle
      )
    } catch (error) {
      patch((message) => ({
        ...message,
        error: message.error ?? String(error),
      }))
    } finally {
      const changes = touched ? diffDocuments(beforeDocument, finalDocument) : []
      patch((message) => ({
        ...message,
        changed: touched && !review,
        changes: review ? [] : changes,
        proposal:
          review && changes.length > 0
            ? {
                baseDocument: beforeDocument,
                document: finalDocument,
                changes,
                builtFromScratch: startedEmpty,
                status: "pending",
              }
            : undefined,
        durationMs: Math.round(performance.now() - startedAt),
      }))
      latest.current.onTurnEnd({
        changed: touched && !review,
        builtFromScratch: startedEmpty && touched && !review,
      })
      busyRef.current = false
      setBusy(false)
      void refreshConversations(latest.current.spaceId)
    }
  }, [refreshConversations])

  const applyProposal = useCallback((messageId: string) => {
    const message = messagesRef.current.find((item) => item.id === messageId)
    const proposal = message?.proposal
    if (!proposal || proposal.status !== "pending") return

    if (
      JSON.stringify(latest.current.getDocument()) !==
      JSON.stringify(proposal.baseDocument)
    ) {
      setMessages((current) =>
        current.map((item) =>
          item.id === messageId && item.proposal
            ? {
                ...item,
                proposal: { ...item.proposal, status: "stale" },
              }
            : item
        )
      )
      return
    }

    latest.current.onTurnStart()
    latest.current.onDocument(proposal.document)
    latest.current.onTurnEnd({
      changed: true,
      builtFromScratch: proposal.builtFromScratch,
    })
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId && item.proposal
          ? {
              ...item,
              changed: true,
              changes: item.proposal.changes,
              proposal: { ...item.proposal, status: "applied" },
            }
          : item
      )
    )
  }, [])

  const dismissProposal = useCallback((messageId: string) => {
    setMessages((current) =>
      current.map((item) =>
        item.id === messageId && item.proposal?.status === "pending"
          ? {
              ...item,
              proposal: { ...item.proposal, status: "dismissed" },
            }
          : item
      )
    )
  }, [])

  const setModel = useCallback(async (model: string) => {
    const current = statusRef.current
    if (!current) return
    setStatus({ ...current, model })
    try {
      setStatus(
        await aiSetConfig({
          provider: current.provider,
          model,
          project: current.project,
          location: current.location,
        })
      )
    } catch {
      setStatus(current)
    }
  }, [])

  return {
    messages,
    busy,
    status,
    models,
    conversations,
    conversationId,
    send,
    applyProposal,
    dismissProposal,
    setModel,
    newConversation,
    openConversation,
    deleteConversation,
  }
}
