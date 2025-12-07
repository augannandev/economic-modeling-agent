import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth-context';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { survivalApi, type Analysis } from '@/lib/survivalApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Plus, 
  FolderOpen, 
  Activity, 
  Clock, 
  CheckCircle2,
  ChevronRight,
  TrendingUp,
  FileSpreadsheet,
  Target,
  Zap,
  ArrowRight
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentAnalyses, setRecentAnalyses] = useState<Analysis[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [projectsData, analysesData] = await Promise.all([
        projectsApi.listProjects().catch(() => ({ projects: [] })),
        survivalApi.listAnalyses().catch(() => ({ analyses: [] })),
      ]);
      
      setProjects(projectsData.projects);
      setRecentAnalyses(analysesData.analyses.slice(0, 5));
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = {
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === 'active').length,
    completedAnalyses: recentAnalyses.filter(a => a.status === 'completed').length,
    runningAnalyses: recentAnalyses.filter(a => a.status === 'running').length,
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'text-green-600';
      case 'running': return 'text-blue-600';
      case 'failed': return 'text-red-600';
      default: return 'text-amber-600';
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome back{user?.displayName ? `, ${user.displayName}` : ''}
          </h1>
          <p className="text-muted-foreground mt-1">
            Your economic modeling dashboard
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => navigate('/projects')}>
            <FolderOpen className="h-4 w-4 mr-2" />
            View Projects
          </Button>
          <Button onClick={() => navigate('/projects/new')}>
            <Plus className="h-4 w-4 mr-2" />
            New Project
          </Button>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-blue-500/20 to-transparent rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.totalProjects}</span>
              <FolderOpen className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-green-500/20 to-transparent rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.activeProjects}</span>
              <Activity className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-purple-500/20 to-transparent rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed Analyses</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.completedAnalyses}</span>
              <CheckCircle2 className="h-8 w-8 text-purple-500/50" />
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden">
          <div className="absolute right-0 top-0 w-24 h-24 bg-gradient-to-br from-amber-500/20 to-transparent rounded-bl-full" />
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Running Now</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <span className="text-3xl font-bold">{stats.runningAnalyses}</span>
              <Clock className="h-8 w-8 text-amber-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Quick Actions */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-amber-500" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button 
              variant="outline" 
              className="w-full justify-between group"
              onClick={() => navigate('/projects/new')}
            >
              <span className="flex items-center gap-2">
                <Plus className="h-4 w-4" />
                Create New Project
              </span>
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between group"
              onClick={() => navigate('/survival-analysis')}
            >
              <span className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Run Survival Analysis
              </span>
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between group"
              onClick={() => navigate('/digitizer')}
            >
              <span className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4" />
                Digitize KM Curve
              </span>
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
            <Button 
              variant="outline" 
              className="w-full justify-between group"
              onClick={() => navigate('/slr')}
            >
              <span className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Literature Review
              </span>
              <ArrowRight className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity" />
            </Button>
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Recent Projects</CardTitle>
              <CardDescription>Your latest economic modeling projects</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/projects')}>
              View All
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </CardHeader>
          <CardContent>
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground mb-4">No projects yet</p>
                <Button onClick={() => navigate('/projects/new')}>
                  Create Your First Project
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {projects.slice(0, 4).map((project) => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/projects/${project.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-2 h-2 rounded-full",
                        project.status === 'active' ? 'bg-green-500' :
                        project.status === 'completed' ? 'bg-blue-500' :
                        'bg-amber-500'
                      )} />
                      <div>
                        <p className="font-medium">{project.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {project.therapeutic_area || 'No therapeutic area'} • {project.status}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Analyses */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent Survival Analyses</CardTitle>
            <CardDescription>Latest analysis runs across all projects</CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/survival-analysis')}>
            View All
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </CardHeader>
        <CardContent>
          {recentAnalyses.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <p className="text-muted-foreground mb-4">No analyses yet</p>
              <Button onClick={() => navigate('/survival-analysis')}>
                Start Your First Analysis
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground border-b">
                    <th className="pb-2 font-medium">Analysis ID</th>
                    <th className="pb-2 font-medium">Endpoint</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 font-medium">Progress</th>
                    <th className="pb-2 font-medium">Created</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {recentAnalyses.map((analysis) => (
                    <tr 
                      key={analysis.id} 
                      className="border-b last:border-0 hover:bg-muted/50 cursor-pointer"
                      onClick={() => navigate('/survival-analysis')}
                    >
                      <td className="py-3 font-mono text-sm">
                        {analysis.id.substring(0, 8)}...
                      </td>
                      <td className="py-3">
                        <span className={cn(
                          "px-2 py-0.5 text-xs rounded-full",
                          analysis.parameters?.endpointType === 'PFS'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-blue-100 text-blue-700'
                        )}>
                          {analysis.parameters?.endpointType || 'OS'}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={cn("capitalize", getStatusColor(analysis.status))}>
                          {analysis.status}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-2 bg-muted rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all"
                              style={{ width: `${(analysis.progress / analysis.total_models) * 100}%` }}
                            />
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {analysis.progress}/{analysis.total_models}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-sm text-muted-foreground">
                        {new Date(analysis.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3">
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Capabilities */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/survival-analysis')}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-950">
              <TrendingUp className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Survival Analysis</h3>
              <p className="text-sm text-muted-foreground">
                42+ parametric models with AI-powered assessment and NICE DSU compliance
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/digitizer')}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-purple-100 dark:bg-purple-950">
              <FileSpreadsheet className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">KM Digitizer</h3>
              <p className="text-sm text-muted-foreground">
                AI-powered curve extraction from published figures with IPD reconstruction
              </p>
            </div>
          </div>
        </Card>

        <Card className="p-6 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate('/slr')}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-green-100 dark:bg-green-950">
              <Target className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold mb-1">Literature Review</h3>
              <p className="text-sm text-muted-foreground">
                Systematic review automation with AI screening and data extraction
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
