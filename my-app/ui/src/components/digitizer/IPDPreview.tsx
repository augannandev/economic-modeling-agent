import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Download, 
  ChevronLeft,
  Table2,
  LineChart,
  CheckCircle2,
  Edit,
  Save,
  X
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  type: 'km_plot' | 'risk_table';
}

interface EndpointData {
  endpointType: string;
  arm: string;
  kmPlot: UploadedImage | null;
  riskTable: UploadedImage | null;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'error';
  extractedData: any | null;
}

interface IPDPreviewProps {
  endpoints: EndpointData[];
  onExport: () => Promise<void>;
  onBack: () => void;
}

export function IPDPreview({ endpoints, onExport, onBack }: IPDPreviewProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const currentEndpoint = endpoints[selectedEndpoint];
  const extractedData = currentEndpoint?.extractedData;

  const handleExport = async () => {
    setIsExporting(true);
    try {
      await onExport();
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Upload
        </Button>
        <Button onClick={handleExport} disabled={isExporting} className="gap-2">
          <Download className="h-4 w-4" />
          {isExporting ? 'Exporting...' : 'Export IPD Data'}
        </Button>
      </div>

      {/* Endpoint Selector */}
      <div className="flex gap-2">
        {endpoints.map((endpoint, index) => (
          <Button
            key={index}
            variant={selectedEndpoint === index ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedEndpoint(index)}
            className="gap-2"
          >
            <CheckCircle2 className="h-4 w-4" />
            {endpoint.endpointType} - {endpoint.arm}
          </Button>
        ))}
      </div>

      {/* Data Preview */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>
                {currentEndpoint?.endpointType} - {currentEndpoint?.arm}
              </CardTitle>
              <CardDescription>
                Review and edit extracted data before export
              </CardDescription>
            </div>
            <Button
              variant={isEditing ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              ) : (
                <>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Data
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="plot">
            <TabsList className="mb-4">
              <TabsTrigger value="plot" className="gap-2">
                <LineChart className="h-4 w-4" />
                Survival Curve
              </TabsTrigger>
              <TabsTrigger value="points" className="gap-2">
                <Table2 className="h-4 w-4" />
                Data Points
              </TabsTrigger>
              <TabsTrigger value="risk" className="gap-2">
                <Table2 className="h-4 w-4" />
                Risk Table
              </TabsTrigger>
            </TabsList>

            <TabsContent value="plot">
              <div className="border rounded-lg p-4 bg-white">
                {/* Simple SVG visualization of the extracted curve */}
                <svg width="100%" height="300" viewBox="0 0 400 200">
                  {/* Grid */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="0.5"/>
                    </pattern>
                  </defs>
                  <rect width="100%" height="100%" fill="url(#grid)" />
                  
                  {/* Axes */}
                  <line x1="40" y1="160" x2="380" y2="160" stroke="#374151" strokeWidth="1"/>
                  <line x1="40" y1="20" x2="40" y2="160" stroke="#374151" strokeWidth="1"/>
                  
                  {/* Labels */}
                  <text x="210" y="190" textAnchor="middle" className="text-xs fill-gray-600">Time (months)</text>
                  <text x="15" y="90" textAnchor="middle" transform="rotate(-90, 15, 90)" className="text-xs fill-gray-600">Survival</text>
                  
                  {/* Y-axis labels */}
                  <text x="35" y="25" textAnchor="end" className="text-xs fill-gray-500">1.0</text>
                  <text x="35" y="65" textAnchor="end" className="text-xs fill-gray-500">0.75</text>
                  <text x="35" y="105" textAnchor="end" className="text-xs fill-gray-500">0.50</text>
                  <text x="35" y="145" textAnchor="end" className="text-xs fill-gray-500">0.25</text>
                  <text x="35" y="165" textAnchor="end" className="text-xs fill-gray-500">0</text>
                  
                  {/* Survival curve */}
                  {extractedData?.points && (
                    <polyline
                      points={extractedData.points.map((p: any, i: number) => 
                        `${40 + (i / extractedData.points.length) * 340},${160 - p.survival * 140}`
                      ).join(' ')}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="2"
                    />
                  )}
                  
                  {/* Data points */}
                  {extractedData?.points?.map((point: any, i: number) => (
                    <circle
                      key={i}
                      cx={40 + (i / extractedData.points.length) * 340}
                      cy={160 - point.survival * 140}
                      r="3"
                      fill="#3b82f6"
                      className={cn(
                        "transition-all",
                        isEditing && "cursor-pointer hover:fill-primary hover:r-4"
                      )}
                    />
                  ))}
                </svg>
                
                <div className="flex justify-center gap-8 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span>Extracted Curve</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500 border-2 border-blue-700" />
                    <span>Data Points ({extractedData?.points?.length || 0})</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="points">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">#</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Time (months)</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Survival Probability</th>
                      {isEditing && <th className="px-4 py-2 w-12"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData?.points?.slice(0, 15).map((point: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2 text-sm text-muted-foreground">{i + 1}</td>
                        <td className="px-4 py-2 text-sm">
                          {isEditing ? (
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded"
                              defaultValue={point.time.toFixed(2)}
                            />
                          ) : (
                            point.time.toFixed(2)
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {isEditing ? (
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded"
                              defaultValue={point.survival.toFixed(4)}
                              step="0.01"
                            />
                          ) : (
                            point.survival.toFixed(4)
                          )}
                        </td>
                        {isEditing && (
                          <td className="px-4 py-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
                              <X className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {extractedData?.points?.length > 15 && (
                  <div className="px-4 py-2 text-sm text-muted-foreground bg-muted/50">
                    ...and {extractedData.points.length - 15} more rows
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="risk">
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">Time (months)</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">At Risk</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Events</th>
                      {isEditing && <th className="px-4 py-2 w-12"></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData?.riskTable?.map((row: any, i: number) => (
                      <tr key={i} className="border-t">
                        <td className="px-4 py-2 text-sm">
                          {isEditing ? (
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded"
                              defaultValue={row.time}
                            />
                          ) : (
                            row.time
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {isEditing ? (
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded"
                              defaultValue={row.atRisk}
                            />
                          ) : (
                            row.atRisk
                          )}
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {isEditing ? (
                            <input
                              type="number"
                              className="w-20 px-2 py-1 border rounded"
                              defaultValue={row.events}
                            />
                          ) : (
                            row.events
                          )}
                        </td>
                        {isEditing && (
                          <td className="px-4 py-2">
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive">
                              <X className="h-3 w-3" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">{endpoints.length}</p>
              <p className="text-xs text-muted-foreground">Endpoints</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">
                {endpoints.reduce((acc, e) => acc + (e.extractedData?.points?.length || 0), 0)}
              </p>
              <p className="text-xs text-muted-foreground">Total Data Points</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold">Parquet</p>
              <p className="text-xs text-muted-foreground">Output Format</p>
            </div>
            <div className="p-3 bg-muted rounded-lg text-center">
              <p className="text-2xl font-bold text-green-600">Ready</p>
              <p className="text-xs text-muted-foreground">Status</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

