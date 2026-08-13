import { useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Bell, Box, Check, ChevronDown, CircleHelp, Code2, Command, FolderGit2,
  GitBranch, LayoutDashboard, Maximize2, Minus, Moon, MoreHorizontal, Plus,
  Search, Settings, Sparkles, Sun, TerminalSquare, X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import "./App.css";

const projects = [
  { name: "codesign", branch: "main", language: "TypeScript", updated: "Now", color: "bg-cyan-500" },
  { name: "desktop-kit", branch: "develop", language: "Rust", updated: "2h", color: "bg-amber-500" },
  { name: "component-lab", branch: "main", language: "React", updated: "Yesterday", color: "bg-emerald-500" },
];

const navigation = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Projects", icon: FolderGit2 },
  { label: "Components", icon: Box },
  { label: "Terminal", icon: TerminalSquare },
];

function App() {
  const [activeItem, setActiveItem] = useState("Overview");
  const [commandName, setCommandName] = useState("Codesign");
  const [rustMessage, setRustMessage] = useState("Rust backend ready");
  const [isDark, setIsDark] = useState(() => {
    const dark = localStorage.theme === "dark" ||
      (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    return dark;
  });
  const appWindow = isTauri() ? getCurrentWindow() : null;

  function toggleTheme() {
    const nextTheme = !isDark;
    setIsDark(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme);
    localStorage.theme = nextTheme ? "dark" : "light";
  }

  async function runRustCommand() {
    try {
      setRustMessage(await invoke<string>("greet", { name: commandName || "Codesign" }));
    } catch {
      setRustMessage("Launch with `bun run tauri dev` to call the Rust backend.");
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen min-h-[600px] flex-col overflow-hidden bg-background text-foreground">
        <header className="grid h-11 shrink-0 grid-cols-[220px_1fr_220px] items-center border-b bg-background/95" data-tauri-drag-region onDoubleClick={() => void appWindow?.toggleMaximize()}>
          <div className="flex items-center gap-2.5 px-4" data-tauri-drag-region>
            <div className="grid size-6 place-items-center rounded-md bg-foreground text-background"><Code2 className="size-3.5" /></div>
            <span className="text-sm font-semibold">Codesign</span>
          </div>
          <div className="flex justify-center" data-tauri-drag-region>
            <button className="flex h-7 w-full max-w-80 items-center gap-2 rounded-md border bg-muted/40 px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted">
              <Search className="size-3.5" /><span>Search projects and commands</span>
              <kbd className="ml-auto rounded border bg-background px-1.5 py-0.5 text-[10px]">⌘ K</kbd>
            </button>
          </div>
          <div className="flex h-full items-center justify-end">
            <WindowButton label="Minimize" onClick={() => void appWindow?.minimize()}><Minus /></WindowButton>
            <WindowButton label="Maximize" onClick={() => void appWindow?.toggleMaximize()}><Maximize2 /></WindowButton>
            <WindowButton label="Close" danger onClick={() => void appWindow?.close()}><X /></WindowButton>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar p-3 text-sidebar-foreground">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="mb-4 h-9 w-full justify-start px-2">
                  <Avatar className="size-6 rounded-md"><AvatarFallback className="rounded-md bg-foreground text-[10px] text-background">CS</AvatarFallback></Avatar>
                  <span className="truncate">Codesign Studio</span><ChevronDown className="ml-auto size-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52">
                <DropdownMenuItem><Check /> Codesign Studio</DropdownMenuItem>
                <DropdownMenuItem><Plus /> New workspace</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem><Settings /> Workspace settings</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <nav className="space-y-0.5">
              {navigation.map(({ label, icon: Icon }) => (
                <Button key={label} variant="ghost" className={`h-8 w-full justify-start px-2 ${activeItem === label ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"}`} onClick={() => setActiveItem(label)}>
                  <Icon className="size-4" />{label}
                  {label === "Components" && <Badge variant="secondary" className="ml-auto h-5 px-1.5 text-[10px]">24</Badge>}
                </Button>
              ))}
            </nav>

            <div className="mt-auto space-y-0.5">
              <Button variant="ghost" className="h-8 w-full justify-start px-2 text-muted-foreground"><CircleHelp /> Help & feedback</Button>
              <Button variant="ghost" className="h-8 w-full justify-start px-2 text-muted-foreground"><Settings /> Settings</Button>
              <Separator className="my-2" />
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Avatar className="size-7"><AvatarFallback>PM</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1 leading-tight"><p className="truncate text-xs font-medium">Priyanshu</p><p className="truncate text-[10px] text-muted-foreground">Local workspace</p></div>
                <Button size="icon-xs" variant="ghost"><MoreHorizontal /></Button>
              </div>
            </div>
          </aside>

          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl p-7 lg:p-10">
              <div className="mb-8 flex items-start justify-between gap-4">
                <div>
                  <p className="mb-1 text-xs font-medium text-cyan-600 dark:text-cyan-400">LOCAL WORKSPACE</p>
                  <h1 className="text-2xl font-semibold tracking-normal">Good afternoon, Priyanshu</h1>
                  <p className="mt-1 text-sm text-muted-foreground">Pick up where you left off or start something new.</p>
                </div>
                <div className="flex gap-2">
                  <Tooltip><TooltipTrigger asChild><Button size="icon" variant="outline" onClick={toggleTheme}>{isDark ? <Sun /> : <Moon />}</Button></TooltipTrigger><TooltipContent>{isDark ? "Use light theme" : "Use dark theme"}</TooltipContent></Tooltip>
                  <Button size="icon" variant="outline"><Bell /></Button>
                  <Button><Plus /> New project</Button>
                </div>
              </div>

              <section className="mb-8">
                <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold">Recent projects</h2><Button variant="ghost" size="sm" className="text-muted-foreground">View all</Button></div>
                <div className="grid gap-3 md:grid-cols-3">
                  {projects.map((project) => (
                    <button key={project.name} className="group rounded-lg border bg-card p-4 text-left shadow-xs transition-[border-color,box-shadow] hover:border-foreground/25 hover:shadow-sm">
                      <div className="mb-5 flex items-center justify-between"><div className="grid size-8 place-items-center rounded-md border bg-muted/40"><FolderGit2 className="size-4" /></div><MoreHorizontal className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" /></div>
                      <h3 className="text-sm font-semibold">{project.name}</h3>
                      <div className="mt-2 flex items-center gap-3 text-[11px] text-muted-foreground"><span className="flex items-center gap-1"><GitBranch className="size-3" />{project.branch}</span><span className="flex items-center gap-1"><span className={`size-1.5 rounded-full ${project.color}`} />{project.language}</span></div>
                      <p className="mt-4 text-[10px] text-muted-foreground">Updated {project.updated}</p>
                    </button>
                  ))}
                </div>
              </section>

              <section className="grid gap-6 border-t pt-7 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <div className="mb-3 flex items-center gap-2"><Command className="size-4" /><h2 className="text-sm font-semibold">Rust command bridge</h2></div>
                  <div className="flex max-w-lg gap-2"><Input value={commandName} onChange={(event) => setCommandName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void runRustCommand()} /><Button variant="secondary" onClick={() => void runRustCommand()}>Invoke</Button></div>
                  <p className="mt-2 text-xs text-muted-foreground">{rustMessage}</p>
                </div>
                <div className="border-l pl-6"><div className="mb-2 flex items-center gap-2"><Sparkles className="size-4 text-amber-500" /><h2 className="text-sm font-semibold">Stack ready</h2></div><p className="text-xs leading-5 text-muted-foreground">Tauri 2, React 19, TypeScript, Tailwind 4, shadcn/ui, and Bun are configured for development and release builds.</p></div>
              </section>
            </div>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}

function WindowButton({ children, danger = false, label, onClick }: { children: React.ReactNode; danger?: boolean; label: string; onClick: () => void }) {
  return <Tooltip><TooltipTrigger asChild><button aria-label={label} className={`grid h-full w-11 place-items-center transition-colors [&_svg]:size-3.5 ${danger ? "hover:bg-destructive hover:text-white" : "hover:bg-muted"}`} onClick={onClick}>{children}</button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>;
}

export default App;
