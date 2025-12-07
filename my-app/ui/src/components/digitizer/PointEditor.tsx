import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  X, 
  Plus, 
  ArrowUpDown,
  Trash2,
  Edit2,
  Check,
  Undo
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DataPoint } from './AffineTransformEditor';

interface PointEditorProps {
  points: DataPoint[];
  onChange: (points: DataPoint[]) => void;
  title?: string;
  description?: string;
  autoSort?: boolean;
}

// Sort points by time ascending
function sortPointsByTime(points: DataPoint[]): DataPoint[] {
  return [...points].sort((a, b) => a.time - b.time);
}

export function PointEditor({ 
  points, 
  onChange, 
  title = "Data Points",
  description = "Edit, delete, or add data points",
  autoSort = true
}: PointEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{ time: string; survival: string }>({ time: '', survival: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [newPointValues, setNewPointValues] = useState<{ time: string; survival: string }>({ time: '', survival: '' });
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [selectedPoints, setSelectedPoints] = useState<Set<number>>(new Set());

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditValues({
      time: points[index].time.toString(),
      survival: points[index].survival.toString()
    });
  };

  const handleSaveEdit = () => {
    if (editingIndex === null) return;
    
    const time = parseFloat(editValues.time);
    const survival = parseFloat(editValues.survival);
    
    if (isNaN(time) || isNaN(survival)) return;
    
    const newPoints = [...points];
    newPoints[editingIndex] = {
      ...newPoints[editingIndex],
      time,
      survival: Math.max(0, Math.min(1, survival)) // Clamp between 0 and 1
    };
    
    onChange(autoSort ? sortPointsByTime(newPoints) : newPoints);
    setEditingIndex(null);
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditValues({ time: '', survival: '' });
  };

  const handleDelete = (index: number) => {
    const newPoints = points.filter((_, i) => i !== index);
    onChange(autoSort ? sortPointsByTime(newPoints) : newPoints);
    setSelectedPoints(prev => {
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  };

  const handleDeleteSelected = () => {
    const newPoints = points.filter((_, i) => !selectedPoints.has(i));
    onChange(autoSort ? sortPointsByTime(newPoints) : newPoints);
    setSelectedPoints(new Set());
  };

  const handleAddPoint = () => {
    const time = parseFloat(newPointValues.time);
    const survival = parseFloat(newPointValues.survival);
    
    if (isNaN(time) || isNaN(survival)) return;
    
    const newPoint: DataPoint = {
      time,
      survival: Math.max(0, Math.min(1, survival)),
      id: `manual_${Date.now()}`,
      isNew: true
    };
    
    // Always sort when adding a new point for proper placement
    const newPoints = [...points, newPoint];
    onChange(autoSort ? sortPointsByTime(newPoints) : newPoints);
    setNewPointValues({ time: '', survival: '' });
    setIsAdding(false);
  };

  const handleSort = () => {
    const sorted = [...points].sort((a, b) => 
      sortOrder === 'asc' ? a.time - b.time : b.time - a.time
    );
    onChange(sorted);
    setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
  };

  const toggleSelectPoint = (index: number) => {
    setSelectedPoints(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPoints.size === points.length) {
      setSelectedPoints(new Set());
    } else {
      setSelectedPoints(new Set(points.map((_, i) => i)));
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {selectedPoints.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelected}
                className="gap-1"
              >
                <Trash2 className="h-4 w-4" />
                Delete {selectedPoints.size}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleSort}
              className="gap-1"
            >
              <ArrowUpDown className="h-4 w-4" />
              Sort
            </Button>
            <Button
              size="sm"
              onClick={() => setIsAdding(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Point
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Add New Point Form */}
        {isAdding && (
          <div className="mb-4 p-4 border rounded-lg bg-muted/50">
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <Label className="text-xs">Time (months)</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={newPointValues.time}
                  onChange={(e) => setNewPointValues(prev => ({ ...prev, time: e.target.value }))}
                  placeholder="0.0"
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs">Survival (0-1)</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  max="1"
                  value={newPointValues.survival}
                  onChange={(e) => setNewPointValues(prev => ({ ...prev, survival: e.target.value }))}
                  placeholder="1.000"
                  className="mt-1"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAddPoint}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => {
                  setIsAdding(false);
                  setNewPointValues({ time: '', survival: '' });
                }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Points Table */}
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-muted">
              <tr>
                <th className="px-2 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={selectedPoints.size === points.length && points.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-2 text-left text-sm font-medium">#</th>
                <th className="px-4 py-2 text-left text-sm font-medium">Time (months)</th>
                <th className="px-4 py-2 text-left text-sm font-medium">Survival</th>
                <th className="px-4 py-2 text-left text-sm font-medium">Status</th>
                <th className="px-4 py-2 w-24"></th>
              </tr>
            </thead>
            <tbody>
              {points.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No data points. Add points manually or use extraction.
                  </td>
                </tr>
              ) : (
                points.map((point, i) => (
                  <tr 
                    key={point.id || i} 
                    className={cn(
                      "border-t transition-colors",
                      selectedPoints.has(i) && "bg-primary/5",
                      point.isNew && "bg-green-50 dark:bg-green-950/20"
                    )}
                  >
                    <td className="px-2 py-2">
                      <input
                        type="checkbox"
                        checked={selectedPoints.has(i)}
                        onChange={() => toggleSelectPoint(i)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-2 text-sm text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2 text-sm">
                      {editingIndex === i ? (
                        <Input
                          type="number"
                          step="0.1"
                          value={editValues.time}
                          onChange={(e) => setEditValues(prev => ({ ...prev, time: e.target.value }))}
                          className="w-24 h-8"
                          autoFocus
                        />
                      ) : (
                        <span className="font-mono">{point.time.toFixed(2)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {editingIndex === i ? (
                        <Input
                          type="number"
                          step="0.001"
                          min="0"
                          max="1"
                          value={editValues.survival}
                          onChange={(e) => setEditValues(prev => ({ ...prev, survival: e.target.value }))}
                          className="w-24 h-8"
                        />
                      ) : (
                        <span className="font-mono">{point.survival.toFixed(4)}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {point.isNew ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                          New
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                          Extracted
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        {editingIndex === i ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={handleSaveEdit}
                            >
                              <Check className="h-4 w-4 text-green-600" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={handleCancelEdit}
                            >
                              <Undo className="h-4 w-4" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => handleStartEdit(i)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              onClick={() => handleDelete(i)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Summary */}
        {points.length > 0 && (
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              {points.length} points total 
              {points.filter(p => p.isNew).length > 0 && 
                ` (${points.filter(p => p.isNew).length} new)`
              }
            </span>
            <span>
              Time range: {Math.min(...points.map(p => p.time)).toFixed(1)} - {Math.max(...points.map(p => p.time)).toFixed(1)} months
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

