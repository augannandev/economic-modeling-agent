import { useState, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  LineChart, 
  Table2, 
  MousePointer2,
  Save,
  Undo,
  Image as ImageIcon,
  ArrowUpDown
} from 'lucide-react';
import { AffineTransformEditor, DataPoint } from './AffineTransformEditor';
import { PointEditor } from './PointEditor';

interface RiskTableRow {
  time: number;
  atRisk: number;
  events?: number;
}

interface DataEditorProps {
  endpointType: string;
  arm: string;
  imageUrl: string;
  extractedPoints: DataPoint[];  // Resampled points at granularity (for table/editing)
  fullResolutionPoints?: DataPoint[];  // Full resolution points (for curve display)
  riskTable: RiskTableRow[];
  axisRanges?: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  onSave: (data: { points: DataPoint[]; riskTable: RiskTableRow[] }) => void;
  onCancel: () => void;
  autoSort?: boolean;
}

// Sort points by time ascending
function sortPointsByTime(points: DataPoint[]): DataPoint[] {
  return [...points].sort((a, b) => a.time - b.time);
}

export function DataEditor({
  endpointType,
  arm,
  imageUrl,
  extractedPoints,
  fullResolutionPoints,
  riskTable: initialRiskTable,
  axisRanges = { xMin: 0, xMax: 40, yMin: 0, yMax: 1 },
  onSave,
  onCancel,
  autoSort = true
}: DataEditorProps) {
  // Points for table editing (resampled at granularity)
  const [points, setPoints] = useState<DataPoint[]>(
    autoSort ? sortPointsByTime(extractedPoints) : extractedPoints
  );
  // Full resolution points for curve display
  const curvePoints = fullResolutionPoints 
    ? (autoSort ? sortPointsByTime(fullResolutionPoints) : fullResolutionPoints)
    : points;
  const [riskTable, setRiskTable] = useState<RiskTableRow[]>(initialRiskTable);
  const [activeTab, setActiveTab] = useState('curve');
  const [hasChanges, setHasChanges] = useState(false);

  const handlePointsChange = useCallback((newPoints: DataPoint[]) => {
    setPoints(autoSort ? sortPointsByTime(newPoints) : newPoints);
    setHasChanges(true);
  }, [autoSort]);

  const handleManualSort = useCallback(() => {
    setPoints(prev => sortPointsByTime(prev));
    setHasChanges(true);
  }, []);

  const handleRiskTableChange = (index: number, field: keyof RiskTableRow, value: number) => {
    const newRiskTable = [...riskTable];
    newRiskTable[index] = { ...newRiskTable[index], [field]: value };
    setRiskTable(newRiskTable);
    setHasChanges(true);
  };

  const handleAddRiskRow = () => {
    const lastTime = riskTable.length > 0 ? riskTable[riskTable.length - 1].time : 0;
    setRiskTable([...riskTable, { time: lastTime + 6, atRisk: 0, events: 0 }]);
    setHasChanges(true);
  };

  const handleDeleteRiskRow = (index: number) => {
    setRiskTable(riskTable.filter((_, i) => i !== index));
    setHasChanges(true);
  };

  const handleReset = () => {
    setPoints(extractedPoints);
    setRiskTable(initialRiskTable);
    setHasChanges(false);
  };

  const handleSave = () => {
    onSave({ points, riskTable });
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                Edit Data: {endpointType} - {arm}
              </CardTitle>
              <CardDescription>
                Review and edit extracted survival data before generating IPD
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {hasChanges && (
                <span className="text-sm text-amber-600 dark:text-amber-400">
                  Unsaved changes
                </span>
              )}
              {!autoSort && (
                <Button
                  variant="outline"
                  onClick={handleManualSort}
                  className="gap-1"
                  size="sm"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sort by Time
                </Button>
              )}
              <Button
                variant="outline"
                onClick={handleReset}
                disabled={!hasChanges}
                className="gap-1"
              >
                <Undo className="h-4 w-4" />
                Reset
              </Button>
              <Button
                onClick={handleSave}
                className="gap-1"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Main Editor */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="curve" className="gap-2">
            <LineChart className="h-4 w-4" />
            Curve View
          </TabsTrigger>
          <TabsTrigger value="points" className="gap-2">
            <Table2 className="h-4 w-4" />
            Data Points
          </TabsTrigger>
          <TabsTrigger value="add" className="gap-2">
            <MousePointer2 className="h-4 w-4" />
            Add Points
          </TabsTrigger>
        </TabsList>

        {/* Curve View Tab */}
        <TabsContent value="curve" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Survival Curve Preview</CardTitle>
              <CardDescription>
                Visual representation of the extracted and edited data points
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Original Image */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Original KM Plot
                  </h4>
                  <div className="border rounded-lg overflow-hidden bg-white">
                    <img 
                      src={imageUrl} 
                      alt="Original KM Plot" 
                      className="w-full h-auto max-h-80 object-contain"
                    />
                  </div>
                </div>

                {/* Reconstructed Curve */}
                <div>
                  <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                    <LineChart className="h-4 w-4" />
                    Extracted Curve ({points.length} points)
                  </h4>
                  <div className="border rounded-lg p-4 bg-white h-80">
                    <svg width="100%" height="100%" viewBox="0 0 400 280" preserveAspectRatio="xMidYMid meet">
                      {/* Grid lines */}
                      <defs>
                        <pattern id="gridPattern" width="68" height="44" patternUnits="userSpaceOnUse">
                          <path d="M 68 0 L 0 0 0 44" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                        </pattern>
                      </defs>
                      <rect x="50" y="20" width="340" height="220" fill="url(#gridPattern)" />
                      
                      {/* Horizontal grid lines */}
                      {[0, 0.25, 0.5, 0.75, 1].map((s) => (
                        <line 
                          key={s}
                          x1="50" 
                          y1={240 - s * 220} 
                          x2="390" 
                          y2={240 - s * 220} 
                          stroke="#e5e7eb" 
                          strokeWidth="0.5"
                          strokeDasharray={s === 0 || s === 1 ? "0" : "3,3"}
                        />
                      ))}
                      
                      {/* Axes */}
                      <line x1="50" y1="240" x2="390" y2="240" stroke="#374151" strokeWidth="1.5"/>
                      <line x1="50" y1="20" x2="50" y2="240" stroke="#374151" strokeWidth="1.5"/>
                      
                      {/* Y-axis labels */}
                      <text x="42" y="25" textAnchor="end" fontSize="11" fill="#6b7280">100</text>
                      <text x="42" y="80" textAnchor="end" fontSize="11" fill="#6b7280">75</text>
                      <text x="42" y="135" textAnchor="end" fontSize="11" fill="#6b7280">50</text>
                      <text x="42" y="190" textAnchor="end" fontSize="11" fill="#6b7280">25</text>
                      <text x="42" y="245" textAnchor="end" fontSize="11" fill="#6b7280">0</text>
                      
                      {/* X-axis labels */}
                      <text x="50" y="258" textAnchor="middle" fontSize="11" fill="#6b7280">0</text>
                      <text x="135" y="258" textAnchor="middle" fontSize="11" fill="#6b7280">{Math.round(axisRanges.xMax * 0.25)}</text>
                      <text x="220" y="258" textAnchor="middle" fontSize="11" fill="#6b7280">{Math.round(axisRanges.xMax * 0.5)}</text>
                      <text x="305" y="258" textAnchor="middle" fontSize="11" fill="#6b7280">{Math.round(axisRanges.xMax * 0.75)}</text>
                      <text x="390" y="258" textAnchor="middle" fontSize="11" fill="#6b7280">{axisRanges.xMax}</text>
                      
                      {/* Axis titles */}
                      <text x="220" y="275" textAnchor="middle" fontSize="11" fill="#374151" fontWeight="500">Time (months)</text>
                      <text x="12" y="130" textAnchor="middle" transform="rotate(-90, 12, 130)" fontSize="11" fill="#374151" fontWeight="500">Survival (%)</text>
                      
                      {/* KM Step function line - using FULL RESOLUTION data for smooth curve */}
                      {curvePoints.length > 0 && (() => {
                        const sortedCurvePoints = [...curvePoints].sort((a, b) => a.time - b.time);
                        const pathParts: string[] = [];
                        
                        for (let i = 0; i < sortedCurvePoints.length; i++) {
                          const x = 50 + (sortedCurvePoints[i].time / axisRanges.xMax) * 340;
                          const y = 240 - sortedCurvePoints[i].survival * 220;
                          
                          if (i === 0) {
                            // Start at first point
                            pathParts.push(`M ${x} ${y}`);
                          } else {
                            const prevY = 240 - sortedCurvePoints[i-1].survival * 220;
                            // Horizontal line to new time at previous survival, then vertical drop
                            pathParts.push(`L ${x} ${prevY}`);
                            if (Math.abs(sortedCurvePoints[i].survival - sortedCurvePoints[i-1].survival) > 0.001) {
                              pathParts.push(`L ${x} ${y}`);
                            }
                          }
                        }
                        
                        // Extend the line to the end of the plot
                        if (sortedCurvePoints.length > 0) {
                          const lastY = 240 - sortedCurvePoints[sortedCurvePoints.length - 1].survival * 220;
                          pathParts.push(`L 390 ${lastY}`);
                        }
                        
                        return (
                          <path
                            d={pathParts.join(' ')}
                            fill="none"
                            stroke="#356876"
                            strokeWidth="2.5"
                            strokeLinecap="square"
                            strokeLinejoin="miter"
                          />
                        );
                      })()}
                      
                      {/* Data point markers - shown at GRANULARITY intervals (resampled points) */}
                      {points.length > 0 && (() => {
                        const sortedPoints = [...points].sort((a, b) => a.time - b.time);
                        return sortedPoints.map((point, i) => {
                          const x = 50 + (point.time / axisRanges.xMax) * 340;
                          const y = 240 - point.survival * 220;
                          const isNew = point.isNew;
                          
                          if (isNew) {
                            // Highlight newly added points with a green circle
                            return (
                              <circle
                                key={i}
                                cx={x}
                                cy={y}
                                r={4}
                                fill="#22c55e"
                                stroke="white"
                                strokeWidth="1.5"
                              />
                            );
                          } else {
                            // Show small circles at granularity intervals
                            return (
                              <circle
                                key={i}
                                cx={x}
                                cy={y}
                                r={2.5}
                                fill="#356876"
                                stroke="white"
                                strokeWidth="1"
                              />
                            );
                          }
                        });
                      })()}
                    </svg>
                  </div>
                </div>
              </div>

              {/* Stats Summary */}
              <div className="grid grid-cols-4 gap-4 mt-6">
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{points.length}</p>
                  <p className="text-xs text-muted-foreground">Table Points (Granularity)</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{curvePoints.length}</p>
                  <p className="text-xs text-muted-foreground">Curve Points (Full Res)</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">{riskTable.length}</p>
                  <p className="text-xs text-muted-foreground">Risk Table Rows</p>
                </div>
                <div className="p-3 bg-muted rounded-lg text-center">
                  <p className="text-2xl font-bold">
                    {points.length > 0 ? Math.max(...points.map(p => p.time)).toFixed(0) : 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Max Time (months)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Data Points Tab */}
        <TabsContent value="points" className="mt-4 space-y-4">
          <PointEditor
            points={points}
            onChange={handlePointsChange}
            title="Survival Data Points"
            description="Edit extracted survival probabilities or add new points manually"
          />

          {/* Risk Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Risk Table</CardTitle>
                  <CardDescription>Number at risk at each time point</CardDescription>
                </div>
                <Button size="sm" onClick={handleAddRiskRow}>
                  Add Row
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">Time (months)</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">At Risk</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Events</th>
                      <th className="px-4 py-2 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {riskTable.map((row, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={row.time}
                            onChange={(e) => handleRiskTableChange(i, 'time', parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border rounded bg-background"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={row.atRisk}
                            onChange={(e) => handleRiskTableChange(i, 'atRisk', parseInt(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border rounded bg-background"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            value={row.events || 0}
                            onChange={(e) => handleRiskTableChange(i, 'events', parseInt(e.target.value) || 0)}
                            className="w-20 px-2 py-1 text-sm border rounded bg-background"
                          />
                        </td>
                        <td className="px-4 py-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleDeleteRiskRow(i)}
                          >
                            <Undo className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Add Points (Affine Transform) Tab */}
        <TabsContent value="add" className="mt-4">
          <AffineTransformEditor
            imageUrl={imageUrl}
            existingPoints={points}
            axisRanges={axisRanges}
            onPointsChange={handlePointsChange}
            onCancel={() => setActiveTab('curve')}
          />
        </TabsContent>
      </Tabs>

      {/* Footer Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleSave} className="gap-2">
          <Save className="h-4 w-4" />
          Save All Changes
        </Button>
      </div>
    </div>
  );
}

