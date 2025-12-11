import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi } from '@/lib/projectsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, 
  ChevronRight, 
  Check,
  FolderPlus,
  Beaker,
  Target,
  Loader2
} from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  { id: 'basic', title: 'Basic Info', icon: FolderPlus },
  { id: 'clinical', title: 'Clinical Details', icon: Beaker },
  { id: 'endpoints', title: 'Endpoints', icon: Target },
];

const THERAPEUTIC_AREAS = [
  'Oncology',
  'Cardiology',
  'Neurology',
  'Immunology',
  'Infectious Disease',
  'Respiratory',
  'Endocrinology',
  'Rheumatology',
  'Dermatology',
  'Gastroenterology',
  'Hematology',
  'Other',
];

const ENDPOINT_TYPES = [
  { value: 'OS', label: 'Overall Survival (OS)', description: 'Time from randomization to death from any cause' },
  { value: 'PFS', label: 'Progression-Free Survival (PFS)', description: 'Time from randomization to disease progression or death' },
  { value: 'DFS', label: 'Disease-Free Survival (DFS)', description: 'Time from treatment to disease recurrence' },
  { value: 'EFS', label: 'Event-Free Survival (EFS)', description: 'Time to any defined event' },
  { value: 'TTP', label: 'Time to Progression (TTP)', description: 'Time from randomization to disease progression' },
  { value: 'ORR', label: 'Overall Response Rate (ORR)', description: 'Proportion of patients with tumor response' },
];

export function ProjectCreate() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    therapeutic_area: '',
    disease_condition: '',
    population: '',
    nct_id: '',
    intervention: '',
    comparator: '',
    endpoints: [] as string[],
  });

  const updateFormData = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleEndpoint = (endpoint: string) => {
    setFormData((prev) => ({
      ...prev,
      endpoints: prev.endpoints.includes(endpoint)
        ? prev.endpoints.filter((e) => e !== endpoint)
        : [...prev.endpoints, endpoint],
    }));
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0:
        return formData.name.trim().length > 0;
      case 1:
        return true; // Optional step
      case 2:
        return formData.endpoints.length > 0;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);

    try {
      // Create project
      const { project } = await projectsApi.createProject({
        name: formData.name,
        description: formData.description || undefined,
        therapeutic_area: formData.therapeutic_area || undefined,
        disease_condition: formData.disease_condition || undefined,
        population: formData.population || undefined,
        nct_id: formData.nct_id || undefined,
        intervention: formData.intervention || undefined,
        comparator: formData.comparator || undefined,
      });

      // Create endpoints
      for (const endpointType of formData.endpoints) {
        await projectsApi.createEndpoint(project.id, {
          endpoint_type: endpointType as any,
        });
      }

      // Create default arms if intervention/comparator specified
      if (formData.intervention) {
        await projectsApi.createArm(project.id, {
          name: formData.intervention,
          arm_type: 'treatment',
          label: formData.intervention.substring(0, 10),
        });
      }
      if (formData.comparator) {
        await projectsApi.createArm(project.id, {
          name: formData.comparator,
          arm_type: 'comparator',
          label: formData.comparator.substring(0, 10),
        });
      }

      // Navigate to project detail
      navigate(`/projects/${project.id}`);
    } catch (err: any) {
      console.error('Project creation error:', err);
      const errorMsg = err?.message || err?.error || 'Failed to create project';
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <Button variant="ghost" onClick={() => navigate('/projects')} className="mb-4">
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back to Projects
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Create New Project</h1>
        <p className="text-muted-foreground mt-1">
          Set up your economic modeling project step by step
        </p>
      </div>

      {/* Progress Steps */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {STEPS.map((step, idx) => {
            const isComplete = idx < currentStep;
            const isCurrent = idx === currentStep;
            const Icon = step.icon;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all",
                      isComplete && "bg-primary border-primary text-primary-foreground",
                      isCurrent && "border-primary text-primary",
                      !isComplete && !isCurrent && "border-muted text-muted-foreground"
                    )}
                  >
                    {isComplete ? (
                      <Check className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "text-sm mt-2 font-medium",
                      (isComplete || isCurrent) ? "text-foreground" : "text-muted-foreground"
                    )}
                  >
                    {step.title}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-4",
                      isComplete ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <Card>
        <CardHeader>
          <CardTitle>{STEPS[currentStep].title}</CardTitle>
          <CardDescription>
            {currentStep === 0 && 'Enter the basic information for your project'}
            {currentStep === 1 && 'Specify the clinical context for your analysis'}
            {currentStep === 2 && 'Select the endpoints you want to analyze'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Step 1: Basic Info */}
          {currentStep === 0 && (
            <>
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => updateFormData('name', e.target.value)}
                  placeholder="e.g., KEYNOTE-024 Survival Analysis"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <textarea
                  id="description"
                  className="w-full p-3 border rounded-lg resize-none focus:ring-2 focus:ring-primary/20 focus:border-primary min-h-[100px]"
                  value={formData.description}
                  onChange={(e) => updateFormData('description', e.target.value)}
                  placeholder="Brief description of the project objectives..."
                />
              </div>
            </>
          )}

          {/* Step 2: Clinical Details */}
          {currentStep === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="therapeutic_area">Therapeutic Area</Label>
                  <select
                    id="therapeutic_area"
                    className="w-full p-2 border rounded-lg bg-background"
                    value={formData.therapeutic_area}
                    onChange={(e) => updateFormData('therapeutic_area', e.target.value)}
                  >
                    <option value="">Select therapeutic area...</option>
                    {THERAPEUTIC_AREAS.map((area) => (
                      <option key={area} value={area}>{area}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nct_id">NCT ID</Label>
                  <Input
                    id="nct_id"
                    value={formData.nct_id}
                    onChange={(e) => updateFormData('nct_id', e.target.value)}
                    placeholder="e.g., NCT02142738"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="disease_condition">Disease / Condition</Label>
                <Input
                  id="disease_condition"
                  value={formData.disease_condition}
                  onChange={(e) => updateFormData('disease_condition', e.target.value)}
                  placeholder="e.g., Advanced NSCLC with PD-L1 ≥50%"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="population">Population</Label>
                <Input
                  id="population"
                  value={formData.population}
                  onChange={(e) => updateFormData('population', e.target.value)}
                  placeholder="e.g., PD-L1 TPS ≥50%, ECOG PS 0-1, treatment-naïve"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="intervention">Intervention (Treatment)</Label>
                  <Input
                    id="intervention"
                    value={formData.intervention}
                    onChange={(e) => updateFormData('intervention', e.target.value)}
                    placeholder="e.g., Pembrolizumab"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="comparator">Comparator</Label>
                  <Input
                    id="comparator"
                    value={formData.comparator}
                    onChange={(e) => updateFormData('comparator', e.target.value)}
                    placeholder="e.g., Platinum-based chemotherapy"
                  />
                </div>
              </div>
            </>
          )}

          {/* Step 3: Endpoints */}
          {currentStep === 2 && (
            <div className="space-y-3">
              {ENDPOINT_TYPES.map((endpoint) => {
                const isSelected = formData.endpoints.includes(endpoint.value);
                return (
                  <div
                    key={endpoint.value}
                    className={cn(
                      "p-4 border rounded-lg cursor-pointer transition-all",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "hover:border-primary/50"
                    )}
                    onClick={() => toggleEndpoint(endpoint.value)}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          "w-5 h-5 rounded border-2 flex items-center justify-center mt-0.5",
                          isSelected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground"
                        )}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </div>
                      <div>
                        <p className="font-medium">{endpoint.label}</p>
                        <p className="text-sm text-muted-foreground">
                          {endpoint.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Error Display */}
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive">
              {error}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={handleBack}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            
            {currentStep < STEPS.length - 1 ? (
              <Button onClick={handleNext} disabled={!canProceed()}>
                Next
                <ChevronRight className="h-4 w-4 ml-2" />
              </Button>
            ) : (
              <Button onClick={handleSubmit} disabled={!canProceed() || loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Create Project
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

