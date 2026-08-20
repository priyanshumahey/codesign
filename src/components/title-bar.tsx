import { Moon, Sun } from "@phosphor-icons/react"

import { CodesignMark } from "@/components/codesign-mark"
import { Button } from "@/components/ui/button"

export function TitleBar({
  theme,
  onToggleTheme,
}: {
  theme: "light" | "dark"
  onToggleTheme: () => void
}) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-10 shrink-0 items-center border-b border-border/70 bg-background px-3 pl-[76px]"
    >
      <div className="flex min-w-0 items-center gap-2 text-foreground/90">
        <CodesignMark className="size-4" />
        <span className="truncate font-heading text-[12px] font-semibold">Codesign</span>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        className="ml-auto text-muted-foreground hover:text-foreground"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </header>
  )
}
