/**
 * Markdown Formatter
 * 
 * Sanitizes and formats LLM output to ensure proper markdown rendering.
 * Fixes common issues like escaped characters, improper heading hierarchy, etc.
 */

/**
 * Fix escaped markdown syntax that appears as raw text
 * e.g., \*\*text\*\* -> **text**
 */
function fixEscapedSyntax(text: string): string {
  // Fix escaped asterisks for bold
  text = text.replace(/\\\*\\\*([^*]+)\\\*\\\*/g, '**$1**');
  // Fix escaped asterisks for italic
  text = text.replace(/\\\*([^*]+)\\\*/g, '*$1*');
  // Fix escaped underscores for bold
  text = text.replace(/\\\_\\\_([^_]+)\\\_\\_/g, '__$1__');
  // Fix escaped underscores for italic
  text = text.replace(/\\\_([^_]+)\\_/g, '_$1_');
  // Fix escaped backticks
  text = text.replace(/\\\`([^`]+)\\\`/g, '`$1`');
  // Fix escaped brackets
  text = text.replace(/\\\[([^\]]+)\\\]/g, '[$1]');
  // Fix escaped parentheses
  text = text.replace(/\\\(([^)]+)\\\)/g, '($1)');
  
  return text;
}

/**
 * Ensure consistent heading hierarchy
 * - Reports should start with H2 (##)
 * - No skipping levels (H2 -> H4)
 */
function normalizeHeadings(text: string): string {
  const lines = text.split('\n');
  let minLevel = 6;
  
  // Find minimum heading level used
  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s/);
    if (match) {
      minLevel = Math.min(minLevel, match[1].length);
    }
  }
  
  // If starting at H1, shift everything down by 1
  if (minLevel === 1) {
    return lines.map(line => {
      const match = line.match(/^(#{1,5})\s(.*)$/);
      if (match) {
        return '#' + match[1] + ' ' + match[2];
      }
      return line;
    }).join('\n');
  }
  
  return text;
}

/**
 * Fix malformed tables
 * Ensures tables have proper header separators
 */
function fixTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    result.push(line);
    
    // Check if this looks like a table header row
    if (line.includes('|') && !line.match(/^[\s|:-]+$/)) {
      const nextLine = lines[i + 1];
      // If next line is not a separator and current line has pipes
      if (nextLine && !nextLine.match(/^[\s|:-]+$/) && nextLine.includes('|')) {
        // Count columns
        const cols = (line.match(/\|/g) || []).length - 1;
        if (cols > 0) {
          // Check if separator is missing
          const separator = '|' + ' --- |'.repeat(cols);
          if (!lines[i + 1]?.match(/^\|[\s|:-]+\|$/)) {
            // Don't add separator if one already exists at i+1
            if (!lines[i + 1]?.includes('---')) {
              result.push(separator);
            }
          }
        }
      }
    }
  }
  
  return result.join('\n');
}

/**
 * Clean up excessive whitespace while preserving code blocks
 */
function cleanWhitespace(text: string): string {
  // Preserve code blocks
  const codeBlocks: string[] = [];
  text = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `__CODE_BLOCK_${codeBlocks.length - 1}__`;
  });
  
  // Clean up excessive blank lines (more than 2 consecutive)
  text = text.replace(/\n{4,}/g, '\n\n\n');
  
  // Ensure single blank line before headings
  text = text.replace(/\n*(#{1,6}\s)/g, '\n\n$1');
  
  // Clean up trailing spaces on lines
  text = text.replace(/[ \t]+$/gm, '');
  
  // Restore code blocks
  for (let i = 0; i < codeBlocks.length; i++) {
    text = text.replace(`__CODE_BLOCK_${i}__`, codeBlocks[i]);
  }
  
  return text.trim();
}

/**
 * Convert raw asterisks/underscores that appear as text to proper formatting
 * This handles cases where the LLM outputs "**text**" as literal characters
 */
function convertRawToFormatted(text: string): string {
  // Already formatted correctly - don't double-process
  // Only fix if we see patterns like literal \* or ** without proper spacing
  return text;
}

/**
 * Ensure bullet points are properly formatted
 */
function fixBulletPoints(text: string): string {
  // Standardize bullet characters
  text = text.replace(/^[•●○◦]\s*/gm, '- ');
  // Ensure space after dash
  text = text.replace(/^-(?! )/gm, '- ');
  // Ensure space after asterisk bullets
  text = text.replace(/^\*(?! )/gm, '* ');
  
  return text;
}

/**
 * Format numbers and percentages consistently
 */
function formatNumbers(text: string): string {
  // Format percentages with 1 decimal place when showing precision
  text = text.replace(/(\d+)\.(\d{3,})%/g, (_, whole, decimals) => 
    `${whole}.${decimals.substring(0, 1)}%`
  );
  
  return text;
}

/**
 * Add emphasis to key terms in survival analysis context
 */
function emphasizeKeyTerms(text: string): string {
  // Don't re-emphasize already formatted text
  const keyTerms = [
    'Base Case',
    'Scenario Analysis', 
    'Screen Out',
    'Recommended',
    'Not Recommended',
    'Caution',
    'Warning',
    'Critical'
  ];
  
  for (const term of keyTerms) {
    // Only emphasize if not already formatted
    const plainPattern = new RegExp(`(?<!\\*\\*)${term}(?!\\*\\*)`, 'g');
    text = text.replace(plainPattern, `**${term}**`);
  }
  
  return text;
}

/**
 * Fix standalone bold text that should be headings
 * e.g., "**Section Title**\n\n" at line start should become "## Section Title"
 */
function fixBoldAsHeadings(text: string): string {
  // Pattern: Line starts with **text** followed by newlines (indicating it's a standalone "heading")
  // Convert to proper heading if it looks like a section title
  const lines = text.split('\n');
  const result: string[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const nextLine = lines[i + 1]?.trim() || '';
    
    // Check if this is a standalone bold line that looks like a heading
    const boldMatch = line.match(/^\*\*([^*]+)\*\*$/);
    
    if (boldMatch && (nextLine === '' || nextLine.startsWith('-') || nextLine.startsWith('*') || /^[A-Z]/.test(nextLine))) {
      const headingText = boldMatch[1].trim();
      
      // Skip if it's a short phrase or looks like emphasis rather than heading
      if (headingText.length > 3 && !headingText.includes(':') && headingText.split(' ').length <= 8) {
        // Determine heading level based on content
        let level = '###'; // Default to H3
        
        if (headingText.match(/^(Executive|Summary|Overview|Conclusion|Introduction|References)/i)) {
          level = '##';
        } else if (headingText.match(/^(Note|Warning|Caution|Important)/i)) {
          // Keep as bold, not heading
          result.push(lines[i]);
          continue;
        }
        
        result.push(`${level} ${headingText}`);
        continue;
      }
    }
    
    result.push(lines[i]);
  }
  
  return result.join('\n');
}

/**
 * Ensure citations are properly formatted with brackets
 */
function formatCitations(text: string): string {
  // Fix citations that might be malformed
  // e.g., "[1]" should stay as is, "1]" should become "[1]"
  text = text.replace(/(?<!\[)(\d+)\]/g, '[$1]');
  
  // Ensure space before citations
  text = text.replace(/(\S)\[(\d+)\]/g, '$1 [$2]');
  
  return text;
}

/**
 * Main formatter function - apply all fixes
 */
export function formatMarkdown(text: string): string {
  if (!text) return '';
  
  let formatted = text;
  
  // Apply fixes in order
  formatted = fixEscapedSyntax(formatted);
  formatted = fixBulletPoints(formatted);
  formatted = fixBoldAsHeadings(formatted);  // New: Fix **Header** patterns
  formatted = normalizeHeadings(formatted);
  formatted = fixTables(formatted);
  formatted = formatNumbers(formatted);
  formatted = formatCitations(formatted);    // New: Format citations
  formatted = emphasizeKeyTerms(formatted);
  formatted = cleanWhitespace(formatted);
  
  return formatted;
}

/**
 * Format a model assessment section with consistent structure
 */
export function formatModelAssessment(
  modelName: string,
  assessment: string,
  scores: { fitScore?: number; extrapScore?: number; aicRank?: number },
  recommendation: 'Base Case' | 'Scenario' | 'Screen Out'
): string {
  const recommendationBadge = {
    'Base Case': '✅ **Base Case**',
    'Scenario': '⚠️ **Scenario Analysis**',
    'Screen Out': '❌ **Screen Out**'
  }[recommendation];

  const scoresLine = [
    scores.fitScore !== undefined ? `Fit: ${scores.fitScore}/10` : null,
    scores.extrapScore !== undefined ? `Extrapolation: ${scores.extrapScore}/10` : null,
    scores.aicRank !== undefined ? `AIC Rank: #${scores.aicRank}` : null
  ].filter(Boolean).join(' | ');

  return formatMarkdown(`
## ${modelName}

${recommendationBadge}

${scoresLine ? `**Scores:** ${scoresLine}` : ''}

${assessment}
`);
}

/**
 * Format the synthesis section with proper structure
 */
export function formatSynthesis(
  content: string,
  recommendations: Array<{ model: string; role: 'Base Case' | 'Scenario' | 'Screen Out'; reason: string }>
): string {
  const recTable = `
| Model | Recommendation | Rationale |
| --- | --- | --- |
${recommendations.map(r => `| ${r.model} | ${r.role} | ${r.reason} |`).join('\n')}
`;

  return formatMarkdown(`
# Synthesis and Recommendations

${content}

## Summary Table

${recTable}
`);
}

/**
 * Embed a base64 image in markdown
 */
export function embedImage(
  base64Data: string, 
  alt: string, 
  format: 'png' | 'jpeg' = 'png'
): string {
  return `![${alt}](data:image/${format};base64,${base64Data})`;
}

/**
 * Create a collapsible section for detailed content
 */
export function createCollapsible(summary: string, content: string): string {
  return `
<details>
<summary>${summary}</summary>

${content}

</details>
`;
}

