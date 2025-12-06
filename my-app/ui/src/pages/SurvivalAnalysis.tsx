import { useState, useEffect } from 'react';
import { survivalApi, type Analysis, type AnalysisStatus } from '@/lib/survivalApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { downloadPDF } from '@/lib/pdfUtils';

export function SurvivalAnalysis() {
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<Analysis | null>(null);
  const [status, setStatus] = useState<AnalysisStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadAnalyses();
  }, []);

  useEffect(() => {
    if (!selectedAnalysis) return;

    const analysisId = selectedAnalysis.id;
    loadStatus(analysisId);

    const interval = setInterval(async () => {
      // Reload the analysis to get updated status
      try {
        const analysisData = await survivalApi.getAnalysis(analysisId);
        const updatedStatus = await survivalApi.getAnalysisStatus(analysisId);
        setStatus(updatedStatus);
        setSelectedAnalysis(analysisData.analysis);
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    }, 2000); // Poll every 2 seconds

    return () => clearInterval(interval);
  }, [selectedAnalysis?.id]); // Use ID instead of whole object to avoid unnecessary re-runs

  const loadAnalyses = async () => {
    try {
      const data = await survivalApi.listAnalyses();
      setAnalyses(data.analyses);
      if (data.analyses.length > 0) {
        // If no analysis is selected, select the first one
        // If current selection is not in the list (was deleted), select the first one
        // Prefer selecting a running analysis if available
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
      // Update selected analysis
      const analysisData = await survivalApi.getAnalysis(analysisId);
      setSelectedAnalysis(analysisData.analysis);
    } catch (err) {
      console.error('Failed to load status:', err);
    }
  };

  const [endpointType, setEndpointType] = useState<'OS' | 'PFS'>('OS');

  // ... (existing useEffects)

  const handleStartAnalysis = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await survivalApi.startAnalysis(endpointType);
      await loadAnalyses();
      // Select the new analysis
      const analysisData = await survivalApi.getAnalysis(result.analysis_id);
      setSelectedAnalysis(analysisData.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAnalysis = async (analysisId: string) => {
    if (!confirm('Are you sure you want to delete this analysis? This action cannot be undone.')) {
      return;
    }

    try {
      await survivalApi.deleteAnalysis(analysisId);
      await loadAnalyses();
      // Select first analysis if available, otherwise clear selection
      const data = await survivalApi.listAnalyses();
      if (data.analyses.length > 0) {
        setSelectedAnalysis(data.analyses[0]);
      } else {
        setSelectedAnalysis(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete analysis');
    }
  };

  const progressPercentage = status
    ? (status.progress / status.total_models) * 100
    : 0;

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Survival Analysis Workflow</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive survival analysis for HTA submissions with 42+ models
          </p>
        </div>
        <div className="flex flex-col items-end gap-3">
          <div className="flex items-center gap-4 bg-muted/50 p-1 rounded-lg border">
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${endpointType === 'OS'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
              onClick={() => setEndpointType('OS')}
            >
              Overall Survival (OS)
            </button>
            <button
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all ${endpointType === 'PFS'
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
                }`}
              onClick={() => setEndpointType('PFS')}
            >
              Progression-Free (PFS)
            </button>
          </div>

          <div className="flex gap-2">
            {selectedAnalysis && selectedAnalysis.status !== 'completed' && selectedAnalysis.status !== 'failed' && (
              <Button
                variant="outline"
                onClick={async () => {
                  if (!selectedAnalysis) return;
                  try {
                    if (selectedAnalysis.status === 'running') {
                      await survivalApi.pauseAnalysis(selectedAnalysis.id);
                    } else if (selectedAnalysis.status === 'paused') {
                      await survivalApi.resumeAnalysis(selectedAnalysis.id);
                    }
                    // Refresh status immediately
                    await loadStatus(selectedAnalysis.id);
                  } catch (err) {
                    console.error('Failed to toggle pause:', err);
                  }
                }}
              >
                {selectedAnalysis.status === 'paused' ? 'Resume Analysis' : 'Pause Analysis'}
              </Button>
            )}
            <Button onClick={handleStartAnalysis} disabled={loading}>
              {loading ? 'Starting...' : `Start New ${endpointType} Analysis`}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Card className="border-red-500">
          <CardContent className="pt-6">
            <p className="text-red-500">{error}</p>
          </CardContent>
        </Card>
      )}

      {selectedAnalysis && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-3">
                  <CardTitle>Analysis: {selectedAnalysis.id.substring(0, 8)}...</CardTitle>
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${selectedAnalysis.parameters?.endpointType === 'PFS'
                    ? 'bg-purple-50 text-purple-700 border-purple-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200'
                    }`}>
                    {selectedAnalysis.parameters?.endpointType || 'OS'}
                  </span>
                </div>
                <CardDescription className="mt-1">
                  Status: {selectedAnalysis.status} |
                  Workflow State: {selectedAnalysis.workflow_state || 'N/A'}
                </CardDescription>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteAnalysis(selectedAnalysis.id)}
              >
                Delete
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedAnalysis.status === 'failed' && selectedAnalysis.error_message && (
              <Card className="border-red-500 bg-red-50">
                <CardContent className="pt-6">
                  <p className="text-red-700 font-semibold mb-2">Error:</p>
                  <p className="text-red-600 text-sm">{selectedAnalysis.error_message}</p>
                </CardContent>
              </Card>
            )}
            {status && (
              <div>
                <div className="flex justify-between mb-2">
                  <span>Progress: {status.progress} / {status.total_models} models</span>
                  <span>{Math.round(progressPercentage)}%</span>
                </div>
                <Progress value={progressPercentage} className="h-2" />
              </div>
            )}

            <Tabs defaultValue="overview" className="w-full">
              <TabsList>
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="ph-tests">PH Tests</TabsTrigger>
                <TabsTrigger value="models">Models</TabsTrigger>
                <TabsTrigger value="synthesis">Synthesis</TabsTrigger>
                <TabsTrigger value="usage">Token Usage</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p>{new Date(selectedAnalysis.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Updated</p>
                    <p>{new Date(selectedAnalysis.updated_at).toLocaleString()}</p>
                  </div>
                  {selectedAnalysis.completed_at && (
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p>{new Date(selectedAnalysis.completed_at).toLocaleString()}</p>
                    </div>
                  )}
                </div>
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
                <div className="flex justify-end mb-2">
                  <Button variant="outline" size="sm" onClick={() => downloadPDF('synthesis-content', 'synthesis-report')}>
                    Download Report
                  </Button>
                </div>
                <div id="synthesis-content">
                  <SynthesisTab analysisId={selectedAnalysis.id} />
                </div>
              </TabsContent>

              <TabsContent value="usage" className="space-y-4">
                <TokenUsageTab analysisId={selectedAnalysis.id} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

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
                  className={`p-3 border rounded cursor-pointer hover:bg-muted flex justify-between items-center group ${selectedAnalysis?.id === analysis.id ? 'bg-muted border-primary' : ''
                    }`}
                  onClick={async () => {
                    setSelectedAnalysis(analysis);
                    // Load full details and status for the selected analysis
                    await loadStatus(analysis.id);
                  }}
                >
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm">{analysis.id.substring(0, 8)}...</span>
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded border ${analysis.parameters?.endpointType === 'PFS'
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                          }`}>
                          {analysis.parameters?.endpointType || 'OS'}
                        </span>
                      </div>
                      <span className={`text-sm ${analysis.status === 'completed' ? 'text-green-500' :
                        analysis.status === 'running' ? 'text-blue-500' :
                          analysis.status === 'failed' ? 'text-red-500' :
                            'text-gray-500'
                        }`}>
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
  );
}

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
          {filteredModels.length} of {models.length} models fitted
        </p>
        <div className="flex gap-2">
          <select
            value={filterArm}
            onChange={(e) => setFilterArm(e.target.value)}
            className="text-sm border rounded px-2 py-1"
          >
            <option value="all">All Arms</option>
            {uniqueArms.map(arm => (
              <option key={arm} value={arm}>{arm}</option>
            ))}
          </select>
          <select
            value={filterApproach}
            onChange={(e) => setFilterApproach(e.target.value)}
            className="text-sm border rounded px-2 py-1"
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
              className="cursor-pointer hover:bg-muted transition-colors"
              onClick={() => setSelectedModel(model.id)}
            >
              <CardHeader>
                <CardTitle className="text-sm">
                  {model.arm} - {model.approach}
                </CardTitle>
                <CardDescription className="text-xs">
                  Model #{model.model_order}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-xs space-y-1">
                  {model.distribution && <p><strong>Distribution:</strong> {model.distribution}</p>}
                  {model.scale && <p><strong>Scale:</strong> {model.scale}</p>}
                  {model.knots && <p><strong>Knots:</strong> {model.knots}</p>}
                  {model.cutpoint && <p><strong>Cutpoint:</strong> {model.cutpoint.toFixed(2)} months</p>}
                  {model.aic !== null && <p><strong>AIC:</strong> {model.aic.toFixed(2)}</p>}
                  {model.bic !== null && <p><strong>BIC:</strong> {model.bic.toFixed(2)}</p>}
                </div>
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                  Click to view details →
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

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
      <div className="flex justify-between items-center mb-4">
        <Button variant="outline" onClick={onBack}>
          ← Back to Models
        </Button>
        <Button variant="outline" onClick={() => downloadPDF('model-detail-content', `model-${model.id}-report`)}>
          Download Report
        </Button>
      </div>

      <div id="model-detail-content" className="space-y-4">
        {/* Model Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>
              {model.arm} - {model.approach}
              {model.distribution && ` (${model.distribution})`}
            </CardTitle>
            <CardDescription>Model #{model.model_order}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {model.distribution && (
                <div>
                  <p className="text-sm text-muted-foreground">Distribution</p>
                  <p className="font-semibold">{model.distribution}</p>
                </div>
              )}
              {model.scale && (
                <div>
                  <p className="text-sm text-muted-foreground">Scale</p>
                  <p className="font-semibold">{model.scale}</p>
                </div>
              )}
              {model.knots && (
                <div>
                  <p className="text-sm text-muted-foreground">Knots</p>
                  <p className="font-semibold">{model.knots}</p>
                </div>
              )}
              {model.cutpoint && (
                <div>
                  <p className="text-sm text-muted-foreground">Cutpoint</p>
                  <p className="font-semibold">{model.cutpoint.toFixed(2)} months</p>
                </div>
              )}
              {model.aic !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">AIC</p>
                  <p className="font-semibold">{model.aic.toFixed(2)}</p>
                </div>
              )}
              {model.bic !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">BIC</p>
                  <p className="font-semibold">{model.bic.toFixed(2)}</p>
                </div>
              )}
              {model.log_likelihood !== null && (
                <div>
                  <p className="text-sm text-muted-foreground">Log-Likelihood</p>
                  <p className="font-semibold">{model.log_likelihood.toFixed(2)}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Plots */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {shortTermPlot && (
            <Card>
              <CardHeader>
                <CardTitle>Short-Term Fit (0-30 months)</CardTitle>
              </CardHeader>
              <CardContent>
                {shortTermPlot.base64_data ? (
                  <img
                    src={`data:image/png;base64,${shortTermPlot.base64_data}`}
                    alt="Short-term survival plot"
                    className="w-full rounded-lg border"
                  />
                ) : (
                  <img
                    src={survivalApi.getPlotUrl(analysisId, modelId, 'short_term')}
                    alt="Short-term survival plot"
                    className="w-full rounded-lg border"
                  />
                )}
              </CardContent>
            </Card>
          )}

          {longTermPlot && (
            <Card>
              <CardHeader>
                <CardTitle>Long-Term Extrapolation (0-240 months)</CardTitle>
              </CardHeader>
              <CardContent>
                {longTermPlot.base64_data ? (
                  <img
                    src={`data:image/png;base64,${longTermPlot.base64_data}`}
                    alt="Long-term survival plot"
                    className="w-full rounded-lg border"
                  />
                ) : (
                  <img
                    src={survivalApi.getPlotUrl(analysisId, modelId, 'long_term')}
                    alt="Long-term survival plot"
                    className="w-full rounded-lg border"
                  />
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Vision Assessment */}
        {vision_assessment && (
          <Card>
            <CardHeader>
              <CardTitle>Vision LLM Assessment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(vision_assessment.short_term_score !== null || vision_assessment.long_term_score !== null) && (
                <div className="grid grid-cols-2 gap-4">
                  {vision_assessment.short_term_score !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Short-Term Fit Score</p>
                      <p className="text-2xl font-bold">
                        {vision_assessment.short_term_score}/10
                      </p>
                    </div>
                  )}
                  {vision_assessment.long_term_score !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">Long-Term Plausibility Score</p>
                      <p className="text-2xl font-bold">
                        {vision_assessment.long_term_score}/10
                      </p>
                    </div>
                  )}
                </div>
              )}
              {vision_assessment.strengths && (
                <div>
                  <p className="text-sm font-semibold mb-2">Strengths:</p>
                  <p className="text-sm whitespace-pre-wrap">{vision_assessment.strengths}</p>
                </div>
              )}
              {vision_assessment.weaknesses && (
                <div>
                  <p className="text-sm font-semibold mb-2">Weaknesses:</p>
                  <p className="text-sm whitespace-pre-wrap">{vision_assessment.weaknesses}</p>
                </div>
              )}
              {vision_assessment.concerns && (
                <div>
                  <p className="text-sm font-semibold mb-2">Concerns:</p>
                  <p className="text-sm whitespace-pre-wrap">{vision_assessment.concerns}</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Reasoning Assessment */}
        {reasoning_assessment && (
          <Card>
            <CardHeader>
              <CardTitle>Reasoning LLM Assessment</CardTitle>
              <CardDescription>Concise clinical evaluation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Check if we have the new structured sections */}
              {reasoning_assessment.sections && (reasoning_assessment.sections.statistical_visual_fit || reasoning_assessment.sections.recommendation) ? (
                <div className="space-y-4">
                  {/* 1. Recommendation (Top Priority) */}
                  <div className={`p-4 rounded-lg border ${(reasoning_assessment.sections.recommendation?.toLowerCase().includes('reject') ||
                    reasoning_assessment.sections.recommendation?.toLowerCase().includes('not recommended')) ? 'bg-red-50 border-red-200' :
                    reasoning_assessment.sections.recommendation?.toLowerCase().includes('base case') ? 'bg-green-50 border-green-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      🎯 Final Recommendation
                    </h4>
                    <p className="text-sm whitespace-pre-wrap">{reasoning_assessment.sections.recommendation}</p>
                  </div>

                  {/* 2. Statistical & Visual Fit */}
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <h4 className="font-semibold mb-2">📊 Statistical & Visual Fit</h4>
                    <p className="text-sm whitespace-pre-wrap">{reasoning_assessment.sections.statistical_visual_fit}</p>
                  </div>

                  {/* 3. Extrapolation & Clinical Plausibility */}
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <h4 className="font-semibold mb-2">🏥 Extrapolation & Clinical Plausibility</h4>
                    <p className="text-sm whitespace-pre-wrap">{reasoning_assessment.sections.clinical_plausibility}</p>
                  </div>

                  {/* 4. Strengths & Weaknesses */}
                  <div className="p-4 rounded-lg border bg-muted/30">
                    <h4 className="font-semibold mb-2">⚖️ Strengths & Weaknesses</h4>
                    <p className="text-sm whitespace-pre-wrap">{reasoning_assessment.sections.strengths_weaknesses}</p>
                  </div>
                </div>
              ) : (
                /* Fallback for old format */
                <div className="max-h-96 overflow-y-auto">
                  <p className="text-sm whitespace-pre-wrap">
                    {reasoning_assessment.assessment_text || reasoning_assessment.full_text || 'Not available'}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SynthesisTab({ analysisId }: { analysisId: string }) {
  const [synthesis, setSynthesis] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div>Loading synthesis...</div>;
  if (!synthesis) return <div>No synthesis report available yet.</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Primary Recommendation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{synthesis.primary_recommendation || 'Not available'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key Uncertainties</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{synthesis.key_uncertainties || 'Not available'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Full Report</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <p className="whitespace-pre-wrap text-sm">{synthesis.full_text}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  if (!phTests) return <div>No PH test results available yet.</div>;

  // Handle diagnostic plots from JSONB field
  const diagnosticPlots = typeof phTests.diagnostic_plots === 'object' && phTests.diagnostic_plots !== null
    ? phTests.diagnostic_plots
    : phTests.test_results?.diagnostic_plots || {};

  const isViolated = phTests.decision === 'separate';

  return (
    <div className="space-y-6">
      {/* 1. Expert Assessment (Top Priority) */}
      <Card className={`border-l-4 ${isViolated ? 'border-l-orange-500' : 'border-l-green-500'}`}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="flex items-center gap-2">
              Expert Assessment
              {isViolated ? (
                <span className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded-full">PH Violated</span>
              ) : (
                <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">PH Valid</span>
              )}
            </CardTitle>
          </div>
          <CardDescription>
            Final decision based on clinical context and visual evidence (overrides statistics)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">Recommended Approach</p>
            <p className="text-2xl font-bold">
              {isViolated ? 'Separate Models' : 'Pooled Model (Standard Cox)'}
            </p>
          </div>

          {phTests.rationale && (
            <div className="p-4 bg-muted/50 rounded-lg border">
              <p className="text-sm font-semibold mb-2 flex items-center gap-2">
                <span className="text-primary">ℹ️</span> Clinical Rationale
              </p>
              <p className="text-base leading-relaxed">{phTests.rationale}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Visual Evidence (Diagnostic Plots) */}
      <div className="space-y-6">
        <h3 className="text-lg font-semibold">Diagnostic Plots</h3>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cumulative Hazard Plot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Cumulative Hazard</CardTitle>
              <CardDescription>
                Visual check for diverging curves (general survival pattern)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {diagnosticPlots.cumulative_hazard ? (
                <img
                  src={`data:image/png;base64,${diagnosticPlots.cumulative_hazard}`}
                  alt="Cumulative Hazard Plot"
                  className="w-full rounded-lg border bg-white"
                />
              ) : (
                <div className="h-64 flex items-center justify-center bg-muted rounded-lg text-muted-foreground">
                  Plot not available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Log-Cumulative Hazard Plot */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Log-Cumulative Hazard</CardTitle>
              <CardDescription>
                Parallel lines = PH holds. Crossing/Converging = PH Violated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {diagnosticPlots.log_cumulative_hazard ? (
                <img
                  src={`data:image/png;base64,${diagnosticPlots.log_cumulative_hazard}`}
                  alt="Log-Cumulative Hazard Plot"
                  className="w-full rounded-lg border bg-white"
                />
              ) : (
                <div className="h-64 flex items-center justify-center bg-muted rounded-lg text-muted-foreground">
                  Plot not available
                </div>
              )}
            </CardContent>
          </Card>

          {/* Schoenfeld Residuals Plot */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-lg">Schoenfeld Residuals</CardTitle>
              <CardDescription>
                Flat line = PH holds. Sloped/Curved = PH Violated.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {diagnosticPlots.schoenfeld_residuals ? (
                <img
                  src={`data:image/png;base64,${diagnosticPlots.schoenfeld_residuals}`}
                  alt="Schoenfeld Residuals Plot"
                  className="w-full rounded-lg border bg-white"
                />
              ) : (
                <div className="h-64 flex items-center justify-center bg-muted rounded-lg text-muted-foreground">
                  Plot not available
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 3. Statistical Details (Secondary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Statistical Test Results</CardTitle>
          <CardDescription>
            Formal statistical tests for proportionality (p &lt; 0.05 indicates violation)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Schoenfeld Test</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-mono font-semibold">
                  p = {phTests.schoenfeld_pvalue ? phTests.schoenfeld_pvalue.toFixed(4) : 'N/A'}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded ${(phTests.schoenfeld_pvalue || 1) < 0.05 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                  {(phTests.schoenfeld_pvalue || 1) < 0.05 ? 'Sig.' : 'Not Sig.'}
                </span>
              </div>
            </div>

            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Time-Dependent Cox</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-mono font-semibold">
                  p = {phTests.chow_test_pvalue ? phTests.chow_test_pvalue.toFixed(4) : 'N/A'}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded ${(phTests.chow_test_pvalue || 1) < 0.05 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                  }`}>
                  {(phTests.chow_test_pvalue || 1) < 0.05 ? 'Sig.' : 'Not Sig.'}
                </span>
              </div>
            </div>

            <div className="p-4 border rounded-lg opacity-75">
              <p className="text-sm text-muted-foreground mb-1">Log-Rank Test</p>
              <div className="flex items-baseline gap-2">
                <p className="text-xl font-mono font-semibold">
                  p = {phTests.logrank_pvalue ? phTests.logrank_pvalue.toFixed(4) : 'N/A'}
                </p>
                <span className="text-xs text-muted-foreground">(Tests survival diff, not PH)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

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
  if (!usage) return <div>No token usage data available.</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Total Usage</CardTitle>
        </CardHeader>
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
        <CardHeader>
          <CardTitle>Usage by Call</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {usage.usage.map((u: any) => (
              <div key={u.id} className="flex justify-between p-2 border rounded">
                <span className="text-sm">{u.model_type}</span>
                <span className="text-sm">
                  {u.tokens_input + u.tokens_output} tokens
                  {u.cost_estimate && ` ($${u.cost_estimate.toFixed(4)})`}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

