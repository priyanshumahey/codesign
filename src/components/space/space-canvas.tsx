import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
} from "@xyflow/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import "@xyflow/react/dist/base.css"

import type { SpaceFile } from "@/lib/spaces"
import { cn } from "@/lib/utils"
import { CanvasActionsProvider, type EdgeLabelEdit } from "./canvas-actions"
import { CanvasPalette } from "./canvas-palette"
import { CanvasToolbar } from "./canvas-toolbar"
import { CopilotPanel } from "./copilot/copilot-panel"
import { useCopilot } from "./copilot/use-copilot"
import { fromDocument, toDocument } from "./document"
import { EdgeContextMenu, type EdgeMenuTarget } from "./edge-context-menu"
import { layoutEdgeLabels, type Placement } from "./edge-labels"
import { DEFAULT_EDGE_OPTIONS, EDGE_TYPES, NODE_TYPES } from "./flow-config"
import { sortByBoundaryParenting } from "./geometry"
import { Inspector } from "./inspector/inspector"
import { SelectionActions } from "./selection-actions"
import { resolveEdgeDirection, type IconEntry } from "./types"
import { useCanvasShortcuts } from "./use-canvas-shortcuts"
import { useSpaceCanvas } from "./use-space-canvas"
import { useSpacePersistence } from "./use-space-persistence"

const PALETTE_KEY = "codesign.palette.open"

function SpaceCanvasInner({ space }: { space: SpaceFile }) {
  // Read once — the file is the source of truth only at open time.
  const [initial] = useState(() => fromDocument(space.document))
  const [baseline] = useState(() =>
    JSON.stringify(toDocument(initial.nodes, initial.edges))
  )

  const canvas = useSpaceCanvas(initial)
  const paneRef = useRef<HTMLDivElement>(null)
  const { fitView } = useReactFlow()
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(
    () => localStorage.getItem(PALETTE_KEY) !== "false"
  )
  const [edgeMenu, setEdgeMenu] = useState<EdgeMenuTarget | null>(null)
  const [edgeEdit, setEdgeEdit] = useState<EdgeLabelEdit | null>(null)

  const canvasRef = useRef(canvas)
  canvasRef.current = canvas

  const copilot = useCopilot({
    spaceId: space.id,
    getDocument: () => toDocument(canvasRef.current.nodes, canvasRef.current.edges),
    getSelection: () =>
      canvasRef.current.nodes.filter((node) => node.selected).map((node) => node.id),
    onDocument: (document) => canvasRef.current.setDocument(document),
    onTurnStart: () => canvasRef.current.checkpoint(),
    onTurnEnd: ({ builtFromScratch }) => {
      // Only reframe when the canvas was empty; otherwise the user's view is theirs.
      if (builtFromScratch) {
        setTimeout(() => fitView({ padding: 0.25, duration: 400 }), 60)
      }
    },
  })

  const persistence = useSpacePersistence({
    path: space.path,
    updatedAt: space.updatedAt,
    nodes: canvas.nodes,
    edges: canvas.edges,
    baseline,
    onExternalChange: (document) => {
      // Someone edited the file underneath us; keep it undoable.
      canvasRef.current.checkpoint()
      canvasRef.current.setDocument(document)
    },
  })

  useEffect(() => {
    localStorage.setItem(PALETTE_KEY, String(paletteOpen))
  }, [paletteOpen])

  const startEdgeLabelEdit = useCallback((id: string, seed = "") => {
    setEdgeMenu(null)
    setEdgeEdit({ id, seed })
  }, [])

  const endEdgeLabelEdit = useCallback(() => setEdgeEdit(null), [])

  // Deleting an edge mid-edit would otherwise leave the state stuck on it.
  const editingEdge =
    edgeEdit && canvas.edges.some((edge) => edge.id === edgeEdit.id) ? edgeEdit : null

  const selectedEdges = canvas.edges.filter((edge) => edge.selected)
  const selectedNodes = canvas.nodes.filter((node) => node.selected)
  const copilotContext = selectedNodes.map((node) => {
    const rawLabel = node.type === "note" ? node.data.text : node.data.label
    const rawDetail =
      node.type === "service"
        ? node.data.description ?? node.data.iconCategory
        : node.type === "note"
          ? node.data.variant
          : undefined
    const kind =
      node.type === "service"
        ? "Service"
        : node.type === "boundary"
          ? "Boundary"
          : node.type === "note"
            ? "Note"
            : "Component"

    return {
      id: node.id,
      label:
        typeof rawLabel === "string" && rawLabel.trim()
          ? rawLabel
          : `Untitled ${kind.toLowerCase()}`,
      kind,
      ...(typeof rawDetail === "string" && rawDetail.trim()
        ? { detail: rawDetail }
        : {}),
    }
  })
  const soleSelectedEdge =
    selectedEdges.length === 1 && selectedNodes.length === 0 ? selectedEdges[0]! : null

  useCanvasShortcuts({
    onUndo: canvas.undo,
    onRedo: canvas.redo,
    onDuplicate: canvas.duplicateSelection,
    onSelectAll: canvas.selectAll,
    onDelete: canvas.deleteSelection,
    onSave: () => void persistence.flush(),
    onTogglePalette: () => setPaletteOpen((open) => !open),
    onType: (key) => {
      if (edgeMenu || editingEdge || !soleSelectedEdge) return
      startEdgeLabelEdit(soleSelectedEdge.id, key)
    },
    onEscape: () => {
      setEdgeMenu(null)
      setDetailsOpen(false)
      canvas.clearSelection()
    },
  })

  const actions = useMemo(
    () => ({
      patchNodeData: canvas.patchNodeData,
      patchEdgeData: canvas.patchEdgeData,
      checkpoint: canvas.checkpoint,
      editingEdge,
      startEdgeLabelEdit,
      endEdgeLabelEdit,
    }),
    [
      canvas.patchNodeData,
      canvas.patchEdgeData,
      canvas.checkpoint,
      editingEdge,
      startEdgeLabelEdit,
      endEdgeLabelEdit,
    ]
  )

  const nodes = useMemo(() => sortByBoundaryParenting(canvas.nodes), [canvas.nodes])

  // Chips are spread along their own path here rather than in the edge, which
  // can only see itself and would happily stack on top of its neighbours.
  const placements = useRef(new Map<string, Placement>())
  const dragging = canvas.nodes.some((node) => node.dragging)
  const edges = useMemo(() => {
    // A chip rides its live path regardless, so it only has to settle on drop.
    if (!dragging) {
      placements.current = layoutEdgeLabels(canvas.nodes, canvas.edges).placements
    }
    return canvas.edges.map((edge) => {
      const placement = placements.current.get(edge.id)
      if (!placement) return edge
      return {
        ...edge,
        data: { ...edge.data, labelStep: placement.step, labelShift: placement.shift },
      }
    })
  }, [dragging, canvas.nodes, canvas.edges])

  // The inspector only makes sense for a single target.
  const inspectedNode =
    selectedNodes.length === 1 && selectedEdges.length === 0 ? selectedNodes[0] : null
  const inspectedEdge =
    selectedEdges.length === 1 && selectedNodes.length === 0 ? selectedEdges[0] : null

  const addToCentre = (entry: IconEntry) => {
    const rect = paneRef.current?.getBoundingClientRect()
    if (!rect) return
    canvas.spawnIconAtScreen(entry, {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
  }

  return (
    <CanvasActionsProvider value={actions}>
      <div className="flex min-h-0 flex-1">
        {paletteOpen && <CanvasPalette onAdd={addToCentre} />}

        <div
          ref={paneRef}
          className="relative min-w-0 flex-1"
          onDragOver={canvas.onDragOver}
          onDrop={canvas.onDrop}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={NODE_TYPES}
            edgeTypes={EDGE_TYPES}
            onNodesChange={canvas.onNodesChange}
            onEdgesChange={canvas.onEdgesChange}
            onConnect={canvas.onConnect}
            onNodeDragStart={canvas.onNodeDragStart}
            onNodeDrag={canvas.onNodeDrag}
            onNodeDragStop={canvas.onNodeDragStop}
            onNodeContextMenu={(event, node) => {
              event.preventDefault()
              setEdgeMenu(null)
              canvas.selectOnly("node", node.id)
              setDetailsOpen(true)
            }}
            onEdgeContextMenu={(event, edge) => {
              event.preventDefault()
              canvas.selectOnly("edge", edge.id)
              setEdgeMenu({
                id: edge.id,
                x: event.clientX,
                y: event.clientY,
                direction: resolveEdgeDirection(edge.data?.direction),
              })
            }}
            onEdgeDoubleClick={(event, edge) => {
              event.stopPropagation()
              canvas.selectOnly("edge", edge.id)
              startEdgeLabelEdit(edge.id)
            }}
            onPaneContextMenu={(event) => event.preventDefault()}
            defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
            connectionMode={ConnectionMode.Loose}
            // Shortcuts own deletion so every removal lands in the undo stack.
            deleteKeyCode={null}
            multiSelectionKeyCode={["Meta", "Shift", "Control"]}
            selectionKeyCode="Shift"
            panOnDrag
            minZoom={0.2}
            maxZoom={2.5}
            fitView={initial.nodes.length > 0}
            fitViewOptions={{ padding: 0.3 }}
            proOptions={{ hideAttribution: true }}
            className="bg-muted/20"
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="var(--color-border)"
            />

            <Panel position="bottom-left">
              <CanvasToolbar
                onUndo={canvas.undo}
                onRedo={canvas.redo}
                onAutoLayout={canvas.runAutoLayout}
                paletteOpen={paletteOpen}
                onTogglePalette={() => setPaletteOpen((open) => !open)}
                detailsOpen={detailsOpen}
                onToggleDetails={() => setDetailsOpen((open) => !open)}
                copilotOpen={copilotOpen}
                onToggleCopilot={() => setCopilotOpen((open) => !open)}
              />
            </Panel>

            {selectedNodes.length > 0 && selectedEdges.length === 0 && (
              <Panel position="bottom-center">
                <SelectionActions
                  count={selectedNodes.length}
                  busy={copilot.busy}
                  onExplain={() => {
                    setCopilotOpen(true)
                    void copilot.send(
                      "Explain how the selected components fit into this system. Do not change the diagram."
                    )
                  }}
                  onImprove={() => {
                    setCopilotOpen(true)
                    void copilot.send(
                      "Improve the selected part of this system design. Keep the changes focused on the selection.",
                      { review: true }
                    )
                  }}
                  onOpenCopilot={() => setCopilotOpen(true)}
                />
              </Panel>
            )}

            {persistence.state !== "idle" && (
              <Panel position="bottom-right">
                <span
                  role={persistence.state === "error" ? "alert" : undefined}
                  className={cn(
                    "rounded-lg border bg-background/95 px-2 py-1 text-[11px] shadow-sm backdrop-blur",
                    persistence.state === "error"
                      ? "border-destructive/40 text-destructive"
                      : "border-border/70 text-muted-foreground"
                  )}
                >
                  {persistence.state === "error"
                    ? `Not saved — ${persistence.error}`
                    : "Saving…"}
                </span>
              </Panel>
            )}
          </ReactFlow>

          {detailsOpen && (
            <Inspector
              node={inspectedNode}
              edge={inspectedEdge}
              nodes={canvas.nodes}
              onClose={() => setDetailsOpen(false)}
              onDelete={() => {
                canvas.deleteSelection()
                setDetailsOpen(false)
              }}
            />
          )}

          {edgeMenu && (
            <EdgeContextMenu
              target={edgeMenu}
              onClose={() => setEdgeMenu(null)}
              onSelectDirection={(direction) =>
                canvas.setEdgeDirection(edgeMenu.id, direction)
              }
              onRename={() => startEdgeLabelEdit(edgeMenu.id)}
              onEditDetails={() => setDetailsOpen(true)}
              onDelete={canvas.deleteSelection}
            />
          )}

          {canvas.nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="flex max-w-xs flex-col items-center gap-1.5 px-6 py-5 text-center">
                <p className="text-[13px] font-medium">Drop your first component</p>
                <p className="text-[12px] leading-relaxed text-muted-foreground">
                  {paletteOpen ? (
                    <>
                      Drag an icon from the left, or double-click one. Connect two nodes
                      by pulling from the dots on their edges, then right-click anything
                      to edit its details.
                    </>
                  ) : (
                    <>
                      Open the palette with ⌘B to add components, or ask the copilot to
                      sketch something for you.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {copilotOpen && (
          <CopilotPanel
            messages={copilot.messages}
            busy={copilot.busy}
            context={copilotContext}
            status={copilot.status}
            models={copilot.models}
            conversations={copilot.conversations}
            conversationId={copilot.conversationId}
            onSend={copilot.send}
            onApplyProposal={copilot.applyProposal}
            onDismissProposal={copilot.dismissProposal}
            onClearContext={canvas.clearSelection}
            onUndo={canvas.undo}
            onModelChange={copilot.setModel}
            onNewConversation={copilot.newConversation}
            onOpenConversation={copilot.openConversation}
            onDeleteConversation={copilot.deleteConversation}
            onClose={() => setCopilotOpen(false)}
          />
        )}
      </div>
    </CanvasActionsProvider>
  )
}

export function SpaceCanvas({ space }: { space: SpaceFile }) {
  return (
    <ReactFlowProvider>
      <SpaceCanvasInner space={space} />
    </ReactFlowProvider>
  )
}
