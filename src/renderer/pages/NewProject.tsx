import * as React from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Sparkles, FileText, Clock, Image, Volume2, Captions } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Checkbox } from '../components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import { useToast } from '../components/ui/toaster'
import { formatWordCount, estimateReadingTime } from '../lib/format'
import type { CategoryWithStats, Channel } from '@shared/types'

export function NewProject() {
  const navigate = useNavigate()
  const location = useLocation()
  const { toast } = useToast()

  const [categories, setCategories] = React.useState<CategoryWithStats[]>([])
  const [channels, setChannels] = React.useState<Channel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [submitting, setSubmitting] = React.useState(false)

  const [selectedCategoryId, setSelectedCategoryId] = React.useState<string>('')
  const [selectedChannelId, setSelectedChannelId] = React.useState<string>(
    (location.state as { channelId?: string })?.channelId || ''
  )
  const [title, setTitle] = React.useState('')
  const [script, setScript] = React.useState('')
  const [generateImages, setGenerateImages] = React.useState(true)
  const [generateAudio, setGenerateAudio] = React.useState(true)
  const [generateSubtitles, setGenerateSubtitles] = React.useState(true)

  // Word count
  const wordCount = React.useMemo(() => {
    return script.trim().split(/\s+/).filter((word) => word.length > 0).length
  }, [script])

  React.useEffect(() => {
    loadCategories()
  }, [])

  // Load channels when category is selected
  React.useEffect(() => {
    if (selectedCategoryId) {
      loadChannels(selectedCategoryId)
    } else {
      setChannels([])
    }
  }, [selectedCategoryId])

  // If we have a pre-selected channel, load its category
  React.useEffect(() => {
    const loadChannelCategoryEffect = async () => {
      try {
        const channel = await window.api.channels.getById(selectedChannelId)
        if (channel) {
          setSelectedCategoryId(channel.categoryId)
        }
      } catch (error) {
        console.error('Failed to load channel:', error)
      }
    }

    if (selectedChannelId && categories.length > 0) {
      loadChannelCategoryEffect()
    }
  }, [selectedChannelId, categories])

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

  const loadChannels = async (categoryId: string) => {
    try {
      const data = await window.api.channels.getByCategory(categoryId)
      setChannels(data)
    } catch (error) {
      console.error('Failed to load channels:', error)
    }
  }

  const handleSubmit = async () => {
    if (!selectedChannelId) {
      toast({ title: 'Error', description: 'Please select a channel', variant: 'destructive' })
      return
    }
    if (!title.trim()) {
      toast({ title: 'Error', description: 'Please enter a title', variant: 'destructive' })
      return
    }
    if (!script.trim()) {
      toast({ title: 'Error', description: 'Please enter a script', variant: 'destructive' })
      return
    }

    setSubmitting(true)

    try {
      const project = await window.api.projects.create({
        channelId: selectedChannelId,
        title: title.trim(),
        script: script.trim(),
        generateImages,
        generateAudio,
        generateSubtitles,
      })

      toast({ title: 'Success', description: 'Project created successfully', variant: 'success' })
      navigate(`/projects/${project.id}`)
    } catch (error) {
      console.error('Failed to create project:', error)
      toast({ title: 'Error', description: 'Failed to create project', variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  const handleGenerateAll = async () => {
    if (!selectedChannelId || !title.trim() || !script.trim()) {
      handleSubmit()
      return
    }

    // Validate at least one generation option is selected
    if (!generateImages && !generateAudio) {
      toast({
        title: 'Error',
        description: 'Please select at least one generation option',
        variant: 'destructive'
      })
      return
    }

    setSubmitting(true)

    try {
      const project = await window.api.projects.create({
        channelId: selectedChannelId,
        title: title.trim(),
        script: script.trim(),
        generateImages,
        generateAudio,
        generateSubtitles,
      })

      // Queue generation
      await window.api.projects.generate(project.id)

      toast({ title: 'Added to Queue', description: `"${title.trim()}" has been added to the queue`, variant: 'success' })

      // Clear form for next project
      setTitle('')
      setScript('')
    } catch (error) {
      console.error('Failed to create and generate project:', error)
      toast({ title: 'Error', description: 'Failed to create project', variant: 'destructive' })
    } finally {
      setSubmitting(false)
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
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-bold text-text-primary">New Project</h2>
          <p className="text-sm text-text-secondary">Create a new video project</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="col-span-2 space-y-6">
          {/* Category & Channel Selection */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Channel Selection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category</Label>
                  <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          <div className="flex items-center gap-2">
                            <div
                              className="w-3 h-3 rounded-full"
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Channel</Label>
                  <Select
                    value={selectedChannelId}
                    onValueChange={setSelectedChannelId}
                    disabled={!selectedCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select channel" />
                    </SelectTrigger>
                    <SelectContent>
                      {channels.map((channel) => (
                        <SelectItem key={channel.id} value={channel.id}>
                          {channel.sortOrder + 1}. {channel.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Title */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Video Title</CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="Enter your video title..."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg"
              />
            </CardContent>
          </Card>

          {/* Script */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Script</CardTitle>
              <div className="flex items-center gap-3 text-sm text-text-secondary">
                <span className="flex items-center gap-1">
                  <FileText className="w-4 h-4" />
                  {formatWordCount(wordCount)}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {estimateReadingTime(wordCount)}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="Paste your script here...

The script will be used to:
- Generate images for each segment
- Create voiceover narration
- Generate synchronized subtitles"
                value={script}
                onChange={(e) => setScript(e.target.value)}
                className="min-h-[400px] font-mono text-sm"
              />
            </CardContent>
          </Card>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Preview Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wide">Channel</p>
                <p className="text-sm text-text-primary">
                  {channels.find((c) => c.id === selectedChannelId)?.name || 'Not selected'}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wide">Title</p>
                <p className="text-sm text-text-primary">{title || 'Not entered'}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary uppercase tracking-wide">Script</p>
                <p className="text-sm text-text-primary">
                  {formatWordCount(wordCount)} ({estimateReadingTime(wordCount)})
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Generation Options */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generation Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-start gap-3">
                <Checkbox
                  id="generate-images"
                  checked={generateImages}
                  onCheckedChange={(checked) => setGenerateImages(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="generate-images"
                    className="text-sm font-medium text-text-primary cursor-pointer flex items-center gap-2"
                  >
                    <Image className="w-4 h-4 text-text-secondary" />
                    Images
                  </label>
                  <p className="text-xs text-text-tertiary">
                    Generate prompts and images for the video
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="generate-audio"
                  checked={generateAudio}
                  onCheckedChange={(checked) => setGenerateAudio(checked === true)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="generate-audio"
                    className="text-sm font-medium text-text-primary cursor-pointer flex items-center gap-2"
                  >
                    <Volume2 className="w-4 h-4 text-text-secondary" />
                    Audio
                  </label>
                  <p className="text-xs text-text-tertiary">
                    Generate voiceover for the video
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Checkbox
                  id="generate-subtitles"
                  checked={generateSubtitles}
                  onCheckedChange={(checked) => setGenerateSubtitles(checked === true)}
                  disabled={!generateAudio}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor="generate-subtitles"
                    className={`text-sm font-medium cursor-pointer flex items-center gap-2 ${!generateAudio ? 'text-text-tertiary' : 'text-text-primary'}`}
                  >
                    <Captions className="w-4 h-4 text-text-secondary" />
                    Subtitles
                  </label>
                  <p className="text-xs text-text-tertiary">
                    Generate subtitles from audio
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions */}
          <Card>
            <CardContent className="p-4 space-y-3">
              <Button
                className="w-full gap-2 btn-gradient"
                onClick={handleGenerateAll}
                disabled={submitting || !selectedChannelId || !title.trim() || !script.trim()}
              >
                <Sparkles className="w-4 h-4" />
                {submitting ? 'Adding...' : 'Add to Queue'}
              </Button>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting || !selectedChannelId || !title.trim() || !script.trim()}
              >
                Save as Draft
              </Button>

              <p className="text-xs text-text-tertiary text-center">
                Add to Queue will generate selected assets automatically
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

    </div>
  )
}
