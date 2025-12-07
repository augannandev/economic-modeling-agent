import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Markdown renderer component with proper styling for:
 * - Headings (H1-H6)
 * - Bold, italic, strikethrough
 * - Lists (ordered and unordered)
 * - Tables (GFM)
 * - Code blocks and inline code
 * - Links
 * - Images (including base64)
 * - Blockquotes
 */
export function Markdown({ content, className }: MarkdownProps) {
  // Pre-process content to fix common LLM output issues
  const processedContent = preprocessMarkdown(content);

  return (
    <ReactMarkdown
      className={cn('markdown-content', className)}
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-6 mb-4 text-foreground border-b pb-2">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mt-5 mb-3 text-foreground">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mt-4 mb-2 text-foreground">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold mt-3 mb-2 text-foreground">
            {children}
          </h4>
        ),
        h5: ({ children }) => (
          <h5 className="text-sm font-semibold mt-2 mb-1 text-foreground">
            {children}
          </h5>
        ),
        h6: ({ children }) => (
          <h6 className="text-sm font-medium mt-2 mb-1 text-muted-foreground">
            {children}
          </h6>
        ),

        // Paragraphs
        p: ({ children }) => (
          <p className="my-2 leading-relaxed text-foreground">
            {children}
          </p>
        ),

        // Bold and emphasis
        strong: ({ children }) => (
          <strong className="font-bold text-foreground">
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em className="italic">
            {children}
          </em>
        ),

        // Lists
        ul: ({ children }) => (
          <ul className="my-2 ml-4 list-disc space-y-1">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-2 ml-4 list-decimal space-y-1">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-foreground">
            {children}
          </li>
        ),

        // Tables
        table: ({ children }) => (
          <div className="my-4 overflow-x-auto">
            <table className="min-w-full border-collapse border border-border rounded-md">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50">
            {children}
          </thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border">
            {children}
          </tbody>
        ),
        tr: ({ children }) => (
          <tr className="border-b border-border">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-sm font-semibold text-foreground border-r border-border last:border-r-0">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-sm text-foreground border-r border-border last:border-r-0">
            {children}
          </td>
        ),

        // Code
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="px-1.5 py-0.5 rounded bg-muted text-sm font-mono text-foreground" {...props}>
                {children}
              </code>
            );
          }
          return (
            <code className={cn("block", className)} {...props}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="my-3 p-3 rounded-md bg-muted overflow-x-auto text-sm font-mono">
            {children}
          </pre>
        ),

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="my-3 pl-4 border-l-4 border-primary/50 italic text-muted-foreground">
            {children}
          </blockquote>
        ),

        // Links
        a: ({ href, children }) => (
          <a 
            href={href} 
            className="text-primary underline hover:text-primary/80 transition-colors"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),

        // Images (supports base64)
        img: ({ src, alt }) => (
          <img 
            src={src} 
            alt={alt || 'Image'} 
            className="my-3 max-w-full h-auto rounded-md border border-border"
          />
        ),

        // Horizontal rule
        hr: () => (
          <hr className="my-6 border-t border-border" />
        ),
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}

/**
 * Pre-process markdown to fix common LLM output issues
 */
function preprocessMarkdown(content: string): string {
  if (!content) return '';
  
  let processed = content;
  
  // Fix escaped asterisks (e.g., \*\*text\*\* -> **text**)
  processed = processed.replace(/\\\*\\\*/g, '**');
  processed = processed.replace(/\\\*/g, '*');
  
  // Fix escaped underscores
  processed = processed.replace(/\\\_/g, '_');
  
  // Fix escaped brackets
  processed = processed.replace(/\\\[/g, '[');
  processed = processed.replace(/\\\]/g, ']');
  
  // Ensure consistent newlines before headings
  processed = processed.replace(/([^\n])(#{1,6}\s)/g, '$1\n\n$2');
  
  // Fix multiple consecutive blank lines (more than 2)
  processed = processed.replace(/\n{4,}/g, '\n\n\n');
  
  // Ensure tables have proper spacing
  processed = processed.replace(/\|([^\n]*)\n([^\|])/g, '|$1\n\n$2');
  
  return processed.trim();
}

/**
 * Compact markdown renderer for smaller spaces (chat bubbles, cards)
 */
export function CompactMarkdown({ content, className }: MarkdownProps) {
  return (
    <Markdown 
      content={content} 
      className={cn('text-sm [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_p]:my-1', className)} 
    />
  );
}

