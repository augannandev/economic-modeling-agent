import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  Users, 
  Calendar,
  Database,
  PlayCircle,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ArmStatistics {
  n: number;
  events: number;
  median: number;
  ci_lower: number;
  ci_upper: number;
  follow_up_range: string;
}

interface IPDPreviewData {
  source: 'digitizer' | 'demo' | 'project';
  endpoint: string;
  plot_base64: string;
  statistics: {
    pembro: ArmStatistics;
    chemo: ArmStatistics;
  };
  available: boolean;
}

interface IPDPreviewProps {
  onStartAnalysis: (endpoint: 'OS' | 'PFS') => void;
  isStarting?: boolean;
  projectId?: string | null;
}

export function IPDPreview({ onStartAnalysis, isStarting = false, projectId }: IPDPreviewProps) {
  const [activeEndpoint, setActiveEndpoint] = useState<'OS' | 'PFS'>('OS');
  const [previewData, setPreviewData] = useState<Record<string, IPDPreviewData>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({ OS: true, PFS: true });
  const [projectName, setProjectName] = useState<string | null>(null);

  useEffect(() => {
    loadPreview('OS');
    loadPreview('PFS');
  }, [projectId]);

  const loadPreview = async (endpoint: 'OS' | 'PFS') => {
    setLoading(prev => ({ ...prev, [endpoint]: true }));
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 
        (window.location.hostname === 'localhost' ? 'http://localhost:3001' : '');
      
      const url = `${apiUrl}/api/v1/survival/ipd-preview?endpoint=${endpoint}${projectId ? `&projectId=${projectId}` : ''}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Failed to load preview');
      }
      
      const data = await response.json();
      setPreviewData(prev => ({ ...prev, [endpoint]: data }));
      
      // Update project name if provided in response
      if (data.projectName) {
        setProjectName(data.projectName);
      } else if (!projectId) {
        setProjectName(null);
      }
    } catch (err) {
      console.error(`Failed to load ${endpoint} preview:`, err);
      // Set empty/unavailable state
      setPreviewData(prev => ({
        ...prev,
        [endpoint]: {
          source: projectId ? 'project' : 'demo',
          endpoint,
          plot_base64: '',
          statistics: {
            pembro: { n: 0, events: 0, median: 0, ci_lower: 0, ci_upper: 0, follow_up_range: 'N/A' },
            chemo: { n: 0, events: 0, median: 0, ci_lower: 0, ci_upper: 0, follow_up_range: 'N/A' }
          },
          available: false
        }
      }));
      if (!projectId) {
        setProjectName(null);
      }
    } finally {
      setLoading(prev => ({ ...prev, [endpoint]: false }));
    }
  };

  const currentData = previewData[activeEndpoint];

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              IPD Data Preview
              {projectName && (
                <span className="text-sm font-normal text-muted-foreground">
                  • {projectName}
                </span>
              )}
            </CardTitle>
            <CardDescription className="mt-1">
              Preview reconstructed Individual Patient Data before running analysis
              {projectId && projectName && ` (from project: ${projectName})`}
            </CardDescription>
          </div>
          <Button 
            onClick={() => onStartAnalysis(activeEndpoint)}
            disabled={isStarting || !currentData?.available}
            size="lg"
          >
            {isStarting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              <>
                <PlayCircle className="h-4 w-4 mr-2" />
                Start {activeEndpoint} Analysis
              </>
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        <Tabs value={activeEndpoint} onValueChange={(v) => setActiveEndpoint(v as 'OS' | 'PFS')}>
          <TabsList className="mb-4">
            <TabsTrigger value="OS" className="gap-2">
              Overall Survival (OS)
              {previewData['OS']?.available && (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              )}
            </TabsTrigger>
            <TabsTrigger value="PFS" className="gap-2">
              Progression-Free Survival (PFS)
              {previewData['PFS']?.available && (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              )}
            </TabsTrigger>
          </TabsList>

          {['OS', 'PFS'].map((endpoint) => (
            <TabsContent key={endpoint} value={endpoint}>
              {loading[endpoint] ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-muted-foreground">Loading preview...</span>
                </div>
              ) : previewData[endpoint]?.available ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* KM Plot */}
                  <Card className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">Kaplan-Meier Curves</CardTitle>
                      <CardDescription>Both treatment arms overlaid</CardDescription>
                    </CardHeader>
                    <CardContent className="p-2">
                      {previewData[endpoint]?.plot_base64 ? (
                        <img 
                          src={`data:image/png;base64,${previewData[endpoint].plot_base64}`}
                          alt={`${endpoint} KM Curves`}
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
                            value={previewData[endpoint]?.statistics.pembro.n || 0} 
                          />
                          <StatItem 
                            icon={AlertCircle} 
                            label="Events" 
                            value={previewData[endpoint]?.statistics.pembro.events || 0} 
                          />
                          <StatItem 
                            icon={Calendar} 
                            label="Median Survival" 
                            value={`${previewData[endpoint]?.statistics.pembro.median?.toFixed(1) || 'N/A'} mo`}
                            subtitle={previewData[endpoint]?.statistics.pembro.ci_lower ? 
                              `(95% CI: ${previewData[endpoint]?.statistics.pembro.ci_lower?.toFixed(1)}-${previewData[endpoint]?.statistics.pembro.ci_upper?.toFixed(1)})` : 
                              undefined
                            }
                          />
                          <StatItem 
                            icon={BarChart3} 
                            label="Follow-up" 
                            value={previewData[endpoint]?.statistics.pembro.follow_up_range || 'N/A'} 
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
                            value={previewData[endpoint]?.statistics.chemo.n || 0} 
                          />
                          <StatItem 
                            icon={AlertCircle} 
                            label="Events" 
                            value={previewData[endpoint]?.statistics.chemo.events || 0} 
                          />
                          <StatItem 
                            icon={Calendar} 
                            label="Median Survival" 
                            value={`${previewData[endpoint]?.statistics.chemo.median?.toFixed(1) || 'N/A'} mo`}
                            subtitle={previewData[endpoint]?.statistics.chemo.ci_lower ? 
                              `(95% CI: ${previewData[endpoint]?.statistics.chemo.ci_lower?.toFixed(1)}-${previewData[endpoint]?.statistics.chemo.ci_upper?.toFixed(1)})` : 
                              undefined
                            }
                          />
                          <StatItem 
                            icon={BarChart3} 
                            label="Follow-up" 
                            value={previewData[endpoint]?.statistics.chemo.follow_up_range || 'N/A'} 
                          />
                        </div>
                      </CardContent>
                    </Card>

                    {/* Data Source */}
                    <div className={cn(
                      "p-3 rounded-lg text-sm",
                      projectId || previewData[endpoint]?.source === 'project'
                        ? "bg-green-500/10 text-green-700 dark:text-green-300" 
                        : previewData[endpoint]?.source === 'digitizer'
                        ? "bg-green-500/10 text-green-700 dark:text-green-300"
                        : "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                    )}>
                      <span className="font-medium">Data source: </span>
                      {projectId || previewData[endpoint]?.source === 'project'
                        ? projectName 
                          ? `Project: ${projectName} (User-generated IPD)`
                          : 'Project Data (User-generated IPD)'
                        : previewData[endpoint]?.source === 'digitizer'
                        ? 'KM Digitizer (User-generated IPD)'
                        : 'Demo Data (Pre-loaded IPD)'
                      }
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No {endpoint} Data Available</h3>
                  <p className="text-muted-foreground max-w-md">
                    Use the KM Digitizer to extract survival curves from published plots, 
                    or ensure demo data is available.
                  </p>
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}

interface StatItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subtitle?: string;
}

function StatItem({ icon: Icon, label, value, subtitle }: StatItemProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 rounded-lg bg-muted">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-semibold">{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

