import { useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { PDFViewer } from '@/components/digitizer/PDFViewer';
import { ExtractionProgress } from '@/components/digitizer/ExtractionProgress';
import { DataEditor } from '@/components/digitizer/DataEditor';
import { DataPoint } from '@/components/digitizer/AffineTransformEditor';
import { extractKMCurve, generatePseudoIPD } from '@/lib/digitizerApi';
import { 
  ChevronLeft,
  Upload,
  FileText,
  Wand2,
  CheckCircle2,
  Edit,
  Save,
  Play,
  FileDown,
  Settings2,
  RefreshCw,
  ArrowUpDown,
  Info,
  X,
  Download
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadedImage {
  id: string;
  file: File;
  preview: string;
  type: 'km_plot' | 'risk_table';
}

interface RiskTableRow {
  time: number;
  atRisk: number;
  events?: number;
}

interface ExtractionMetadata {
  detectedEndpointType?: string;  // From plot title/labels
  detectedArmName?: string;  // Primary arm name detected
  numCurves?: number;
  curveColors?: string[];
  studyInfo?: string;
  xUnit?: string;
}

// Each arm extracted from a KM plot
interface ExtractedArm {
  id: string;
  detectedName: string;  // From legend: "Pembrolizumab", "Chemotherapy"
  mappedArmType: string;  // User maps to: "Treatment", "Comparator", "Control"
  color: string;  // Detected color: "blue", "gray"
  points: DataPoint[];  // Resampled points at selected granularity (shown in table)
  fullResolutionPoints: DataPoint[];  // Full resolution points (for curve display)
  riskTable: RiskTableRow[];
  editedPoints?: DataPoint[];  // User edits
  editedRiskTable?: RiskTableRow[];
}

interface EndpointData {
  endpointType: string;  // Predefined: OS, PFS, DFS, EFS, TTP
  arm: string;           // Kept for backwards compatibility with uploader
  kmPlot: UploadedImage | null;
  riskTable: UploadedImage | null;
  extractionStatus: 'pending' | 'extracting' | 'extracted' | 'error';
  // Legacy single-arm data (for backwards compatibility)
  extractedData: {
    points: DataPoint[];
    riskTable: RiskTableRow[];
    axisRanges?: {
      xMin: number;
      xMax: number;
      yMin: number;
      yMax: number;
    };
  } | null;
  editedData?: {
    points: DataPoint[];
    riskTable: RiskTableRow[];
  } | null;
  // New multi-arm support
  extractedArms: ExtractedArm[];
  axisRanges?: {
    xMin: number;
    xMax: number;
    yMin: number;
    yMax: number;
  };
  metadata?: ExtractionMetadata;
}

// Predefined options
const ENDPOINT_TYPES = ['OS', 'PFS', 'DFS', 'EFS', 'TTP'];
const ARM_TYPES = ['Treatment', 'Comparator', 'Control'];
const GRANULARITY_OPTIONS = [
  { value: 0.1, label: '0.1 months (finest)' },
  { value: 0.25, label: '0.25 months' },
  { value: 0.5, label: '0.5 months' },
  { value: 1.0, label: '1.0 month (coarsest)' },
];

const WORKFLOW_TABS = [
  { id: 'upload', label: 'Upload', icon: Upload },
  { id: 'extract', label: 'Extract', icon: Wand2 },
  { id: 'edit', label: 'Edit', icon: Edit },
  { id: 'export', label: 'Export IPD', icon: FileDown },
];

/**
 * Resample points to a specific granularity
 */
function resamplePoints(points: DataPoint[], granularity: number): DataPoint[] {
  if (points.length === 0) return [];
  
  const sortedPoints = [...points].sort((a, b) => a.time - b.time);
  const maxTime = sortedPoints[sortedPoints.length - 1].time;
  const resampled: DataPoint[] = [];
  
  // Always include time 0
  const firstPoint = sortedPoints.find(p => p.time === 0) || { time: 0, survival: 1.0 };
  resampled.push({ ...firstPoint, id: `resampled_0` });
  
  // Generate points at granularity intervals
  for (let t = granularity; t <= maxTime; t += granularity) {
    // Find the point just before or at this time (step function)
    let before = sortedPoints[0];
    
    for (let i = 0; i < sortedPoints.length; i++) {
      if (sortedPoints[i].time <= t) {
        before = sortedPoints[i];
      } else {
        break;
      }
    }
    
    // Use step function (KM-style) - use the survival from before
    const survival = before.survival;
    
    resampled.push({
      time: Math.round(t * 1000) / 1000,
      survival: Math.round(survival * 10000) / 10000,
      id: `resampled_${resampled.length}`,
    });
  }
  
  return resampled;
}

/**
 * Sort points by time ascending
 */
function sortPointsByTime(points: DataPoint[]): DataPoint[] {
  return [...points].sort((a, b) => a.time - b.time);
}

export function KMDigitizer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const projectId = searchParams.get('project');
  
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadMethod, setUploadMethod] = useState<'direct' | 'pdf'>('direct');
  // Each endpoint represents ONE plot that can contain MULTIPLE arms
  const [endpoints, setEndpoints] = useState<EndpointData[]>([
    { endpointType: 'OS', arm: '', kmPlot: null, riskTable: null, extractionStatus: 'pending', extractedData: null, extractedArms: [] },
  ]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);
  const [editingEndpointIndex, setEditingEndpointIndex] = useState<number | null>(null);
  const [editingArmId, setEditingArmId] = useState<string | null>(null);
  const [isGeneratingIPD, setIsGeneratingIPD] = useState(false);

  // Global settings
  const [granularity, setGranularity] = useState(0.25);
  const [autoSort, setAutoSort] = useState(true);

  // Image handling
  const handleImageUpload = useCallback((endpointIndex: number, type: 'km_plot' | 'risk_table', file: File) => {
    const preview = URL.createObjectURL(file);
    const image: UploadedImage = {
      id: `${Date.now()}-${type}`,
      file,
      preview,
      type,
    };

    setEndpoints((prev) => {
      const updated = [...prev];
      if (type === 'km_plot') {
        updated[endpointIndex].kmPlot = image;
      } else {
        updated[endpointIndex].riskTable = image;
      }
      // Reset extraction status when image changes
      updated[endpointIndex].extractionStatus = 'pending';
      updated[endpointIndex].extractedData = null;
      updated[endpointIndex].editedData = undefined;
      updated[endpointIndex].extractedArms = [];
      updated[endpointIndex].metadata = undefined;
      return updated;
    });
  }, []);

  const handleRemoveImage = useCallback((endpointIndex: number, type: 'km_plot' | 'risk_table') => {
    setEndpoints((prev) => {
      const updated = [...prev];
      if (type === 'km_plot') {
        if (updated[endpointIndex].kmPlot) {
          URL.revokeObjectURL(updated[endpointIndex].kmPlot!.preview);
        }
        updated[endpointIndex].kmPlot = null;
      } else {
        if (updated[endpointIndex].riskTable) {
          URL.revokeObjectURL(updated[endpointIndex].riskTable!.preview);
        }
        updated[endpointIndex].riskTable = null;
      }
      updated[endpointIndex].extractionStatus = 'pending';
      updated[endpointIndex].extractedData = null;
      updated[endpointIndex].editedData = undefined;
      updated[endpointIndex].extractedArms = [];
      updated[endpointIndex].metadata = undefined;
      return updated;
    });
  }, []);

  const handleAddEndpoint = () => {
    // Suggest next endpoint type
    const usedTypes = endpoints.map(e => e.endpointType);
    const nextType = ENDPOINT_TYPES.find(t => !usedTypes.includes(t)) || 'PFS';
    
    setEndpoints((prev) => [
      ...prev,
      { endpointType: nextType, arm: '', kmPlot: null, riskTable: null, extractionStatus: 'pending', extractedData: null, extractedArms: [] },
    ]);
  };

  const handleRemoveEndpoint = (index: number) => {
    setEndpoints((prev) => {
      const endpoint = prev[index];
      if (endpoint.kmPlot) URL.revokeObjectURL(endpoint.kmPlot.preview);
      if (endpoint.riskTable) URL.revokeObjectURL(endpoint.riskTable.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleUpdateEndpoint = (index: number, field: 'endpointType' | 'arm', value: string) => {
    setEndpoints((prev) => {
      const updated = [...prev];
      if (field === 'endpointType') {
        updated[index].endpointType = value;
      } else {
        updated[index].arm = value;
      }
      return updated;
    });
  };

  // Update arm mapping (user maps detected name to predefined type)
  const handleUpdateArmMapping = (endpointIndex: number, armId: string, mappedType: string) => {
    setEndpoints((prev) => {
      const updated = [...prev];
      const armIndex = updated[endpointIndex].extractedArms.findIndex(a => a.id === armId);
      if (armIndex >= 0) {
        updated[endpointIndex].extractedArms[armIndex].mappedArmType = mappedType;
      }
      return updated;
    });
  };

  // Extraction - require BOTH KM plot AND risk table for each endpoint
  const canProceedToExtraction = endpoints.every((e) => e.kmPlot !== null && e.riskTable !== null);

  const handleStartExtraction = async () => {
    setIsExtracting(true);
    setActiveTab('extract');
    setExtractionProgress(0);

    for (let i = 0; i < endpoints.length; i++) {
      const endpoint = endpoints[i];
      
      // Skip endpoints without a KM plot
      if (!endpoint.kmPlot) {
        continue;
      }
      
      setEndpoints((prev) => {
        const updated = [...prev];
        updated[i].extractionStatus = 'extracting';
        return updated;
      });

      try {
        console.log(`[KMDigitizer] Extracting ALL curves from endpoint ${i + 1}/${endpoints.length}: ${endpoint.endpointType}`);
        
        // Call extraction API - it will extract ALL curves from the plot
        const result = await extractKMCurve({
          kmPlotFile: endpoint.kmPlot.file,
          riskTableFile: endpoint.riskTable?.file,
          endpointType: endpoint.endpointType,
          arm: 'all',  // Signal to extract ALL arms
          granularity: granularity,
          apiProvider: 'anthropic'
        });

        if (result.success) {
          // Use the structured curves data from backend
          const backendCurves = result.curves || [];
          const curveColors = result.metadata?.curveColors || [];
          const curveNames = result.metadata?.detectedArmNames || [];
          
          // Debug logging for risk table
          console.log(`[KMDigitizer] Extraction result:`, {
            curvesCount: backendCurves.length,
            globalRiskTable: result.riskTable?.length || 0,
            curves: backendCurves.map(c => ({
              name: c.name,
              pointsCount: c.points?.length,
              riskTableCount: c.riskTable?.length || 0,
            })),
          });
          
          // Create ExtractedArm objects from backend curves
          const extractedArms: ExtractedArm[] = [];
          
          if (backendCurves.length > 0) {
            // Backend returned structured curves - use them
            for (let curveIdx = 0; curveIdx < backendCurves.length; curveIdx++) {
              const curve = backendCurves[curveIdx];
              const color = curve.color || curveColors[curveIdx] || 'blue';
              const detectedName = curve.name || curveNames[curveIdx] || `Arm ${curveIdx + 1}`;
              
              // Default mapping based on index or color
              let mappedType = 'Treatment';
              if (curveIdx === 1 || color === 'gray') mappedType = 'Comparator';
              if (curveIdx === 2) mappedType = 'Control';
              
              // Full resolution points (for curve display)
              const fullResPoints = curve.points.map((p, j) => ({
                ...p,
                id: p.id || `arm${curveIdx}_full_${j}`,
              }));
              const sortedFullRes = autoSort ? sortPointsByTime(fullResPoints) : fullResPoints;
              
              // Resampled points at granularity (for table display/editing)
              // Use resampledPoints if available, otherwise use full points
              const resampledData = curve.resampledPoints || curve.points;
              const resampledPoints = resampledData.map((p, j) => ({
                ...p,
                id: p.id || `arm${curveIdx}_${j}`,
              }));
              const sortedResampled = autoSort ? sortPointsByTime(resampledPoints) : resampledPoints;
              
              // Use per-arm risk table from curve if available, otherwise fall back to global risk table
              const armRiskTable = curve.riskTable || (curveIdx === 0 ? (result.riskTable || []) : []);
              
              console.log(`[KMDigitizer] Curve ${detectedName}: ${sortedFullRes.length} full res, ${sortedResampled.length} resampled`);
              
              extractedArms.push({
                id: `arm_${i}_${curveIdx}`,
                detectedName,
                mappedArmType: mappedType,
                color,
                points: sortedResampled,  // Resampled points for table
                fullResolutionPoints: sortedFullRes,  // Full res for curve
                riskTable: armRiskTable,
              });
            }
          } else {
            // Fallback: single curve from points array
            const curvePoints = result.points.map((p, j) => ({
              ...p,
              id: p.id || `arm0_${j}`,
            }));
            
            const sortedPoints = autoSort ? sortPointsByTime(curvePoints) : curvePoints;
            
            extractedArms.push({
              id: `arm_${i}_0`,
              detectedName: curveNames[0] || result.metadata?.detectedArmName || 'Treatment',
              mappedArmType: 'Treatment',
              color: curveColors[0] || 'blue',
              points: sortedPoints,  // Same for both in fallback
              fullResolutionPoints: sortedPoints,
              riskTable: result.riskTable || [],
            });
          }

      setEndpoints((prev) => {
        const updated = [...prev];
        updated[i].extractionStatus = 'extracted';
            updated[i].extractedArms = extractedArms;
            updated[i].axisRanges = result.axisRanges || {
              xMin: 0,
              xMax: 36,
              yMin: 0,
              yMax: 1
            };
            
            // Also populate legacy extractedData for backwards compatibility
            if (extractedArms.length > 0) {
        updated[i].extractedData = {
                points: extractedArms[0].points,
                riskTable: extractedArms[0].riskTable,
                axisRanges: result.axisRanges || { xMin: 0, xMax: 36, yMin: 0, yMax: 1 }
              };
            }
            
            updated[i].metadata = {
              detectedEndpointType: result.metadata?.outcomeType,
              detectedArmName: result.metadata?.detectedArmName,
              numCurves: extractedArms.length,
              curveColors: result.metadata?.curveColors,
              studyInfo: result.metadata?.studyInfo,
              xUnit: result.metadata?.xUnit,
        };
        return updated;
      });
        } else {
          throw new Error(result.error || 'Extraction failed');
        }
      } catch (error) {
        console.error(`[KMDigitizer] Extraction failed for endpoint ${i + 1}:`, error);
        
        setEndpoints((prev) => {
          const updated = [...prev];
          updated[i].extractionStatus = 'error';
          return updated;
        });
      }

      setExtractionProgress(((i + 1) / endpoints.length) * 100);
    }

    setIsExtracting(false);
    
    // Auto-advance to edit tab after extraction if any succeeded
    setTimeout(() => {
      const anyExtracted = endpoints.some(e => e.extractionStatus === 'extracted');
      if (anyExtracted) {
        setActiveTab('edit');
      }
    }, 500);
  };

  // Re-apply granularity to all endpoints
  const handleApplyGranularity = () => {
    setEndpoints((prev) => prev.map(endpoint => {
      if (endpoint.extractedArms.length === 0) return endpoint;
      
      return {
        ...endpoint,
        extractedArms: endpoint.extractedArms.map(arm => {
          const dataToResample = arm.editedPoints || arm.points;
          const resampledPoints = resamplePoints(dataToResample, granularity);
          return {
            ...arm,
            editedPoints: autoSort ? sortPointsByTime(resampledPoints) : resampledPoints,
          };
        })
      };
    }));
  };

  // Sort all endpoints
  const handleSortAllEndpoints = () => {
    setEndpoints((prev) => prev.map(endpoint => {
      if (endpoint.extractedArms.length === 0) return endpoint;
      
      return {
        ...endpoint,
        extractedArms: endpoint.extractedArms.map(arm => ({
          ...arm,
          editedPoints: sortPointsByTime(arm.editedPoints || arm.points),
        }))
      };
    }));
  };

  // Editing - edits a specific arm within an endpoint
  const handleEditArm = (endpointIndex: number, armId: string) => {
    setEditingEndpointIndex(endpointIndex);
    setEditingArmId(armId);
  };

  const handleSaveArmEdit = (endpointIndex: number, armId: string, data: { points: DataPoint[]; riskTable: RiskTableRow[] }) => {
    setEndpoints((prev) => {
      const updated = [...prev];
      const armIndex = updated[endpointIndex].extractedArms.findIndex(a => a.id === armId);
      if (armIndex >= 0) {
        updated[endpointIndex].extractedArms[armIndex].editedPoints = 
          autoSort ? sortPointsByTime(data.points) : data.points;
        updated[endpointIndex].extractedArms[armIndex].editedRiskTable = data.riskTable;
      }
      return updated;
    });
    setEditingEndpointIndex(null);
    setEditingArmId(null);
  };

  const handleCancelEdit = () => {
    setEditingEndpointIndex(null);
    setEditingArmId(null);
  };

  // Export / IPD Generation - now generates IPD for each arm
  const allEndpointsExtracted = endpoints.every(e => e.extractionStatus === 'extracted');

  const handleGenerateIPD = async () => {
    setIsGeneratingIPD(true);

    try {
      // Prepare IPD requests for each arm in each endpoint
      // IMPORTANT: Use full resolution points for IPD generation (Guyot method needs actual event times)
      const ipdRequests: { endpointType: string; arm: string; points: DataPoint[]; riskTable: RiskTableRow[] }[] = [];
      
      endpoints.forEach(endpoint => {
        endpoint.extractedArms.forEach(arm => {
          // Use full resolution points for IPD (where actual events occur)
          // Fall back to resampled points if edited, or if full res not available
          const pointsForIPD = arm.editedPoints || arm.fullResolutionPoints || arm.points;
          
          // Use detectedName for file naming (e.g., "Pembrolizumab", "Chemotherapy")
          // This matches what survival analysis expects
          const armNameForFile = arm.detectedName || arm.mappedArmType;
          
          ipdRequests.push({
            endpointType: endpoint.endpointType,
            arm: armNameForFile,
            points: pointsForIPD,
            riskTable: arm.editedRiskTable || arm.riskTable,
          });
          
          console.log(`[KMDigitizer] IPD request for ${endpoint.endpointType}-${armNameForFile}: ${pointsForIPD.length} points`);
          
          // Debug: check survival range to verify data has drops
          if (pointsForIPD.length > 0) {
            const survivals = pointsForIPD.map(p => p.survival);
            const minSurv = Math.min(...survivals);
            const maxSurv = Math.max(...survivals);
            console.log(`[KMDigitizer] Survival range: ${minSurv.toFixed(4)} - ${maxSurv.toFixed(4)}`);
          }
        });
      });

      console.log(`[KMDigitizer] Generating IPD for ${ipdRequests.length} arm(s)`);
      
      const result = await generatePseudoIPD(ipdRequests);

      if (result.success) {
        console.log('[KMDigitizer] IPD generation successful:', result.files);
        alert(`Pseudo-IPD generated successfully!\n\nGenerated ${result.files.length} parquet files:\n${result.files.map(f => `• ${f.endpoint} - ${f.arm}: ${f.nPatients} patients, ${f.events} events`).join('\n')}\n\nFiles are ready for survival analysis.`);
        
    if (projectId) {
      navigate(`/projects/${projectId}`);
        }
      } else {
        throw new Error(result.error || 'IPD generation failed');
      }
    } catch (error) {
      console.error('IPD generation failed:', error);
      alert(`Failed to generate IPD: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeneratingIPD(false);
    }
  };

  // Download extracted data as CSV
  const handleDownloadCSV = (endpoint: EndpointData, arm: ExtractedArm) => {
    const points = arm.editedPoints || arm.points;
    const csvContent = [
      'time,survival',
      ...points.map(p => `${p.time},${p.survival}`)
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `km_data_${endpoint.endpointType}_${arm.detectedName || arm.mappedArmType}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Download all extracted data as CSV (combined)
  const handleDownloadAllCSV = () => {
    const allData: string[] = ['endpoint,arm,time,survival'];
    
    endpoints.forEach(endpoint => {
      endpoint.extractedArms.forEach(arm => {
        const points = arm.editedPoints || arm.points;
        const armName = arm.detectedName || arm.mappedArmType;
        points.forEach(p => {
          allData.push(`${endpoint.endpointType},${armName},${p.time},${p.survival}`);
        });
      });
    });
    
    const csvContent = allData.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `km_data_all_endpoints.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Check if tab should be disabled
  const isTabDisabled = (tabId: string) => {
    switch (tabId) {
      case 'extract':
        return !canProceedToExtraction;
      case 'edit':
        return !allEndpointsExtracted;
      case 'export':
        return !allEndpointsExtracted;
      default:
        return false;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" onClick={() => navigate(projectId ? `/projects/${projectId}` : '/projects')} className="mb-2">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">KM Curve Digitizer</h1>
          <p className="text-muted-foreground mt-1">
            Extract survival data from published Kaplan-Meier plots and generate Pseudo-IPD
          </p>
        </div>
      </div>

      {/* Global Settings Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-muted-foreground" />
            <CardTitle className="text-base">Extraction Settings</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-6">
            {/* Granularity Selector */}
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Data Granularity:</Label>
              <select
                value={granularity}
                onChange={(e) => setGranularity(parseFloat(e.target.value))}
                className="h-9 px-3 text-sm border rounded-md bg-background"
              >
                {GRANULARITY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {allEndpointsExtracted && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleApplyGranularity}
                  className="gap-1"
                >
                  <RefreshCw className="h-4 w-4" />
                  Apply to All
                </Button>
                      )}
                    </div>

            {/* Auto-Sort Toggle */}
            <div className="flex items-center gap-3">
              <Label className="text-sm font-medium">Auto-Sort:</Label>
              <Button
                variant={autoSort ? "default" : "outline"}
                size="sm"
                onClick={() => setAutoSort(!autoSort)}
                className="gap-1"
              >
                <ArrowUpDown className="h-4 w-4" />
                {autoSort ? 'On' : 'Off'}
              </Button>
              {!autoSort && allEndpointsExtracted && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSortAllEndpoints}
                  className="gap-1"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Sort All Now
                </Button>
                  )}
                </div>

            {/* Info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Info className="h-4 w-4" />
              <span>Settings apply to all endpoints</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Main Workflow Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          {WORKFLOW_TABS.map((tab) => {
            const Icon = tab.icon;
            const disabled = isTabDisabled(tab.id);
            const isComplete = 
              (tab.id === 'upload' && canProceedToExtraction) ||
              (tab.id === 'extract' && allEndpointsExtracted) ||
              (tab.id === 'edit' && endpoints.some(e => e.editedData));
            
            return (
              <TabsTrigger 
                key={tab.id} 
                value={tab.id} 
                disabled={disabled}
                className={cn(
                  "gap-2",
                  isComplete && "text-green-600"
                )}
              >
                {isComplete ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload" className="mt-6">
        <Card>
          <CardHeader>
              <CardTitle>Upload KM Plot Images</CardTitle>
            <CardDescription>
                Upload one plot per endpoint type. Each plot can contain multiple treatment arms 
                (e.g., Treatment vs Control). The system will automatically detect and extract all curves.
            </CardDescription>
          </CardHeader>
          <CardContent>
              <Tabs value={uploadMethod} onValueChange={(v) => setUploadMethod(v as 'direct' | 'pdf')}>
              <TabsList className="mb-4">
                  <TabsTrigger value="direct" className="gap-2">
                  <Upload className="h-4 w-4" />
                  Direct Upload
                </TabsTrigger>
                <TabsTrigger value="pdf" className="gap-2">
                  <FileText className="h-4 w-4" />
                  From PDF
                </TabsTrigger>
              </TabsList>

                <TabsContent value="direct" className="space-y-6">
                  {/* Info Banner */}
                  <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg">
                    <div className="flex items-start gap-3">
                      <Info className="h-5 w-5 text-primary mt-0.5" />
                      <div className="text-sm">
                        <p className="font-medium text-primary">Two Images Required Per Endpoint</p>
                        <p className="text-muted-foreground mt-1">
                          <strong>1. KM Plot:</strong> The survival curve image (without the risk table area). 
                          Multi-arm detection will extract all curves from this plot.
                        </p>
                        <p className="text-muted-foreground mt-1">
                          <strong>2. Risk Table:</strong> The "Number at Risk" table image. 
                          This is <span className="text-destructive font-medium">required</span> for accurate IPD reconstruction using the Guyot method.
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Endpoint Cards */}
                {endpoints.map((endpoint, index) => {
                    const isComplete = endpoint.kmPlot !== null && endpoint.riskTable !== null;
                    const hasPartial = endpoint.kmPlot !== null || endpoint.riskTable !== null;
                    
                    return (
                    <Card key={index} className={cn(
                      "border-2 transition-colors",
                      isComplete && "border-green-500/30 bg-green-500/5",
                      hasPartial && !isComplete && "border-amber-500/30 bg-amber-500/5"
                    )}>
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {isComplete ? (
                              <CheckCircle2 className="h-5 w-5 text-green-600" />
                            ) : hasPartial ? (
                              <Upload className="h-5 w-5 text-amber-500" />
                            ) : (
                              <Upload className="h-5 w-5 text-muted-foreground" />
                            )}
                            <CardTitle className="text-base">
                              {endpoint.endpointType} Endpoint
                              {hasPartial && !isComplete && (
                                <span className="text-xs text-amber-600 ml-2">(incomplete)</span>
                              )}
                            </CardTitle>
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-sm">Type:</Label>
                            <select
                              value={endpoint.endpointType}
                              onChange={(e) => handleUpdateEndpoint(index, 'endpointType', e.target.value)}
                              className="h-8 px-2 text-sm border rounded bg-background"
                            >
                              {ENDPOINT_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                            {endpoints.length > 1 && (
                              <Button 
                                variant="ghost" 
                                size="icon"
                                onClick={() => handleRemoveEndpoint(index)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-2 gap-4">
                          {/* KM Plot Upload */}
                          <div>
                            <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                              <Wand2 className="h-4 w-4" />
                              Kaplan-Meier Plot
                              <span className="text-destructive">*</span>
                            </Label>
                            {endpoint.kmPlot ? (
                              <div className="relative border rounded-lg overflow-hidden">
                                <img 
                                  src={endpoint.kmPlot.preview} 
                                  alt="KM Plot" 
                                  className="w-full h-40 object-contain bg-muted/30"
                                />
                                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                                  <span className="text-xs bg-black/70 text-white px-2 py-1 rounded">
                                    {endpoint.kmPlot.file.name}
                                  </span>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleRemoveImage(index, 'km_plot')}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                                <span className="text-sm text-muted-foreground">Drop image or click</span>
                                <span className="text-xs text-muted-foreground">PNG, JPG, JPEG</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImageUpload(index, 'km_plot', file);
                                  }}
                                />
                              </label>
                            )}
                          </div>

                          {/* Risk Table Upload (Required for IPD) */}
                          <div>
                            <Label className="text-sm font-medium mb-2 flex items-center gap-2">
                              <FileText className="h-4 w-4" />
                              Risk Table (Number at Risk)
                              <span className="text-destructive">*</span>
                            </Label>
                            {endpoint.riskTable ? (
                              <div className="relative border rounded-lg overflow-hidden">
                                <img 
                                  src={endpoint.riskTable.preview} 
                                  alt="Risk Table" 
                                  className="w-full h-40 object-contain bg-muted/30"
                                />
                                <div className="absolute bottom-2 left-2 right-2 flex justify-between items-center">
                                  <span className="text-xs bg-black/70 text-white px-2 py-1 rounded">
                                    {endpoint.riskTable.file.name}
                                  </span>
                                  <Button
                                    variant="destructive"
                                    size="icon"
                                    className="h-7 w-7"
                                    onClick={() => handleRemoveImage(index, 'risk_table')}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ) : (
                              <label className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors">
                                <FileText className="h-8 w-8 text-muted-foreground mb-2" />
                                <span className="text-sm text-muted-foreground">Drop image or click</span>
                                <span className="text-xs text-muted-foreground">Number at risk table</span>
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleImageUpload(index, 'risk_table', file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </div>

                        {/* Show extracted arms preview if available */}
                        {endpoint.extractedArms.length > 0 && (
                          <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                            <div className="flex items-center gap-2 text-sm text-green-700">
                              <CheckCircle2 className="h-4 w-4" />
                              <span className="font-medium">
                                {endpoint.extractedArms.length} arm(s) detected: 
                              </span>
                              <span>
                                {endpoint.extractedArms.map(a => a.detectedName).join(', ')}
                              </span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  );
                  })}

                  <Button variant="outline" onClick={handleAddEndpoint} className="w-full gap-2">
                    <Upload className="h-4 w-4" />
                    Add Another Endpoint (e.g., PFS)
                </Button>

                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleStartExtraction} 
                    disabled={!canProceedToExtraction}
                    className="gap-2"
                      size="lg"
                  >
                      <Play className="h-4 w-4" />
                      Extract All Curves (Granularity: {granularity}mo)
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="pdf">
                <PDFViewer 
                    onScreenshotCapture={(_screenshot, type) => {
                    console.log('Screenshot captured:', type);
                  }}
                />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
        </TabsContent>

        {/* Extract Tab */}
        <TabsContent value="extract" className="mt-6">
        <ExtractionProgress
          endpoints={endpoints}
          progress={extractionProgress}
          isExtracting={isExtracting}
        />

          {/* Show detected arms and mapping UI after extraction */}
          {!isExtracting && allEndpointsExtracted && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Extraction Complete - Map Detected Arms
                </CardTitle>
                <CardDescription>
                  Review the detected treatment arms from each plot and map them to standard types for analysis.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {endpoints.map((endpoint, endpointIndex) => (
                  <div key={endpointIndex} className="border rounded-lg overflow-hidden">
                    {/* Endpoint Header */}
                    <div className="bg-muted/50 px-4 py-3 border-b">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-semibold text-primary">{endpoint.endpointType}</span>
                          <span className="text-sm text-muted-foreground">
                            {endpoint.extractedArms.length} arm(s) detected
                          </span>
                        </div>
                        {endpoint.metadata?.studyInfo && (
                          <span className="text-xs text-muted-foreground">
                            {endpoint.metadata.studyInfo}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arms List */}
                    <div className="divide-y">
                      {endpoint.extractedArms.map((arm) => (
                        <div 
                          key={arm.id} 
                          className="px-4 py-3 flex items-center justify-between hover:bg-muted/30"
                        >
                          <div className="flex items-center gap-4">
                            {/* Color indicator */}
                            <div 
                              className="w-4 h-4 rounded-full border-2"
                              style={{ 
                                backgroundColor: arm.color === 'blue' ? '#3b82f6' : 
                                  arm.color === 'gray' ? '#6b7280' :
                                  arm.color === 'red' ? '#ef4444' :
                                  arm.color === 'green' ? '#22c55e' :
                                  arm.color === 'orange' ? '#f97316' :
                                  arm.color === 'purple' ? '#a855f7' : '#3b82f6'
                              }}
                            />
                            
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{arm.detectedName}</span>
                                <span className="text-xs text-muted-foreground">
                                  ({arm.points.length} points)
                                </span>
                              </div>
                              <span className="text-xs text-muted-foreground">
                                Color: {arm.color}
                              </span>
                            </div>
                          </div>

                          {/* Mapping Dropdown */}
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">Map to:</span>
                            <select
                              value={arm.mappedArmType}
                              onChange={(e) => handleUpdateArmMapping(endpointIndex, arm.id, e.target.value)}
                              className="h-9 px-3 text-sm border rounded-md bg-background font-medium"
                            >
                              {ARM_TYPES.map(type => (
                                <option key={type} value={type}>{type}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      ))}

                      {endpoint.extractedArms.length === 0 && (
                        <div className="px-4 py-6 text-center text-muted-foreground">
                          <p>No arms detected. The extraction may have failed.</p>
                        </div>
                      )}
                    </div>

                    {/* Quick Preview */}
                    {endpoint.kmPlot && (
                      <div className="px-4 py-3 bg-muted/30 border-t">
                        <img 
                          src={endpoint.kmPlot.preview} 
                          alt="KM Plot Preview"
                          className="max-h-32 object-contain mx-auto rounded"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!isExtracting && allEndpointsExtracted && (
            <div className="flex justify-end mt-4 gap-3">
              <Button variant="outline" onClick={() => setActiveTab('upload')}>
                Back to Upload
              </Button>
              <Button onClick={() => setActiveTab('edit')} className="gap-2">
                Continue to Edit Data
                <ChevronLeft className="h-4 w-4 rotate-180" />
              </Button>
            </div>
          )}
        </TabsContent>

        {/* Edit Tab */}
        <TabsContent value="edit" className="mt-6">
          {editingEndpointIndex !== null && editingArmId !== null ? (
            // Show DataEditor for the selected arm
            (() => {
              const endpoint = endpoints[editingEndpointIndex];
              const arm = endpoint.extractedArms.find(a => a.id === editingArmId);
              if (!arm) return null;
              
              return (
                <DataEditor
                  endpointType={endpoint.endpointType}
                  arm={arm.mappedArmType}
                  imageUrl={endpoint.kmPlot?.preview || ''}
                  extractedPoints={arm.editedPoints || arm.points}
                  fullResolutionPoints={arm.fullResolutionPoints}
                  riskTable={arm.editedRiskTable || arm.riskTable}
                  axisRanges={endpoint.axisRanges}
                  onSave={(data) => handleSaveArmEdit(editingEndpointIndex, editingArmId, data)}
                  onCancel={handleCancelEdit}
                  autoSort={autoSort}
                />
              );
            })()
          ) : (
            // Show endpoint list for editing
            <div className="space-y-4">
              {/* Bulk Actions */}
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium">Bulk Actions:</span>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleApplyGranularity}
                        className="gap-1"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Re-apply Granularity ({granularity}mo)
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={handleSortAllEndpoints}
                        className="gap-1"
                      >
                        <ArrowUpDown className="h-4 w-4" />
                        Sort All by Time
                      </Button>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      Auto-sort: {autoSort ? 'On' : 'Off'}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Review & Edit Extracted Data</CardTitle>
                  <CardDescription>
                    Click on an arm to review and edit the extracted data points.
                    Each arm's data will be used to generate individual patient data.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {endpoints.map((endpoint, endpointIndex) => (
                      <div key={endpointIndex} className="space-y-3">
                        {/* Endpoint Header */}
                        <h3 className="font-semibold text-primary flex items-center gap-2">
                          {endpoint.endpointType} Endpoint
                          <span className="text-xs font-normal text-muted-foreground">
                            ({endpoint.extractedArms.length} arm{endpoint.extractedArms.length !== 1 ? 's' : ''})
                          </span>
                        </h3>
                        
                        {/* Arms Grid */}
                        <div className="grid gap-3">
                          {endpoint.extractedArms.map((arm) => {
                            const hasEdits = !!arm.editedPoints;
                            const points = arm.editedPoints || arm.points;
                            const riskTable = arm.editedRiskTable || arm.riskTable;
                            
                            return (
                              <Card 
                                key={arm.id} 
                                className={cn(
                                  "cursor-pointer hover:border-primary/50 transition-colors",
                                  hasEdits && "border-green-500/30 bg-green-500/5"
                                )}
                                onClick={() => {
                                  // Edit the specific arm's data
                                  handleEditArm(endpointIndex, arm.id);
                                }}
                              >
                                <CardContent className="pt-4">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                      {/* Color indicator */}
                                      <div 
                                        className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                                        style={{ 
                                          backgroundColor: arm.color === 'blue' ? '#3b82f6' : 
                                            arm.color === 'gray' ? '#6b7280' :
                                            arm.color === 'red' ? '#ef4444' :
                                            arm.color === 'green' ? '#22c55e' :
                                            arm.color === 'orange' ? '#f97316' :
                                            arm.color === 'purple' ? '#a855f7' : '#3b82f6'
                                        }}
                                      />
                                      
                                      {hasEdits ? (
                                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                                      ) : (
                                        <Edit className="h-5 w-5 text-muted-foreground" />
                                      )}
                                      
                                      <div>
                                        <h4 className="font-medium flex items-center gap-2">
                                          <span className="px-2 py-0.5 bg-muted rounded text-sm">
                                            {arm.mappedArmType}
                                          </span>
                                          <span className="text-muted-foreground">←</span>
                                          <span className="text-sm text-muted-foreground">
                                            {arm.detectedName}
                                          </span>
                                        </h4>
                                        <p className="text-sm text-muted-foreground mt-1">
                                          {points.length} data points, {riskTable.length} risk table entries
                                          {hasEdits && <span className="text-green-600 ml-2">(edited)</span>}
                                        </p>
                                      </div>
                                    </div>
                                    <Button variant="outline" size="sm">
                                      <Edit className="h-4 w-4 mr-2" />
                                      Edit
                                    </Button>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                          
                          {endpoint.extractedArms.length === 0 && (
                            <div className="text-center py-8 text-muted-foreground">
                              No arms extracted for this endpoint.
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setActiveTab('extract')}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Back to Extraction
                </Button>
                <Button onClick={() => setActiveTab('export')} className="gap-2">
                  Continue to Export
                  <ChevronLeft className="h-4 w-4 rotate-180" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Export Tab */}
        <TabsContent value="export" className="mt-6">
          <div className="space-y-6">
            {/* Summary Card */}
            <Card>
              <CardHeader>
                <CardTitle>Generate Pseudo-IPD</CardTitle>
                <CardDescription>
                  Review the extracted data and generate individual patient data using the Guyot method.
                  These files will be used by the Survival Analysis module.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Arms Summary - grouped by endpoint */}
                <div className="space-y-6 mb-6">
                  {endpoints.map((endpoint, endpointIndex) => (
                    <div key={endpointIndex} className="space-y-3">
                      <h3 className="font-semibold text-primary">{endpoint.endpointType} Endpoint</h3>
                      <div className="grid gap-3">
                        {endpoint.extractedArms.map((arm) => {
                          const hasEdits = !!arm.editedPoints;
                          const points = arm.editedPoints || arm.points;
                          const riskTable = arm.editedRiskTable || arm.riskTable;
                          
                          return (
                            <div 
                              key={arm.id} 
                              className="flex items-center justify-between p-4 border rounded-lg"
                            >
                              <div className="flex items-center gap-4">
                                {/* Color indicator */}
                                <div 
                                  className="w-4 h-4 rounded-full border-2 flex-shrink-0"
                                  style={{ 
                                    backgroundColor: arm.color === 'blue' ? '#3b82f6' : 
                                      arm.color === 'gray' ? '#6b7280' :
                                      arm.color === 'red' ? '#ef4444' :
                                      arm.color === 'green' ? '#22c55e' :
                                      arm.color === 'orange' ? '#f97316' :
                                      arm.color === 'purple' ? '#a855f7' : '#3b82f6'
                                  }}
                                />
                                <CheckCircle2 className="h-5 w-5 text-green-600" />
                                <div>
                                  <h4 className="font-medium flex items-center gap-2">
                                    {arm.mappedArmType}
                                    <span className="text-xs text-muted-foreground">
                                      ({arm.detectedName})
                                    </span>
                                  </h4>
                                  <p className="text-sm text-muted-foreground">
                                    {points.length} survival points, {riskTable.length} risk table rows
                                    {hasEdits && <span className="text-green-600"> (edited)</span>}
                                  </p>
                                </div>
                              </div>
                              <span className="text-sm text-green-600 font-medium">Ready</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">{endpoints.length}</p>
                    <p className="text-xs text-muted-foreground">Endpoints</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">
                      {endpoints.reduce((acc, e) => acc + e.extractedArms.length, 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Arms</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">
                      {endpoints.reduce((acc, e) => 
                        acc + e.extractedArms.reduce((armAcc, arm) => 
                          armAcc + (arm.editedPoints || arm.points).length, 0), 0)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Points</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold">{granularity}mo</p>
                    <p className="text-xs text-muted-foreground">Granularity</p>
                  </div>
                  <div className="p-4 bg-muted rounded-lg text-center">
                    <p className="text-2xl font-bold text-green-600">Ready</p>
                    <p className="text-xs text-muted-foreground">Status</p>
                  </div>
                </div>

                {/* Output Info */}
                <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg mb-6">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                    Output Files (for Survival Analysis)
                  </h4>
                  <p className="text-sm text-blue-700 dark:text-blue-300 mb-2">
                    The following parquet files will be generated and available in the Survival Analysis module:
                  </p>
                  <ul className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                    {endpoints.flatMap((endpoint) => 
                      endpoint.extractedArms.map((arm) => (
                        <li key={arm.id} className="font-mono">
                          • ipd_EndpointType.{endpoint.endpointType}_{arm.detectedName || arm.mappedArmType}.parquet
                        </li>
                      ))
                    )}
                  </ul>
                </div>

                {/* CSV Download Section */}
                <div className="p-4 border rounded-lg mb-6">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Download className="h-4 w-4" />
                    Download Extracted Data (CSV)
                  </h4>
                  <p className="text-sm text-muted-foreground mb-4">
                    Download the extracted survival curve data as CSV files for use in other applications.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleDownloadAllCSV}
                      className="gap-2"
                    >
                      <Download className="h-4 w-4" />
                      Download All (Combined CSV)
                    </Button>
                    {endpoints.flatMap((endpoint) => 
                      endpoint.extractedArms.map((arm) => (
                        <Button 
                          key={arm.id}
                          variant="outline" 
                          size="sm" 
                          onClick={() => handleDownloadCSV(endpoint, arm)}
                          className="gap-2"
                        >
                          <Download className="h-4 w-4" />
                          {endpoint.endpointType} - {arm.detectedName || arm.mappedArmType}
                        </Button>
                      ))
                    )}
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setActiveTab('edit')}>
                    <ChevronLeft className="h-4 w-4 mr-2" />
                    Back to Edit
                  </Button>
                  <Button 
                    onClick={handleGenerateIPD} 
                    disabled={isGeneratingIPD}
                    className="gap-2"
                    size="lg"
                  >
                    {isGeneratingIPD ? (
                      <>
                        <span className="animate-spin">⏳</span>
                        Generating IPD...
                      </>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Generate Pseudo-IPD
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
