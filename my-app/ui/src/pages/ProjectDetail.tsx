import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectsApi, type Project, type Arm, type Endpoint, type DataSource } from '@/lib/projectsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft,
  Plus,
  Trash2,
  Upload,
  FileSpreadsheet,
  Activity,
  Users,
  Target,
  Database,
  PlayCircle,
  Settings,
  CheckCircle2,
  Clock,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const [project, setProject] = useState<Project | null>(null);
  const [arms, setArms] = useState<Arm[]>([]);
  const [endpoints, setEndpoints] = useState<Endpoint[]>([]);
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Form states for adding new items
  const [showAddArm, setShowAddArm] = useState(false);
  const [showAddEndpoint, setShowAddEndpoint] = useState(false);
  const [newArm, setNewArm] = useState({ name: '', arm_type: 'treatment' as const });
  const [newEndpoint, setNewEndpoint] = useState({ endpoint_type: 'OS' as const });

  useEffect(() => {
    if (projectId) {
      loadProject();
    }
  }, [projectId]);

  const loadProject = async () => {
    if (!projectId) return;
    
    try {
      const [projectData, armsData, endpointsData, dataSourcesData] = await Promise.all([
        projectsApi.getProject(projectId),
        projectsApi.listArms(projectId),
        projectsApi.listEndpoints(projectId),
        projectsApi.listDataSources(projectId),
      ]);

      setProject(projectData.project);
      setArms(armsData.arms);
      setEndpoints(endpointsData.endpoints);
      setDataSources(dataSourcesData.data_sources);
    } catch (err: any) {
      console.error('Failed to load project:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddArm = async () => {
    if (!projectId || !newArm.name) return;

    try {
      await projectsApi.createArm(projectId, {
        name: newArm.name,
        arm_type: newArm.arm_type,
      });
      await loadProject();
      setShowAddArm(false);
      setNewArm({ name: '', arm_type: 'treatment' });
    } catch (err) {
      console.error('Failed to add arm:', err);
    }
  };

  const handleDeleteArm = async (armId: string) => {
    if (!projectId || !confirm('Delete this arm?')) return;

    try {
      await projectsApi.deleteArm(projectId, armId);
      await loadProject();
    } catch (err) {
      console.error('Failed to delete arm:', err);
    }
  };

  const handleAddEndpoint = async () => {
    if (!projectId) return;

    try {
      await projectsApi.createEndpoint(projectId, {
        endpoint_type: newEndpoint.endpoint_type,
      });
      await loadProject();
      setShowAddEndpoint(false);
      setNewEndpoint({ endpoint_type: 'OS' });
    } catch (err) {
      console.error('Failed to add endpoint:', err);
    }
  };

  const handleDeleteEndpoint = async (endpointId: string) => {
    if (!projectId || !confirm('Delete this endpoint?')) return;

    try {
      await projectsApi.deleteEndpoint(projectId, endpointId);
      await loadProject();
    } catch (err) {
      console.error('Failed to delete endpoint:', err);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, armId?: string, endpointId?: string) => {
    if (!projectId || !e.target.files?.[0]) return;

    try {
      await projectsApi.uploadDataSource(projectId, e.target.files[0], armId, endpointId);
      await loadProject();
    } catch (err) {
      console.error('Failed to upload file:', err);
    }
  };

  const getArmColor = (armType: string) => {
    switch (armType) {
      case 'treatment': return 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300';
      case 'comparator': return 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300';
      case 'control': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
      default: return 'bg-muted';
    }
  };

  const getEndpointStatusIcon = (status: string) => {
    switch (status) {
      case 'analyzed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'data_ready': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-amber-500" />;
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto p-6">
        <Card className="p-12 text-center">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <Button onClick={() => navigate('/projects')}>Back to Projects</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Button variant="ghost" onClick={() => navigate('/projects')} className="mb-2">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back to Projects
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          {project.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
          <div className="flex gap-2 mt-3">
            <span className={cn(
              "px-2 py-0.5 text-xs rounded-full",
              project.status === 'active' ? 'bg-blue-100 text-blue-700' :
              project.status === 'completed' ? 'bg-green-100 text-green-700' :
              project.status === 'archived' ? 'bg-gray-100 text-gray-700' :
              'bg-amber-100 text-amber-700'
            )}>
              {project.status}
            </span>
            {project.therapeutic_area && (
              <span className="px-2 py-0.5 text-xs rounded-full bg-muted">
                {project.therapeutic_area}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate(`/projects/${projectId}/edit`)}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
          <Button onClick={() => navigate(`/survival-analysis?project=${projectId}`)}>
            <PlayCircle className="h-4 w-4 mr-2" />
            Run Analysis
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview" className="gap-2">
            <Activity className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="arms" className="gap-2">
            <Users className="h-4 w-4" />
            Arms ({arms.length})
          </TabsTrigger>
          <TabsTrigger value="endpoints" className="gap-2">
            <Target className="h-4 w-4" />
            Endpoints ({endpoints.length})
          </TabsTrigger>
          <TabsTrigger value="data" className="gap-2">
            <Database className="h-4 w-4" />
            Data ({dataSources.length})
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Disease/Condition</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {project.disease_condition || 'Not specified'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Intervention</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {project.intervention || 'Not specified'}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-muted-foreground">Comparator</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold">
                  {project.comparator || 'Not specified'}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-950">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{arms.length}</p>
                <p className="text-sm text-muted-foreground">Treatment Arms</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-950">
                <Target className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{endpoints.length}</p>
                <p className="text-sm text-muted-foreground">Endpoints</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-950">
                <Database className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">{dataSources.length}</p>
                <p className="text-sm text-muted-foreground">Data Sources</p>
              </div>
            </Card>
            <Card className="p-4 flex items-center gap-4">
              <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-950">
                <Activity className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {endpoints.filter(e => e.status === 'analyzed').length}
                </p>
                <p className="text-sm text-muted-foreground">Analyzed</p>
              </div>
            </Card>
          </div>
        </TabsContent>

        {/* Arms Tab */}
        <TabsContent value="arms" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Treatment Arms</h3>
            <Button onClick={() => setShowAddArm(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Arm
            </Button>
          </div>

          {showAddArm && (
            <Card className="p-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label>Arm Name</Label>
                  <Input
                    value={newArm.name}
                    onChange={(e) => setNewArm({ ...newArm, name: e.target.value })}
                    placeholder="e.g., Pembrolizumab"
                  />
                </div>
                <div className="w-48">
                  <Label>Type</Label>
                  <select
                    className="w-full p-2 border rounded-lg bg-background"
                    value={newArm.arm_type}
                    onChange={(e) => setNewArm({ ...newArm, arm_type: e.target.value as any })}
                  >
                    <option value="treatment">Treatment</option>
                    <option value="comparator">Comparator</option>
                    <option value="control">Control</option>
                  </select>
                </div>
                <Button onClick={handleAddArm}>Add</Button>
                <Button variant="outline" onClick={() => setShowAddArm(false)}>Cancel</Button>
              </div>
            </Card>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {arms.map((arm) => (
              <Card key={arm.id} className="p-4">
                <div className="flex justify-between items-start">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">{arm.name}</h4>
                      <span className={cn("px-2 py-0.5 text-xs rounded-full", getArmColor(arm.arm_type))}>
                        {arm.arm_type}
                      </span>
                    </div>
                    {arm.drug_name && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {arm.drug_name} {arm.regimen && `(${arm.regimen})`}
                      </p>
                    )}
                    {arm.sample_size && (
                      <p className="text-sm text-muted-foreground">
                        n = {arm.sample_size}
                      </p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => handleDeleteArm(arm.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {arms.length === 0 && !showAddArm && (
            <Card className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No treatment arms defined yet</p>
              <Button className="mt-4" onClick={() => setShowAddArm(true)}>
                Add First Arm
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Endpoints Tab */}
        <TabsContent value="endpoints" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Clinical Endpoints</h3>
            <Button onClick={() => setShowAddEndpoint(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Endpoint
            </Button>
          </div>

          {showAddEndpoint && (
            <Card className="p-4">
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <Label>Endpoint Type</Label>
                  <select
                    className="w-full p-2 border rounded-lg bg-background"
                    value={newEndpoint.endpoint_type}
                    onChange={(e) => setNewEndpoint({ ...newEndpoint, endpoint_type: e.target.value as any })}
                  >
                    <option value="OS">Overall Survival (OS)</option>
                    <option value="PFS">Progression-Free Survival (PFS)</option>
                    <option value="DFS">Disease-Free Survival (DFS)</option>
                    <option value="EFS">Event-Free Survival (EFS)</option>
                    <option value="TTP">Time to Progression (TTP)</option>
                    <option value="ORR">Overall Response Rate (ORR)</option>
                  </select>
                </div>
                <Button onClick={handleAddEndpoint}>Add</Button>
                <Button variant="outline" onClick={() => setShowAddEndpoint(false)}>Cancel</Button>
              </div>
            </Card>
          )}

          <div className="space-y-3">
            {endpoints.map((endpoint) => (
              <Card key={endpoint.id} className="p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    {getEndpointStatusIcon(endpoint.status)}
                    <div>
                      <h4 className="font-semibold">{endpoint.endpoint_type}</h4>
                      <p className="text-sm text-muted-foreground">
                        Time horizon: {endpoint.time_horizon} months
                      </p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      endpoint.status === 'analyzed' ? 'bg-green-100 text-green-700' :
                      endpoint.status === 'data_ready' ? 'bg-blue-100 text-blue-700' :
                      'bg-amber-100 text-amber-700'
                    )}>
                      {endpoint.status}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/survival-analysis?project=${projectId}&endpoint=${endpoint.id}`)}
                    >
                      <PlayCircle className="h-4 w-4 mr-2" />
                      Analyze
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive"
                      onClick={() => handleDeleteEndpoint(endpoint.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {endpoints.length === 0 && !showAddEndpoint && (
            <Card className="p-8 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground">No endpoints defined yet</p>
              <Button className="mt-4" onClick={() => setShowAddEndpoint(true)}>
                Add First Endpoint
              </Button>
            </Card>
          )}
        </TabsContent>

        {/* Data Tab */}
        <TabsContent value="data" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Data Sources</h3>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                onClick={() => navigate(`/digitizer?project=${projectId}`)}
              >
                <Activity className="h-4 w-4 mr-2" />
                Digitize KM Curves
              </Button>
              <input
                type="file"
                id="file-upload"
                className="hidden"
                accept=".parquet,.csv"
                onChange={(e) => handleFileUpload(e)}
              />
              <Button onClick={() => document.getElementById('file-upload')?.click()}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Data
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {dataSources.map((ds) => (
              <Card key={ds.id} className="p-4">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-4">
                    <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
                    <div>
                      <h4 className="font-semibold">{ds.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {ds.source_type} • {ds.original_filename}
                      </p>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 text-xs rounded-full",
                      ds.processing_status === 'ready' ? 'bg-green-100 text-green-700' :
                      ds.processing_status === 'processing' ? 'bg-blue-100 text-blue-700' :
                      ds.processing_status === 'error' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    )}>
                      {ds.processing_status}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={async () => {
                      if (confirm('Delete this data source?')) {
                        await projectsApi.deleteDataSource(projectId!, ds.id);
                        await loadProject();
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>

          {dataSources.length === 0 && (
            <Card className="p-8 text-center">
              <Database className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">No data sources uploaded yet</p>
              <div className="flex gap-2 justify-center">
                <Button onClick={() => document.getElementById('file-upload')?.click()}>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Data File
                </Button>
                <Button variant="outline" onClick={() => navigate(`/digitizer?project=${projectId}`)}>
                  Digitize from Image
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

