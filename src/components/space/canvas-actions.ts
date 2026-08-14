import { createContext, useContext } from "react"

/** The edge whose label is being typed, and the character that opened it. */
export type EdgeLabelEdit = { id: string; seed: string }

/**
 * React Flow's own `updateNodeData` bypasses the undo stack, so nodes and the
 * inspector patch through here instead.
 */
export type CanvasActions = {
  patchNodeData: (id: string, data: Record<string, unknown>) => void
  patchEdgeData: (id: string, data: Record<string, unknown>) => void
  /** Records an undo checkpoint before a direct manipulation, e.g. a resize. */
  checkpoint: () => void
  editingEdge: EdgeLabelEdit | null
  startEdgeLabelEdit: (id: string, seed?: string) => void
  endEdgeLabelEdit: () => void
}

const CanvasActionsContext = createContext<CanvasActions | null>(null)

export const CanvasActionsProvider = CanvasActionsContext.Provider

export function useCanvasActions(): CanvasActions {
  const actions = useContext(CanvasActionsContext)
  if (!actions) throw new Error("useCanvasActions must be used inside <SpaceCanvas>")
  return actions
}
