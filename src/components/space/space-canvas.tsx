import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Panel,
  ReactFlow,
  ReactFlowProvider,
} from "@xyflow/react"
import { useMemo, useRef, useState } from "react"
import "@xyflow/react/dist/base.css"

import { CanvasPalette } from "./canvas-palette"
import { CanvasToolbar } from "./canvas-toolbar"
import {
  DEFAULT_EDGE_OPTIONS,
  EDGE_TYPES,
  NODE_TYPES,
  sortByGroupParenting,
} from "./flow-config"
import { Inspector } from "./inspector/inspector"
import type { IconEntry } from "./types"
import { useCanvasShortcuts } from "./use-canvas-shortcuts"
import { useSpaceCanvas } from "./use-space-canvas"

function SpaceCanvasInner() {
  const canvas = useSpaceCanvas()
  const paneRef = useRef<HTMLDivElement>(null)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useCanvasShortcuts({
    onUndo: canvas.undo,
    onRedo: canvas.redo,
    onDuplicate: canvas.duplicateSelection,
    onSelectAll: canvas.selectAll,
    onDelete: canvas.deleteSelection,
    onEscape: () => {
      setDetailsOpen(false)
      canvas.clearSelection()
    },
  })

  const nodes = useMemo(() => sortByGroupParenting(canvas.nodes), [canvas.nodes])

  // The inspector only makes sense for a single target.
  const selectedNodes = canvas.nodes.filter((node) => node.selected)
  const selectedEdges = canvas.edges.filter((edge) => edge.selected)
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
    <div className="flex min-h-0 flex-1">
      <CanvasPalette onAdd={addToCentre} />

      <div
        ref={paneRef}
        className="relative min-w-0 flex-1"
        onDragOver={canvas.onDragOver}
        onDrop={canvas.onDrop}
      >
        <ReactFlow
          nodes={nodes}
          edges={canvas.edges}
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
            canvas.selectOnly("node", node.id)
            setDetailsOpen(true)
          }}
          onEdgeContextMenu={(event, edge) => {
            event.preventDefault()
            canvas.selectOnly("edge", edge.id)
            setDetailsOpen(true)
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
          proOptions={{ hideAttribution: true }}
          className="bg-muted/25"
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
              detailsOpen={detailsOpen}
              onToggleDetails={() => setDetailsOpen((open) => !open)}
            />
          </Panel>
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

        {canvas.nodes.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex max-w-xs flex-col items-center gap-1.5 rounded-2xl border border-dashed border-border bg-background/70 px-6 py-5 text-center backdrop-blur-sm">
              <p className="text-[13px] font-medium">Drop your first component</p>
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                Drag an icon from the left, or double-click one. Connect two nodes by
                pulling from the dots on their edges, then right-click anything to edit
                its details.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export function SpaceCanvas() {
  return (
    <ReactFlowProvider>
      <SpaceCanvasInner />
    </ReactFlowProvider>
  )
}
