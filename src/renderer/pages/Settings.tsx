import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { FolderOpen, Palette, Save, Brain, Image, Volume2, RefreshCw, AlertCircle, CheckCircle2, Download, ArrowUpCircle, Key, ExternalLink, Cloud, Upload } from 'lucide-react'
import { useUpdater } from '../hooks/useUpdater'
import { useAuth } from '../contexts/AuthContext'
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
import { Progress } from '../components/ui/progress'
import type { AppSettings, VoiceTemplate, PromptModel, MaskedApiKeys, PushAllResult } from '@shared/types'

export function Settings() {
  const { toast } = useToast()
  const navigate = useNavigate()
  const { isAdmin } = useAuth()
  const [settings, setSettings] = React.useState<AppSettings | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  // Voice template state
  const [voiceTemplates, setVoiceTemplates] = React.useState<VoiceTemplate[]>([])
  const [loadingTemplates, setLoadingTemplates] = React.useState(false)
  const [voiceBalance, setVoiceBalance] = React.useState<number | null>(null)

  // Masked API keys for editors
  const [maskedKeys, setMaskedKeys] = React.useState<MaskedApiKeys | null>(null)
  const [keyStatus, setKeyStatus] = React.useState<Record<string, boolean>>({})
  const [loadingKeys, setLoadingKeys] = React.useState(false)

  // Cloud sync state (admin only)
  const [isPushing, setIsPushing] = React.useState(false)
  const [pushResult, setPushResult] = React.useState<PushAllResult | null>(null)

  // Updater state
  const {
    state: updateState,
    isChecking,
    isDownloading,
    isUpdateAvailable,
    isUpdateDownloaded,
    hasError,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useUpdater()

  React.useEffect(() => {
    loadSettings()
    // Load masked API keys for editors
    if (!isAdmin) {
      loadMaskedKeys()
    }
  }, [isAdmin])

  const loadMaskedKeys = async () => {
    setLoadingKeys(true)
    try {
      const [masked, status] = await Promise.all([
        window.api.apiKeys.getMasked(),
        window.api.apiKeys.getStatus(),
      ])
      setMaskedKeys(masked)
      setKeyStatus(status)
    } catch (error) {
      console.error('Failed to load API keys:', error)
    } finally {
      setLoadingKeys(false)
    }
  }

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
    // Voice API key is now managed centrally - check if it's configured
    if (!isAdmin && !keyStatus.voiceApi) {
      toast({ title: 'Error', description: 'Voice API key not configured by administrator', variant: 'destructive' })
      return
    }

    setLoadingTemplates(true)
    try {
      // For admins with local key, use that; otherwise the backend will use the cached key
      const voiceApiKey = isAdmin && settings?.apiKeys?.voiceApi
        ? settings.apiKeys.voiceApi
        : '' // Empty string signals to use cached/cloud key
      const result = await window.api.settings.fetchVoiceTemplates(voiceApiKey)
      setVoiceTemplates(result.templates)
      if (result.balance !== undefined) {
        setVoiceBalance(result.balance)
      }
      toast({ title: 'Success', description: `Loaded ${result.templates.length} voice templates`, variant: 'success' })
    } catch (error) {
      console.error('Failed to fetch voice templates:', error)
      toast({ title: 'Error', description: 'Failed to fetch voice templates. Check API key configuration.', variant: 'destructive' })
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

  const handlePushToCloud = async () => {
    setIsPushing(true)
    setPushResult(null)
    try {
      const result = await window.api.cloudSync.pushAll()
      setPushResult(result)
      if (result.success) {
        toast({ title: 'Success', description: 'All data synced to cloud', variant: 'success' })
      } else {
        toast({
          title: 'Warning',
          description: `Sync completed with ${result.categoriesFailed + result.channelsFailed} errors`,
          variant: 'destructive'
        })
      }
    } catch (error) {
      console.error('Failed to push to cloud:', error)
      toast({ title: 'Error', description: 'Failed to sync to cloud', variant: 'destructive' })
    } finally {
      setIsPushing(false)
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

      {/* API Keys Section - Different for Admin vs Editor */}
      {isAdmin ? (
        /* Admin: Link to API Keys management page */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Keys
            </CardTitle>
            <CardDescription>
              Manage API keys for all users from the admin panel
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/admin/api-keys')} className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Manage API Keys
            </Button>
            <p className="text-xs text-text-tertiary mt-2">
              API keys you configure will be automatically synced to all editors
            </p>
          </CardContent>
        </Card>
      ) : (
        /* Editor: Show masked API keys (read-only) */
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="w-4 h-4" />
              API Keys
            </CardTitle>
            <CardDescription>
              API keys are managed by your administrator
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loadingKeys ? (
              <div className="flex items-center justify-center py-4">
                <RefreshCw className="w-4 h-4 animate-spin" />
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                    <div>
                      <Label className="text-sm">Anthropic API (Claude)</Label>
                      <p className="text-xs text-text-tertiary font-mono mt-1">
                        {maskedKeys?.anthropicApi || 'Not configured'}
                      </p>
                    </div>
                    {keyStatus.anthropicApi ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-text-tertiary" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                    <div>
                      <Label className="text-sm">OpenAI API</Label>
                      <p className="text-xs text-text-tertiary font-mono mt-1">
                        {maskedKeys?.openaiApi || 'Not configured'}
                      </p>
                    </div>
                    {keyStatus.openaiApi ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-text-tertiary" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                    <div>
                      <Label className="text-sm">Replicate API</Label>
                      <p className="text-xs text-text-tertiary font-mono mt-1">
                        {maskedKeys?.replicateApi || 'Not configured'}
                      </p>
                    </div>
                    {keyStatus.replicateApi ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-text-tertiary" />
                    )}
                  </div>

                  <div className="flex items-center justify-between p-3 bg-bg-elevated rounded-lg">
                    <div>
                      <Label className="text-sm">Voice API</Label>
                      <p className="text-xs text-text-tertiary font-mono mt-1">
                        {maskedKeys?.voiceApi || 'Not configured'}
                      </p>
                    </div>
                    {keyStatus.voiceApi ? (
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-text-tertiary" />
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={loadMaskedKeys} className="gap-2 w-full">
                  <RefreshCw className="w-4 h-4" />
                  Refresh Keys
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cloud Sync Section - Admin only */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Cloud className="w-4 h-4" />
              Cloud Sync
            </CardTitle>
            <CardDescription>
              Sync your categories and channels to the cloud for editors
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Push All to Cloud</p>
                <p className="text-xs text-text-tertiary">
                  Upload all categories and channels to Supabase
                </p>
              </div>
              <Button
                variant="outline"
                onClick={handlePushToCloud}
                disabled={isPushing}
                className="gap-2"
              >
                {isPushing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isPushing ? 'Syncing...' : 'Sync to Cloud'}
              </Button>
            </div>

            {/* Push Result Display */}
            {pushResult && (
              <div className={`rounded-md p-3 ${pushResult.success ? 'bg-green-500/10' : 'bg-amber-500/10'}`}>
                <div className="flex items-center gap-2 mb-2">
                  {pushResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-green-600" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  )}
                  <span className={`text-sm font-medium ${pushResult.success ? 'text-green-600' : 'text-amber-600'}`}>
                    {pushResult.success ? 'Sync Complete' : 'Sync Completed with Errors'}
                  </span>
                </div>
                <div className="text-xs text-text-secondary space-y-1">
                  <p>Categories: {pushResult.categoriesPushed} synced, {pushResult.categoriesFailed} failed</p>
                  <p>Channels: {pushResult.channelsPushed} synced, {pushResult.channelsFailed} failed</p>
                </div>
                {pushResult.errors.length > 0 && (
                  <div className="mt-2 text-xs text-red-500">
                    {pushResult.errors.slice(0, 3).map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                    {pushResult.errors.length > 3 && (
                      <p>...and {pushResult.errors.length - 3} more errors</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Prompt Model Selection (visible for all) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Prompt Generation
          </CardTitle>
          <CardDescription>
            Configure the AI model for generating image prompts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
        </CardContent>
      </Card>

      {/* Image Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="w-4 h-4" />
            Image Generation
          </CardTitle>
          <CardDescription>
            Configure image generation settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                disabled={loadingTemplates || (!isAdmin && !keyStatus.voiceApi)}
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
            {!isAdmin && !keyStatus.voiceApi && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Voice API key not configured. Contact your administrator.
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

      {/* App Updates */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ArrowUpCircle className="w-4 h-4" />
            App Updates
          </CardTitle>
          <CardDescription>
            Check for and install application updates
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Current Version</p>
              <p className="text-sm text-text-tertiary">{updateState.currentVersion || 'Loading...'}</p>
            </div>
            <Button
              variant="outline"
              onClick={checkForUpdates}
              disabled={isChecking || isDownloading}
              className="gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
              {isChecking ? 'Checking...' : 'Check for Updates'}
            </Button>
          </div>

          {/* Update Status */}
          {isUpdateAvailable && (
            <div className="flex items-center justify-between rounded-md bg-accent/10 p-3">
              <div>
                <p className="text-sm font-medium text-accent">Update Available</p>
                <p className="text-sm text-text-secondary">
                  Version {updateState.updateInfo?.version} is ready to download
                </p>
              </div>
              <Button onClick={downloadUpdate} className="gap-2">
                <Download className="w-4 h-4" />
                Download
              </Button>
            </div>
          )}

          {isDownloading && updateState.progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Downloading update...</span>
                <span>{updateState.progress.percent.toFixed(0)}%</span>
              </div>
              <Progress value={updateState.progress.percent} />
            </div>
          )}

          {isUpdateDownloaded && (
            <div className="flex items-center justify-between rounded-md bg-green-500/10 p-3">
              <div>
                <p className="text-sm font-medium text-green-600 dark:text-green-400">
                  Update Ready
                </p>
                <p className="text-sm text-text-secondary">
                  Version {updateState.updateInfo?.version} is ready to install
                </p>
              </div>
              <Button onClick={installUpdate} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Restart & Install
              </Button>
            </div>
          )}

          {hasError && (
            <div className="flex items-center gap-2 text-sm text-red-500">
              <AlertCircle className="w-4 h-4" />
              {updateState.error}
            </div>
          )}

          {updateState.status === 'not-available' && (
            <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
              <CheckCircle2 className="w-4 h-4" />
              You are running the latest version
            </div>
          )}
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
