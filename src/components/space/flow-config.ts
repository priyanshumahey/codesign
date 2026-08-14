import { MarkerType, type DefaultEdgeOptions } from "@xyflow/react"

import { SystemEdge } from "./edges/system-edge"
import { GroupNode } from "./nodes/group-node"
import { NoteNode } from "./nodes/note-node"
import { ServiceNode } from "./nodes/service-node"
import {
  GROUP_NODE_TYPE,
  NOTE_NODE_TYPE,
  SERVICE_NODE_TYPE,
  SYSTEM_EDGE_TYPE,
} from "./types"

export const NODE_TYPES = {
  [SERVICE_NODE_TYPE]: ServiceNode,
  [GROUP_NODE_TYPE]: GroupNode,
  [NOTE_NODE_TYPE]: NoteNode,
}

export const EDGE_TYPES = {
  [SYSTEM_EDGE_TYPE]: SystemEdge,
}

const ARROW = {
  type: MarkerType.ArrowClosed,
  width: 14,
  height: 14,
  color: "var(--color-muted-foreground)",
}

/**
 * Both markers are declared so their defs always exist; the edge picks which
 * end to draw from its own direction. React Flow orients markers with
 * `auto-start-reverse`, so one def serves either end.
 */
export const DEFAULT_EDGE_OPTIONS: DefaultEdgeOptions = {
  type: SYSTEM_EDGE_TYPE,
  markerStart: ARROW,
  markerEnd: ARROW,
}
