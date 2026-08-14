import { createContext, useContext } from "react"

/**
 * React Flow's own `updateNodeData` bypasses the undo stack, so nodes and the
 * inspector patch through here instead.
 */
export type CanvasActions = {
  patchNodeData: (id: string, data: Record<string, unknown>) => void
  patchEdgeData: (id: string, data: Record<string, unknown>) => void
  /** Records an undo checkpoint before a direct manipulation, e.g. a resize. */
  checkpoint: () => void
}

const CanvasActionsContext = createContext<CanvasActions | null>(null)

export const CanvasActionsProvider = CanvasActionsContext.Provider

export function useCanvasActions(): CanvasActions {
  const actions = useContext(CanvasActionsContext)
  if (!actions) throw new Error("useCanvasActions must be used inside <SpaceCanvas>")
  return actions
}
