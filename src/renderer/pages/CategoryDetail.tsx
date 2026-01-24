import * as React from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Tv, Pencil, Trash2 } from 'lucide-react'
import { Button } from '../components/ui/button'
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
import type { Category, Channel, CreateChannelInput } from '@shared/types'

export function CategoryDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()
  const { isAdmin, isManager } = useAuth()
  const canManageContent = isAdmin || isManager
  const [category, setCategory] = React.useState<Category | null>(null)
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editingChannel, setEditingChannel] = React.useState<Channel | null>(null)
  const [formData, setFormData] = React.useState<CreateChannelInput>({
    categoryId: id || '',
    name: '',
    description: '',
  })

  React.useEffect(() => {
    if (id) {
      loadData()
    }
  }, [id])

  const loadData = async () => {
    try {
      const [categoryData, channelsData] = await Promise.all([
        window.api.categories.getById(id!),
        window.api.channels.getByCategory(id!),
      ])
      setCategory(categoryData)
      setChannels(channelsData)
    } catch (error) {
      console.error('Failed to load category:', error)
      toast({ title: 'Error', description: 'Failed to load category', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (channel?: Channel) => {
    if (channel) {
      setEditingChannel(channel)
      setFormData({
        categoryId: id || '',
        name: channel.name,
        description: channel.description || '',
      })
    } else {
      setEditingChannel(null)
      setFormData({
        categoryId: id || '',
        name: '',
        description: '',
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
      if (editingChannel) {
        await window.api.channels.update({
          id: editingChannel.id,
          name: formData.name,
          description: formData.description,
        })
        toast({ title: 'Success', description: 'Channel updated', variant: 'success' })
      } else {
        await window.api.channels.create(formData)
        toast({ title: 'Success', description: 'Channel created', variant: 'success' })
      }

      setDialogOpen(false)
      loadData()
    } catch (error) {
      console.error('Failed to save channel:', error)
      toast({ title: 'Error', description: 'Failed to save channel', variant: 'destructive' })
    }
  }

  const handleDeleteChannel = async (channelId: string) => {
    if (!confirm('Are you sure you want to delete this channel? This will also delete all projects within it.')) {
      return
    }

    try {
      await window.api.channels.delete(channelId)
      toast({ title: 'Success', description: 'Channel deleted', variant: 'success' })
      loadData()
    } catch (error) {
      console.error('Failed to delete channel:', error)
      toast({ title: 'Error', description: 'Failed to delete channel', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  if (!category) {
    return (
      <div className="text-center py-16">
        <p className="text-text-secondary">Category not found</p>
        <Button variant="outline" onClick={() => navigate('/categories')} className="mt-4">
          Back to Categories
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/categories')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${category.color}20` }}
            >
              <Tv className="w-5 h-5" style={{ color: category.color }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-text-primary">{category.name}</h2>
              {category.description && (
                <p className="text-sm text-text-secondary">{category.description}</p>
              )}
            </div>
          </div>
        </div>
{canManageContent && (
        <Button onClick={() => handleOpenDialog()} className="gap-2">
          <Plus className="w-4 h-4" />
          New Channel
        </Button>
        )}
      </div>

      {/* Channels List */}
      {channels.length > 0 ? (
        <div className="border border-border rounded-lg overflow-hidden divide-y divide-border">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="group flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-bg-elevated transition-colors"
              onClick={() => navigate(`/channels/${channel.id}`)}
            >
              <Tv className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
              <span className="text-sm font-medium text-text-primary truncate">{channel.sortOrder + 1}. {channel.name}</span>
              {channel.description && (
                <span className="text-text-tertiary text-xs truncate hidden sm:block">
                  {channel.description}
                </span>
              )}
              <div className="ml-auto flex items-center gap-2 shrink-0">
                <span className="text-text-tertiary text-xs">{channel.projectCount}</span>
                {canManageContent && (
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenDialog(channel)
                    }}
                    className="p-1 rounded hover:bg-bg-hover text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteChannel(channel.id)
                    }}
                    className="p-1 rounded hover:bg-error/10 text-text-tertiary hover:text-error"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Tv className="w-12 h-12 mx-auto text-text-tertiary mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No channels yet</h3>
          <p className="text-text-secondary text-sm mb-6">
            {canManageContent
              ? 'Create your first channel in this category'
              : 'No channels available in this category'}
          </p>
          {canManageContent && (
          <Button onClick={() => handleOpenDialog()}>
            <Plus className="w-4 h-4 mr-2" />
            Create Channel
          </Button>
          )}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? 'Edit Channel' : 'New Channel'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="e.g., Crypto Daily, Tech Reviews"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Brief description of this channel"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit}>
              {editingChannel ? 'Save Changes' : 'Create Channel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
