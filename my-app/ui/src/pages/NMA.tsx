import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Network, 
  Plus,
  BarChart3,
  Table2,
  Settings,
  Play,
  Download,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Treatment {
  id: string;
  name: string;
  color: string;
}

interface Comparison {
  treatment1: string;
  treatment2: string;
  studies: number;
  isDirect: boolean;
}

// Mock data
const MOCK_TREATMENTS: Treatment[] = [
  { id: '1', name: 'Pembrolizumab', color: '#3b82f6' },
  { id: '2', name: 'Nivolumab', color: '#8b5cf6' },
  { id: '3', name: 'Atezolizumab', color: '#10b981' },
  { id: '4', name: 'Docetaxel', color: '#f59e0b' },
  { id: '5', name: 'Platinum Chemo', color: '#ef4444' },
];

const MOCK_COMPARISONS: Comparison[] = [
  { treatment1: 'Pembrolizumab', treatment2: 'Platinum Chemo', studies: 3, isDirect: true },
  { treatment1: 'Nivolumab', treatment2: 'Docetaxel', studies: 2, isDirect: true },
  { treatment1: 'Atezolizumab', treatment2: 'Docetaxel', studies: 2, isDirect: true },
  { treatment1: 'Docetaxel', treatment2: 'Platinum Chemo', studies: 4, isDirect: true },
  { treatment1: 'Pembrolizumab', treatment2: 'Nivolumab', studies: 0, isDirect: false },
];

export function NMA() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('network');
  const [isRunning, setIsRunning] = useState(false);
  const [hasResults, setHasResults] = useState(false);

  const handleRunNMA = async () => {
    setIsRunning(true);
    await new Promise((resolve) => setTimeout(resolve, 3000));
    setIsRunning(false);
    setHasResults(true);
    setActiveTab('results');
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Network Meta-Analysis</h1>
          <p className="text-muted-foreground mt-1">
            Compare multiple treatments using direct and indirect evidence
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <Settings className="h-4 w-4 mr-2" />
            Configure
          </Button>
          <Button onClick={handleRunNMA} disabled={isRunning} className="gap-2">
            {isRunning ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run NMA
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
              <Network className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{MOCK_TREATMENTS.length}</p>
              <p className="text-xs text-muted-foreground">Treatments</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
              <BarChart3 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {MOCK_COMPARISONS.filter((c) => c.isDirect).length}
              </p>
              <p className="text-xs text-muted-foreground">Direct Comparisons</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-950 rounded-lg">
              <Table2 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">
                {MOCK_COMPARISONS.reduce((acc, c) => acc + c.studies, 0)}
              </p>
              <p className="text-xs text-muted-foreground">Studies</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={cn(
              "p-2 rounded-lg",
              hasResults ? "bg-green-100 dark:bg-green-950" : "bg-amber-100 dark:bg-amber-950"
            )}>
              {hasResults ? (
                <BarChart3 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              )}
            </div>
            <div>
              <p className="text-2xl font-bold">{hasResults ? 'Ready' : 'Pending'}</p>
              <p className="text-xs text-muted-foreground">Status</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader>
            <TabsList>
              <TabsTrigger value="network" className="gap-2">
                <Network className="h-4 w-4" />
                Network
              </TabsTrigger>
              <TabsTrigger value="data" className="gap-2">
                <Table2 className="h-4 w-4" />
                Data
              </TabsTrigger>
              <TabsTrigger value="results" className="gap-2" disabled={!hasResults}>
                <BarChart3 className="h-4 w-4" />
                Results
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent>
            {/* Network Tab */}
            <TabsContent value="network">
              <div className="border rounded-lg p-4 bg-white dark:bg-gray-950">
                {/* Network Visualization */}
                <svg width="100%" height="400" viewBox="0 0 600 400">
                  {/* Draw edges */}
                  {MOCK_COMPARISONS.filter((c) => c.isDirect).map((comp, i) => {
                    const t1 = MOCK_TREATMENTS.find((t) => t.name === comp.treatment1);
                    const t2 = MOCK_TREATMENTS.find((t) => t.name === comp.treatment2);
                    if (!t1 || !t2) return null;
                    
                    const t1Idx = MOCK_TREATMENTS.indexOf(t1);
                    const t2Idx = MOCK_TREATMENTS.indexOf(t2);
                    const angle1 = (t1Idx * 2 * Math.PI) / MOCK_TREATMENTS.length - Math.PI / 2;
                    const angle2 = (t2Idx * 2 * Math.PI) / MOCK_TREATMENTS.length - Math.PI / 2;
                    const r = 150;
                    const cx = 300, cy = 200;
                    
                    return (
                      <line
                        key={i}
                        x1={cx + r * Math.cos(angle1)}
                        y1={cy + r * Math.sin(angle1)}
                        x2={cx + r * Math.cos(angle2)}
                        y2={cy + r * Math.sin(angle2)}
                        stroke="#94a3b8"
                        strokeWidth={Math.max(1, comp.studies)}
                        opacity={0.5}
                      />
                    );
                  })}
                  
                  {/* Draw nodes */}
                  {MOCK_TREATMENTS.map((treatment, i) => {
                    const angle = (i * 2 * Math.PI) / MOCK_TREATMENTS.length - Math.PI / 2;
                    const r = 150;
                    const cx = 300, cy = 200;
                    const x = cx + r * Math.cos(angle);
                    const y = cy + r * Math.sin(angle);
                    
                    return (
                      <g key={treatment.id}>
                        <circle
                          cx={x}
                          cy={y}
                          r={30}
                          fill={treatment.color}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                        />
                        <text
                          x={x}
                          y={y + 50}
                          textAnchor="middle"
                          className="text-xs fill-gray-600 dark:fill-gray-300"
                        >
                          {treatment.name}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                <div className="flex justify-center gap-4 mt-4 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-1 bg-gray-400" />
                    <span>Direct comparison (width = # studies)</span>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Data Tab */}
            <TabsContent value="data">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Comparisons</h3>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Comparison
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="px-4 py-2 text-left text-sm font-medium">Treatment 1</th>
                        <th className="px-4 py-2 text-left text-sm font-medium">Treatment 2</th>
                        <th className="px-4 py-2 text-left text-sm font-medium">Studies</th>
                        <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {MOCK_COMPARISONS.map((comp, i) => (
                        <tr key={i} className="border-t">
                          <td className="px-4 py-2 text-sm">{comp.treatment1}</td>
                          <td className="px-4 py-2 text-sm">{comp.treatment2}</td>
                          <td className="px-4 py-2 text-sm">{comp.studies}</td>
                          <td className="px-4 py-2">
                            <span className={cn(
                              "px-2 py-0.5 text-xs rounded-full",
                              comp.isDirect
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-700"
                            )}>
                              {comp.isDirect ? 'Direct' : 'Indirect'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results">
              {hasResults ? (
                <div className="space-y-6">
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-2" />
                      Export Results
                    </Button>
                  </div>

                  {/* Forest Plot Placeholder */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Forest Plot - Overall Survival</CardTitle>
                      <CardDescription>
                        Hazard ratios with 95% credible intervals vs. Platinum Chemotherapy
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {MOCK_TREATMENTS.filter((t) => t.name !== 'Platinum Chemo').map((treatment) => {
                          const hr = 0.5 + Math.random() * 0.6;
                          const lower = hr * 0.7;
                          const upper = hr * 1.4;
                          
                          return (
                            <div key={treatment.id} className="flex items-center gap-4">
                              <span className="w-32 text-sm">{treatment.name}</span>
                              <div className="flex-1 relative h-6">
                                {/* CI line */}
                                <div
                                  className="absolute top-1/2 h-0.5 bg-gray-400"
                                  style={{
                                    left: `${lower * 50}%`,
                                    width: `${(upper - lower) * 50}%`,
                                    transform: 'translateY(-50%)',
                                  }}
                                />
                                {/* Point estimate */}
                                <div
                                  className="absolute top-1/2 w-3 h-3 rounded-full"
                                  style={{
                                    left: `${hr * 50}%`,
                                    transform: 'translate(-50%, -50%)',
                                    backgroundColor: treatment.color,
                                  }}
                                />
                                {/* Reference line */}
                                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gray-300" />
                              </div>
                              <span className="w-32 text-sm text-right">
                                {hr.toFixed(2)} ({lower.toFixed(2)}-{upper.toFixed(2)})
                              </span>
                            </div>
                          );
                        })}
                        
                        {/* X-axis */}
                        <div className="flex items-center gap-4 pt-2 border-t">
                          <span className="w-32" />
                          <div className="flex-1 flex justify-between text-xs text-muted-foreground">
                            <span>Favors Treatment</span>
                            <span>HR = 1.0</span>
                            <span>Favors Comparator</span>
                          </div>
                          <span className="w-32" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* SUCRA Ranking */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Treatment Ranking (SUCRA)</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {MOCK_TREATMENTS.sort(() => Math.random() - 0.5).map((treatment, i) => {
                          const sucra = 95 - i * 15 + Math.random() * 10;
                          return (
                            <div key={treatment.id} className="flex items-center gap-4">
                              <span className="w-8 text-sm font-medium">#{i + 1}</span>
                              <span className="w-32 text-sm">{treatment.name}</span>
                              <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${sucra}%`,
                                    backgroundColor: treatment.color,
                                  }}
                                />
                              </div>
                              <span className="w-16 text-sm text-right">{sucra.toFixed(1)}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : (
                <div className="text-center py-12 text-muted-foreground">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="mb-4">Run the NMA to see results</p>
                  <Button onClick={handleRunNMA}>Run Analysis</Button>
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

