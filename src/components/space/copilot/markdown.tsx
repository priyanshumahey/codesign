import { Check, Copy } from "@phosphor-icons/react"
import {
  Children,
  isValidElement,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import { cn } from "@/lib/utils"

function CodeBlock({
  children,
  streaming,
}: ComponentProps<"pre"> & { streaming: boolean }) {
  const [copied, setCopied] = useState(false)
  const child = Children.toArray(children)[0]
  const codeProps = isValidElement<{ className?: string; children?: ReactNode }>(child)
    ? child.props
    : null
  const source = String(codeProps?.children ?? "").replace(/\n$/, "")
  const language = codeProps?.className?.replace(/^language-/, "") || "plain text"
  const lines = source.split("\n")

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 1500)
    return () => window.clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(source)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="my-1 min-w-0 max-w-full overflow-hidden rounded-lg border border-border/70 bg-muted/35">
      <div className="flex h-8 items-center gap-2 border-b border-border/60 bg-background/70 px-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[9px] font-medium text-foreground/75">
          {language}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          title="Copy code"
          aria-label={copied ? "Code copied" : "Copy code"}
          className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? <Check className="size-3" weight="bold" /> : <Copy className="size-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="thin-scrollbar overflow-x-auto py-2 font-mono text-[10px] leading-[1.65]">
        <code className="block min-w-max">
          {lines.map((line, index) => (
            <span key={index} className="codesign-fade-up flex min-h-[1.65em]">
              <span
                aria-hidden
                className="w-8 shrink-0 select-none pr-2 text-right tabular-nums text-muted-foreground/45"
              >
                {index + 1}
              </span>
              <span className="whitespace-pre pr-3 text-foreground/80">
                {line || " "}
                {streaming && index === lines.length - 1 && (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-3 w-[3px] translate-y-0.5 animate-pulse rounded-full bg-foreground/70"
                  />
                )}
              </span>
            </span>
          ))}
        </code>
      </pre>
    </div>
  )
}

/**
 * Assistant replies are markdown. Rendering goes through react-markdown, which
 * produces React elements rather than HTML, so model output can never inject
 * markup.
 */
export function Markdown({
  children,
  streaming = false,
}: {
  children: string
  streaming?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5 text-[12px] leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="flex list-disc flex-col gap-0.5 pl-4">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="flex list-decimal flex-col gap-0.5 pl-4">{children}</ol>
          ),
          li: ({ children }) => <li className="pl-0.5">{children}</li>,
          h1: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          h3: ({ children }) => <h3 className="font-semibold">{children}</h3>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-border pl-2 text-muted-foreground">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border/70" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2"
            >
              {children}
            </a>
          ),
          code: ({ className, children }) => (
            <code
              className={cn(
                "rounded bg-muted px-1 py-px font-mono text-[11px]",
                className
              )}
            >
              {children}
            </code>
          ),
          pre: ({ children }) => (
            <CodeBlock streaming={streaming}>{children}</CodeBlock>
          ),
          table: ({ children }) => (
            <table className="w-full border-collapse text-[11px]">{children}</table>
          ),
          th: ({ children }) => (
            <th className="border border-border/70 px-1.5 py-0.5 text-left font-medium">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-border/70 px-1.5 py-0.5">{children}</td>
          ),
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  )
}
