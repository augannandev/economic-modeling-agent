import { useState, useRef, useCallback, useEffect } from 'react';
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
  X,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

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
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionMode, setSelectionMode] = useState<'km_plot' | 'risk_table' | null>(null);
  const [selection, setSelection] = useState<SelectionRect | null>(null);
  const [captures, setCaptures] = useState<{ type: string; preview: string; blob: Blob }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<pdfjsLib.RenderTask | null>(null);

  // Load PDF when file is uploaded
  useEffect(() => {
    if (!pdfFile) return;

    const loadPDF = async () => {
      setIsLoading(true);
      setRenderError(null);
      
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (error) {
        console.error('Error loading PDF:', error);
        setRenderError('Failed to load PDF. Please try another file.');
      } finally {
        setIsLoading(false);
      }
    };

    loadPDF();

    return () => {
      if (pdfDoc) {
        pdfDoc.destroy();
      }
    };
  }, [pdfFile]);

  // Render current page when PDF or page changes
  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async () => {
      // Cancel any ongoing render
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }

      try {
        const page = await pdfDoc.getPage(currentPage);
        const canvas = canvasRef.current;
        if (!canvas) return;

        const context = canvas.getContext('2d');
        if (!context) return;

        // Calculate scale to fit container while respecting zoom
        const baseScale = 1.5; // Base resolution multiplier for quality
        const viewport = page.getViewport({ scale: baseScale * zoom });

        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
          canvas: canvas,
        };

        renderTaskRef.current = page.render(renderContext as any);
        await renderTaskRef.current.promise;
      } catch (error: any) {
        if (error?.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', error);
          setRenderError('Failed to render page.');
        }
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, zoom]);

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setCaptures([]);
      setSelection(null);
      setSelectionMode(null);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === 'application/pdf') {
      setPdfFile(file);
      setCaptures([]);
      setSelection(null);
      setSelectionMode(null);
    }
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!selectionMode || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    
    setSelection({
      startX: e.clientX - rect.left + scrollLeft,
      startY: e.clientY - rect.top + scrollTop,
      endX: e.clientX - rect.left + scrollLeft,
      endY: e.clientY - rect.top + scrollTop,
    });
    setIsSelecting(true);
  }, [selectionMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isSelecting || !selection || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const scrollLeft = containerRef.current.scrollLeft;
    const scrollTop = containerRef.current.scrollTop;
    
    setSelection({
      ...selection,
      endX: e.clientX - rect.left + scrollLeft,
      endY: e.clientY - rect.top + scrollTop,
    });
  }, [isSelecting, selection]);

  const handleMouseUp = useCallback(async () => {
    if (!isSelecting || !selection || !selectionMode || !canvasRef.current) return;

    setIsSelecting(false);
    
    // Calculate the selection rectangle in canvas coordinates
    const canvas = canvasRef.current;
    const left = Math.min(selection.startX, selection.endX);
    const top = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);

    // Minimum selection size
    if (width < 10 || height < 10) {
      setSelection(null);
      return;
    }

    // Create a temporary canvas to extract the selected region
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const tempCtx = tempCanvas.getContext('2d');
    
    if (tempCtx) {
      tempCtx.drawImage(
        canvas,
        left, top, width, height,
        0, 0, width, height
      );

      // Convert to blob
      tempCanvas.toBlob((blob) => {
        if (blob) {
          const preview = tempCanvas.toDataURL('image/png');
          setCaptures((prev) => [
            ...prev,
            { type: selectionMode, preview, blob },
          ]);
          
          // Call the callback with the captured screenshot
          onScreenshotCapture(blob, selectionMode);
        }
      }, 'image/png');
    }
    
    setSelection(null);
    setSelectionMode(null);
  }, [isSelecting, selection, selectionMode, onScreenshotCapture]);

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

  const removeCapture = (index: number) => {
    setCaptures((prev) => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      {!pdfFile ? (
        <div
          className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => document.getElementById('pdf-upload')?.click()}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
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
          <div className="flex items-center justify-between bg-muted/50 p-2 rounded-lg flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1 || isLoading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-2 min-w-[100px] text-center">
                Page {currentPage} of {totalPages}
              </span>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages || isLoading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                disabled={zoom <= 0.5}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm w-16 text-center">{Math.round(zoom * 100)}%</span>
              <Button 
                variant="outline" 
                size="icon" 
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                disabled={zoom >= 3}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant={selectionMode === 'km_plot' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode(selectionMode === 'km_plot' ? null : 'km_plot')}
                className="gap-2"
                disabled={isLoading}
              >
                <ImageIcon className="h-4 w-4" />
                Select KM Plot
              </Button>
              <Button
                variant={selectionMode === 'risk_table' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSelectionMode(selectionMode === 'risk_table' ? null : 'risk_table')}
                className="gap-2"
                disabled={isLoading}
              >
                <Table2 className="h-4 w-4" />
                Select Risk Table
              </Button>
            </div>

            {/* Change PDF button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setPdfFile(null);
                setPdfDoc(null);
                setCaptures([]);
              }}
              className="gap-2"
            >
              <X className="h-4 w-4" />
              Change PDF
            </Button>
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

          {/* Error Message */}
          {renderError && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3 text-destructive text-sm">
              {renderError}
            </div>
          )}

          {/* PDF Viewer Area */}
          <div
            ref={containerRef}
            className={cn(
              "relative border rounded-lg bg-gray-100 dark:bg-gray-800 overflow-auto",
              selectionMode && "cursor-crosshair"
            )}
            style={{ height: '600px' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => {
              if (isSelecting) {
                setIsSelecting(false);
                setSelection(null);
              }
            }}
          >
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Loading PDF...</span>
                </div>
              </div>
            ) : (
              <div className="inline-block p-4">
                <canvas
                  ref={canvasRef}
                  className="shadow-lg bg-white"
                  style={{ display: 'block' }}
                />
              </div>
            )}

            {/* Selection Rectangle */}
            {selection && isSelecting && (
              <div
                className="absolute border-2 border-primary bg-primary/20 pointer-events-none z-10"
                style={getSelectionStyle()}
              />
            )}
          </div>

          {/* Captured Screenshots */}
          {captures.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Captured Screenshots ({captures.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {captures.map((capture, idx) => (
                    <div key={idx} className="relative group">
                      <img
                        src={capture.preview}
                        alt={capture.type}
                        className="w-full h-40 object-contain border rounded bg-white"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-2 rounded-b">
                        {capture.type === 'km_plot' ? 'KM Plot' : 'Risk Table'}
                      </div>
                      <Button
                        variant="destructive"
                        size="icon"
                        className="absolute top-2 right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => removeCapture(idx)}
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
