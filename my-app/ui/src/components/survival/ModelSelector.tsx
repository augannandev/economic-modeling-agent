import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  CheckCircle2, 
  Star, 
  Search,
  ArrowUpDown,
  Eye
} from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface ModelSelectorProps {
  models: Model[];
  selectedModelId?: string;
  recommendedModelId?: string;
  onSelect: (model: Model) => void;
  onViewDetails?: (model: Model) => void;
}

type SortField = 'distribution' | 'approach' | 'aic' | 'bic' | 'vision_score';
type SortDirection = 'asc' | 'desc';

export function ModelSelector({
  models,
  selectedModelId,
  recommendedModelId,
  onSelect,
  onViewDetails,
}: ModelSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('aic');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [filterApproach, setFilterApproach] = useState<string>('all');

  // Get unique approaches
  const approaches = Array.from(new Set(models.map((m) => m.approach)));

  // Helper to get display name for model (distribution or scale for splines)
  const getModelDisplayName = (model: Model): string => {
    return model.distribution || `${model.approach}` || 'Unknown';
  };

  // Filter and sort models
  const filteredModels = models
    .filter((model) => {
      const displayName = getModelDisplayName(model);
      const matchesSearch = 
        displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        model.approach.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesApproach = 
        filterApproach === 'all' || model.approach === filterApproach;
      return matchesSearch && matchesApproach;
    })
    .sort((a, b) => {
      let aVal: number | string = 0;
      let bVal: number | string = 0;

      switch (sortField) {
        case 'distribution':
          aVal = getModelDisplayName(a);
          bVal = getModelDisplayName(b);
          break;
        case 'approach':
          aVal = a.approach;
          bVal = b.approach;
          break;
        case 'aic':
          aVal = a.aic ?? Infinity;
          bVal = b.aic ?? Infinity;
          break;
        case 'bic':
          aVal = a.bic ?? Infinity;
          bVal = b.bic ?? Infinity;
          break;
        case 'vision_score':
          aVal = a.vision_score ?? 0;
          bVal = b.vision_score ?? 0;
          break;
      }

      if (typeof aVal === 'string') {
        return sortDirection === 'asc' 
          ? aVal.localeCompare(bVal as string)
          : (bVal as string).localeCompare(aVal);
      }

      return sortDirection === 'asc' ? aVal - (bVal as number) : (bVal as number) - aVal;
    });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'vision_score' ? 'desc' : 'asc');
    }
  };

  const getApproachColor = (approach: string) => {
    switch (approach.toLowerCase()) {
      case 'one-piece':
        return 'bg-blue-500/10 text-blue-700 dark:text-blue-300';
      case 'piecewise':
        return 'bg-purple-500/10 text-purple-700 dark:text-purple-300';
      case 'spline':
        return 'bg-green-500/10 text-green-700 dark:text-green-300';
      default:
        return 'bg-gray-500/10 text-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex gap-4 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search models..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <select
          className="h-10 px-3 border rounded-md bg-background"
          value={filterApproach}
          onChange={(e) => setFilterApproach(e.target.value)}
        >
          <option value="all">All Approaches</option>
          {approaches.map((approach) => (
            <option key={approach} value={approach}>
              {approach}
            </option>
          ))}
        </select>
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-muted/50 rounded-lg text-sm font-medium">
        <div className="col-span-4 flex items-center gap-1 cursor-pointer" onClick={() => handleSort('distribution')}>
          Model
          <ArrowUpDown className="h-3 w-3" />
        </div>
        <div className="col-span-2 flex items-center gap-1 cursor-pointer" onClick={() => handleSort('approach')}>
          Approach
          <ArrowUpDown className="h-3 w-3" />
        </div>
        <div className="col-span-2 flex items-center gap-1 cursor-pointer" onClick={() => handleSort('aic')}>
          AIC
          <ArrowUpDown className="h-3 w-3" />
        </div>
        <div className="col-span-2 flex items-center gap-1 cursor-pointer" onClick={() => handleSort('vision_score')}>
          Score
          <ArrowUpDown className="h-3 w-3" />
        </div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {/* Model List */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto">
        {filteredModels.map((model) => {
          const isSelected = model.id === selectedModelId;
          const isRecommended = model.id === recommendedModelId;

          return (
            <Card
              key={model.id}
              className={cn(
                "grid grid-cols-12 gap-2 px-4 py-3 items-center cursor-pointer transition-all",
                isSelected && "border-2 border-primary bg-primary/5",
                isRecommended && !isSelected && "border-amber-500/50",
                !isSelected && !isRecommended && "hover:bg-muted/50"
              )}
              onClick={() => onSelect(model)}
            >
              <div className="col-span-4 flex items-center gap-2">
                {isSelected && <CheckCircle2 className="h-4 w-4 text-primary" />}
                {isRecommended && !isSelected && <Star className="h-4 w-4 text-amber-500" />}
                <span className="font-medium">{getModelDisplayName(model)}</span>
              </div>
              
              <div className="col-span-2">
                <span className={cn(
                  "text-xs px-2 py-1 rounded-full",
                  getApproachColor(model.approach)
                )}>
                  {model.approach}
                </span>
              </div>
              
              <div className="col-span-2 text-sm text-muted-foreground">
                {model.aic?.toFixed(1) ?? 'N/A'}
              </div>
              
              <div className="col-span-2">
                {model.vision_score !== undefined ? (
                  <div className="flex items-center gap-1">
                    <div 
                      className={cn(
                        "h-2 rounded-full",
                        model.vision_score >= 7 ? "bg-green-500" :
                        model.vision_score >= 5 ? "bg-amber-500" : "bg-red-500"
                      )}
                      style={{ width: `${model.vision_score * 10}%` }}
                    />
                    <span className="text-xs">{model.vision_score}/10</span>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
              
              <div className="col-span-2 flex justify-end gap-1">
                {onViewDetails && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails(model);
                    }}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(model);
                  }}
                >
                  {isSelected ? 'Selected' : 'Select'}
                </Button>
              </div>
            </Card>
          );
        })}

        {filteredModels.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No models match your search criteria
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
        <div className="flex items-center gap-1">
          <Star className="h-3 w-3 text-amber-500" />
          Agent Recommended
        </div>
        <div className="flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3 text-primary" />
          Your Selection
        </div>
      </div>
    </div>
  );
}

