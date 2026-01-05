import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Tv, FileVideo, FolderKanban } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import type { ChannelWithCategory } from '@shared/types'

export function Channels() {
  const navigate = useNavigate()
  const [channels, setChannels] = React.useState<ChannelWithCategory[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadChannels()
  }, [])

  const loadChannels = async () => {
    try {
      const data = await window.api.channels.getAll()
      setChannels(data)
    } catch (error) {
      console.error('Failed to load channels:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  // Group channels by category
  const groupedChannels = channels.reduce((acc, channel) => {
    if (!acc[channel.categoryId]) {
      acc[channel.categoryId] = {
        categoryName: channel.categoryName,
        categoryColor: channel.categoryColor,
        channels: [],
      }
    }
    acc[channel.categoryId].channels.push(channel)
    return acc
  }, {} as Record<string, { categoryName: string; categoryColor: string; channels: ChannelWithCategory[] }>)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-text-secondary text-sm">
            All your YouTube channels across categories
          </p>
        </div>
        <Button onClick={() => navigate('/categories')} variant="outline" className="gap-2">
          <FolderKanban className="w-4 h-4" />
          Manage Categories
        </Button>
      </div>

      {/* Channels by Category */}
      {Object.keys(groupedChannels).length > 0 ? (
        <div className="space-y-8">
          {Object.entries(groupedChannels).map(([categoryId, group]) => (
            <div key={categoryId}>
              <div className="flex items-center gap-2 mb-4">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: group.categoryColor }}
                />
                <h3 className="font-semibold text-text-primary">{group.categoryName}</h3>
                <Badge variant="secondary">{group.channels.length}</Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {group.channels.map((channel) => (
                  <Card
                    key={channel.id}
                    className="cursor-pointer hover:border-border-strong transition-colors"
                    onClick={() => navigate(`/channels/${channel.id}`)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: `${group.categoryColor}20` }}
                        >
                          <Tv className="w-5 h-5" style={{ color: group.categoryColor }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-text-primary truncate">{channel.sortOrder + 1}. {channel.name}</h4>
                          {channel.description && (
                            <p className="text-xs text-text-tertiary truncate">{channel.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                        <FileVideo className="w-4 h-4 text-text-tertiary" />
                        <span className="text-sm text-text-secondary">
                          {channel.projectCount} projects
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-16">
          <Tv className="w-12 h-12 mx-auto text-text-tertiary mb-4" />
          <h3 className="text-lg font-medium text-text-primary mb-2">No channels yet</h3>
          <p className="text-text-secondary text-sm mb-6">
            Create a category first, then add channels to it
          </p>
          <Button onClick={() => navigate('/categories')}>
            <Plus className="w-4 h-4 mr-2" />
            Create Category
          </Button>
        </div>
      )}
    </div>
  )
}
