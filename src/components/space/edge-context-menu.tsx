import { PencilSimple, SlidersHorizontal, Trash } from "@phosphor-icons/react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { EDGE_DIRECTIONS, EDGE_DIRECTION_LABELS, type EdgeDirection } from "./types"

const ARROW_GLYPH: Record<EdgeDirection, string> = {
  forward: "→",
  backward: "←",
  both: "↔",
  none: "—",
}

export type EdgeMenuTarget = {
  id: string
  x: number
  y: number
  direction: EdgeDirection
}

/**
 * An edge is an SVG path with nothing to anchor a menu to, so the menu hangs
 * off a zero-size trigger parked at the pointer; Radix handles the rest.
 */
export function EdgeContextMenu({
  target,
  onSelectDirection,
  onRename,
  onEditDetails,
  onDelete,
  onClose,
}: {
  target: EdgeMenuTarget
  onSelectDirection: (direction: EdgeDirection) => void
  onRename: () => void
  onEditDetails: () => void
  onDelete: () => void
  onClose: () => void
}) {
  return (
    <DropdownMenu
      open
      modal={false}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DropdownMenuTrigger
        aria-hidden
        tabIndex={-1}
        className="fixed size-0"
        style={{ left: target.x, top: target.y }}
      />
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        // The trigger unmounts with the menu, and "Rename label" hands focus to
        // the label editor, so Radix must not claw it back on close.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="w-auto min-w-44"
      >
        <DropdownMenuLabel>Direction</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={target.direction}
          onValueChange={(value) => onSelectDirection(value as EdgeDirection)}
        >
          {EDGE_DIRECTIONS.map((direction) => (
            <DropdownMenuRadioItem key={direction} value={direction}>
              <span className="w-3 text-center font-mono">{ARROW_GLYPH[direction]}</span>
              {EDGE_DIRECTION_LABELS[direction]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />

        <DropdownMenuItem onSelect={onRename}>
          <PencilSimple />
          Rename label
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onEditDetails}>
          <SlidersHorizontal />
          Edit details…
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash />
          Delete connection
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
