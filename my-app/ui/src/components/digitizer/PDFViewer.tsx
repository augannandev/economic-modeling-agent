import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Upload, 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut,
  Crop,
  Image as ImageIcon,
  Table2,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PDFViewerProps {
  onScreenshotCapture: (screenshot: Blob, type: 'km_plot' | 'risk_table') => void;
}

interface SelectionRect {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export function PDFViewer({ onScreenshotCapture }: PDFViewerProps) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'km_plot' | 'risk_table' | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [captures, setCaptures] = useState<{ type: string; preview: string }[]>([]);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
      // In a real implementation, we'd use PDF.js to render the PDF
      // For now, we'll show a placeholder
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setSelection({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top,
    });
    setIsSelecting(true);
  }, [selectionMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !selection || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    setSelection({
      ...selection,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top,
    });
  }, [isSelecting, selection]);

  const handleMouseUp = useCallback(() => {
    if (!isSelecting || !selection || !selectionMode) return;

    setIsSelecting(false);
    
    // Create a screenshot of the selected area
    // In a real implementation, we'd use canvas to capture the region
    const preview = `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect fill="%23eee" width="100%" height="100%"/><text x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999">Screenshot</text></svg>`;
    
    setCaptures((prev) => [
      ...prev,
      { type: selectionMode, preview },
    ]);
    
    setSelection(null);
    setSelectionMode(null);
  }, [isSelecting, selection, selectionMode]);

  const getSelectionStyle = () => {
    if (!selection) return {};
    
    const left = Math.min(selection.startX, selection.endX);
    const top = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    
    return {
      left: `${left}px`,
      top: `${top}px`,
      width: `${width}px`,
      height: `${height}px`,
    };
  };

  return (
    <div className="space-y-4">
      {!pdfFile ? (
        <div
          className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => document.getElementById('pdf-upload')?.click()}
        >
          <Upload className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium mb-2">Upload PDF Document</p>
          <p className="text-sm text-muted-foreground">
            Click to upload or drag and drop
          </p>
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2">
                Page {currentPage} of {totalPages}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="icon" onClick={() => setZoom((z) => Math.min(2, z + 0.25))}>
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={selectionMode === 'km_plot' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode(selectionMode === 'km_plot' ? null : 'km_plot')}
                className="gap-2"
              >
                <ImageIcon className="h-4 w-4" />
                Select KM Plot
              </Button>
              <Button
                variant={selectionMode === 'risk_table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode(selectionMode === 'risk_table' ? null : 'risk_table')}
                className="gap-2"
              >
                <Table2 className="h-4 w-4" />
                Select Risk Table
              </Button>
            </div>
          </div>

          {/* Selection Mode Indicator */}
          {selectionMode && (
            <div className="bg-primary/10 border border-primary/20 rounded-lg p-3 flex items-center gap-2">
              <Crop className="h-4 w-4 text-primary" />
              <span className="text-sm">
                Click and drag to select the {selectionMode === 'km_plot' ? 'KM plot' : 'risk table'} region
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelectionMode(null)} className="ml-auto">
                Cancel
              </Button>
            </div>
          )}

          {/* PDF Viewer Area */}
          <div
            ref={containerRef}
            className={cn(
              "relative border rounded-lg bg-gray-100 overflow-auto",
              selectionMode && "cursor-crosshair"
            )}
            style={{ height: '500px' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          >
            {/* PDF content would be rendered here using PDF.js */}
            <div
              className="flex items-center justify-center h-full text-muted-foreground"
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}
            >
              <div className="text-center p-8 bg-white rounded-lg shadow-sm">
                <p className="font-medium mb-2">{pdfFile.name}</p>
                <p className="text-sm">PDF rendering would appear here</p>
                <p className="text-xs mt-2 text-muted-foreground">
                  (Requires PDF.js integration)
                </p>
              </div>
            </div>

            {/* Selection Rectangle */}
            {selection && isSelecting && (
              <div
                className="absolute border-2 border-primary bg-primary/10 pointer-events-none"
                style={getSelectionStyle()}
              />
            )}
          </div>

          {/* Captured Screenshots */}
          {captures.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Captured Screenshots</CardTitle>
              </CardHeader>
              <CardContent>
              <div className="grid grid-cols-2 gap-4">
                  {captures.map((capture, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={capture.preview}
                        alt={capture.type}
                        className="w-full h-32 object-contain border rounded bg-white"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2">
                        {capture.type === 'km_plot' ? 'KM Plot' : 'Risk Table'}
                    </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setCaptures((prev) => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
