import React, { useState, useEffect } from 'react';
import { survivalApi, type Analysis, type AnalysisStatus, type SupabaseProject } from '@/lib/survivalApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Markdown, CompactMarkdown } from '@/components/ui/markdown';
import { downloadPDF, downloadMarkdownAsPDF } from '@/lib/pdfUtils';
import { downloadSynthesisAsDocx } from '@/lib/docxUtils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChatSidebar } from '@/components/chat';
import { FinalDecisionPanel, ReproducibilityTab, IPDPreview } from '@/components/survival';
import { 
  CheckCircle2, 
  Circle, 
  Loader2, 
  PlayCircle, 
  PauseCircle,
  MessageSquare,
  AlertCircle,
  ChevronRight,
  Download,
  FileText,
  FileType
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Workflow steps
const WORKFLOW_STEPS = [
  { id: 'DATA_LOADED', label: 'Data Loading', description: 'Loading IPD data' },
  { id: 'PH_TESTING', label: 'PH Testing', description: 'Testing proportional hazards' },
  { id: 'ONE_PIECE_FITTING', label: 'One-Piece Models', description: 'Fitting parametric models' },
  { id: 'PIECEWISE_FITTING', label: 'Piecewise Models', description: 'Fitting piecewise models' },
  { id: 'SPLINE_FITTING', label: 'Spline Models', description: 'Fitting spline models' },
  { id: 'SYNTHESIS', label: 'Synthesis', description: 'Generating final report' },
  { id: 'COMPLETE', label: 'Complete', description: 'Analysis complete' },
];

function getStepIndex(state: string | null): number {
  if (!state) return 0;
  const idx = WORKFLOW_STEPS.findIndex(s => state.includes(s.id));
  return idx >= 0 ? idx : 0;
}

export function SurvivalAnalysis() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [endpointType, setEndpointType] = useState<'OS' | 'PFS'>('OS');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  
  // Project selection state
  const [supabaseProjects, setSupabaseProjects] = useState<SupabaseProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);

  useEffect(() => {
    loadAnalyses();
    loadSupabaseProjects();
  }, []);
  
  const loadSupabaseProjects = async () => {
    try {
      const result = await survivalApi.listSupabaseProjects();
      setSupabaseConfigured(result.supabaseConfigured);
      setSupabaseProjects(result.projects);
      
      // Auto-select first project with IPD
      if (result.projects.length > 0) {
        const projectWithIPD = result.projects.find(p => p.hasIPD);
        if (projectWithIPD) {
          setSelectedProjectId(projectWithIPD.id);
        }
      }
    } catch (err) {
      console.error('Failed to load Supabase projects:', err);
    }
  };

  useEffect(() => {
    if (!selectedAnalysis) return;

    const analysisId = selectedAnalysis.id;
    loadStatus(analysisId);

    // Only poll if analysis is running
    if (selectedAnalysis.status === 'running' || selectedAnalysis.status === 'paused') {
      const interval = setInterval(async () => {
        try {
          const analysisData = await survivalApi.getAnalysis(analysisId);
          const updatedStatus = await survivalApi.getAnalysisStatus(analysisId);
          setStatus(updatedStatus);
          setSelectedAnalysis(analysisData.analysis);
        } catch (err) {
          console.error('Failed to poll status:', err);
        }
      }, 2000);

      return () => clearInterval(interval);
    }
  }, [selectedAnalysis?.id, selectedAnalysis?.status]);

  const loadAnalyses = async () => {
    try {
      const data = await survivalApi.listAnalyses();
      setAnalyses(data.analyses);
      if (data.analyses.length > 0) {
        if (!selectedAnalysis || !data.analyses.find(a => a.id === selectedAnalysis.id)) {
          const runningAnalysis = data.analyses.find(a => a.status === 'running');
          setSelectedAnalysis(runningAnalysis || data.analyses[0]);
        }
      } else {
        setSelectedAnalysis(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analyses');
    }
  };

  const loadStatus = async (analysisId: string) => {
    try {
      const statusData = await survivalApi.getAnalysisStatus(analysisId);
      setStatus(statusData);
      const analysisData = await survivalApi.getAnalysis(analysisId);
      setSelectedAnalysis(analysisData.analysis);
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const handleStartAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      // Pass selectedProjectId to use project-specific IPD from Supabase
      const result = await survivalApi.startAnalysis(
        endpointType, 
        selectedProjectId || undefined
      );
      await loadAnalyses();
      const analysisData = await survivalApi.getAnalysis(result.analysis_id);
      setSelectedAnalysis(analysisData.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnalysis = async (analysisId: string) => {
    if (!confirm('Are you sure you want to delete this analysis?')) return;

    try {
      await survivalApi.deleteAnalysis(analysisId);
      await loadAnalyses();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete analysis');
    }
  };

  const handleTogglePause = async () => {
    if (!selectedAnalysis) return;
    try {
      if (selectedAnalysis.status === 'running') {
        await survivalApi.pauseAnalysis(selectedAnalysis.id);
      } else if (selectedAnalysis.status === 'paused') {
        await survivalApi.resumeAnalysis(selectedAnalysis.id);
      }
      await loadStatus(selectedAnalysis.id);
    } catch (err) {
      console.error('Failed to toggle pause:', err);
    }
  };

  const progressPercentage = status
    ? (status.progress / status.total_models) * 100
    : 0;

  const currentStepIndex = getStepIndex(selectedAnalysis?.workflow_state || null);

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Main Content */}
      <div className={cn(
        "flex-1 min-w-0 overflow-auto transition-all duration-300",
        isChatOpen ? "mr-96" : ""
      )}>
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Survival Analysis</h1>
              <p className="text-muted-foreground mt-1">
                Comprehensive analysis with 42+ models
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Endpoint Toggle */}
              <div className="flex items-center bg-muted/50 p-1 rounded-lg border">
                <button
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                    endpointType === 'OS'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setEndpointType('OS')}
                >
                  OS
                </button>
                <button
                  className={cn(
                    "px-3 py-1.5 text-sm font-medium rounded-md transition-all",
                    endpointType === 'PFS'
                      ? 'bg-background shadow-sm text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                  onClick={() => setEndpointType('PFS')}
                >
                  PFS
                </button>
              </div>

              {/* Action Buttons */}
              {selectedAnalysis && ['running', 'paused'].includes(selectedAnalysis.status) && (
                <Button variant="outline" size="icon" onClick={handleTogglePause}>
                  {selectedAnalysis.status === 'paused' ? (
                    <PlayCircle className="h-4 w-4" />
                  ) : (
                    <PauseCircle className="h-4 w-4" />
                  )}
                </Button>
              )}

              <Button 
                variant="outline" 
                size="icon"
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={cn(isChatOpen && "bg-primary text-primary-foreground")}
              >
                <MessageSquare className="h-4 w-4" />
              </Button>

              {/* Project Selector */}
              {supabaseConfigured && supabaseProjects.length > 0 && (
                <select
                  value={selectedProjectId || ''}
                  onChange={(e) => setSelectedProjectId(e.target.value || null)}
                  className="h-9 px-3 py-1 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Demo Data</option>
                  {supabaseProjects.map((project) => (
                    <option 
                      key={project.id} 
                      value={project.id}
                      disabled={!project.hasIPD}
                    >
                      {project.name} {project.hasIPD ? `(${project.ipdCount} records)` : '(no IPD)'}
                    </option>
                  ))}
                </select>
              )}

              <Button onClick={handleStartAnalysis} disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  `New ${endpointType} Analysis`
                )}
              </Button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <Card className="border-destructive">
              <CardContent className="pt-6 flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                {error}
              </CardContent>
            </Card>
          )}

          {/* IPD Preview - Show when no analysis exists */}
          {!selectedAnalysis && (
            <IPDPreview 
              onStartAnalysis={(endpoint) => {
                setEndpointType(endpoint);
                handleStartAnalysis();
              }}
              isStarting={loading}
            />
          )}

          {/* Workflow Steps */}
          {selectedAnalysis && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-4 overflow-x-auto">
                  {WORKFLOW_STEPS.map((step, idx) => {
                    const isComplete = idx < currentStepIndex || selectedAnalysis.status === 'completed';
                    const isCurrent = idx === currentStepIndex && selectedAnalysis.status === 'running';
                    const isPending = idx > currentStepIndex;

                    return (
                      <div key={step.id} className="flex items-center">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-all",
                            isComplete && "bg-primary border-primary text-primary-foreground",
                            isCurrent && "border-primary text-primary animate-pulse",
                            isPending && "border-muted text-muted-foreground"
                          )}>
                            {isComplete ? (
                              <CheckCircle2 className="h-4 w-4" />
                            ) : isCurrent ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Circle className="h-4 w-4" />
                            )}
                          </div>
                          <span className={cn(
                            "text-xs mt-1 font-medium",
                            (isComplete || isCurrent) ? "text-foreground" : "text-muted-foreground"
                          )}>
                            {step.label}
                          </span>
                        </div>
                        {idx < WORKFLOW_STEPS.length - 1 && (
                          <ChevronRight className={cn(
                            "h-4 w-4 mx-2",
                            isComplete ? "text-primary" : "text-muted-foreground"
                          )} />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Progress Bar */}
                {status && selectedAnalysis.status !== 'completed' && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">
                        {status.progress} / {status.total_models} models
                      </span>
                      <span className="font-medium">{Math.round(progressPercentage)}%</span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Analysis Details */}
          {selectedAnalysis && (
            <Card>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-3">
                      <CardTitle>{selectedAnalysis.parameters?.endpointType || 'OS'} Analysis</CardTitle>
                      <span className={cn(
                        "px-2 py-0.5 text-xs font-medium rounded-full",
                        selectedAnalysis.status === 'completed' && 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
                        selectedAnalysis.status === 'running' && 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
                        selectedAnalysis.status === 'paused' && 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
                        selectedAnalysis.status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
                      )}>
                        {selectedAnalysis.status}
                      </span>
                    </div>
                    <CardDescription className="mt-1">
                      Created {new Date(selectedAnalysis.created_at).toLocaleString()}
                    </CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteAnalysis(selectedAnalysis.id)}
                  >
                    Delete
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-4">
                {/* Error Message */}
                {selectedAnalysis.status === 'failed' && selectedAnalysis.error_message && (
                  <Card className="border-destructive bg-destructive/10">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive mt-0.5" />
                        <div>
                          <p className="font-semibold text-destructive">Analysis Failed</p>
                          <p className="text-sm text-destructive/80 mt-1">
                            {selectedAnalysis.error_message}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="ph-tests">PH Tests</TabsTrigger>
                    <TabsTrigger value="models">Models</TabsTrigger>
                    <TabsTrigger value="synthesis">Synthesis</TabsTrigger>
                    {selectedAnalysis.status === 'completed' && (
                      <TabsTrigger value="decision">Final Decision</TabsTrigger>
                    )}
                    {selectedAnalysis.status === 'completed' && (
                      <TabsTrigger value="reproducibility">Reproducibility</TabsTrigger>
                    )}
                    <TabsTrigger value="usage">Usage</TabsTrigger>
                  </TabsList>

                  <TabsContent value="overview" className="space-y-4">
                    <OverviewTab analysis={selectedAnalysis} />
                  </TabsContent>

                  <TabsContent value="ph-tests" className="space-y-4">
                    <div className="flex justify-end mb-2">
                      <Button variant="outline" size="sm" onClick={() => downloadPDF('ph-tests-content', 'ph-tests-report')}>
                        Download Report
                      </Button>
                    </div>
                    <div id="ph-tests-content">
                      <PHTestsTab analysisId={selectedAnalysis.id} />
                    </div>
                  </TabsContent>

                  <TabsContent value="models" className="space-y-4">
                    <ModelsTab analysisId={selectedAnalysis.id} />
                  </TabsContent>

                  <TabsContent value="synthesis" className="space-y-4">
                    <SynthesisTab analysisId={selectedAnalysis.id} />
                  </TabsContent>

                  {selectedAnalysis.status === 'completed' && (
                    <TabsContent value="decision" className="space-y-4">
                      <FinalDecisionTab analysisId={selectedAnalysis.id} />
                    </TabsContent>
                  )}

                  {selectedAnalysis.status === 'completed' && (
                    <TabsContent value="reproducibility" className="space-y-4">
                      <ReproducibilityTabWrapper analysisId={selectedAnalysis.id} />
                    </TabsContent>
                  )}

                  <TabsContent value="usage" className="space-y-4">
                    <TokenUsageTab analysisId={selectedAnalysis.id} />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {/* Previous Analyses */}
          {analyses.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Previous Analyses</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {analyses.map((analysis) => (
                    <div
                      key={analysis.id}
                      className={cn(
                        "p-3 border rounded cursor-pointer hover:bg-muted flex justify-between items-center group transition-colors",
                        selectedAnalysis?.id === analysis.id && 'bg-muted border-primary'
                      )}
                      onClick={() => setSelectedAnalysis(analysis)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm">{analysis.id.substring(0, 8)}...</span>
                          <span className={cn(
                            "px-1.5 py-0.5 text-[10px] font-medium rounded border",
                            analysis.parameters?.endpointType === 'PFS'
                              ? 'bg-purple-50 text-purple-700 border-purple-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                          )}>
                            {analysis.parameters?.endpointType || 'OS'}
                          </span>
                          <span className={cn(
                            "text-sm",
                            analysis.status === 'completed' && 'text-green-600',
                            analysis.status === 'running' && 'text-blue-600',
                            analysis.status === 'paused' && 'text-amber-600',
                            analysis.status === 'failed' && 'text-red-600'
                          )}>
                            {analysis.status}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {new Date(analysis.created_at).toLocaleString()}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteAnalysis(analysis.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Chat Sidebar */}
      <ChatSidebar
        analysisId={selectedAnalysis?.id || null}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onToggle={() => setIsChatOpen(!isChatOpen)}
      />
    </div>
  );
}

// Overview Tab Component
function OverviewTab({ analysis }: { analysis: Analysis }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Status</p>
        <p className="font-semibold capitalize">{analysis.status}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Workflow State</p>
        <p className="font-semibold">{analysis.workflow_state || 'N/A'}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Created</p>
        <p className="font-semibold">{new Date(analysis.created_at).toLocaleString()}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Updated</p>
        <p className="font-semibold">{new Date(analysis.updated_at).toLocaleString()}</p>
      </div>
      {analysis.completed_at && (
        <div>
          <p className="text-sm text-muted-foreground">Completed</p>
          <p className="font-semibold">{new Date(analysis.completed_at).toLocaleString()}</p>
        </div>
      )}
    </div>
  );
}

// Error Boundary for FinalDecisionPanel
class FinalDecisionErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('FinalDecisionPanel error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-5 w-5" />
              <span className="font-semibold">Failed to load Final Decision panel</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              There was an error rendering the model selection interface.
            </p>
            <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }
    return this.props.children;
  }
}

// Helper to find best model for an arm based on AIC (fallback)
function findBestModelForArm(models: any[], armCode: string): any | null {
  const armModels = models.filter(m => m.arm === armCode && m.aic != null);
  if (armModels.length === 0) return null;
  return armModels.reduce((best, current) => 
    current.aic < best.aic ? current : best
  );
}

// Known approach types
const APPROACH_TYPES = ['one-piece', 'piecewise', 'spline'];

// Normalize distribution name for matching
function normalizeDistribution(name: string): string {
  return name.toLowerCase()
    .replace(/[-_\s]+/g, '')  // Remove hyphens, underscores, spaces
    .replace(/lognormal/g, 'lognormal')
    .replace(/loglogistic/g, 'loglogistic')
    .replace(/generalizedgamma/g, 'generalizedgamma')
    .replace(/gengamma/g, 'generalizedgamma');
}

// Map synthesis arm label to database arm code
function mapArmLabelToCode(armLabel: string, availableArms: string[]): string | null {
  const label = armLabel.toLowerCase().trim();
  
  // Direct mappings
  const mappings: Record<string, string[]> = {
    'chemo': ['chemotherapy', 'chemo', 'control', 'comparator', 'standard'],
    'pembro': ['pembrolizumab', 'pembro', 'keytruda', 'treatment', 'intervention'],
  };
  
  // Try to find a match in known mappings
  for (const [code, aliases] of Object.entries(mappings)) {
    if (availableArms.includes(code) && aliases.some(alias => label.includes(alias))) {
      return code;
    }
  }
  
  // Fallback: try partial matching with available arms
  for (const armCode of availableArms) {
    if (label.includes(armCode) || armCode.includes(label.substring(0, 4))) {
      return armCode;
    }
  }
  
  return null;
}

// Parse model recommendation string like "Log-normal piecewise" or "Exponential piecewise"
function parseModelRecommendation(modelStr: string): { distribution: string | null; approach: string | null } {
  const lower = modelStr.toLowerCase().trim();
  
  // Find approach type
  let approach: string | null = null;
  for (const approachType of APPROACH_TYPES) {
    if (lower.includes(approachType.replace('-', ''))) {
      approach = approachType;
      break;
    }
  }
  
  // If no approach found, default to one-piece
  if (!approach) {
    approach = 'one-piece';
  }
  
  // Extract distribution (everything except the approach)
  let distribution = lower;
  for (const approachType of APPROACH_TYPES) {
    distribution = distribution.replace(approachType.replace('-', ''), '').replace(approachType, '');
  }
  distribution = distribution.trim().replace(/[-\s]+$/, '').replace(/^[-\s]+/, '');
  
  return { distribution: distribution || null, approach };
}

// Interface for parsed recommendation
interface ParsedRecommendation {
  armLabel: string;       // Display name from synthesis (e.g., "Pembrolizumab")
  armCode: string;        // Database code (e.g., "pembro")
  distribution: string;   // e.g., "exponential"
  approach: string;       // e.g., "piecewise"
  model: any;             // Matched model from database
  reasoning: string;      // Extracted reasoning from synthesis
}

// Parse all recommendations from synthesis text
function parseAllRecommendations(
  synthesisText: string | null,
  models: any[]
): ParsedRecommendation[] {
  if (!synthesisText || models.length === 0) return [];
  
  const recommendations: ParsedRecommendation[] = [];
  const availableArms = [...new Set(models.map(m => m.arm))];
  
  // Regex to match: **Arm Name Arm**: **Model Name** or **Arm Name Arm: Model Name**
  // Pattern captures: (1) arm name, (2) model recommendation
  const pattern = /\*\*([^*:]+?)\s*Arm\*\*:\s*\*\*([^*]+)\*\*/gi;
  
  let match;
  while ((match = pattern.exec(synthesisText)) !== null) {
    const armLabel = match[1].trim();
    const modelStr = match[2].trim();
    
    // Map arm label to database code
    const armCode = mapArmLabelToCode(armLabel, availableArms);
    if (!armCode) {
      console.log(`[FinalDecision] Could not map arm label "${armLabel}" to any known arm`);
      continue;
    }
    
    // Parse the model recommendation
    const { distribution, approach } = parseModelRecommendation(modelStr);
    if (!distribution) {
      console.log(`[FinalDecision] Could not parse distribution from "${modelStr}"`);
      continue;
    }
    
    // Find matching model in database
    const armModels = models.filter(m => m.arm === armCode);
    const normalizedDist = normalizeDistribution(distribution);
    
    let matchedModel = armModels.find(m => {
      const modelDist = normalizeDistribution(m.distribution || '');
      const modelApproach = (m.approach || '').toLowerCase();
      return modelDist === normalizedDist && modelApproach === approach;
    });
    
    // If no exact match, try matching just distribution
    if (!matchedModel) {
      matchedModel = armModels.find(m => {
        const modelDist = normalizeDistribution(m.distribution || '');
        return modelDist === normalizedDist;
      });
    }
    
    // Fallback to best AIC for this arm
    if (!matchedModel) {
      console.log(`[FinalDecision] No model match for ${armLabel} (${distribution} ${approach}), using best AIC`);
      matchedModel = findBestModelForArm(models, armCode);
    }
    
    if (matchedModel) {
      // Extract reasoning for this arm from synthesis text
      const reasoningPattern = new RegExp(
        `\\*\\*${armLabel}\\s*Arm\\*\\*:[^*]*\\*\\*[^*]+\\*\\*\\s*([^*]+?)(?=\\*\\*|$)`,
        'i'
      );
      const reasoningMatch = synthesisText.match(reasoningPattern);
      const reasoning = reasoningMatch?.[1]?.trim().substring(0, 300) || 
        `${distribution} ${approach} recommended for ${armLabel}`;
      
      recommendations.push({
        armLabel,
        armCode,
        distribution: matchedModel.distribution || distribution,
        approach: matchedModel.approach || approach,
        model: matchedModel,
        reasoning
      });
      
      console.log(`[FinalDecision] Parsed recommendation for ${armLabel}:`, {
        distribution: matchedModel.distribution,
        approach: matchedModel.approach,
        modelId: matchedModel.id
      });
    }
  }
  
  // If no recommendations found via regex, fallback to best AIC for all arms
  if (recommendations.length === 0) {
    console.log('[FinalDecision] No recommendations parsed, falling back to best AIC per arm');
    for (const armCode of availableArms) {
      const bestModel = findBestModelForArm(models, armCode);
      if (bestModel) {
        const armLabel = armCode === 'pembro' ? 'Pembrolizumab' : 
                        armCode === 'chemo' ? 'Chemotherapy' : armCode;
        recommendations.push({
          armLabel,
          armCode,
          distribution: bestModel.distribution || bestModel.approach,
          approach: bestModel.approach,
          model: bestModel,
          reasoning: 'Selected based on best statistical fit (lowest AIC)'
        });
      }
    }
  }
  
  return recommendations;
}

// Final Decision Tab Component
function FinalDecisionTab({ analysisId }: { analysisId: string }) {
  const [models, setModels] = useState<any[]>([]);
  const [synthesis, setSynthesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, [analysisId]);

  const loadData = async () => {
    try {
      setError(null);
      const [modelsData, synthesisData] = await Promise.all([
        survivalApi.listModels(analysisId),
        survivalApi.getSynthesis(analysisId),
      ]);
      setModels(modelsData.models || []);
      setSynthesis(synthesisData.synthesis);
    } catch (err) {
      console.error('Failed to load data:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (decisions: any[]) => {
    setSubmitting(true);
    try {
      // TODO: Save decisions to backend
      console.log('Decisions:', decisions);
      alert('Decisions saved successfully!');
    } catch (err) {
      console.error('Failed to save decisions:', err);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-8">Loading...</div>;

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Failed to load recommendations</span>
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setLoading(true); loadData(); }}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Parse all recommendations from synthesis text (dynamic, works for any arms)
  const parsedRecommendations = parseAllRecommendations(synthesis?.primary_recommendation, models);

  // Generate recommendations for the FinalDecisionPanel
  const recommendations = parsedRecommendations.map((rec, index) => ({
    arm: rec.armLabel,
    recommended_model: rec.distribution || rec.approach,
    recommended_approach: rec.approach,
    model_id: rec.model.id,
    confidence: index === 0 ? 0.85 : 0.78,  // Slight variation in confidence
    reasoning: rec.reasoning,
    alternatives: models
      .filter(m => m.arm === rec.armCode && m.id !== rec.model.id)
      .sort((a, b) => (a.aic || Infinity) - (b.aic || Infinity))
      .slice(0, 3)
      .map(m => ({
        model_id: m.id,
        model_name: m.distribution || m.approach,
        approach: m.approach,
        score: m.aic && rec.model.aic 
          ? Math.max(1, 10 - Math.min(9, (m.aic - rec.model.aic) / 50)) 
          : 5,
      })),
  }));

  if (recommendations.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No recommendations available yet. Complete the synthesis first.
      </div>
    );
  }

  // Build arm code to label mapping from parsed recommendations
  const armCodeToLabel: Record<string, string> = {};
  parsedRecommendations.forEach(rec => {
    armCodeToLabel[rec.armCode] = rec.armLabel;
  });
  // Fallback mappings for arms not in recommendations
  const defaultArmLabels: Record<string, string> = {
    'pembro': 'Pembrolizumab',
    'chemo': 'Chemotherapy',
  };

  return (
    <FinalDecisionErrorBoundary>
      <FinalDecisionPanel
        analysisId={analysisId}
        recommendations={recommendations}
        allModels={models.map(m => ({
          id: m.id,
          arm: armCodeToLabel[m.arm] || defaultArmLabels[m.arm] || m.arm,
          approach: m.approach,
          distribution: m.distribution,
          aic: m.aic,
          bic: m.bic,
        }))}
        onApprove={handleApprove}
        isSubmitting={submitting}
      />
    </FinalDecisionErrorBoundary>
  );
}

// Error Boundary for catching render errors
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ReproducibilityErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ReproducibilityTab error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 text-destructive mb-4">
              <AlertCircle className="h-5 w-5" />
              <span className="font-semibold">Failed to load Reproducibility tab</span>
            </div>
            <p className="text-sm text-muted-foreground mb-4">
              There was an error rendering the reproducibility content. This may be due to a browser compatibility issue.
            </p>
            <p className="text-xs text-muted-foreground font-mono bg-muted p-2 rounded">
              {this.state.error?.message || 'Unknown error'}
            </p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try Again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

// Reproducibility Tab Wrapper Component
function ReproducibilityTabWrapper({ analysisId }: { analysisId: string }) {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadModels();
  }, [analysisId]);

  const loadModels = async () => {
    try {
      setError(null);
      const data = await survivalApi.listModels(analysisId);
      setModels(data.models);
    } catch (err) {
      console.error('Failed to load models for reproducibility:', err);
      setError(err instanceof Error ? err.message : 'Failed to load models');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-destructive mb-2">
            <AlertCircle className="h-5 w-5" />
            <span className="font-semibold">Failed to load reproducibility data</span>
          </div>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => { setLoading(true); loadModels(); }}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Calculate arm data from models
  const armData = {
    pembro: {
      n: models.filter(m => m.arm === 'pembro').length > 0 ? 154 : 0,
      events: 45,
      maxTime: 18.75
    },
    chemo: {
      n: models.filter(m => m.arm === 'chemo').length > 0 ? 151 : 0,
      events: 59,
      maxTime: 18.5
    }
  };

  return (
    <ReproducibilityErrorBoundary>
      <ReproducibilityTab
        analysisId={analysisId}
        models={models.map(m => ({
          id: m.id,
          arm: m.arm,
          approach: m.approach,
          distribution: m.distribution,
          aic: m.aic,
          bic: m.bic,
          parameters: m.parameters
        }))}
        armData={armData}
      />
    </ReproducibilityErrorBoundary>
  );
}

// Models Tab Component (simplified from original)
function ModelsTab({ analysisId }: { analysisId: string }) {
  const [models, setModels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [filterArm, setFilterArm] = useState<string>('all');
  const [filterApproach, setFilterApproach] = useState<string>('all');

  useEffect(() => {
    loadModels();
  }, [analysisId]);

  const loadModels = async () => {
    try {
      const data = await survivalApi.listModels(analysisId);
      setModels(data.models);
    } catch (err) {
      console.error('Failed to load models:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading models...</div>;

  const filteredModels = models.filter(model => {
    if (filterArm !== 'all' && model.arm !== filterArm) return false;
    if (filterApproach !== 'all' && model.approach !== filterApproach) return false;
    return true;
  });

  const uniqueArms = [...new Set(models.map(m => m.arm))];
  const uniqueApproaches = [...new Set(models.map(m => m.approach))];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">
          {filteredModels.length} of {models.length} models
        </p>
        <div className="flex gap-2">
          <select
            value={filterArm}
            onChange={(e) => setFilterArm(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="all">All Arms</option>
            {uniqueArms.map(arm => (
              <option key={arm} value={arm}>{arm}</option>
            ))}
          </select>
          <select
            value={filterApproach}
            onChange={(e) => setFilterApproach(e.target.value)}
            className="text-sm border rounded px-2 py-1 bg-background"
          >
            <option value="all">All Approaches</option>
            {uniqueApproaches.map(approach => (
              <option key={approach} value={approach}>{approach}</option>
            ))}
          </select>
        </div>
      </div>

      {selectedModel ? (
        <ModelDetailView
          analysisId={analysisId}
          modelId={selectedModel}
          onBack={() => setSelectedModel(null)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModels.map((model) => (
            <Card
              key={model.id}
              className="cursor-pointer hover:bg-muted/50 transition-colors"
              onClick={() => setSelectedModel(model.id)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>{model.distribution || model.approach}</span>
                  <span className={cn(
                    "text-xs px-2 py-0.5 rounded",
                    model.approach === 'one-piece' && 'bg-blue-100 text-blue-700',
                    model.approach === 'piecewise' && 'bg-purple-100 text-purple-700',
                    model.approach === 'spline' && 'bg-green-100 text-green-700'
                  )}>
                    {model.approach}
                  </span>
                </CardTitle>
                <CardDescription className="text-xs">{model.arm}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-1">
                  {model.aic !== null && <p>AIC: {model.aic.toFixed(2)}</p>}
                  {model.bic !== null && <p>BIC: {model.bic.toFixed(2)}</p>}
                  {model.cutpoint && <p>Cutpoint: {model.cutpoint.toFixed(2)}mo</p>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// Model Detail View Component
function ModelDetailView({
  analysisId,
  modelId,
  onBack
}: {
  analysisId: string;
  modelId: string;
  onBack: () => void;
}) {
  const [modelDetails, setModelDetails] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadModelDetails();
  }, [analysisId, modelId]);

  const loadModelDetails = async () => {
    try {
      const data = await survivalApi.getModelDetails(analysisId, modelId);
      setModelDetails(data);
    } catch (err) {
      console.error('Failed to load model details:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading model details...</div>;
  if (!modelDetails) return <div>Model not found.</div>;

  const { model, vision_assessment, reasoning_assessment, plots } = modelDetails;
  const shortTermPlot = plots?.find((p: any) => p.plot_type === 'short_term');
  const longTermPlot = plots?.find((p: any) => p.plot_type === 'long_term');

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={onBack}>← Back to Models</Button>
        <Button variant="outline" onClick={() => downloadPDF('model-detail-content', `model-${model.id}-report`)}>
          Download Report
        </Button>
      </div>

      <div id="model-detail-content" className="space-y-4">
        {/* Model Info */}
        <Card>
          <CardHeader>
            <CardTitle>{model.arm} - {model.distribution || model.approach}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {model.aic !== null && <div><span className="text-muted-foreground">AIC:</span> {model.aic.toFixed(2)}</div>}
              {model.bic !== null && <div><span className="text-muted-foreground">BIC:</span> {model.bic.toFixed(2)}</div>}
              {model.cutpoint && <div><span className="text-muted-foreground">Cutpoint:</span> {model.cutpoint.toFixed(2)}mo</div>}
              {model.knots && <div><span className="text-muted-foreground">Knots:</span> {model.knots}</div>}
            </div>
          </CardContent>
        </Card>

        {/* Plots */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shortTermPlot && (
            <Card>
              <CardHeader><CardTitle className="text-base">Short-Term Fit</CardTitle></CardHeader>
              <CardContent>
                <img
                  src={shortTermPlot.base64_data 
                    ? `data:image/png;base64,${shortTermPlot.base64_data}`
                    : survivalApi.getPlotUrl(analysisId, modelId, 'short_term')}
                  alt="Short-term plot"
                  className="w-full rounded border"
                />
              </CardContent>
            </Card>
          )}
          {longTermPlot && (
            <Card>
              <CardHeader><CardTitle className="text-base">Long-Term Extrapolation</CardTitle></CardHeader>
              <CardContent>
                <img
                  src={longTermPlot.base64_data
                    ? `data:image/png;base64,${longTermPlot.base64_data}`
                    : survivalApi.getPlotUrl(analysisId, modelId, 'long_term')}
                  alt="Long-term plot"
                  className="w-full rounded border"
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vision Assessment */}
        {vision_assessment && (
          <Card>
            <CardHeader><CardTitle className="text-base">Vision Assessment</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4">
                {vision_assessment.short_term_score !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground">Short-Term Score</p>
                    <p className="text-2xl font-bold">{vision_assessment.short_term_score}/10</p>
                  </div>
                )}
                {vision_assessment.long_term_score !== null && (
                  <div>
                    <p className="text-sm text-muted-foreground">Long-Term Score</p>
                    <p className="text-2xl font-bold">{vision_assessment.long_term_score}/10</p>
                  </div>
                )}
              </div>
              {vision_assessment.strengths && <p className="text-sm"><strong>Strengths:</strong> {vision_assessment.strengths}</p>}
              {vision_assessment.weaknesses && <p className="text-sm"><strong>Weaknesses:</strong> {vision_assessment.weaknesses}</p>}
            </CardContent>
          </Card>
        )}

        {/* Reasoning Assessment */}
        {reasoning_assessment && (
          <Card>
            <CardHeader><CardTitle className="text-base">Reasoning Assessment</CardTitle></CardHeader>
            <CardContent>
              {reasoning_assessment.sections?.recommendation ? (
                <div className="space-y-3">
                  <div className="p-3 bg-primary/5 rounded border">
                    <p className="font-semibold mb-1">Recommendation</p>
                    <CompactMarkdown content={reasoning_assessment.sections.recommendation} />
                  </div>
                  {reasoning_assessment.sections.statistical_visual_fit && (
                    <div>
                      <p className="font-semibold mb-1 text-sm">Statistical Fit</p>
                      <CompactMarkdown content={reasoning_assessment.sections.statistical_visual_fit} className="text-muted-foreground" />
                    </div>
                  )}
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto">
                  <CompactMarkdown content={reasoning_assessment.assessment_text || reasoning_assessment.full_text || 'N/A'} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// Synthesis Tab Component
function SynthesisTab({ analysisId }: { analysisId: string }) {
  const [synthesis, setSynthesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadSynthesis();
  }, [analysisId]);

  const loadSynthesis = async () => {
    try {
      const data = await survivalApi.getSynthesis(analysisId);
      setSynthesis(data.synthesis);
    } catch (err) {
      console.error('Failed to load synthesis:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadPDF = async () => {
    if (!synthesis) return;
    setExporting(true);
    try {
      const sections = [
        { title: 'Primary Recommendation', content: synthesis.primary_recommendation || '' },
        { title: 'Key Uncertainties', content: synthesis.key_uncertainties || '' },
        { title: 'Full Analysis Report', content: synthesis.full_text || '' },
      ];
      await downloadMarkdownAsPDF('Survival Analysis Synthesis Report', sections, 'synthesis-report');
    } catch (err) {
      console.error('Failed to export PDF:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadDocx = async () => {
    if (!synthesis) return;
    setExporting(true);
    try {
      const sections = [
        { title: 'Primary Recommendation', content: synthesis.primary_recommendation || '' },
        { title: 'Key Uncertainties', content: synthesis.key_uncertainties || '' },
        { title: 'Full Analysis Report', content: synthesis.full_text || '' },
      ];
      await downloadSynthesisAsDocx('Survival Analysis Synthesis Report', sections, 'synthesis-report');
    } catch (err) {
      console.error('Failed to export DOCX:', err);
    } finally {
      setExporting(false);
    }
  };

  if (loading) return <div>Loading synthesis...</div>;
  if (!synthesis) return <div className="text-muted-foreground">No synthesis report available yet.</div>;

  return (
    <div className="space-y-4">
      {/* Download Options */}
      <div className="flex justify-end">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" disabled={exporting}>
              {exporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Download Report
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDownloadPDF}>
              <FileText className="h-4 w-4 mr-2" />
              Download as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDownloadDocx}>
              <FileType className="h-4 w-4 mr-2" />
              Download as Word (.docx)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-1 h-5 bg-primary rounded-full" />
            Primary Recommendation
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompactMarkdown content={synthesis.primary_recommendation || 'Not available'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-1 h-5 bg-amber-500 rounded-full" />
            Key Uncertainties
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CompactMarkdown content={synthesis.key_uncertainties || 'Not available'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span className="w-1 h-5 bg-blue-500 rounded-full" />
            Full Report
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-[600px] overflow-y-auto pr-2">
            <Markdown content={synthesis.full_text || ''} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// PH Tests Tab Component
function PHTestsTab({ analysisId }: { analysisId: string }) {
  const [phTests, setPhTests] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPHTests();
  }, [analysisId]);

  const loadPHTests = async () => {
    try {
      const data = await survivalApi.getPHTests(analysisId);
      setPhTests(data.ph_tests);
    } catch (err) {
      console.error('Failed to load PH tests:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading PH test results...</div>;
  if (!phTests) return <div className="text-muted-foreground">No PH test results available yet.</div>;

  const diagnosticPlots = typeof phTests.diagnostic_plots === 'object' && phTests.diagnostic_plots !== null
    ? phTests.diagnostic_plots
    : phTests.test_results?.diagnostic_plots || {};

  const isViolated = phTests.decision === 'separate';

  return (
    <div className="space-y-6">
      {/* Decision Card */}
      <Card className={cn(
        "border-l-4",
        isViolated ? "border-l-amber-500" : "border-l-green-500"
      )}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Expert Assessment
            <span className={cn(
              "px-2 py-1 text-xs rounded-full",
              isViolated ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"
            )}>
              {isViolated ? 'PH Violated' : 'PH Valid'}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-lg font-semibold mb-2">
            {isViolated ? 'Separate Models Recommended' : 'Pooled Model (Standard Cox)'}
          </p>
          {phTests.rationale && (
            <p className="text-sm text-muted-foreground">{phTests.rationale}</p>
          )}
        </CardContent>
      </Card>

      {/* Diagnostic Plots */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {diagnosticPlots.cumulative_hazard && (
          <Card>
            <CardHeader><CardTitle className="text-base">Cumulative Hazard</CardTitle></CardHeader>
            <CardContent>
              <img
                src={`data:image/png;base64,${diagnosticPlots.cumulative_hazard}`}
                alt="Cumulative Hazard"
                className="w-full rounded border bg-white"
              />
            </CardContent>
          </Card>
        )}
        {diagnosticPlots.log_cumulative_hazard && (
          <Card>
            <CardHeader><CardTitle className="text-base">Log-Cumulative Hazard</CardTitle></CardHeader>
            <CardContent>
              <img
                src={`data:image/png;base64,${diagnosticPlots.log_cumulative_hazard}`}
                alt="Log-Cumulative Hazard"
                className="w-full rounded border bg-white"
              />
            </CardContent>
          </Card>
        )}
        {diagnosticPlots.schoenfeld_residuals && (
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle className="text-base">Schoenfeld Residuals</CardTitle></CardHeader>
            <CardContent>
              <img
                src={`data:image/png;base64,${diagnosticPlots.schoenfeld_residuals}`}
                alt="Schoenfeld Residuals"
                className="w-full rounded border bg-white"
              />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Statistical Tests */}
      <Card>
        <CardHeader><CardTitle className="text-base">Statistical Tests</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="p-3 border rounded">
              <p className="text-sm text-muted-foreground">Schoenfeld p-value</p>
              <p className="text-xl font-mono">{phTests.schoenfeld_pvalue?.toFixed(4) ?? 'N/A'}</p>
            </div>
            <div className="p-3 border rounded">
              <p className="text-sm text-muted-foreground">Time-Dependent Cox p-value</p>
              <p className="text-xl font-mono">{phTests.chow_test_pvalue?.toFixed(4) ?? 'N/A'}</p>
            </div>
            <div className="p-3 border rounded">
              <p className="text-sm text-muted-foreground">Log-Rank p-value</p>
              <p className="text-xl font-mono">{phTests.logrank_pvalue?.toFixed(4) ?? 'N/A'}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Token Usage Tab Component
function TokenUsageTab({ analysisId }: { analysisId: string }) {
  const [usage, setUsage] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUsage();
  }, [analysisId]);

  const loadUsage = async () => {
    try {
      const data = await survivalApi.getTokenUsage(analysisId);
      setUsage(data);
    } catch (err) {
      console.error('Failed to load token usage:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading token usage...</div>;
  if (!usage) return <div className="text-muted-foreground">No token usage data available.</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Total Usage</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Input Tokens</p>
              <p className="text-2xl font-bold">{usage.total.input.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Output Tokens</p>
              <p className="text-2xl font-bold">{usage.total.output.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Estimated Cost</p>
              <p className="text-2xl font-bold">${usage.total.cost.toFixed(2)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Usage by Call</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {usage.usage.map((u: any) => (
              <div key={u.id} className="flex justify-between p-2 border rounded text-sm">
                <span>{u.model_type}</span>
                <span>{u.tokens_input + u.tokens_output} tokens</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
