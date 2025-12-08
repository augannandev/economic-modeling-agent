import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import { 
  Copy, 
  Check, 
  Download, 
  Code2, 
  FileCode, 
  ChevronDown, 
  ChevronUp,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { 
  generateIPDReconstructionCode, 
  generateModelFittingCode, 
  generatePlottingCode,
  type CodeGeneratorParams 
} from '@/lib/codeGenerators';

interface ReproducibilityTabProps {
  analysisId: string;
  models: Array<{
    id: string;
    arm: string;
    approach: string;
    distribution: string;
    aic: number | null;
    bic: number | null;
    parameters?: Record<string, number>;
  }>;
  armData?: {
    pembro?: { n: number; events: number; maxTime: number };
    chemo?: { n: number; events: number; maxTime: number };
  };
}

interface CodeBlockProps {
  title: string;
  description?: string;
  code: string;
  language: 'r' | 'python' | 'bash';
  defaultExpanded?: boolean;
}

function CodeBlock({ title, description, code, language, defaultExpanded = true }: CodeBlockProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="mb-4">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <FileCode className="h-5 w-5 text-muted-foreground" />
          <div>
            <h4 className="font-medium">{title}</h4>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn(
            "text-xs px-2 py-1 rounded-full",
            language === 'r' && "bg-blue-500/10 text-blue-600",
            language === 'python' && "bg-yellow-500/10 text-yellow-600",
            language === 'bash' && "bg-gray-500/10 text-gray-600"
          )}>
            {language.toUpperCase()}
          </span>
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>
      
      {expanded && (
        <CardContent className="pt-0">
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="absolute top-2 right-2 z-10"
              onClick={(e) => {
                e.stopPropagation();
                handleCopy();
              }}
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 mr-1 text-green-500" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" />
                  Copy
                </>
              )}
            </Button>
            <SyntaxHighlighter
              language={language}
              style={oneDark}
              customStyle={{
                borderRadius: '8px',
                padding: '1rem',
                fontSize: '0.875rem',
                margin: 0,
              }}
              showLineNumbers
            >
              {code}
            </SyntaxHighlighter>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export function ReproducibilityTab({ analysisId, models, armData }: ReproducibilityTabProps) {
  const [activeTab, setActiveTab] = useState('ipd');
  const [downloading, setDownloading] = useState(false);

  // Generate code params from models
  const codeParams: CodeGeneratorParams = {
    distributions: [...new Set(models.map(m => m.distribution))],
    arms: ['pembro', 'chemo'],
    armLabels: { pembro: 'Pembrolizumab', chemo: 'Chemotherapy' },
    armData: armData || {
      pembro: { n: 154, events: 45, maxTime: 18.75 },
      chemo: { n: 151, events: 59, maxTime: 18.5 }
    },
    modelParams: models.reduce((acc, m) => {
      acc[`${m.arm}_${m.distribution}`] = m.parameters || {};
      return acc;
    }, {} as Record<string, Record<string, number>>),
  };

  const handleDownloadAll = async () => {
    setDownloading(true);
    try {
      const response = await fetch(`/api/v1/survival/${analysisId}/code-package`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `survival_analysis_code_${analysisId}.zip`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        // Fallback: create zip client-side
        downloadCodeAsText();
      }
    } catch (error) {
      console.error('Download failed:', error);
      downloadCodeAsText();
    } finally {
      setDownloading(false);
    }
  };

  const downloadCodeAsText = () => {
    const allCode = `# ===================================
# Survival Analysis Reproducibility Code
# Analysis ID: ${analysisId}
# Generated: ${new Date().toISOString()}
# ===================================

# ===================
# IPD RECONSTRUCTION
# ===================
${generateIPDReconstructionCode(codeParams)}

# ===================
# MODEL FITTING
# ===================
${generateModelFittingCode(codeParams)}

# ===================
# PLOTTING
# ===================
${generatePlottingCode(codeParams)}
`;
    
    const blob = new Blob([allCode], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `survival_analysis_code_${analysisId}.R`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Reproducibility & Methodology
              </CardTitle>
              <CardDescription className="mt-2">
                View and download the statistical code used in this analysis for HTA transparency and reproducibility.
              </CardDescription>
            </div>
            <Button onClick={handleDownloadAll} disabled={downloading}>
              <Download className="h-4 w-4 mr-2" />
              {downloading ? 'Preparing...' : 'Download All Code'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 text-sm">
            <a 
              href="https://cran.r-project.org/web/packages/IPDfromKM/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              IPDfromKM (CRAN)
            </a>
            <a 
              href="https://cran.r-project.org/web/packages/flexsurv/index.html"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              flexsurv (CRAN)
            </a>
            <a 
              href="https://pubmed.ncbi.nlm.nih.gov/22763916/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-primary hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Guyot et al. (2012)
            </a>
          </div>
        </CardContent>
      </Card>

      {/* Code Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="ipd">IPD Reconstruction</TabsTrigger>
          <TabsTrigger value="fitting">Model Fitting</TabsTrigger>
          <TabsTrigger value="plots">Plotting</TabsTrigger>
        </TabsList>

        <TabsContent value="ipd" className="mt-4">
          <div className="space-y-4">
            <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
              <h3 className="font-medium text-blue-700 dark:text-blue-300 mb-2">
                IPD Reconstruction Methodology
              </h3>
              <p className="text-sm text-muted-foreground">
                Individual Patient Data (IPD) was reconstructed from published Kaplan-Meier curves 
                using the algorithm described by Guyot et al. (2012). This approach uses digitized 
                survival coordinates and at-risk tables to estimate individual event times.
              </p>
            </div>

            <CodeBlock
              title="R Implementation (Recommended)"
              description="Using the IPDfromKM package - peer-reviewed and well-documented"
              code={generateIPDReconstructionCode(codeParams)}
              language="r"
            />

            <CodeBlock
              title="Python Alternative"
              description="Custom implementation of Guyot algorithm"
              code={`# Python IPD Reconstruction (Alternative)
# Based on Guyot et al. (2012) algorithm

import pandas as pd
import numpy as np
from scipy.interpolate import interp1d

def reconstruct_ipd(km_data, risk_table, total_events):
    """
    Reconstruct IPD from KM curve and risk table.
    
    Parameters:
    -----------
    km_data : DataFrame with columns ['time', 'survival']
    risk_table : DataFrame with columns ['time', 'at_risk']
    total_events : int, total number of events
    
    Returns:
    --------
    DataFrame with columns ['time', 'event']
    """
    # Sort by time
    km_data = km_data.sort_values('time').reset_index(drop=True)
    risk_table = risk_table.sort_values('time').reset_index(drop=True)
    
    # Interpolate at-risk numbers to KM times
    f_nrisk = interp1d(
        risk_table['time'], 
        risk_table['at_risk'],
        kind='previous',
        fill_value='extrapolate'
    )
    
    n_intervals = len(km_data) - 1
    ipd_records = []
    
    for i in range(n_intervals):
        t1, t2 = km_data['time'].iloc[i], km_data['time'].iloc[i+1]
        s1, s2 = km_data['survival'].iloc[i], km_data['survival'].iloc[i+1]
        
        n_risk = f_nrisk(t1)
        
        # Estimate events and censoring in interval
        if s1 > 0 and s2 > 0:
            d = n_risk * (1 - s2/s1)  # Events
            c = n_risk - d - f_nrisk(t2)  # Censored
            
            # Add event records
            for _ in range(int(round(d))):
                ipd_records.append({'time': (t1 + t2) / 2, 'event': 1})
            
            # Add censored records
            for _ in range(int(round(max(0, c)))):
                ipd_records.append({'time': (t1 + t2) / 2, 'event': 0})
    
    return pd.DataFrame(ipd_records)

# Example usage:
# ipd = reconstruct_ipd(km_digitized, risk_table, total_events=45)`}
              language="python"
              defaultExpanded={false}
            />
          </div>
        </TabsContent>

        <TabsContent value="fitting" className="mt-4">
          <div className="space-y-4">
            <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500/20">
              <h3 className="font-medium text-purple-700 dark:text-purple-300 mb-2">
                Parametric Model Fitting
              </h3>
              <p className="text-sm text-muted-foreground">
                Models were fitted using the flexsurv package in R, which implements maximum likelihood 
                estimation for parametric survival distributions. AIC and BIC were used for model comparison.
              </p>
            </div>

            <CodeBlock
              title="Model Fitting Code"
              description="R code using flexsurv for all distributions"
              code={generateModelFittingCode(codeParams)}
              language="r"
            />

            <CodeBlock
              title="Distribution Functions Reference"
              description="Mathematical definitions of fitted distributions"
              code={`# Survival Distribution Formulas
# ==============================

# 1. EXPONENTIAL
# S(t) = exp(-λt)
# Hazard: h(t) = λ (constant)

# 2. WEIBULL
# S(t) = exp(-(t/λ)^k)
# Hazard: h(t) = (k/λ)(t/λ)^(k-1)
# k > 1: increasing hazard
# k < 1: decreasing hazard
# k = 1: exponential (constant)

# 3. LOG-NORMAL
# S(t) = 1 - Φ((log(t) - μ) / σ)
# Hazard: non-monotonic (increases then decreases)

# 4. LOG-LOGISTIC
# S(t) = 1 / (1 + (t/α)^β)
# Hazard: non-monotonic if β > 1

# 5. GOMPERTZ
# S(t) = exp((b/a)(1 - exp(at)))
# Hazard: h(t) = b * exp(at)
# Always increasing hazard

# 6. GENERALIZED GAMMA
# Flexible 3-parameter distribution
# Includes Weibull, log-normal, gamma as special cases`}
              language="r"
              defaultExpanded={false}
            />
          </div>
        </TabsContent>

        <TabsContent value="plots" className="mt-4">
          <div className="space-y-4">
            <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
              <h3 className="font-medium text-green-700 dark:text-green-300 mb-2">
                Visualization Code
              </h3>
              <p className="text-sm text-muted-foreground">
                Code for generating Kaplan-Meier curves with parametric model overlays 
                for both short-term fit assessment and long-term extrapolation.
              </p>
            </div>

            <CodeBlock
              title="Plotting Code"
              description="R code for KM curves and model overlays"
              code={generatePlottingCode(codeParams)}
              language="r"
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

