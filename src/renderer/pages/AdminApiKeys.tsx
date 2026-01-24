import * as React from 'react'
import { Key, Save, Trash2, Eye, EyeOff, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { useToast } from '../components/ui/toaster'
import { useAuth } from '../contexts/AuthContext'
import type { ApiKeyType, ApiKeysConfig } from '@shared/types'

interface ApiKeyField {
  type: ApiKeyType
  label: string
  description: string
  placeholder: string
  validatePrefix?: string
}

const API_KEY_FIELDS: ApiKeyField[] = [
  {
    type: 'anthropicApi',
    label: 'Anthropic API Key (Claude)',
    description: 'For Claude models - used for prompt generation',
    placeholder: 'sk-ant-...',
    validatePrefix: 'sk-ant-',
  },
  {
    type: 'openaiApi',
    label: 'OpenAI API Key',
    description: 'For GPT models - alternative prompt generation',
    placeholder: 'sk-...',
    validatePrefix: 'sk-',
  },
  {
    type: 'replicateApi',
    label: 'Replicate API Key',
    description: 'For image generation and WhisperX transcription',
    placeholder: 'r8_...',
    validatePrefix: 'r8_',
  },
  {
    type: 'voiceApi',
    label: 'Voice API Key',
    description: 'For Russian TTS voiceover generation',
    placeholder: 'Enter your Voice API key',
  },
]

export function AdminApiKeys() {
  const { toast } = useToast()
  const { isAdmin, isManager } = useAuth()
  const [keys, setKeys] = React.useState<ApiKeysConfig>({})
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState<ApiKeyType | null>(null)
  const [deleting, setDeleting] = React.useState<ApiKeyType | null>(null)
  const [showKey, setShowKey] = React.useState<Record<ApiKeyType, boolean>>({
    anthropicApi: false,
    openaiApi: false,
    replicateApi: false,
    voiceApi: false,
  })

  // Track which keys have been modified
  const [modified, setModified] = React.useState<Record<ApiKeyType, boolean>>({
    anthropicApi: false,
    openaiApi: false,
    replicateApi: false,
    voiceApi: false,
  })

  React.useEffect(() => {
    loadKeys()
  }, [])

  const loadKeys = async () => {
    try {
      setLoading(true)
      const data = await window.api.apiKeys.getAll()
      setKeys(data as ApiKeysConfig)
      // Reset modified state
      setModified({
        anthropicApi: false,
        openaiApi: false,
        replicateApi: false,
        voiceApi: false,
      })
    } catch (error) {
      console.error('Failed to load API keys:', error)
      toast({
        title: 'Error',
        description: 'Failed to load API keys',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleKeyChange = (keyType: ApiKeyType, value: string) => {
    setKeys((prev) => ({ ...prev, [keyType]: value }))
    setModified((prev) => ({ ...prev, [keyType]: true }))
  }

  const handleSaveKey = async (keyType: ApiKeyType) => {
    const value = keys[keyType]
    if (!value || value.trim().length === 0) {
      toast({
        title: 'Error',
        description: 'API key value is required',
        variant: 'destructive',
      })
      return
    }

    setSaving(keyType)
    try {
      await window.api.apiKeys.set(keyType, value.trim())
      setModified((prev) => ({ ...prev, [keyType]: false }))
      toast({
        title: 'Success',
        description: `${getFieldLabel(keyType)} saved successfully`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to save API key:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save API key',
        variant: 'destructive',
      })
    } finally {
      setSaving(null)
    }
  }

  const handleDeleteKey = async (keyType: ApiKeyType) => {
    setDeleting(keyType)
    try {
      await window.api.apiKeys.delete(keyType)
      setKeys((prev) => ({ ...prev, [keyType]: undefined }))
      setModified((prev) => ({ ...prev, [keyType]: false }))
      toast({
        title: 'Success',
        description: `${getFieldLabel(keyType)} deleted`,
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to delete API key:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete API key',
        variant: 'destructive',
      })
    } finally {
      setDeleting(null)
    }
  }

  const handleRefresh = async () => {
    try {
      await window.api.apiKeys.refreshCache()
      await loadKeys()
      toast({
        title: 'Success',
        description: 'API keys refreshed from cloud',
        variant: 'success',
      })
    } catch (error) {
      console.error('Failed to refresh API keys:', error)
      toast({
        title: 'Error',
        description: 'Failed to refresh API keys',
        variant: 'destructive',
      })
    }
  }

  const getFieldLabel = (keyType: ApiKeyType): string => {
    const field = API_KEY_FIELDS.find((f) => f.type === keyType)
    return field?.label || keyType
  }

  const validateKeyFormat = (value: string | undefined, field: ApiKeyField): boolean => {
    if (!value) return true // Empty is valid
    if (!field.validatePrefix) return true
    return value.startsWith(field.validatePrefix)
  }

  const toggleShowKey = (keyType: ApiKeyType) => {
    setShowKey((prev) => ({ ...prev, [keyType]: !prev[keyType] }))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-6 h-6 border-2 border-accent border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">API Key Management</h1>
          <p className="text-text-secondary">
            {isAdmin
              ? 'Manage API keys for all editors. Changes sync automatically.'
              : 'Configure your personal API keys for content generation.'}
          </p>
        </div>
        <Button variant="outline" onClick={handleRefresh} className="gap-2">
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Manager info card */}
      {isManager && (
        <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Personal API Keys Required
                </p>
                <p className="text-amber-700 dark:text-amber-300 mt-1">
                  As a Manager, you must configure your own API keys to generate content.
                  These keys are only used for your projects and are not shared with others.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {API_KEY_FIELDS.map((field) => {
        const value = keys[field.type] || ''
        const isValid = validateKeyFormat(value, field)
        const isModified = modified[field.type]
        const isSaving = saving === field.type
        const isDeleting = deleting === field.type

        return (
          <Card key={field.type}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="w-4 h-4" />
                {field.label}
              </CardTitle>
              <CardDescription>{field.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKey[field.type] ? 'text' : 'password'}
                      value={value}
                      onChange={(e) => handleKeyChange(field.type, e.target.value)}
                      placeholder={field.placeholder}
                      className={!isValid ? 'border-red-500 pr-10' : 'pr-10'}
                    />
                    <button
                      type="button"
                      onClick={() => toggleShowKey(field.type)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary hover:text-text-primary"
                    >
                      {showKey[field.type] ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <Button
                    onClick={() => handleSaveKey(field.type)}
                    disabled={isSaving || !isModified || !value}
                    className="gap-2"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <Save className="w-4 h-4" />
                    )}
                    Save
                  </Button>
                  {value && (
                    <Button
                      variant="outline"
                      onClick={() => handleDeleteKey(field.type)}
                      disabled={isDeleting}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                    >
                      {isDeleting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </Button>
                  )}
                </div>
                {!isValid && (
                  <p className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />
                    Invalid format. Key should start with "{field.validatePrefix}"
                  </p>
                )}
                {value && isValid && !isModified && (
                  <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    {isAdmin ? 'Configured and synced to all editors' : 'Configured'}
                  </p>
                )}
                {isModified && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {isAdmin
                      ? 'Unsaved changes - click Save to sync to editors'
                      : 'Unsaved changes - click Save to update'}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}

      <Card className="bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900">
        <CardContent className="pt-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-blue-900 dark:text-blue-100">
                How API Keys Work
              </p>
              <p className="text-blue-700 dark:text-blue-300 mt-1">
                {isAdmin
                  ? 'API keys you set here are encrypted and stored in the cloud. Editors automatically receive these keys when they start the app. They see masked values (e.g., sk-a•••••••xyz) and cannot view or modify the actual keys.'
                  : 'Your API keys are encrypted and stored securely. They are used exclusively for your own content generation and are not shared with anyone else.'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
