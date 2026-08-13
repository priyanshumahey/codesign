import { Moon, Sun } from "@phosphor-icons/react"

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
      className="flex h-11 shrink-0 items-center justify-end px-3"
    >
      <Button
        size="icon-sm"
        variant="ghost"
        onClick={onToggleTheme}
        title={theme === "dark" ? "Switch to light" : "Switch to dark"}
        className="text-muted-foreground hover:text-foreground"
      >
        {theme === "dark" ? <Sun /> : <Moon />}
      </Button>
    </header>
  )
}
