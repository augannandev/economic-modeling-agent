import { toPng } from 'html-to-image';
import jsPDF from 'jspdf';

/**
 * Download a specific HTML element as a PDF
 * @param elementId The ID of the DOM element to capture
 * @param filename The name of the output PDF file
 */
export async function downloadPDF(elementId: string, filename: string): Promise<void> {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error(`Element with ID ${elementId} not found`);
        return;
    }

    try {
        // Use html-to-image which supports modern CSS including oklch
        const dataUrl = await toPng(element, {
            quality: 1.0,
            pixelRatio: 2, // Higher resolution
            backgroundColor: '#ffffff',
        });

        // Create image to get dimensions
        const img = new Image();
        img.src = dataUrl;

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        // Calculate PDF dimensions
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4',
        });

        const imgWidth = 210; // A4 width in mm
        const pageHeight = 297; // A4 height in mm
        const imgHeight = (img.height * imgWidth) / img.width;
        let heightLeft = imgHeight;
        let position = 0;

        // Add first page
        pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;

        // Add subsequent pages if content is long
        while (heightLeft >= 0) {
            position = heightLeft - imgHeight;
            pdf.addPage();
            pdf.addImage(dataUrl, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;
        }

        pdf.save(`${filename}.pdf`);
    } catch (error) {
        console.error('Failed to generate PDF:', error);
        const errorMessage = error instanceof Error ? error.message : String(error);
        alert(`Failed to generate PDF: ${errorMessage}. Check console for details.`);
    }
}
