import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { projectsApi, type Project } from '@/lib/projectsApi';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  Plus, 
  Search, 
  FolderOpen, 
  Clock, 
  CheckCircle2, 
  Archive,
  MoreHorizontal,
  Trash2,
  Edit,
  ExternalLink
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function Projects() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await projectsApi.listProjects();
      setProjects(data.projects);
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProject = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this project?')) return;

    try {
      await projectsApi.deleteProject(projectId);
      await loadProjects();
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  const filteredProjects = projects.filter((project) => {
    const matchesSearch = 
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.therapeutic_area?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.disease_condition?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === 'all' || project.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active': return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'archived': return <Archive className="h-4 w-4 text-gray-500" />;
      default: return <FolderOpen className="h-4 w-4 text-amber-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      draft: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
      active: 'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
      completed: 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300',
      archived: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
    };
    return styles[status as keyof typeof styles] || styles.draft;
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground mt-1">
            Manage your economic modeling projects
          </p>
        </div>
        <Button onClick={() => navigate('/projects/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          {['all', 'draft', 'active', 'completed', 'archived'].map((status) => (
            <Button
              key={status}
              variant={filterStatus === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilterStatus(status)}
              className="capitalize"
            >
              {status}
            </Button>
          ))}
        </div>
      </div>

      {/* Projects Grid */}
      {filteredProjects.length === 0 ? (
        <Card className="p-12">
          <div className="text-center">
            <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">No projects found</h3>
            <p className="text-muted-foreground mb-4">
              {projects.length === 0
                ? "You haven't created any projects yet."
                : "No projects match your search criteria."}
            </p>
            {projects.length === 0 && (
              <Button onClick={() => navigate('/projects/new')}>
                Create your first project
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((project) => (
            <Card
              key={project.id}
              className="cursor-pointer hover:shadow-md transition-shadow group"
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(project.status)}
                    <CardTitle className="text-base line-clamp-1">
                      {project.name}
                    </CardTitle>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/projects/${project.id}/edit`);
                      }}
                    >
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      onClick={(e) => handleDeleteProject(project.id, e)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription className="line-clamp-2 mt-1">
                  {project.description || 'No description'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* Tags */}
                  <div className="flex flex-wrap gap-2">
                    <span className={cn("px-2 py-0.5 text-xs rounded-full", getStatusBadge(project.status))}>
                      {project.status}
                    </span>
                    {project.therapeutic_area && (
                      <span className="px-2 py-0.5 text-xs rounded-full bg-muted">
                        {project.therapeutic_area}
                      </span>
                    )}
                  </div>

                  {/* Details */}
                  <div className="text-xs text-muted-foreground space-y-1">
                    {project.disease_condition && (
                      <p>Condition: {project.disease_condition}</p>
                    )}
                    {project.intervention && (
                      <p>Intervention: {project.intervention}</p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="flex justify-between items-center pt-2 border-t text-xs text-muted-foreground">
                    <span>Created {new Date(project.created_at).toLocaleDateString()}</span>
                    <ExternalLink className="h-3 w-3" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

