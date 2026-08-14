import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Assistant replies are markdown. Rendering goes through react-markdown, which
 * produces React elements rather than HTML, so model output can never inject
 * markup.
 */
export function Markdown({ children }: { children: string }) {
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
          code: ({ className, children }) => {
            // Fenced blocks arrive with a language class; bare spans do not.
            if (className) {
              return (
                <code className="block overflow-x-auto rounded-lg border border-border/70 bg-muted/50 p-2 font-mono text-[11px]">
                  {children}
                </code>
              )
            }
            return (
              <code className="rounded bg-muted px-1 py-px font-mono text-[11px]">
                {children}
              </code>
            )
          },
          pre: ({ children }) => <>{children}</>,
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
