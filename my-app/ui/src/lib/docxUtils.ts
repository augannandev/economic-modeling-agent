import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  Packer,
  Header,
  Footer,
  PageNumber,
  LevelFormat,
} from 'docx';
import { saveAs } from 'file-saver';

interface SynthesisSection {
  title: string;
  content: string;
}

/**
 * Download synthesis report as a Word document
 */
export async function downloadSynthesisAsDocx(
  title: string,
  sections: SynthesisSection[],
  filename: string
): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Title
  children.push(
    new Paragraph({
      text: title,
      heading: HeadingLevel.TITLE,
      spacing: { after: 200 },
    })
  );

  // Date
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `Generated: ${new Date().toLocaleDateString()}`,
          italics: true,
          color: '666666',
          size: 20,
        }),
      ],
      spacing: { after: 400 },
    })
  );

  // Process each section
  for (const section of sections) {
    // Section title
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 400, after: 200 },
      })
    );

    // Parse and add section content
    const contentElements = parseMarkdownToDocx(section.content);
    children.push(...contentElements);
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
              style: {
                paragraph: {
                  indent: { left: 720, hanging: 360 },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch in twips
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: title,
                    italics: true,
                    size: 18,
                    color: '888888',
                  }),
                ],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    children: ['Page ', PageNumber.CURRENT, ' of ', PageNumber.TOTAL_PAGES],
                    size: 18,
                    color: '888888',
                  }),
                ],
                alignment: AlignmentType.CENTER,
              }),
            ],
          }),
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}

/**
 * Parse markdown content into docx elements
 */
function parseMarkdownToDocx(markdown: string): (Paragraph | Table)[] {
  if (!markdown) return [];

  const elements: (Paragraph | Table)[] = [];
  const lines = markdown.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Skip empty lines
    if (!trimmedLine) {
      i++;
      continue;
    }

    // Headers
    if (trimmedLine.startsWith('### ')) {
      elements.push(
        new Paragraph({
          text: trimmedLine.substring(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 240, after: 120 },
        })
      );
      i++;
      continue;
    }
    if (trimmedLine.startsWith('## ')) {
      elements.push(
        new Paragraph({
          text: trimmedLine.substring(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      i++;
      continue;
    }
    if (trimmedLine.startsWith('# ')) {
      elements.push(
        new Paragraph({
          text: trimmedLine.substring(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      i++;
      continue;
    }

    // Horizontal rule
    if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
      elements.push(
        new Paragraph({
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: 'CCCCCC',
            },
          },
          spacing: { before: 200, after: 200 },
        })
      );
      i++;
      continue;
    }

    // Blockquote
    if (trimmedLine.startsWith('> ')) {
      const quoteText = trimmedLine.substring(2);
      elements.push(
        new Paragraph({
          children: parseInlineFormatting(quoteText),
          indent: { left: 720 },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 24,
              color: '4A90D9',
            },
          },
          spacing: { before: 120, after: 120 },
        })
      );
      i++;
      continue;
    }

    // Bullet list
    if (trimmedLine.startsWith('- ') || trimmedLine.startsWith('* ')) {
      const listItems: string[] = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* '))) {
        listItems.push(lines[i].trim().substring(2));
        i++;
      }
      for (const item of listItems) {
        elements.push(
          new Paragraph({
            children: parseInlineFormatting(item),
            bullet: { level: 0 },
            spacing: { before: 60, after: 60 },
          })
        );
      }
      continue;
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmedLine)) {
      const listItems: string[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^\d+\.\s/, ''));
        i++;
      }
      for (const item of listItems) {
        elements.push(
          new Paragraph({
            children: parseInlineFormatting(item),
            numbering: { reference: 'default-numbering', level: 0 },
            spacing: { before: 60, after: 60 },
          })
        );
      }
      continue;
    }

    // Table
    if (trimmedLine.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }
      if (tableLines.length >= 2) {
        const table = parseMarkdownTable(tableLines);
        if (table) {
          elements.push(table);
        }
      }
      continue;
    }

    // Regular paragraph
    elements.push(
      new Paragraph({
        children: parseInlineFormatting(trimmedLine),
        spacing: { before: 120, after: 120 },
      })
    );
    i++;
  }

  return elements;
}

/**
 * Parse inline formatting (bold, italic, code, links)
 */
function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  
  // Regex patterns for inline formatting
  const patterns = [
    { regex: /\*\*\*([^*]+)\*\*\*/g, bold: true, italics: true },
    { regex: /\*\*([^*]+)\*\*/g, bold: true, italics: false },
    { regex: /\*([^*]+)\*/g, bold: false, italics: true },
    { regex: /__([^_]+)__/g, bold: true, italics: false },
    { regex: /_([^_]+)_/g, bold: false, italics: true },
    { regex: /`([^`]+)`/g, code: true },
  ];

  const segments: Array<{ text: string; bold?: boolean; italics?: boolean; code?: boolean; start: number }> = [];

  // Find all formatted segments
  for (const pattern of patterns) {
    let match;
    const regex = new RegExp(pattern.regex.source, 'g');
    while ((match = regex.exec(text)) !== null) {
      segments.push({
        text: match[1],
        bold: pattern.bold,
        italics: pattern.italics,
        code: 'code' in pattern ? pattern.code : false,
        start: match.index,
      });
    }
  }

  // If no formatting found, return plain text
  if (segments.length === 0) {
    return [new TextRun({ text, size: 22 })];
  }

  // Sort segments by position and process
  segments.sort((a, b) => a.start - b.start);

  let lastEnd = 0;
  for (const segment of segments) {
    // Find this segment in the original text
    const fullMatch = patterns.reduce((found, pattern) => {
      if (found) return found;
      const regex = new RegExp(pattern.regex.source, 'g');
      let match;
      while ((match = regex.exec(text)) !== null) {
        if (match[1] === segment.text && match.index === segment.start) {
          return { match: match[0], end: match.index + match[0].length };
        }
      }
      return null;
    }, null as { match: string; end: number } | null);

    if (!fullMatch) continue;

    // Add text before this segment
    if (segment.start > lastEnd) {
      runs.push(new TextRun({ text: text.substring(lastEnd, segment.start), size: 22 }));
    }

    // Add formatted segment
    runs.push(
      new TextRun({
        text: segment.text,
        bold: segment.bold,
        italics: segment.italics,
        font: segment.code ? { name: 'Courier New' } : undefined,
        shading: segment.code ? { fill: 'F0F0F0' } : undefined,
        size: 22,
      })
    );

    lastEnd = fullMatch.end;
  }

  // Add remaining text
  if (lastEnd < text.length) {
    runs.push(new TextRun({ text: text.substring(lastEnd), size: 22 }));
  }

  return runs.length > 0 ? runs : [new TextRun({ text, size: 22 })];
}

/**
 * Parse markdown table into docx Table
 */
function parseMarkdownTable(lines: string[]): Table | null {
  if (lines.length < 2) return null;

  // Parse header row
  const headerCells = lines[0]
    .split('|')
    .filter(cell => cell.trim())
    .map(cell => cell.trim());

  // Skip separator row (index 1)
  // Parse data rows
  const dataRows = lines.slice(2).map(line =>
    line
      .split('|')
      .filter(cell => cell.trim())
      .map(cell => cell.trim())
  );

  // Create table
  const rows: TableRow[] = [];

  // Header row
  rows.push(
    new TableRow({
      children: headerCells.map(
        cell =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cell.replace(/\*\*/g, ''),
                    bold: true,
                    size: 20,
                  }),
                ],
              }),
            ],
            shading: { fill: 'E8E8E8' },
          })
      ),
    })
  );

  // Data rows with alternating colors
  dataRows.forEach((row, index) => {
    rows.push(
      new TableRow({
        children: row.map(
          cell =>
            new TableCell({
              children: [
                new Paragraph({
                  children: parseInlineFormatting(cell),
                }),
              ],
              shading: index % 2 === 0 ? undefined : { fill: 'F8F8F8' },
            })
        ),
      })
    );
  });

  return new Table({
    rows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

/**
 * Simple helper to download markdown content as DOCX
 */
export async function downloadMarkdownAsDocx(
  markdown: string,
  title: string,
  filename: string
): Promise<void> {
  await downloadSynthesisAsDocx(title, [{ title: '', content: markdown }], filename);
}
