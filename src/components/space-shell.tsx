import { ArrowLeft, FolderOpen } from "@phosphor-icons/react"

import { SpaceCanvas } from "@/components/space/space-canvas"
import { Button } from "@/components/ui/button"
import { revealInFileManager, type SpaceFile } from "@/lib/spaces"

export function SpaceShell({
  space,
  onBack,
}: {
  space: SpaceFile
  onBack: () => void
}) {
  return (
    <div className="flex min-h-0 flex-1 px-2 pb-2">
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="gap-1.5">
            <ArrowLeft />
            Spaces
          </Button>
          <div className="h-4 w-px bg-border" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-medium">{space.name}</p>
            <p className="truncate text-[11px] text-muted-foreground">{space.path}</p>
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            title="Reveal in Finder"
            onClick={() => void revealInFileManager(space.path)}
            className="ml-auto text-muted-foreground hover:text-foreground"
          >
            <FolderOpen />
          </Button>
        </header>

        <SpaceCanvas key={space.path} space={space} />
      </div>
    </div>
  )
}
