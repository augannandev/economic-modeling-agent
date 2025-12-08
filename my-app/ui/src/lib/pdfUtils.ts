import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

/**
 * Download a specific HTML element as a PDF with proper page handling
 * @param elementId The ID of the DOM element to capture
 * @param filename The name of the output PDF file
 */
export async function downloadPDF(elementId: string, filename: string): Promise<void> {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with ID ${elementId} not found`);
        return;
    }

    // Store original styles to restore later
    const originalStyles: Map<HTMLElement, { maxHeight: string; overflow: string; height: string }> = new Map();

    try {
        // Temporarily remove scroll constraints to capture full content
        const scrollableElements = element.querySelectorAll('[class*="max-h-"], [class*="overflow-"]');
        scrollableElements.forEach((el) => {
            const htmlEl = el as HTMLElement;
            originalStyles.set(htmlEl, {
                maxHeight: htmlEl.style.maxHeight,
                overflow: htmlEl.style.overflow,
                height: htmlEl.style.height,
            });
            htmlEl.style.maxHeight = 'none';
            htmlEl.style.overflow = 'visible';
            htmlEl.style.height = 'auto';
        });

        // Also check the element itself
        originalStyles.set(element, {
            maxHeight: element.style.maxHeight,
            overflow: element.style.overflow,
            height: element.style.height,
        });
        element.style.maxHeight = 'none';
        element.style.overflow = 'visible';

        // Wait for layout to settle
        await new Promise(resolve => setTimeout(resolve, 100));

        // Capture the full content
        const dataUrl = await toPng(element, {
            quality: 1.0,
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            style: {
                transform: 'scale(1)',
                transformOrigin: 'top left',
            },
        });

        // Create image to get dimensions
        const img = new Image();
        img.src = dataUrl;

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        // PDF settings
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
        });

        const pageWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const margin = 10; // Margin in mm
        const contentWidth = pageWidth - (margin * 2);
        const contentHeight = pageHeight - (margin * 2);

        // Calculate scaled dimensions
        const imgAspectRatio = img.width / img.height;
        const scaledWidth = contentWidth;
        const scaledHeight = (img.height * scaledWidth) / img.width;

        // Calculate how many pages we need
        const totalPages = Math.ceil(scaledHeight / contentHeight);

        for (let page = 0; page < totalPages; page++) {
            if (page > 0) {
                pdf.addPage();
            }

            // Calculate the portion of the image to show on this page
            const sourceY = (page * contentHeight / scaledHeight) * img.height;
            const sourceHeight = Math.min(
                (contentHeight / scaledHeight) * img.height,
                img.height - sourceY
            );

            // Create a canvas for this page's portion
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (!ctx) continue;

            // Set canvas size for this slice
            canvas.width = img.width;
            canvas.height = sourceHeight;

            // Draw the portion of the image
            ctx.drawImage(
                img,
                0, sourceY, // Source x, y
                img.width, sourceHeight, // Source width, height
                0, 0, // Dest x, y
                img.width, sourceHeight // Dest width, height
            );

            // Convert to data URL
            const pageDataUrl = canvas.toDataURL('image/png', 1.0);

            // Calculate the height for this slice in the PDF
            const sliceHeight = (sourceHeight / img.height) * scaledHeight;

            // Add the image slice to PDF
            pdf.addImage(
                pageDataUrl,
                'PNG',
                margin,
                margin,
                contentWidth,
                sliceHeight
            );

            // Add page number footer
            pdf.setFontSize(9);
            pdf.setTextColor(128, 128, 128);
            pdf.text(
                `Page ${page + 1} of ${totalPages}`,
                pageWidth / 2,
                pageHeight - 5,
                { align: 'center' }
            );

            // Add subtle header line
            if (page > 0) {
                pdf.setDrawColor(200, 200, 200);
                pdf.setLineWidth(0.1);
                pdf.line(margin, margin - 2, pageWidth - margin, margin - 2);
            }
        }

        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Failed to generate PDF:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to generate PDF: ${errorMessage}. Check console for details.`);
    } finally {
        // Restore original styles
        originalStyles.forEach((styles, el) => {
            el.style.maxHeight = styles.maxHeight;
            el.style.overflow = styles.overflow;
            el.style.height = styles.height;
        });
    }
}

/**
 * Generate PDF from markdown content directly (for synthesis reports)
 * This provides better control over page breaks and formatting
 */
export async function downloadMarkdownAsPDF(
    title: string,
    sections: Array<{ title: string; content: string }>,
    filename: string
): Promise<void> {
    const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);
    let yPosition = margin;
    let pageNumber = 1;

    const addPageNumber = () => {
        pdf.setFontSize(9);
        pdf.setTextColor(128, 128, 128);
        pdf.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    };

    const checkNewPage = (requiredHeight: number) => {
        if (yPosition + requiredHeight > pageHeight - margin - 15) {
            addPageNumber();
            pdf.addPage();
            pageNumber++;
            yPosition = margin;
            return true;
        }
        return false;
    };

    // Title
    pdf.setFontSize(20);
    pdf.setTextColor(0, 0, 0);
    pdf.setFont('helvetica', 'bold');
    pdf.text(title, margin, yPosition + 8);
    yPosition += 15;

    // Date
    pdf.setFontSize(10);
    pdf.setTextColor(100, 100, 100);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Generated: ${new Date().toLocaleDateString()}`, margin, yPosition);
    yPosition += 10;

    // Divider line
    pdf.setDrawColor(200, 200, 200);
    pdf.setLineWidth(0.5);
    pdf.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 10;

    // Sections
    for (const section of sections) {
        checkNewPage(20);

        // Section title
        pdf.setFontSize(14);
        pdf.setTextColor(0, 0, 0);
        pdf.setFont('helvetica', 'bold');
        pdf.text(section.title, margin, yPosition);
        yPosition += 8;

        // Section content - simple text wrapping
        pdf.setFontSize(10);
        pdf.setTextColor(60, 60, 60);
        pdf.setFont('helvetica', 'normal');

        // Strip markdown formatting for PDF text
        const plainText = stripMarkdown(section.content);
        const lines = pdf.splitTextToSize(plainText, contentWidth);

        for (const line of lines) {
            if (checkNewPage(6)) {
                // Continue after page break
            }
            pdf.text(line, margin, yPosition);
            yPosition += 5;
        }

        yPosition += 8; // Space between sections
    }

    addPageNumber();
    pdf.save(`${filename}.pdf`);
}

/**
 * Strip markdown formatting for plain text output
 */
function stripMarkdown(text: string): string {
    if (!text) return '';
    
    return text
        // Remove headers
        .replace(/^#{1,6}\s+/gm, '')
        // Remove bold/italic
        .replace(/\*\*([^*]+)\*\*/g, '$1')
        .replace(/\*([^*]+)\*/g, '$1')
        .replace(/__([^_]+)__/g, '$1')
        .replace(/_([^_]+)_/g, '$1')
        // Remove links but keep text
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        // Remove images
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Remove inline code
        .replace(/`([^`]+)`/g, '$1')
        // Remove code blocks
        .replace(/```[\s\S]*?```/g, '')
        // Remove blockquotes
        .replace(/^>\s+/gm, '')
        // Remove horizontal rules
        .replace(/^---+$/gm, '')
        // Clean up extra whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}
