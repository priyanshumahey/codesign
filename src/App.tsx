import { useState } from "react"

import { Launcher } from "@/components/launcher/launcher"
import { SpaceShell } from "@/components/space-shell"
import { TitleBar } from "@/components/title-bar"
import { useTheme } from "@/hooks/use-theme"
import type { SpaceFile } from "@/lib/spaces"
import "./App.css"

export default function App() {
  const { theme, toggleTheme } = useTheme()
  const [space, setSpace] = useState<SpaceFile | null>(null)

  return (
    <div className="flex h-full flex-col bg-muted/40">
      <TitleBar theme={theme} onToggleTheme={toggleTheme} />
      {space ? (
        <SpaceShell space={space} onBack={() => setSpace(null)} onRenamed={setSpace} />
      ) : (
        <Launcher onOpenSpace={setSpace} />
      )}
    </div>
  )
}
