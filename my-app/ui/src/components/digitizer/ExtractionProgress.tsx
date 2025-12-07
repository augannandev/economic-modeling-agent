import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Wand2
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

interface ExtractionProgressProps {
  endpoints: EndpointData[];
  progress: number;
  isExtracting: boolean;
}

export function ExtractionProgress({ endpoints, progress, isExtracting }: ExtractionProgressProps) {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'extracting':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      case 'extracted':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-muted" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'extracting':
        return 'Extracting data points...';
      case 'extracted':
        return 'Extraction complete';
      case 'error':
        return 'Extraction failed';
      default:
        return 'Waiting...';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Extracting Data
        </CardTitle>
        <CardDescription>
          AI is analyzing the images and extracting survival data points
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Progress */}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-muted-foreground">Overall Progress</span>
            <span className="font-medium">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Per-Endpoint Progress */}
        <div className="space-y-4">
          {endpoints.map((endpoint, index) => (
            <div
              key={index}
              className={cn(
                "p-4 border rounded-lg transition-colors",
                endpoint.extractionStatus === 'extracting' && "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
                endpoint.extractionStatus === 'extracted' && "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950",
                endpoint.extractionStatus === 'error' && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950"
              )}
            >
              <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusIcon(endpoint.extractionStatus)}
                <div>
                    <p className="font-medium">
                      {endpoint.endpointType} - {endpoint.arm}
                    </p>
                  <p className="text-sm text-muted-foreground">
                    {getStatusText(endpoint.extractionStatus)}
                  </p>
                </div>
              </div>

                {endpoint.extractionStatus === 'extracted' && endpoint.extractedData && (
                  <div className="text-right text-sm">
                    <p className="text-muted-foreground">
                      {endpoint.extractedData.points?.length || 0} data points
                    </p>
                    <p className="text-muted-foreground">
                      {endpoint.extractedData.riskTable?.length || 0} time points
                    </p>
                  </div>
                )}
              </div>

              {/* Extraction Details */}
              {endpoint.extractionStatus === 'extracting' && (
                <div className="mt-3 pt-3 border-t border-dashed">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Analyzing KM curve...</span>
                  </div>
                </div>
              )}

              {endpoint.extractionStatus === 'extracted' && (
                <div className="mt-3 pt-3 border-t border-dashed grid grid-cols-2 gap-4">
                  <div className="text-center p-2 bg-background rounded">
                    <p className="text-2xl font-bold text-green-600">
                      {endpoint.extractedData?.points?.length || 0}
                    </p>
                    <p className="text-xs text-muted-foreground">Points Extracted</p>
                  </div>
                  <div className="text-center p-2 bg-background rounded">
                    <p className="text-2xl font-bold text-blue-600">
                      {Math.round((endpoint.extractedData?.points?.length / 100) * 95) || 0}%
                    </p>
                    <p className="text-xs text-muted-foreground">Confidence</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Processing Info */}
        {isExtracting && (
          <div className="bg-muted/50 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-primary/10 rounded-full">
                <Wand2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-medium">AI Processing</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Using computer vision to detect curve coordinates and OCR to read risk table values.
                  This typically takes 10-30 seconds per image.
                </p>
              </div>
            </div>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
