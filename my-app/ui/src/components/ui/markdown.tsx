import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
  className?: string;
}

/**
 * Markdown renderer component with elegant styling for:
 * - Headings (H1-H6) with colored accents
 * - Bold, italic, strikethrough
 * - Lists (ordered and unordered) with proper indentation
 * - Tables (GFM) with zebra striping
 * - Code blocks and inline code
 * - Links with hover effects
 * - Images (including base64)
 * - Blockquotes with accent styling
 */
export function Markdown({ content, className }: MarkdownProps) {
  // Pre-process content to fix common LLM output issues
  const processedContent = preprocessMarkdown(content);

  return (
    <div className="w-full max-w-full" style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}>
      <ReactMarkdown
        className={cn('markdown-content w-full', className)}
        remarkPlugins={[remarkGfm]}
      components={{
        // Headings with colored left border accent
        h1: ({ children }) => (
          <h1 className="text-2xl font-bold mt-8 mb-4 text-foreground pb-3 border-b-2 border-primary/30 flex items-center gap-3">
            <span className="w-1 h-7 bg-primary rounded-full" />
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xl font-semibold mt-7 mb-3 text-foreground flex items-center gap-2.5 border-l-4 border-primary/40 pl-3 -ml-3">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-lg font-semibold mt-5 mb-2.5 text-foreground/90 border-l-2 border-primary/30 pl-3 -ml-3">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-base font-semibold mt-4 mb-2 text-foreground/85">
            {children}
          </h4>
        ),
        h5: ({ children }) => (
          <h5 className="text-sm font-semibold mt-3 mb-1.5 text-foreground/80 uppercase tracking-wide">
            {children}
          </h5>
        ),
        h6: ({ children }) => (
          <h6 className="text-sm font-medium mt-2 mb-1 text-muted-foreground uppercase tracking-wide">
            {children}
          </h6>
        ),

        // Paragraphs with better line height
        p: ({ children }) => (
          <p className="my-3 leading-7 text-foreground/90">
            {children}
          </p>
        ),

        // Bold and emphasis
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">
            {children}
          </strong>
        ),
        em: ({ children }) => (
          <em className="italic text-foreground/85">
            {children}
          </em>
        ),

        // Lists with better spacing and styling
        ul: ({ children }) => (
          <ul className="my-3 ml-6 list-disc space-y-1.5 marker:text-primary/60">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="my-3 ml-6 list-decimal space-y-1.5 marker:text-primary/70 marker:font-semibold">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-foreground/90 leading-relaxed pl-1">
            {children}
          </li>
        ),

        // Tables with zebra striping and hover effects
        table: ({ children }) => (
          <div className="my-6 w-full overflow-x-auto rounded-lg border border-border shadow-sm">
            <table className="w-full divide-y divide-border">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/70">
            {children}
          </thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border bg-background">
            {children}
          </tbody>
        ),
        tr: ({ children }) => (
          <tr className="transition-colors hover:bg-muted/40 even:bg-muted/20">
            {children}
          </tr>
        ),
        th: ({ children }) => (
          <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-foreground/70">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-4 py-3 text-sm text-foreground/90">
            {children}
          </td>
        ),

        // Code with better styling
        code: ({ className, children, ...props }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code 
                className="px-1.5 py-0.5 rounded-md bg-primary/10 text-sm font-mono text-primary/90 border border-primary/20" 
                {...props}
              >
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
          <pre className="my-4 p-4 rounded-lg bg-slate-900 dark:bg-slate-950 overflow-x-auto text-sm font-mono text-slate-100 border border-slate-700 shadow-md">
            {children}
          </pre>
        ),

        // Blockquotes with accent styling
        blockquote: ({ children }) => (
          <blockquote className="my-5 py-3 px-5 border-l-4 border-primary/50 bg-primary/5 rounded-r-lg italic text-foreground/80">
            {children}
          </blockquote>
        ),

        // Links with hover effects
        a: ({ href, children }) => (
          <a 
            href={href} 
            className="text-primary font-medium underline decoration-primary/30 underline-offset-2 hover:decoration-primary/60 hover:text-primary/80 transition-all"
            target="_blank"
            rel="noopener noreferrer"
          >
            {children}
          </a>
        ),

        // Images with shadow and better styling
        img: ({ src, alt }) => (
          <figure className="my-6">
            <img 
              src={src} 
              alt={alt || 'Image'} 
              className="max-w-full h-auto rounded-lg border border-border shadow-md mx-auto"
            />
            {alt && (
              <figcaption className="text-center text-sm text-muted-foreground mt-2 italic">
                {alt}
              </figcaption>
            )}
          </figure>
        ),

        // Horizontal rule with gradient
        hr: () => (
          <hr className="my-8 border-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
        ),
      }}
    >
      {processedContent}
    </ReactMarkdown>
    </div>
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
 * Uses slightly reduced spacing while maintaining readability
 */
export function CompactMarkdown({ content, className }: MarkdownProps) {
  return (
    <Markdown 
      content={content} 
      className={cn(
        'text-sm',
        '[&_h1]:text-lg [&_h1]:mt-4 [&_h1]:mb-2',
        '[&_h2]:text-base [&_h2]:mt-3 [&_h2]:mb-2',
        '[&_h3]:text-sm [&_h3]:mt-2 [&_h3]:mb-1',
        '[&_p]:my-1.5 [&_p]:leading-6',
        '[&_ul]:my-2 [&_ol]:my-2',
        '[&_li]:leading-normal',
        '[&_blockquote]:my-3 [&_blockquote]:py-2 [&_blockquote]:px-3',
        '[&_table]:my-3',
        '[&_hr]:my-4',
        className
      )} 
    />
  );
}

/**
 * Report-style markdown for PDF/DOCX export
 * Optimized for print with cleaner styling
 */
export function ReportMarkdown({ content, className }: MarkdownProps) {
  return (
    <Markdown 
      content={content} 
      className={cn(
        'print:text-black',
        '[&_h1]:text-xl [&_h1]:border-b [&_h1]:border-gray-300',
        '[&_h2]:text-lg',
        '[&_h3]:text-base',
        '[&_table]:border [&_table]:border-gray-300',
        '[&_th]:bg-gray-100 [&_th]:text-gray-900',
        '[&_td]:text-gray-800',
        '[&_blockquote]:bg-gray-50 [&_blockquote]:border-gray-400',
        className
      )} 
    />
  );
}
