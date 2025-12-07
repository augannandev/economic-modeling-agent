import { useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { 
  Upload, 
  X, 
  Image as ImageIcon, 
  Table2,
  Trash2,
  CheckCircle2
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

interface EndpointImageUploaderProps {
  index: number;
  endpoint: EndpointData;
  onUpload: (index: number, type: 'km_plot' | 'risk_table', file: File) => void;
  onRemove: (index: number, type: 'km_plot' | 'risk_table') => void;
  onUpdate: (index: number, field: 'endpointType' | 'arm', value: string) => void;
  onDelete?: () => void;
  endpointOptions?: string[];
  armOptions?: string[];
}

const DEFAULT_ENDPOINT_OPTIONS = ['OS', 'PFS', 'DFS', 'EFS', 'TTP'];
const DEFAULT_ARM_OPTIONS = ['Treatment', 'Comparator', 'Control'];

export function EndpointImageUploader({
  index,
  endpoint,
  onUpload,
  onRemove,
  onUpdate,
  onDelete,
  endpointOptions = DEFAULT_ENDPOINT_OPTIONS,
  armOptions = DEFAULT_ARM_OPTIONS,
}: EndpointImageUploaderProps) {
  const handleDrop = useCallback(
    (type: 'km_plot' | 'risk_table') => (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        onUpload(index, type, file);
      }
    },
    [index, onUpload]
  );

  const handleFileChange = useCallback(
    (type: 'km_plot' | 'risk_table') => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        onUpload(index, type, file);
      }
    },
    [index, onUpload]
  );

  const isComplete = endpoint.kmPlot && endpoint.riskTable;

  return (
    <Card className={cn(
      "border-2 transition-colors",
      isComplete && "border-green-500/30 bg-green-500/5"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              {isComplete && <CheckCircle2 className="h-4 w-4 text-green-600" />}
              Endpoint {index + 1}
            </CardTitle>
            
            {/* Endpoint Type Select */}
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Type:</Label>
            <select
                className="h-8 px-2 text-sm border rounded bg-background"
              value={endpoint.endpointType}
              onChange={(e) => onUpdate(index, 'endpointType', e.target.value)}
            >
                {endpointOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
          </div>
            
            {/* Arm Select */}
            <div className="flex items-center gap-2">
              <Label className="text-sm text-muted-foreground">Arm:</Label>
              <select
                className="h-8 px-2 text-sm border rounded bg-background"
              value={endpoint.arm}
              onChange={(e) => onUpdate(index, 'arm', e.target.value)}
              >
                {armOptions.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          </div>
          
        {onDelete && (
          <Button variant="ghost" size="icon" onClick={onDelete} className="text-destructive">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* KM Plot Upload */}
        <div>
            <Label className="flex items-center gap-2 mb-2">
              <ImageIcon className="h-4 w-4" />
              Kaplan-Meier Plot
          </Label>
            
          {endpoint.kmPlot ? (
              <div className="relative group">
              <img
                src={endpoint.kmPlot.preview}
                alt="KM Plot"
                  className="w-full h-48 object-contain border rounded-lg bg-white"
              />
              <Button
                variant="destructive"
                size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemove(index, 'km_plot')}
              >
                <X className="h-4 w-4" />
              </Button>
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                  {endpoint.kmPlot.file.name}
                </div>
            </div>
          ) : (
            <div
                className="border-2 border-dashed rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop('km_plot')}
                onClick={() => document.getElementById(`km-plot-${index}`)?.click()}
            >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                  Drop image or click to upload
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, or JPEG
              </p>
              <input
                  id={`km-plot-${index}`}
                type="file"
                accept="image/*"
                className="hidden"
                  onChange={handleFileChange('km_plot')}
              />
            </div>
          )}
        </div>

        {/* Risk Table Upload */}
        <div>
            <Label className="flex items-center gap-2 mb-2">
            <Table2 className="h-4 w-4" />
              Risk Table (with numbers at risk)
          </Label>
            
          {endpoint.riskTable ? (
              <div className="relative group">
              <img
                src={endpoint.riskTable.preview}
                alt="Risk Table"
                  className="w-full h-48 object-contain border rounded-lg bg-white"
              />
              <Button
                variant="destructive"
                size="icon"
                  className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => onRemove(index, 'risk_table')}
              >
                <X className="h-4 w-4" />
              </Button>
                <div className="absolute bottom-2 left-2 px-2 py-1 bg-black/70 text-white text-xs rounded">
                  {endpoint.riskTable.file.name}
                </div>
            </div>
          ) : (
            <div
                className="border-2 border-dashed rounded-lg h-48 flex flex-col items-center justify-center cursor-pointer hover:border-primary/50 transition-colors"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop('risk_table')}
                onClick={() => document.getElementById(`risk-table-${index}`)?.click()}
            >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                  Drop image or click to upload
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, or JPEG
              </p>
              <input
                  id={`risk-table-${index}`}
                type="file"
                accept="image/*"
                className="hidden"
                  onChange={handleFileChange('risk_table')}
              />
            </div>
          )}
        </div>
      </div>
      </CardContent>
    </Card>
  );
}
