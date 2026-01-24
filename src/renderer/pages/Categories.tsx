import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FolderKanban, Tv, Pencil, Trash2, Cloud, RefreshCw } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { useToast } from '../components/ui/toaster'
import { useAuth } from '../contexts/AuthContext'
import type { CategoryWithStats, CreateCategoryInput } from '@shared/types'
import { CATEGORY_COLORS } from '@shared/constants'

export function Categories() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isAdmin, isManager } = useAuth()
  const canManageContent = isAdmin || isManager
  const [syncing, setSyncing] = React.useState(false)
  const [categories, setCategories] = React.useState<CategoryWithStats[]>([])
  const [loading, setLoading] = React.useState(true)
  const [hasUpdates, setHasUpdates] = React.useState(false)
  const [checkingUpdates, setCheckingUpdates] = React.useState(false)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingCategory, setEditingCategory] = React.useState<CategoryWithStats | null>(null)
  const [formData, setFormData] = React.useState<CreateCategoryInput>({
    name: '',
    description: '',
    color: CATEGORY_COLORS[0],
  })
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  React.useEffect(() => {
    loadCategories()
  }, [])

  // Check for cloud updates (for editors only - admins and managers create their own content)
  React.useEffect(() => {
    if (canManageContent) return // Admins and managers don't need to sync from cloud

    const checkForUpdates = async () => {
      setCheckingUpdates(true)
      try {
        const result = await window.api.cloudSync.checkForUpdates()
        setHasUpdates(result.needsSync)
      } catch (error) {
        console.error('Failed to check for updates:', error)
      } finally {
        setCheckingUpdates(false)
      }
    }

    checkForUpdates()
  }, [canManageContent])

  const loadCategories = async () => {
    try {
      const data = await window.api.categories.getAll()
      setCategories(data)
    } catch (error) {
      console.error('Failed to load categories:', error)
      toast({ title: 'Error', description: 'Failed to load categories', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  // Sync categories from cloud (for editors)
  const handleSyncFromCloud = async () => {
    setSyncing(true)
    try {
      await window.api.cloudSync.pullAll()
      await loadCategories()
      setHasUpdates(false) // Clear the update indicator
      toast({ title: 'Success', description: 'Categories synced from cloud', variant: 'success' })
    } catch (error) {
      console.error('Failed to sync categories:', error)
      toast({ title: 'Error', description: 'Failed to sync categories', variant: 'destructive' })
    } finally {
      setSyncing(false)
    }
  }

  const handleOpenDialog = (category?: CategoryWithStats) => {
    if (category) {
      setEditingCategory(category)
      setFormData({
        name: category.name,
        description: category.description || '',
        color: category.color,
      })
    } else {
      setEditingCategory(null)
      setFormData({
        name: '',
        description: '',
        color: CATEGORY_COLORS[Math.floor(Math.random() * CATEGORY_COLORS.length)],
      })
    }
    setDialogOpen(true)
  }

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      toast({ title: 'Error', description: 'Name is required', variant: 'destructive' })
      return
    }

    try {
      if (editingCategory) {
        await window.api.categories.update({
          id: editingCategory.id,
          ...formData,
        })
        toast({ title: 'Success', description: 'Category updated', variant: 'success' })
      } else {
        await window.api.categories.create(formData)
        toast({ title: 'Success', description: 'Category created', variant: 'success' })
      }

      setDialogOpen(false)
      loadCategories()
    } catch (error) {
      console.error('Failed to save category:', error)
      toast({ title: 'Error', description: 'Failed to save category', variant: 'destructive' })
    }
  }

  const handleDelete = async (id: string) => {
    if (deletingId) return // Prevent duplicate actions
    if (!confirm('Are you sure you want to delete this category? This will also delete all channels and projects within it.')) {
      return
    }

    setDeletingId(id)
    try {
      await window.api.categories.delete(id)
      toast({ title: 'Success', description: 'Category deleted', variant: 'success' })
      loadCategories()
    } catch (error) {
      console.error('Failed to delete category:', error)
      toast({ title: 'Error', description: 'Failed to delete category', variant: 'destructive' })
    } finally {
      setDeletingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-sm">
            {canManageContent ? 'Organize your channels into categories' : 'Categories synced from your organization'}
          </p>
          {!canManageContent && hasUpdates && (
            <p className="text-accent text-xs mt-1 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-accent"></span>
              Updates available from cloud
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {!canManageContent && (
            <Button
              variant="outline"
              onClick={handleSyncFromCloud}
              disabled={syncing || checkingUpdates}
              className="gap-2 relative"
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : checkingUpdates ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              Sync
              {hasUpdates && !syncing && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                </span>
              )}
            </Button>
          )}
          {canManageContent && (
            <Button onClick={() => handleOpenDialog()} className="gap-2">
              <Plus className="w-4 h-4" />
              New Category
            </Button>
          )}
        </div>
      </div>

      {/* Categories Grid */}
      {categories.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map((category) => (
            <Card
              key={category.id}
              className="group cursor-pointer border-border bg-bg-surface relative overflow-hidden transition-all duration-300 hover:border-border-strong hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/20"
              onClick={() => navigate(`/categories/${category.id}`)}
              style={{
                boxShadow: `0 0 0 0px ${category.color}00, 0 1px 3px rgba(0, 0, 0, 0.3)`,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 1px ${category.color}40, 0 8px 24px rgba(0, 0, 0, 0.4)`
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = `0 0 0 0px ${category.color}00, 0 1px 3px rgba(0, 0, 0, 0.3)`
              }}
            >
              {/* Subtle gradient overlay */}
              <div
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                style={{
                  background: `radial-gradient(circle at top right, ${category.color}08, transparent 60%)`,
                }}
              />

              <CardContent className="p-5 relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Enhanced icon container with gradient and glow */}
                    <div className="relative flex-shrink-0">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center relative overflow-hidden transition-all duration-300 group-hover:scale-105"
                        style={{
                          background: `linear-gradient(135deg, ${category.color}25, ${category.color}15)`,
                          boxShadow: `0 0 0 1px ${category.color}20, 0 4px 12px ${category.color}15`,
                        }}
                      >
                        {/* Subtle shine effect */}
                        <div
                          className="absolute inset-0 opacity-40 group-hover:opacity-60 transition-opacity"
                          style={{
                            background: `linear-gradient(135deg, transparent 0%, ${category.color}20 50%, transparent 100%)`,
                          }}
                        />
                        <FolderKanban
                          className="w-5 h-5 relative z-10 transition-transform duration-300 group-hover:scale-110"
                          style={{ color: category.color }}
                        />
                      </div>
                      {/* Glow effect on hover */}
                      <div
                        className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md -z-10"
                        style={{ backgroundColor: `${category.color}40` }}
                      />
                    </div>

                    <div className="flex-1 min-w-0 mt-0.5">
                      <h3 className="font-semibold text-text-primary text-base leading-snug mb-1 transition-colors group-hover:text-white">
                        {category.name}
                      </h3>
                      {category.description && (
                        <p className="text-xs text-text-tertiary leading-relaxed line-clamp-2">
                          {category.description}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Action buttons with stagger animation - Admin and Manager only */}
                  {canManageContent && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-all duration-200 -mr-1 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenDialog(category)
                        }}
                        className="p-2 rounded-lg hover:bg-bg-hover text-text-tertiary hover:text-text-primary transition-all duration-200 hover:scale-105 active:scale-95"
                        style={{
                          transitionDelay: '0ms',
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(category.id)
                        }}
                        disabled={deletingId === category.id}
                        className="p-2 rounded-lg hover:bg-error/10 text-text-tertiary hover:text-error disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-105 active:scale-95"
                        style={{
                          transitionDelay: '25ms',
                        }}
                      >
                        {deletingId === category.id ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats as integrated badges */}
                <div className="flex items-center gap-2">
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    style={{
                      backgroundColor: `${category.color}12`,
                      color: category.color,
                    }}
                  >
                    <Tv className="w-3.5 h-3.5" />
                    <span>{category.channelCount}</span>
                  </div>
                  <div
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-bg-elevated text-text-secondary text-xs font-medium"
                  >
                    <FolderKanban className="w-3.5 h-3.5" />
                    <span>{category.projectCount}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-20">
          {/* Enhanced empty state with gradient background */}
          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-accent/20 blur-3xl rounded-full" />
            <div className="relative w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-bg-elevated to-bg-surface border border-border flex items-center justify-center">
              <FolderKanban className="w-10 h-10 text-accent" />
            </div>
          </div>
          <h3 className="text-xl font-semibold text-text-primary mb-2">
            {canManageContent ? 'No categories yet' : 'No categories available'}
          </h3>
          <p className="text-text-secondary text-sm mb-8 max-w-md mx-auto leading-relaxed">
            {canManageContent
              ? 'Create your first category to start organizing your YouTube channels and content projects'
              : 'Categories will appear here once your administrator creates them. Try syncing to check for updates.'}
          </p>
          {canManageContent ? (
            <Button onClick={() => handleOpenDialog()} className="gap-2 px-6">
              <Plus className="w-4 h-4" />
              Create Category
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleSyncFromCloud}
              disabled={syncing || checkingUpdates}
              className="gap-2 px-6 relative"
            >
              {syncing ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : checkingUpdates ? (
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              {hasUpdates ? 'Updates Available - Sync Now' : 'Sync from Cloud'}
              {hasUpdates && !syncing && (
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-accent"></span>
                </span>
              )}
            </Button>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'New Category'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Finance, Technology, Health"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this category"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[80px]"
              />
            </div>

            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={`w-8 h-8 rounded-lg border-2 transition-transform hover:scale-110 ${
                      formData.color === color ? 'border-white scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setFormData({ ...formData, color })}
                  />
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingCategory ? 'Save Changes' : 'Create Category'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
