import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Search, 
  BookOpen, 
  Filter, 
  CheckCircle2, 
  XCircle,
  FileText,
  ExternalLink,
  Loader2,
  Plus
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Study {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  doi?: string;
  abstract?: string;
  status: 'pending' | 'included' | 'excluded';
}

// Mock data for demonstration
const MOCK_STUDIES: Study[] = [
  {
    id: '1',
    title: 'Pembrolizumab versus chemotherapy for PD-L1-positive non-small-cell lung cancer',
    authors: 'Reck M, Rodríguez-Abreu D, Robinson AG, et al.',
    journal: 'N Engl J Med',
    year: 2016,
    doi: '10.1056/NEJMoa1606774',
    abstract: 'Pembrolizumab significantly improved progression-free survival and overall survival...',
    status: 'included',
  },
  {
    id: '2',
    title: 'Five-Year Overall Survival for Patients With Advanced Non‒Small-Cell Lung Cancer Treated With Pembrolizumab',
    authors: 'Reck M, Rodríguez-Abreu D, Robinson AG, et al.',
    journal: 'J Clin Oncol',
    year: 2021,
    doi: '10.1200/JCO.21.00174',
    status: 'pending',
  },
  {
    id: '3',
    title: 'Nivolumab versus Docetaxel in Advanced Nonsquamous Non-Small-Cell Lung Cancer',
    authors: 'Borghaei H, Paz-Ares L, Horn L, et al.',
    journal: 'N Engl J Med',
    year: 2015,
    doi: '10.1056/NEJMoa1507643',
    status: 'pending',
  },
];

export function SLR() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('search');
  const [isSearching, setIsSearching] = useState(false);
  const [studies, setStudies] = useState<Study[]>(MOCK_STUDIES);

  const handleSearch = async () => {
    setIsSearching(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 2000));
    setIsSearching(false);
    setActiveTab('results');
  };

  const handleStudyAction = (studyId: string, action: 'include' | 'exclude') => {
    setStudies((prev) =>
      prev.map((s) =>
        s.id === studyId ? { ...s, status: action === 'include' ? 'included' : 'excluded' } : s
      )
    );
  };

  const pendingStudies = studies.filter((s) => s.status === 'pending');
  const includedStudies = studies.filter((s) => s.status === 'included');
  const excludedStudies = studies.filter((s) => s.status === 'excluded');

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Systematic Literature Review</h1>
          <p className="text-muted-foreground mt-1">
            AI-powered literature search and screening
          </p>
        </div>
        <Button onClick={() => navigate('/projects/new')} className="gap-2">
          <Plus className="h-4 w-4" />
          New Review
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-950 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{studies.length}</p>
              <p className="text-xs text-muted-foreground">Total Studies</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 dark:bg-amber-950 rounded-lg">
              <Search className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{pendingStudies.length}</p>
              <p className="text-xs text-muted-foreground">Pending Review</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-950 rounded-lg">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{includedStudies.length}</p>
              <p className="text-xs text-muted-foreground">Included</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-950 rounded-lg">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{excludedStudies.length}</p>
              <p className="text-xs text-muted-foreground">Excluded</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content */}
      <Card>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <CardHeader>
            <TabsList>
              <TabsTrigger value="search" className="gap-2">
                <Search className="h-4 w-4" />
                Search
              </TabsTrigger>
              <TabsTrigger value="results" className="gap-2">
                <FileText className="h-4 w-4" />
                Results ({studies.length})
              </TabsTrigger>
              <TabsTrigger value="screening" className="gap-2">
                <Filter className="h-4 w-4" />
                Screening ({pendingStudies.length})
              </TabsTrigger>
              <TabsTrigger value="included" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Included ({includedStudies.length})
              </TabsTrigger>
            </TabsList>
          </CardHeader>

          <CardContent>
            {/* Search Tab */}
            <TabsContent value="search" className="space-y-6">
              <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center mb-8">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <h3 className="text-lg font-semibold">PICO Search Configuration</h3>
                  <p className="text-sm text-muted-foreground">
                    Define your search criteria using the PICO framework
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label>Population</Label>
                    <Input placeholder="e.g., Advanced non-small cell lung cancer patients" />
                  </div>
                  <div>
                    <Label>Intervention</Label>
                    <Input placeholder="e.g., Pembrolizumab monotherapy" />
                  </div>
                  <div>
                    <Label>Comparator</Label>
                    <Input placeholder="e.g., Platinum-based chemotherapy" />
                  </div>
                  <div>
                    <Label>Outcome</Label>
                    <Input placeholder="e.g., Overall survival, progression-free survival" />
                  </div>
                </div>

                <div className="pt-4">
                  <Button onClick={handleSearch} disabled={isSearching} className="w-full gap-2">
                    {isSearching ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Searching databases...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4" />
                        Search Literature
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </TabsContent>

            {/* Results Tab */}
            <TabsContent value="results" className="space-y-4">
              <div className="flex justify-between items-center">
                <Input placeholder="Filter results..." className="max-w-sm" />
                <Button variant="outline" size="sm">
                  Export Results
                </Button>
              </div>
              
              <div className="space-y-3">
                {studies.map((study) => (
                  <StudyCard
                    key={study.id}
                    study={study}
                    onInclude={() => handleStudyAction(study.id, 'include')}
                    onExclude={() => handleStudyAction(study.id, 'exclude')}
                  />
                ))}
              </div>
            </TabsContent>

            {/* Screening Tab */}
            <TabsContent value="screening" className="space-y-4">
              {pendingStudies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>All studies have been screened</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingStudies.map((study) => (
                    <StudyCard
                      key={study.id}
                      study={study}
                      onInclude={() => handleStudyAction(study.id, 'include')}
                      onExclude={() => handleStudyAction(study.id, 'exclude')}
                      showActions
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            {/* Included Tab */}
            <TabsContent value="included" className="space-y-4">
              {includedStudies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No studies included yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {includedStudies.map((study) => (
                    <StudyCard key={study.id} study={study} />
                  ))}
                </div>
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}

function StudyCard({
  study,
  onInclude,
  onExclude,
  showActions = false,
}: {
  study: Study;
  onInclude?: () => void;
  onExclude?: () => void;
  showActions?: boolean;
}) {
  return (
    <Card className={cn(
      "p-4",
      study.status === 'included' && "border-green-200 bg-green-50/50 dark:border-green-900 dark:bg-green-950/30",
      study.status === 'excluded' && "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30"
    )}>
      <div className="flex justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-medium mb-1">{study.title}</h4>
          <p className="text-sm text-muted-foreground">{study.authors}</p>
          <p className="text-sm text-muted-foreground">
            {study.journal}, {study.year}
          </p>
          {study.doi && (
            <a
              href={`https://doi.org/${study.doi}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary flex items-center gap-1 mt-1 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              {study.doi}
            </a>
          )}
        </div>
        
        {showActions && study.status === 'pending' && (
          <div className="flex flex-col gap-2">
            <Button size="sm" variant="outline" className="gap-1" onClick={onInclude}>
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              Include
            </Button>
            <Button size="sm" variant="outline" className="gap-1" onClick={onExclude}>
              <XCircle className="h-4 w-4 text-red-600" />
              Exclude
            </Button>
          </div>
        )}
        
        {study.status !== 'pending' && (
          <div className={cn(
            "px-3 py-1 text-xs font-medium rounded-full h-fit",
            study.status === 'included' && "bg-green-100 text-green-700",
            study.status === 'excluded' && "bg-red-100 text-red-700"
          )}>
            {study.status}
          </div>
        )}
      </div>
    </Card>
  );
}

