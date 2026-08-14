import { Handle, Position } from "@xyflow/react"
import { Fragment } from "react"

import { cn } from "@/lib/utils"

export type HandleSide = "top" | "right" | "bottom" | "left"

const SIDE_POSITIONS: Record<HandleSide, Position> = {
  top: Position.Top,
  right: Position.Right,
  bottom: Position.Bottom,
  left: Position.Left,
}

export const SOURCE_HANDLE_IDS: Record<HandleSide, string> = {
  top: "top-source",
  right: "right-source",
  bottom: "bottom-source",
  left: "left-source",
}

export const TARGET_HANDLE_IDS: Record<HandleSide, string> = {
  top: "top-target",
  right: "right-target",
  bottom: "bottom-target",
  left: "left-target",
}

const HANDLE_BASE =
  "!size-2.5 !rounded-full !border-2 !border-background !bg-foreground/40 transition-opacity duration-150 hover:!bg-foreground group-hover/node:opacity-100"

/**
 * Source and target handles on all four sides so edges can attach from any
 * direction. Both stack at the same point — loose connection mode picks one.
 */
export function NodeHandles({ visible }: { visible: boolean }) {
  const className = cn(HANDLE_BASE, visible ? "opacity-100" : "opacity-0")
  return (
    <>
      {(Object.keys(SIDE_POSITIONS) as HandleSide[]).map((side) => (
        <Fragment key={side}>
          <Handle
            type="target"
            id={TARGET_HANDLE_IDS[side]}
            position={SIDE_POSITIONS[side]}
            className={className}
          />
          <Handle
            type="source"
            id={SOURCE_HANDLE_IDS[side]}
            position={SIDE_POSITIONS[side]}
            className={className}
          />
        </Fragment>
      ))}
    </>
  )
}
