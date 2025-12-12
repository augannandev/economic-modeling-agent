import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  BarChart3, 
  Users, 
  Calendar,
  Database,
  Download,
  Loader2,
  AlertCircle,
  Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArmStatistics {
  n: number;
  events: number;
  median: number | null;
  ci_lower: number | null;
  ci_upper: number | null;
  follow_up_range: string;
}

interface IPDRecord {
  patient_id: number;
  time: number;
  event: number;
  arm: string;
}

interface IPDDataResponse {
  endpoint: string;
  source: string;
  records: IPDRecord[];
  statistics: {
    pembro: ArmStatistics;
    chemo: ArmStatistics;
  };
  km_plot_base64: string | null;
  available: boolean;
  projectId?: string;
  projectName?: string;
  error?: string;
}

interface IPDDataTabProps {
  analysisId: string;
}

// Stat item component
function StatItem({ 
  icon: Icon, 
  label, 
  value, 
  subtitle 
}: { 
  icon: React.ElementType; 
  label: string; 
  value: string | number; 
  subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

export function IPDDataTab({ analysisId }: IPDDataTabProps) {
  const [data, setData] = useState<IPDDataResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterArm, setFilterArm] = useState<string>('all');

  useEffect(() => {
    loadIPDData();
  }, [analysisId]);

  const loadIPDData = async () => {
    setLoading(true);
    setError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
      
      const response = await fetch(`${apiUrl}/api/v1/survival/analyses/${analysisId}/ipd-data`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to load IPD data');
      }
      
      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Failed to load IPD data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load IPD data');
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (!data || !data.records.length) return;
    
    const filteredRecords = filterArm === 'all' 
      ? data.records 
      : data.records.filter(r => r.arm.toLowerCase().includes(filterArm.toLowerCase()));
    
    const csvContent = [
      ['patient_id', 'time', 'event', 'arm'].join(','),
      ...filteredRecords.map(r => [r.patient_id, r.time, r.event, r.arm].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ipd_data_${data.endpoint}_${analysisId.substring(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading IPD data...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Failed to load IPD data</span>
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={loadIPDData}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data?.available) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No IPD data available for this analysis.
      </div>
    );
  }

  const filteredRecords = filterArm === 'all' 
    ? data.records 
    : data.records.filter(r => r.arm.toLowerCase().includes(filterArm.toLowerCase()));

  return (
    <div className="space-y-6">
      {/* Header with source info */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Database className="h-5 w-5 text-primary" />
          <div>
            <h3 className="font-semibold">
              {data.endpoint} Individual Patient Data
            </h3>
            <p className="text-sm text-muted-foreground">
              Source: {data.source === 'project' ? data.projectName || 'Project' : 'Demo Data'}
              {' '}&bull;{' '}
              {data.records.length} patients
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KM Plot */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Kaplan-Meier Curves</CardTitle>
            <CardDescription>Reconstructed IPD survival curves</CardDescription>
          </CardHeader>
          <CardContent className="p-2">
            {data.km_plot_base64 ? (
              <img 
                src={`data:image/png;base64,${data.km_plot_base64}`}
                alt={`${data.endpoint} KM Curves`}
                className="w-full h-auto rounded-lg"
              />
            ) : (
              <div className="h-64 flex items-center justify-center bg-muted rounded-lg">
                <BarChart3 className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="space-y-4">
          {/* Pembrolizumab Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500" />
                Pembrolizumab
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <StatItem 
                  icon={Users} 
                  label="Patients" 
                  value={data.statistics.pembro.n || 0} 
                />
                <StatItem 
                  icon={AlertCircle} 
                  label="Events" 
                  value={data.statistics.pembro.events || 0} 
                />
                <StatItem 
                  icon={Calendar} 
                  label="Median Survival" 
                  value={data.statistics.pembro.median != null ? `${data.statistics.pembro.median.toFixed(1)} mo` : 'Not reached'}
                  subtitle={data.statistics.pembro.ci_lower != null ? 
                    `(95% CI: ${data.statistics.pembro.ci_lower.toFixed(1)}-${data.statistics.pembro.ci_upper?.toFixed(1) || 'NR'})` : 
                    undefined
                  }
                />
                <StatItem 
                  icon={BarChart3} 
                  label="Follow-up" 
                  value={data.statistics.pembro.follow_up_range || 'N/A'} 
                />
              </div>
            </CardContent>
          </Card>

          {/* Chemotherapy Stats */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                Chemotherapy
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <StatItem 
                  icon={Users} 
                  label="Patients" 
                  value={data.statistics.chemo.n || 0} 
                />
                <StatItem 
                  icon={AlertCircle} 
                  label="Events" 
                  value={data.statistics.chemo.events || 0} 
                />
                <StatItem 
                  icon={Calendar} 
                  label="Median Survival" 
                  value={data.statistics.chemo.median != null ? `${data.statistics.chemo.median.toFixed(1)} mo` : 'Not reached'}
                  subtitle={data.statistics.chemo.ci_lower != null ? 
                    `(95% CI: ${data.statistics.chemo.ci_lower.toFixed(1)}-${data.statistics.chemo.ci_upper?.toFixed(1) || 'NR'})` : 
                    undefined
                  }
                />
                <StatItem 
                  icon={BarChart3} 
                  label="Follow-up" 
                  value={data.statistics.chemo.follow_up_range || 'N/A'} 
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">IPD Records</CardTitle>
              <CardDescription>
                Showing {filteredRecords.length} of {data.records.length} patients
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <select
                value={filterArm}
                onChange={(e) => setFilterArm(e.target.value)}
                className="text-sm border rounded px-2 py-1 bg-background"
              >
                <option value="all">All Arms</option>
                <option value="pembro">Pembrolizumab</option>
                <option value="chemo">Chemotherapy</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-2 font-medium">Patient ID</th>
                  <th className="text-left p-2 font-medium">Time (months)</th>
                  <th className="text-left p-2 font-medium">Event</th>
                  <th className="text-left p-2 font-medium">Arm</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.slice(0, 200).map((record, idx) => (
                  <tr 
                    key={`${record.patient_id}-${record.arm}-${idx}`}
                    className={cn(
                      "border-b border-muted hover:bg-muted/50",
                      idx % 2 === 0 ? "bg-background" : "bg-muted/20"
                    )}
                  >
                    <td className="p-2">{record.patient_id}</td>
                    <td className="p-2">{record.time.toFixed(2)}</td>
                    <td className="p-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs",
                        record.event === 1 
                          ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                          : "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                      )}>
                        {record.event === 1 ? 'Event' : 'Censored'}
                      </span>
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <div className={cn(
                          "w-2 h-2 rounded-full",
                          record.arm.toLowerCase().includes('pembro') ? "bg-orange-500" : "bg-blue-500"
                        )} />
                        {record.arm}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredRecords.length > 200 && (
              <div className="p-2 text-center text-sm text-muted-foreground bg-muted">
                Showing first 200 of {filteredRecords.length} records. Export CSV for full data.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
