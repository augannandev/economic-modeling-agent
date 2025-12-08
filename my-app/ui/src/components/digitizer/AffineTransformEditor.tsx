import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Target, 
  Plus, 
  RotateCcw, 
  Check,
  X,
  Grid3X3,
  ZoomIn,
  ZoomOut,
  Move
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DataPoint {
  time: number;
  survival: number;
  id?: string;
  isNew?: boolean;
}

export interface ReferencePoint {
  pixelX: number;
  pixelY: number;
  dataX: number;
  dataY: number;
}

interface AffineTransformEditorProps {
  imageUrl: string;
  existingPoints: DataPoint[];
  axisRanges?: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  onPointsChange: (points: DataPoint[]) => void;
  onCancel?: () => void;
}

type EditorMode = 'view' | 'calibrate' | 'add';

export function AffineTransformEditor({
  imageUrl,
  existingPoints,
  axisRanges = { xMin: 0, xMax: 40, yMin: 0, yMax: 1 },
  onPointsChange,
  onCancel
}: AffineTransformEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);
  
  const [mode, setMode] = useState<EditorMode>('view');
  const [showGrid, setShowGrid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 });
  
  // Calibration state
  const [referencePoints, setReferencePoints] = useState<ReferencePoint[]>([]);
  const [calibrationStep, setCalibrationStep] = useState(0);
  const [isCalibrated, setIsCalibrated] = useState(false);
  
  // Transformation matrix
  const [transformMatrix, setTransformMatrix] = useState<{
    scaleX: number;
    scaleY: number;
    offsetX: number;
    offsetY: number;
  } | null>(null);
  
  // Points state
  const [points, setPoints] = useState<DataPoint[]>(existingPoints);
  const [newPoints, setNewPoints] = useState<DataPoint[]>([]);
  const [_selectedPointIndex, _setSelectedPointIndex] = useState<number | null>(null); // Reserved for future selection feature
  
  // Cursor position
  const [cursorPosition, setCursorPosition] = useState<{ pixel: { x: number; y: number }; data: { x: number; y: number } | null } | null>(null);
  
  // Image dimensions
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });

  // Calculate transformation matrix from reference points
  const calculateTransform = useCallback((refs: ReferencePoint[]) => {
    if (refs.length < 2) return null;
    
    const [p1, p2] = refs;
    
    // Calculate scale factors
    const scaleX = (p2.dataX - p1.dataX) / (p2.pixelX - p1.pixelX);
    const scaleY = (p2.dataY - p1.dataY) / (p2.pixelY - p1.pixelY);
    
    // Calculate offsets
    const offsetX = p1.dataX - scaleX * p1.pixelX;
    const offsetY = p1.dataY - scaleY * p1.pixelY;
    
    return { scaleX, scaleY, offsetX, offsetY };
  }, []);

  // Convert pixel coordinates to data coordinates
  const pixelToData = useCallback((pixelX: number, pixelY: number) => {
    if (!transformMatrix) return null;
    
    const dataX = transformMatrix.scaleX * pixelX + transformMatrix.offsetX;
    const dataY = transformMatrix.scaleY * pixelY + transformMatrix.offsetY;
    
    return { 
      x: Math.max(axisRanges.xMin, Math.min(axisRanges.xMax, dataX)),
      y: Math.max(axisRanges.yMin, Math.min(axisRanges.yMax, dataY))
    };
  }, [transformMatrix, axisRanges]);

  // Convert data coordinates to pixel coordinates (for display)
  const dataToPixel = useCallback((dataX: number, dataY: number) => {
    if (!transformMatrix) return null;
    
    const pixelX = (dataX - transformMatrix.offsetX) / transformMatrix.scaleX;
    const pixelY = (dataY - transformMatrix.offsetY) / transformMatrix.scaleY;
    
    return { x: pixelX, y: pixelY };
  }, [transformMatrix]);

  // Handle image click
  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    
    const rect = imageRef.current.getBoundingClientRect();
    const pixelX = (e.clientX - rect.left) / zoom;
    const pixelY = (e.clientY - rect.top) / zoom;
    
    if (mode === 'calibrate') {
      // Add calibration reference point
      const dataX = calibrationStep === 0 ? axisRanges.xMin : axisRanges.xMax;
      const dataY = calibrationStep === 0 ? axisRanges.yMax : axisRanges.yMin;
      
      const newRef: ReferencePoint = {
        pixelX,
        pixelY,
        dataX,
        dataY
      };
      
      const newRefs = [...referencePoints, newRef];
      setReferencePoints(newRefs);
      
      if (calibrationStep === 0) {
        setCalibrationStep(1);
      } else {
        // Calculate transformation
        const matrix = calculateTransform(newRefs);
        setTransformMatrix(matrix);
        setIsCalibrated(true);
        setMode('add');
      }
    } else if (mode === 'add' && isCalibrated) {
      // Add new point
      const dataCoords = pixelToData(pixelX, pixelY);
      if (dataCoords) {
        const newPoint: DataPoint = {
          time: Math.round(dataCoords.x * 100) / 100,
          survival: Math.round(dataCoords.y * 1000) / 1000,
          id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          isNew: true
        };
        setNewPoints(prev => [...prev, newPoint]);
      }
    }
  }, [mode, calibrationStep, referencePoints, isCalibrated, pixelToData, calculateTransform, axisRanges, zoom]);

  // Handle mouse move for cursor position display (throttled with requestAnimationFrame)
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current) return;
    
    if (isPanning) {
      const dx = e.clientX - lastPanPoint.x;
      const dy = e.clientY - lastPanPoint.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      setLastPanPoint({ x: e.clientX, y: e.clientY });
      return;
    }
    
    // Capture values immediately to avoid stale closures
    const clientX = e.clientX;
    const clientY = e.clientY;
    const currentZoom = zoom;
    const currentIsCalibrated = isCalibrated;
    
    // Throttle cursor position updates using requestAnimationFrame
    const now = Date.now();
    if (rafRef.current === null && now - lastUpdateRef.current >= 16) { // ~60fps
      rafRef.current = requestAnimationFrame(() => {
        if (!imageRef.current) return;
        
        const rect = imageRef.current.getBoundingClientRect();
        const pixelX = (clientX - rect.left) / currentZoom;
        const pixelY = (clientY - rect.top) / currentZoom;
        
        const dataCoords = currentIsCalibrated ? pixelToData(pixelX, pixelY) : null;
        
        setCursorPosition({
          pixel: { x: Math.round(pixelX), y: Math.round(pixelY) },
          data: dataCoords
        });
        
        lastUpdateRef.current = Date.now();
        rafRef.current = null;
      });
    }
  }, [isPanning, lastPanPoint, zoom, isCalibrated, pixelToData]);

  // Handle pan start
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode === 'view') {
      setIsPanning(true);
      setLastPanPoint({ x: e.clientX, y: e.clientY });
    }
  }, [mode]);

  // Handle pan end
  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  // Remove new point
  const handleRemoveNewPoint = (index: number) => {
    setNewPoints(prev => prev.filter((_, i) => i !== index));
  };

  // Reset calibration
  const handleResetCalibration = () => {
    setReferencePoints([]);
    setCalibrationStep(0);
    setIsCalibrated(false);
    setTransformMatrix(null);
    setMode('calibrate');
  };

  // Save changes
  const handleSaveChanges = () => {
    const allPoints = [...points, ...newPoints];
    // Sort by time
    allPoints.sort((a, b) => a.time - b.time);
    onPointsChange(allPoints);
  };

  // Image load handler with auto-fit
  const handleImageLoad = useCallback(() => {
    if (imageRef.current && containerRef.current) {
      const img = imageRef.current;
      const container = containerRef.current;
      
      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      const containerWidth = container.clientWidth;
      const containerHeight = container.clientHeight;
      
      setImageDimensions({
        width: imgWidth,
        height: imgHeight
      });
      
      // Calculate zoom to fit image in container
      const scaleX = containerWidth / imgWidth;
      const scaleY = containerHeight / imgHeight;
      const fitZoom = Math.min(scaleX, scaleY, 1); // Don't zoom in beyond 100%
      
      // Center the image
      const scaledWidth = imgWidth * fitZoom;
      const scaledHeight = imgHeight * fitZoom;
      const centerX = (containerWidth - scaledWidth) / 2;
      const centerY = (containerHeight - scaledHeight) / 2;
      
      setZoom(fitZoom);
      setPan({ x: centerX, y: centerY });
    }
  }, []);

  // Update points when existingPoints changes
  useEffect(() => {
    setPoints(existingPoints);
  }, [existingPoints]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  // Memoize transform calculations for existing points
  const existingPointsPixels = useMemo(() => {
    if (!isCalibrated || points.length === 0) return [];
    return points.map(point => {
      const pixel = dataToPixel(point.time, point.survival);
      return pixel ? { point, pixel } : null;
    }).filter((item): item is { point: DataPoint; pixel: { x: number; y: number } } => item !== null);
  }, [isCalibrated, points, dataToPixel]);

  // Memoize transform calculations for new points
  const newPointsPixels = useMemo(() => {
    if (!isCalibrated || newPoints.length === 0) return [];
    return newPoints.map(point => {
      const pixel = dataToPixel(point.time, point.survival);
      return pixel ? { point, pixel } : null;
    }).filter((item): item is { point: DataPoint; pixel: { x: number; y: number } } => item !== null);
  }, [isCalibrated, newPoints, dataToPixel]);

  const calibrationInstructions = [
    "Click on the ORIGIN point (Time=0, Survival=1.0 or 100%)",
    "Click on the OPPOSITE corner (Max Time, Survival=0)"
  ];

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Mode Selection */}
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Mode:</Label>
              <div className="flex gap-1">
                <Button
                  variant={mode === 'view' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('view')}
                  className="gap-1"
                >
                  <Move className="h-4 w-4" />
                  View
                </Button>
                <Button
                  variant={mode === 'calibrate' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    if (!isCalibrated) {
                      setMode('calibrate');
                    }
                  }}
                  disabled={isCalibrated}
                  className="gap-1"
                >
                  <Target className="h-4 w-4" />
                  Calibrate
                </Button>
                <Button
                  variant={mode === 'add' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setMode('add')}
                  disabled={!isCalibrated}
                  className="gap-1"
                >
                  <Plus className="h-4 w-4" />
                  Add Points
                </Button>
              </div>
            </div>

            {/* View Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowGrid(!showGrid)}
                className={cn(showGrid && "bg-primary text-primary-foreground")}
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setZoom(z => Math.min(3, z + 0.25))}
              >
                <ZoomIn className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground w-12 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}
              >
                <ZoomOut className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>

            {/* Calibration Controls */}
            {isCalibrated && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetCalibration}
              >
                <Target className="h-4 w-4 mr-1" />
                Recalibrate
              </Button>
            )}
          </div>

          {/* Calibration Instructions */}
          {mode === 'calibrate' && !isCalibrated && (
            <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Calibration Step {calibrationStep + 1}/2:
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {calibrationInstructions[calibrationStep]}
              </p>
            </div>
          )}

          {/* Cursor Position Display */}
          {cursorPosition && (
            <div className="mt-4 flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Pixel:</span>
                <span className="font-mono">
                  ({cursorPosition.pixel.x}, {cursorPosition.pixel.y})
                </span>
              </div>
              {cursorPosition.data && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Data:</span>
                  <span className="font-mono text-primary">
                    Time={cursorPosition.data.x.toFixed(2)}, Survival={cursorPosition.data.y.toFixed(3)}
                  </span>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Canvas */}
      <Card>
        <CardContent className="pt-4">
          <div 
            ref={containerRef}
            className="relative overflow-hidden border rounded-lg bg-white cursor-crosshair"
            style={{ 
              height: '70vh',
              minHeight: '600px',
              maxHeight: '800px',
              cursor: mode === 'view' ? 'grab' : 'crosshair'
            }}
            onClick={handleImageClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => { 
              setCursorPosition(null); 
              setIsPanning(false);
              if (rafRef.current !== null) {
                cancelAnimationFrame(rafRef.current);
                rafRef.current = null;
              }
            }}
          >
            <div
              style={{
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: 'top left',
                position: 'relative',
                willChange: 'transform'
              }}
            >
              {/* KM Plot Image */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="KM Plot"
                className="max-w-none"
                style={{ 
                  display: 'block',
                  objectFit: 'contain'
                }}
                onLoad={handleImageLoad}
                draggable={false}
              />

              {/* Grid Overlay */}
              {showGrid && imageDimensions.width > 0 && (
                <svg
                  className="absolute top-0 left-0 pointer-events-none"
                  width={imageDimensions.width}
                  height={imageDimensions.height}
                  style={{ opacity: 0.3 }}
                >
                  {/* Vertical lines */}
                  {Array.from({ length: 21 }).map((_, i) => (
                    <line
                      key={`v-${i}`}
                      x1={(i / 20) * imageDimensions.width}
                      y1={0}
                      x2={(i / 20) * imageDimensions.width}
                      y2={imageDimensions.height}
                      stroke="#356876"
                      strokeWidth={i % 5 === 0 ? 1 : 0.5}
                    />
                  ))}
                  {/* Horizontal lines */}
                  {Array.from({ length: 21 }).map((_, i) => (
                    <line
                      key={`h-${i}`}
                      x1={0}
                      y1={(i / 20) * imageDimensions.height}
                      x2={imageDimensions.width}
                      y2={(i / 20) * imageDimensions.height}
                      stroke="#356876"
                      strokeWidth={i % 5 === 0 ? 1 : 0.5}
                    />
                  ))}
                </svg>
              )}

              {/* Reference Points */}
              {referencePoints.map((point, i) => (
                <div
                  key={`ref-${i}`}
                  className="absolute w-6 h-6 -ml-3 -mt-3 flex items-center justify-center"
                  style={{ left: point.pixelX, top: point.pixelY }}
                >
                  <div className="w-4 h-4 rounded-full bg-amber-500 border-2 border-white shadow-lg animate-pulse" />
                  <span className="absolute -top-5 text-xs font-bold text-amber-600 bg-white px-1 rounded">
                    P{i + 1}
                  </span>
                </div>
              ))}

              {/* Existing Points (if calibrated) - using memoized pixels */}
              {existingPointsPixels.map(({ point, pixel }, i) => (
                <div
                  key={`existing-${point.id || i}`}
                  className="absolute w-4 h-4 -ml-2 -mt-2 rounded-full bg-blue-500 border-2 border-white shadow cursor-pointer hover:scale-125 transition-transform will-change-transform"
                  style={{ left: pixel.x, top: pixel.y }}
                  title={`Time: ${point.time}, Survival: ${point.survival}`}
                />
              ))}

              {/* New Points - using memoized pixels */}
              {newPointsPixels.map(({ point, pixel }, i) => (
                <div
                  key={`new-${point.id || i}`}
                  className="absolute w-5 h-5 -ml-2.5 -mt-2.5 rounded-full bg-green-500 border-2 border-white shadow cursor-pointer hover:scale-125 transition-transform group will-change-transform"
                  style={{ left: pixel.x, top: pixel.y }}
                  title={`NEW - Time: ${point.time}, Survival: ${point.survival}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveNewPoint(i);
                  }}
                >
                  <X className="h-3 w-3 text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100" />
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span>Calibration Points</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-blue-500" />
              <span>Extracted Points ({points.length})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500" />
              <span>New Points ({newPoints.length})</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* New Points Table */}
      {newPoints.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Newly Added Points</CardTitle>
            <CardDescription>
              Click on a point in the image to remove it, or use the table below
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-medium">#</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Time (months)</th>
                    <th className="px-4 py-2 text-left text-sm font-medium">Survival</th>
                    <th className="px-4 py-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {newPoints.map((point, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2 text-sm text-muted-foreground">{i + 1}</td>
                      <td className="px-4 py-2 text-sm font-mono">{point.time.toFixed(2)}</td>
                      <td className="px-4 py-2 text-sm font-mono">{point.survival.toFixed(4)}</td>
                      <td className="px-4 py-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive"
                          onClick={() => handleRemoveNewPoint(i)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex gap-2">
          {newPoints.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setNewPoints([])}
            >
              Clear New Points
            </Button>
          )}
          <Button
            onClick={handleSaveChanges}
            disabled={newPoints.length === 0}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Save {newPoints.length} New Point{newPoints.length !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    </div>
  );
}

