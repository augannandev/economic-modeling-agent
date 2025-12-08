import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompactMarkdown } from '@/components/ui/markdown';
import { ModelSelector } from './ModelSelector';
import { 
  CheckCircle2, 
  AlertTriangle, 
  ChevronDown, 
  ChevronUp,
  ThumbsUp,
  ThumbsDown,
  Edit3
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModelRecommendation {
  arm: string;
  recommended_model: string;
  recommended_approach: string;
  model_id: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    model_id: string;
    model_name: string;
    approach: string;
    score: number;
  }>;
}

interface Model {
  id: string;
  arm: string;
  approach: string;
  distribution: string;
  aic: number | null;
  bic: number | null;
  vision_score?: number;
  reasoning_summary?: string;
}

interface FinalDecisionPanelProps {
  analysisId: string;
  recommendations: ModelRecommendation[];
  allModels: Model[];
  onApprove: (decisions: UserDecision[]) => Promise<void>;
  isSubmitting?: boolean;
}

interface UserDecision {
  arm: string;
  approved: boolean;
  selected_model_id: string;
  selected_model_name: string;
  selected_approach: string;
  rationale: string;
}

export function FinalDecisionPanel({
  analysisId,
  recommendations,
  allModels,
  onApprove,
  isSubmitting = false,
}: FinalDecisionPanelProps) {
  // Suppress unused variable warning - reserved for future use
  void analysisId;
  const [decisions, setDecisions] = useState<Record<string, UserDecision>>(() => {
    const initial: Record<string, UserDecision> = {};
    recommendations.forEach((rec) => {
      initial[rec.arm] = {
        arm: rec.arm,
        approved: true,
        selected_model_id: rec.model_id,
        selected_model_name: rec.recommended_model,
        selected_approach: rec.recommended_approach,
        rationale: '',
      };
    });
    return initial;
  });

  const [expandedArm, setExpandedArm] = useState<string | null>(
    recommendations[0]?.arm || null
  );
  const [showAlternatives, setShowAlternatives] = useState<Record<string, boolean>>({});
  const [justApproved, setJustApproved] = useState<Record<string, boolean>>({});

  const handleApprove = (arm: string) => {
    const rec = recommendations.find((r) => r.arm === arm);
    if (!rec) return;

    setDecisions((prev) => ({
      ...prev,
      [arm]: {
        ...prev[arm],
        approved: true,
        selected_model_id: rec.model_id,
        selected_model_name: rec.recommended_model,
        selected_approach: rec.recommended_approach,
      },
    }));
    
    // Show visual feedback
    setJustApproved((prev) => ({ ...prev, [arm]: true }));
    setTimeout(() => {
      setJustApproved((prev) => ({ ...prev, [arm]: false }));
    }, 2000);
  };

  const handleOverride = (arm: string, model: Model) => {
    setDecisions((prev) => ({
      ...prev,
      [arm]: {
        ...prev[arm],
        approved: false,
        selected_model_id: model.id,
        selected_model_name: model.distribution,
        selected_approach: model.approach,
      },
    }));
  };

  const handleRationaleChange = (arm: string, rationale: string) => {
    setDecisions((prev) => ({
      ...prev,
      [arm]: {
        ...prev[arm],
        rationale,
      },
    }));
  };

  const handleSubmit = async () => {
    const decisionArray = Object.values(decisions);
    await onApprove(decisionArray);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-amber-600';
    return 'text-red-600';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold">Final Model Selection</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Review the agent's recommendations and approve or select alternative models
          </p>
        </div>
        <Button 
          onClick={handleSubmit} 
          disabled={isSubmitting}
          size="lg"
        >
          {isSubmitting ? 'Submitting...' : 'Confirm Selections'}
        </Button>
      </div>

      <Tabs value={expandedArm || undefined} onValueChange={setExpandedArm}>
        <TabsList className="mb-4">
          {recommendations.map((rec) => (
            <TabsTrigger key={rec.arm} value={rec.arm} className="gap-2">
              {rec.arm}
              {decisions[rec.arm]?.approved ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Edit3 className="h-4 w-4 text-amber-600" />
              )}
            </TabsTrigger>
          ))}
        </TabsList>

        {recommendations.map((rec) => (
          <TabsContent key={rec.arm} value={rec.arm} className="space-y-4">
            {/* Agent Recommendation */}
            <Card className="p-4 border-2 border-primary/20 bg-primary/5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-primary">
                      Agent Recommendation
                    </span>
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      getConfidenceColor(rec.confidence),
                      "bg-current/10"
                    )}>
                      {getConfidenceLabel(rec.confidence)} Confidence ({Math.round(rec.confidence * 100)}%)
                    </span>
                  </div>
                  
                  <h3 className="text-lg font-semibold">
                    {rec.recommended_model}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Approach: {rec.recommended_approach}
                  </p>
                  
                  <div className="mt-3">
                    <CompactMarkdown content={rec.reasoning} />
                  </div>
                </div>
                
                <div className="flex gap-2 ml-4">
                  <Button
                    variant={decisions[rec.arm]?.approved ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => handleApprove(rec.arm)}
                    className={cn(
                      "gap-1 transition-all",
                      decisions[rec.arm]?.approved && "bg-green-600 hover:bg-green-700",
                      justApproved[rec.arm] && "ring-2 ring-green-400 ring-offset-2"
                    )}
                  >
                    {decisions[rec.arm]?.approved ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        {justApproved[rec.arm] ? 'Approved!' : 'Approved'}
                      </>
                    ) : (
                      <>
                        <ThumbsUp className="h-4 w-4" />
                        Approve
                      </>
                    )}
                  </Button>
                  <Button
                    variant={!decisions[rec.arm]?.approved ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setShowAlternatives((prev) => ({ ...prev, [rec.arm]: true }))}
                    className="gap-1"
                  >
                    <ThumbsDown className="h-4 w-4" />
                    Override
                  </Button>
                </div>
              </div>
            </Card>

            {/* Current Selection (if overridden) */}
            {!decisions[rec.arm]?.approved && (
              <Card className="p-4 border-2 border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  <span className="text-sm font-medium text-amber-600">
                    Your Selection (Override)
                  </span>
                </div>
                <h3 className="text-lg font-semibold">
                  {decisions[rec.arm]?.selected_model_name}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Approach: {decisions[rec.arm]?.selected_approach}
                </p>
              </Card>
            )}

            {/* Rationale Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Decision Rationale {!decisions[rec.arm]?.approved && '(Required for override)'}
              </label>
              <textarea
                className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                rows={3}
                placeholder={
                  decisions[rec.arm]?.approved
                    ? 'Optional: Add notes about why you approve this recommendation...'
                    : 'Required: Explain why you selected a different model...'
                }
                value={decisions[rec.arm]?.rationale || ''}
                onChange={(e) => handleRationaleChange(rec.arm, e.target.value)}
              />
            </div>

            {/* Alternative Models */}
            <div>
              <Button
                variant="ghost"
                className="w-full justify-between"
                onClick={() => setShowAlternatives((prev) => ({ 
                  ...prev, 
                  [rec.arm]: !prev[rec.arm] 
                }))}
              >
                <span>View All Models for {rec.arm}</span>
                {showAlternatives[rec.arm] ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
              
              {showAlternatives[rec.arm] && (
                <div className="mt-4">
                  <ModelSelector
                    models={allModels.filter((m) => m.arm === rec.arm)}
                    selectedModelId={decisions[rec.arm]?.selected_model_id}
                    onSelect={(model) => handleOverride(rec.arm, model)}
                    recommendedModelId={rec.model_id}
                  />
                </div>
              )}
            </div>
          </TabsContent>
        ))}
      </Tabs>
    </Card>
  );
}

