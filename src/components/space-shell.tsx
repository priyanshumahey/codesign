import { ArrowLeft, FolderOpen } from "@phosphor-icons/react"
import { useState } from "react"

import { SpaceCanvas } from "@/components/space/space-canvas"
import { useInlineEdit } from "@/components/space/use-inline-edit"
import { Button } from "@/components/ui/button"
import {
  errorMessage,
  renameSpace,
  revealInFileManager,
  type SpaceFile,
} from "@/lib/spaces"
import { cn } from "@/lib/utils"

export function SpaceShell({
  space,
  onBack,
  onRenamed,
}: {
  space: SpaceFile
  onBack: () => void
  /** Renaming moves the file, so the shell hands back a space with a new path. */
  onRenamed: (space: SpaceFile) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const title = useInlineEdit<HTMLInputElement>({
    value: space.name,
    onCommit: (name) => {
      void renameSpace(space.path, name)
        .then(onRenamed)
        .catch((cause) => setError(errorMessage(cause)))
    },
  })

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
            {title.editing ? (
              <input
                ref={title.ref}
                value={title.draft}
                onChange={(event) => title.setDraft(event.target.value)}
                onBlur={title.commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") title.commit()
                  else if (event.key === "Escape") title.cancel()
                }}
                aria-label="Space name"
                className="w-full min-w-40 rounded-md border border-foreground/30 bg-background px-1.5 py-px text-[13px] font-medium outline-none"
              />
            ) : (
              <p
                onDoubleClick={() => {
                  setError(null)
                  title.startEditing()
                }}
                title="Double-click to rename"
                className="-mx-1 cursor-text truncate rounded px-1 py-px text-[13px] font-medium transition-colors hover:bg-muted"
              >
                {space.name}
              </p>
            )}
            <p
              className={cn(
                "truncate text-[11px]",
                error ? "text-destructive" : "text-muted-foreground"
              )}
            >
              {error ?? space.path}
            </p>
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

        <SpaceCanvas key={space.id} space={space} />
      </div>
    </div>
  )
}
