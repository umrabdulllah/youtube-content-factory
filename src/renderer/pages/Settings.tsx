import * as React from 'react'
import { FolderOpen, Palette, Save, Brain, Image, Volume2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useToast } from '../components/ui/toaster'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import type { AppSettings, VoiceTemplate, PromptModel } from '@shared/types'

export function Settings() {
  const { toast } = useToast()
  const [settings, setSettings] = React.useState<AppSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // Voice template state
  const [voiceTemplates, setVoiceTemplates] = React.useState<VoiceTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = React.useState(false)
  const [voiceBalance, setVoiceBalance] = React.useState<number | null>(null)

  React.useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const data = await window.api.settings.get()
      setSettings(data)
    } catch (error) {
      console.error('Failed to load settings:', error)
      toast({ title: 'Error', description: 'Failed to load settings', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const handleSelectDirectory = async () => {
    const path = await window.api.settings.selectDirectory()
    if (path && settings) {
      setSettings({ ...settings, basePath: path })
    }
  }

  const handleFetchVoiceTemplates = async () => {
    if (!settings?.apiKeys.voiceApi) {
      toast({ title: 'Error', description: 'Please enter Voice API key first', variant: 'destructive' })
      return
    }

    setLoadingTemplates(true)
    try {
      const result = await window.api.settings.fetchVoiceTemplates(settings.apiKeys.voiceApi)
      setVoiceTemplates(result.templates)
      if (result.balance !== undefined) {
        setVoiceBalance(result.balance)
      }
      toast({ title: 'Success', description: `Loaded ${result.templates.length} voice templates`, variant: 'success' })
    } catch (error) {
      console.error('Failed to fetch voice templates:', error)
      toast({ title: 'Error', description: 'Failed to fetch voice templates. Check your API key.', variant: 'destructive' })
    } finally {
      setLoadingTemplates(false)
    }
  }

  const handleSave = async () => {
    if (!settings) return

    setSaving(true)
    try {
      await window.api.settings.set(settings)
      toast({ title: 'Success', description: 'Settings saved', variant: 'success' })
    } catch (error) {
      console.error('Failed to save settings:', error)
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  // Helper to detect which prompt provider is configured
  const getPromptProvider = (): 'anthropic' | 'openai' | 'none' => {
    if (settings?.apiKeys.anthropicApi) return 'anthropic'
    if (settings?.apiKeys.openaiApi) return 'openai'
    return 'none'
  }

  // Helper to validate API key format
  const validateKeyFormat = (key: string, type: 'anthropic' | 'openai' | 'replicate'): boolean => {
    if (!key) return true // Empty is valid (not configured)
    switch (type) {
      case 'anthropic': return key.startsWith('sk-ant-')
      case 'openai': return key.startsWith('sk-') && !key.startsWith('sk-ant-')
      case 'replicate': return key.startsWith('r8_')
      default: return true
    }
  }

  if (loading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Storage Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FolderOpen className="w-4 h-4" />
            Storage
          </CardTitle>
          <CardDescription>
            Configure where your projects and generated assets are stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Base Directory</Label>
            <div className="flex gap-2">
              <Input
                value={settings.basePath}
                onChange={(e) => setSettings({ ...settings, basePath: e.target.value })}
                placeholder="/path/to/your/projects"
                className="flex-1"
              />
              <Button variant="outline" onClick={handleSelectDirectory}>
                Browse
              </Button>
            </div>
            <p className="text-xs text-text-tertiary">
              All categories, channels, and projects will be stored in this directory
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Prompt Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Prompt Generation
          </CardTitle>
          <CardDescription>
            Configure AI for generating image prompts from scripts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Anthropic API Key (Claude)</Label>
            <div className="relative">
              <Input
                type="password"
                value={settings.apiKeys.anthropicApi || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, anthropicApi: e.target.value },
                  })
                }
                placeholder="sk-ant-..."
                className={!validateKeyFormat(settings.apiKeys.anthropicApi || '', 'anthropic') ? 'border-red-500' : ''}
              />
              {settings.apiKeys.anthropicApi && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validateKeyFormat(settings.apiKeys.anthropicApi, 'anthropic') ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">
              For Claude models (recommended for best prompts)
            </p>
          </div>

          <div className="relative flex items-center">
            <div className="flex-1 border-t border-border" />
            <span className="px-3 text-xs text-text-tertiary">OR</span>
            <div className="flex-1 border-t border-border" />
          </div>

          <div className="space-y-2">
            <Label>OpenAI API Key</Label>
            <div className="relative">
              <Input
                type="password"
                value={settings.apiKeys.openaiApi || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, openaiApi: e.target.value },
                  })
                }
                placeholder="sk-..."
                className={!validateKeyFormat(settings.apiKeys.openaiApi || '', 'openai') ? 'border-red-500' : ''}
              />
              {settings.apiKeys.openaiApi && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validateKeyFormat(settings.apiKeys.openaiApi, 'openai') ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">
              Alternative: GPT models for prompt generation
            </p>
          </div>

          <div className="space-y-2">
            <Label>Prompt Model</Label>
            <Select
              value={settings.promptModel}
              onValueChange={(value: PromptModel) =>
                setSettings({ ...settings, promptModel: value })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude-sonnet-4-5">Claude Sonnet 4.5 (Recommended)</SelectItem>
                <SelectItem value="gpt-5.2">GPT-5.2 (Best Intelligence)</SelectItem>
                <SelectItem value="gpt-5-mini">GPT-5 Mini (Cost-Optimized)</SelectItem>
                <SelectItem value="gpt-4o">GPT-4o</SelectItem>
                <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-text-tertiary">
              Model used for generating oil painting prompts
            </p>
          </div>

          {getPromptProvider() !== 'none' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              Using {getPromptProvider() === 'anthropic' ? 'Anthropic (Claude)' : 'OpenAI (GPT)'}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Image Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="w-4 h-4" />
            Image Generation
          </CardTitle>
          <CardDescription>
            Configure Replicate API for generating images
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Replicate API Key</Label>
            <div className="relative">
              <Input
                type="password"
                value={settings.apiKeys.replicateApi || ''}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    apiKeys: { ...settings.apiKeys, replicateApi: e.target.value },
                  })
                }
                placeholder="r8_..."
                className={!validateKeyFormat(settings.apiKeys.replicateApi || '', 'replicate') ? 'border-red-500' : ''}
              />
              {settings.apiKeys.replicateApi && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2">
                  {validateKeyFormat(settings.apiKeys.replicateApi, 'replicate') ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-500" />
                  )}
                </span>
              )}
            </div>
            <p className="text-xs text-text-tertiary">
              Used for image generation and subtitle transcription (WhisperX)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Max Concurrent Images</Label>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={8}
                value={settings.maxConcurrentImages}
                onChange={(e) =>
                  setSettings({ ...settings, maxConcurrentImages: parseInt(e.target.value) })
                }
                className="flex-1 h-2 bg-bg-elevated rounded-lg appearance-none cursor-pointer accent-accent"
              />
              <span className="w-8 text-center font-medium">{settings.maxConcurrentImages}</span>
            </div>
            <p className="text-xs text-text-tertiary">
              Number of images to generate in parallel (1-8)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Audio Generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            Audio Generation
          </CardTitle>
          <CardDescription>
            Configure Russian TTS service for voiceovers
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Voice API Key</Label>
            <Input
              type="password"
              value={settings.apiKeys.voiceApi || ''}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  apiKeys: { ...settings.apiKeys, voiceApi: e.target.value },
                })
              }
              placeholder="Enter your Voice API key"
            />
            <p className="text-xs text-text-tertiary">
              API key for voiceapi.csv666.ru TTS service
            </p>
          </div>

          <div className="space-y-2">
            <Label>Voice Template</Label>
            <div className="flex gap-2">
              <Select
                value={settings.voiceTemplateId || ''}
                onValueChange={(value) =>
                  setSettings({ ...settings, voiceTemplateId: value || undefined })
                }
                disabled={voiceTemplates.length === 0}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder={voiceTemplates.length === 0 ? "Fetch templates first" : "Select a voice template"} />
                </SelectTrigger>
                <SelectContent>
                  {voiceTemplates.map((template) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                onClick={handleFetchVoiceTemplates}
                disabled={loadingTemplates || !settings.apiKeys.voiceApi}
                className="gap-2"
              >
                <RefreshCw className={`w-4 h-4 ${loadingTemplates ? 'animate-spin' : ''}`} />
                Fetch
              </Button>
            </div>
            {voiceBalance !== null && (
              <p className="text-xs text-green-600 dark:text-green-400">
                Balance: {voiceBalance.toLocaleString()} credits
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Default Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="w-4 h-4" />
            Default Generation Settings
          </CardTitle>
          <CardDescription>
            Default settings for new projects (can be overridden per channel)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Default Voice</Label>
            <Input
              value={settings.defaultVoice}
              onChange={(e) => setSettings({ ...settings, defaultVoice: e.target.value })}
              placeholder="en-US-Neural2-J"
            />
          </div>

          <div className="space-y-2">
            <Label>Default Image Style</Label>
            <Input
              value={settings.defaultImageStyle}
              onChange={(e) => setSettings({ ...settings, defaultImageStyle: e.target.value })}
              placeholder="cinematic"
            />
          </div>

          <div className="space-y-2">
            <Label>Default Language</Label>
            <Input
              value={settings.defaultLanguage}
              onChange={(e) => setSettings({ ...settings, defaultLanguage: e.target.value })}
              placeholder="en"
            />
          </div>

          <div className="space-y-2">
            <Label>Max Concurrent Tasks</Label>
            <Input
              type="number"
              min={1}
              max={10}
              value={settings.maxConcurrentTasks}
              onChange={(e) =>
                setSettings({ ...settings, maxConcurrentTasks: parseInt(e.target.value) || 2 })
              }
            />
            <p className="text-xs text-text-tertiary">
              Number of generation tasks to run in parallel
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
