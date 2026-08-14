import { useCallback, useRef } from "react"
import {
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type XYPosition,
} from "@xyflow/react"

import { fromDocument, toDocument } from "./document"
import { peekPendingIconDrag, setPendingIconDrag } from "./drag-payload"
import { retargetEdges } from "./edge-routing"
import { absolutePosition, findBoundaryAt, nodeSize } from "./geometry"
import { reconcileEdges, reconcileNodes } from "./reconcile"
import {
  BOUNDARY_COLORS,
  CONTAINER_BOUNDARY_ID,
  CONTAINER_NOTE_ID,
  BOUNDARY_DEFAULT_SIZE,
  BOUNDARY_NODE_TYPE,
  ICON_DRAG_MIME,
  NOTE_DEFAULT_SIZE,
  NOTE_NODE_TYPE,
  SERVICE_NODE_SIZE,
  SERVICE_NODE_TYPE,
  type EdgeDirection,
  type BoundaryNodeData,
  type IconEntry,
  type NoteNodeData,
  type ServiceNodeData,
} from "./types"
import { applyOps as invokeApplyOps, type OpOutcome, type SpaceOp } from "@/lib/ops"
import type { SpaceDocument } from "@/lib/spaces"

type Snapshot = { nodes: Node[]; edges: Edge[] }

let idCounter = 0
// Ids outlive the session once a document is saved, so mix in per-run entropy.
const SESSION = Math.random().toString(36).slice(2, 6)
const nextId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${SESSION}${idCounter++}`

export function useSpaceCanvas(initial: Snapshot) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initial.nodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges)
  const { screenToFlowPosition, updateNodeData, updateEdgeData } = useReactFlow()

  const nodesRef = useRef(nodes)
  const edgesRef = useRef(edges)
  nodesRef.current = nodes
  edgesRef.current = edges

  const past = useRef<Snapshot[]>([])
  const future = useRef<Snapshot[]>([])
  // Continue the palette rather than restarting at the first colour on reopen.
  const colorCursor = useRef(
    initial.nodes.filter((node) => node.type === BOUNDARY_NODE_TYPE).length
  )

  const snapshot = useCallback(() => {
    past.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
    if (past.current.length > 100) past.current.shift()
    future.current = []
  }, [])

  const undo = useCallback(() => {
    const previous = past.current.pop()
    if (!previous) return
    future.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
    setNodes(previous.nodes)
    setEdges(previous.edges)
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    const next = future.current.pop()
    if (!next) return
    past.current.push({ nodes: nodesRef.current, edges: edgesRef.current })
    setNodes(next.nodes)
    setEdges(next.edges)
  }, [setNodes, setEdges])

  const spawnIcon = useCallback(
    (entry: IconEntry, position: XYPosition) => {
      snapshot()
      const current = nodesRef.current

      if (entry.id === CONTAINER_BOUNDARY_ID) {
        const color = BOUNDARY_COLORS[colorCursor.current++ % BOUNDARY_COLORS.length]
        const node: Node = {
          id: nextId("boundary"),
          type: BOUNDARY_NODE_TYPE,
          position: {
            x: position.x - BOUNDARY_DEFAULT_SIZE.width / 2,
            y: position.y - BOUNDARY_DEFAULT_SIZE.height / 2,
          },
          width: BOUNDARY_DEFAULT_SIZE.width,
          height: BOUNDARY_DEFAULT_SIZE.height,
          data: { label: "Boundary", color } satisfies BoundaryNodeData,
        }
        setNodes((list) => [...list, node])
        return
      }

      const isNote = entry.id === CONTAINER_NOTE_ID
      const parent = findBoundaryAt(current, position)
      const origin = parent ? absolutePosition(parent, current) : { x: 0, y: 0 }
      const size = isNote ? NOTE_DEFAULT_SIZE : SERVICE_NODE_SIZE
      const local = {
        x: position.x - origin.x - size.width / 2,
        y: position.y - origin.y - size.height / 2,
      }

      const node: Node = {
        id: nextId(isNote ? "note" : "node"),
        type: isNote ? NOTE_NODE_TYPE : SERVICE_NODE_TYPE,
        position: local,
        data: isNote
          ? ({ text: "", variant: "body" } satisfies NoteNodeData)
          : ({
              iconId: entry.id,
              iconPath: entry.path,
              iconCategory: entry.category,
              ...(entry.mono ? { iconMono: true } : {}),
              label: entry.name,
            } satisfies ServiceNodeData),
        ...(parent ? { parentId: parent.id, extent: "parent" as const } : {}),
      }
      setNodes((list) => [...list, node])
    },
    [setNodes, snapshot]
  )

  /** Click-to-add path: converts a screen point before spawning. */
  const spawnIconAtScreen = useCallback(
    (entry: IconEntry, screenPoint: { x: number; y: number }) => {
      spawnIcon(entry, screenToFlowPosition(screenPoint))
    },
    [spawnIcon, screenToFlowPosition]
  )

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(ICON_DRAG_MIME) && !peekPendingIconDrag()) {
      return
    }
    event.preventDefault()
    event.dataTransfer.dropEffect = "copy"
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      const raw = event.dataTransfer.getData(ICON_DRAG_MIME)
      let entry: IconEntry | null = peekPendingIconDrag()
      if (raw) {
        try {
          entry = JSON.parse(raw) as IconEntry
        } catch {
          /* keep the mirrored entry */
        }
      }
      if (!entry) return
      event.preventDefault()
      setPendingIconDrag(null)
      spawnIcon(entry, screenToFlowPosition({ x: event.clientX, y: event.clientY }))
    },
    [screenToFlowPosition, spawnIcon]
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      snapshot()
      setEdges((current) => retargetEdges(addEdge(connection, current), nodesRef.current))
    },
    [setEdges, snapshot]
  )

  const onNodeDragStart = useCallback(() => snapshot(), [snapshot])

  const patchNodeData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      snapshot()
      updateNodeData(id, data)
    },
    [snapshot, updateNodeData]
  )

  const patchEdgeData = useCallback(
    (id: string, data: Record<string, unknown>) => {
      snapshot()
      updateEdgeData(id, data)
    },
    [snapshot, updateEdgeData]
  )

  const setEdgeDirection = useCallback(
    (id: string, direction: EdgeDirection) => patchEdgeData(id, { direction }),
    [patchEdgeData]
  )

  /** Keeps edges attached to the facing sides while a node is being moved. */
  const onNodeDrag = useCallback(() => {
    setEdges((current) => retargetEdges(current, nodesRef.current))
  }, [setEdges])

  /** Adopt or release a boundary based on where the node was dropped. */
  const onNodeDragStop = useCallback(
    (_event: MouseEvent | TouchEvent, dragged: Node) => {
      if (dragged.type === BOUNDARY_NODE_TYPE) return
      const current = nodesRef.current
      const node = current.find((candidate) => candidate.id === dragged.id)
      if (!node) return

      const origin = absolutePosition(node, current)
      const size = nodeSize(node)
      const center = { x: origin.x + size.width / 2, y: origin.y + size.height / 2 }
      const boundary = findBoundaryAt(current, center, node.id)

      if (boundary?.id === node.parentId) return

      setNodes((list) =>
        list.map((candidate) => {
          if (candidate.id !== node.id) return candidate
          const { parentId: _parentId, extent: _extent, ...rest } = candidate
          if (!boundary) return { ...rest, position: origin }
          const groupOrigin = absolutePosition(boundary, list)
          return {
            ...rest,
            parentId: boundary.id,
            extent: "parent" as const,
            position: { x: origin.x - groupOrigin.x, y: origin.y - groupOrigin.y },
          }
        })
      )
    },
    [setNodes]
  )

  const deleteSelection = useCallback(() => {
    const doomed = new Set(
      nodesRef.current.filter((node) => node.selected).map((node) => node.id)
    )
    // A boundary takes its children with it.
    for (const node of nodesRef.current) {
      if (node.parentId && doomed.has(node.parentId)) doomed.add(node.id)
    }
    const selectedEdges = edgesRef.current.filter((edge) => edge.selected)
    if (doomed.size === 0 && selectedEdges.length === 0) return

    snapshot()
    setNodes((list) => list.filter((node) => !doomed.has(node.id)))
    setEdges((list) =>
      list.filter(
        (edge) =>
          !edge.selected && !doomed.has(edge.source) && !doomed.has(edge.target)
      )
    )
  }, [setNodes, setEdges, snapshot])

  const duplicateSelection = useCallback(() => {
    const selected = nodesRef.current.filter((node) => node.selected)
    if (selected.length === 0) return

    snapshot()
    const idMap = new Map(selected.map((node) => [node.id, nextId("copy")]))
    const copies = selected.map((node) => ({
      ...node,
      id: idMap.get(node.id)!,
      position: { x: node.position.x + 28, y: node.position.y + 28 },
      // Keep a copy inside its boundary unless the boundary was copied too.
      ...(node.parentId && idMap.has(node.parentId)
        ? { parentId: idMap.get(node.parentId)! }
        : {}),
      selected: true,
    }))

    setNodes((list) => [
      ...list.map((node) => (node.selected ? { ...node, selected: false } : node)),
      ...copies,
    ])
    setEdges((list) => [
      ...list,
      ...list
        .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
        .map((edge) => ({
          ...edge,
          id: nextId("edge"),
          source: idMap.get(edge.source)!,
          target: idMap.get(edge.target)!,
        })),
    ])
  }, [setNodes, setEdges, snapshot])

  const selectAll = useCallback(() => {
    setNodes((list) => list.map((node) => ({ ...node, selected: true })))
    setEdges((list) => list.map((edge) => ({ ...edge, selected: true })))
  }, [setNodes, setEdges])

  const clearSelection = useCallback(() => {
    setNodes((list) => list.map((node) => ({ ...node, selected: false })))
    setEdges((list) => list.map((edge) => ({ ...edge, selected: false })))
  }, [setNodes, setEdges])

  const selectOnly = useCallback(
    (kind: "node" | "edge", id: string) => {
      setNodes((list) =>
        list.map((node) => ({ ...node, selected: kind === "node" && node.id === id }))
      )
      setEdges((list) =>
        list.map((edge) => ({ ...edge, selected: kind === "edge" && edge.id === id }))
      )
    },
    [setNodes, setEdges]
  )

  /**
   * Folds in a document computed outside React — by the op layer or the agent.
   * Does not snapshot, so a caller can checkpoint once and stream many updates
   * into a single undo step.
   */
  const setDocument = useCallback(
    (document: SpaceDocument) => {
      const next = fromDocument(document)
      setNodes((current) => reconcileNodes(current, next.nodes))
      setEdges((current) =>
        retargetEdges(reconcileEdges(current, next.edges), next.nodes)
      )
    },
    [setNodes, setEdges]
  )

  /**
   * Runs a batch of ops through the Rust op layer and folds the result back in.
   * One batch is one snapshot, so an entire agent turn undoes with a single ⌘Z.
   */
  const applyOps = useCallback(
    async (ops: SpaceOp[]): Promise<OpOutcome[]> => {
      if (ops.length === 0) return []
      const result = await invokeApplyOps(
        toDocument(nodesRef.current, edgesRef.current),
        ops
      )
      snapshot()
      setDocument(result.document)
      return result.outcomes
    },
    [setDocument, snapshot]
  )

  // Layout lives in Rust so the canvas, the agent and the MCP server all tidy
  // up the same way — and so nodes inside boundaries are laid out too.
  const runAutoLayout = useCallback(() => {
    void applyOps([{ op: "auto_layout" }])
  }, [applyOps])

  return {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    onDragOver,
    onDrop,
    onNodeDragStart,
    onNodeDrag,
    onNodeDragStop,
    spawnIconAtScreen,
    patchNodeData,
    patchEdgeData,
    setEdgeDirection,
    checkpoint: snapshot,
    deleteSelection,
    duplicateSelection,
    selectAll,
    clearSelection,
    selectOnly,
    runAutoLayout,
    applyOps,
    setDocument,
    undo,
    redo,
  }
}
