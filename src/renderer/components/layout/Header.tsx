import * as React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Search, Command, FolderKanban, Tv, FileVideo, Loader2, Settings, Wallet } from 'lucide-react'
import { cn } from '@renderer/lib/utils'
import { usePlatform } from '@renderer/hooks/usePlatform'

interface SearchResult {
  type: 'category' | 'channel' | 'project'
  id: string
  title: string
  subtitle: string
  color?: string
}

interface SearchResults {
  categories: SearchResult[]
  channels: SearchResult[]
  projects: SearchResult[]
  total: number
}

export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const { isMac } = usePlatform()
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [searchQuery, setSearchQuery] = React.useState('')
  const [searchResults, setSearchResults] = React.useState<SearchResults | null>(null)
  const [isSearching, setIsSearching] = React.useState(false)
  const [selectedIndex, setSelectedIndex] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)

  // Voice API balance state
  const [voiceBalance, setVoiceBalance] = React.useState<number | null>(null)
  const [isLoadingBalance, setIsLoadingBalance] = React.useState(false)

  // Get all results as a flat array for keyboard navigation
  const allResults = React.useMemo(() => {
    if (!searchResults) return []
    return [
      ...searchResults.categories,
      ...searchResults.channels,
      ...searchResults.projects,
    ]
  }, [searchResults])

  // Debounced search
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults(null)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await window.api.search.query(searchQuery, 5)
        setSearchResults(results)
        setSelectedIndex(0)
      } catch (error) {
        console.error('Search failed:', error)
        setSearchResults(null)
      } finally {
        setIsSearching(false)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery])

  // Reset search state when modal closes
  React.useEffect(() => {
    if (!searchOpen) {
      setSearchQuery('')
      setSearchResults(null)
      setSelectedIndex(0)
    } else {
      // Focus input when modal opens
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [searchOpen])

  const navigateToResult = (result: SearchResult) => {
    setSearchOpen(false)
    switch (result.type) {
      case 'category':
        navigate(`/categories/${result.id}`)
        break
      case 'channel':
        navigate(`/channels/${result.id}`)
        break
      case 'project':
        navigate(`/projects/${result.id}`)
        break
    }
  }

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.min(prev + 1, allResults.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter' && allResults[selectedIndex]) {
      e.preventDefault()
      navigateToResult(allResults[selectedIndex])
    }
  }

  const getResultIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'category':
        return FolderKanban
      case 'channel':
        return Tv
      case 'project':
        return FileVideo
    }
  }

  // Keyboard shortcut for search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
      }
      // New project shortcut
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        navigate('/projects/new')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [navigate])

  // Fetch voice API balance
  const fetchBalance = React.useCallback(async () => {
    try {
      setIsLoadingBalance(true)
      const settings = await window.api.settings.get()
      const apiKey = settings.apiKeys?.voiceApi
      if (apiKey) {
        const result = await window.api.settings.checkVoiceBalance(apiKey)
        setVoiceBalance(result.balance)
      } else {
        setVoiceBalance(null)
      }
    } catch (error) {
      console.error('Failed to fetch voice balance:', error)
      setVoiceBalance(null)
    } finally {
      setIsLoadingBalance(false)
    }
  }, [])

  // Fetch balance on mount and every 5 minutes
  React.useEffect(() => {
    fetchBalance()
    const interval = setInterval(fetchBalance, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchBalance])

  return (
    <header className="h-10 flex items-center border-b border-border bg-bg-surface drag-region">
      {/* Center: Search Bar */}
      <div className="flex-1 flex justify-center px-4 no-drag">
        <button
          onClick={() => setSearchOpen(true)}
          className={cn(
            'flex items-center gap-2 w-full max-w-sm px-3 py-1 rounded-md',
            'bg-bg-elevated/50 border border-border/50',
            'text-text-tertiary text-xs',
            'hover:bg-bg-hover hover:border-border',
            'transition-colors'
          )}
        >
          <Search className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="flex-1 text-left">Search...</span>
          <div className="flex items-center gap-0.5">
            <kbd className="px-1 py-0.5 bg-bg-surface rounded text-[9px] border border-border">
              {isMac ? <Command className="w-2.5 h-2.5 inline" /> : 'Ctrl'}
            </kbd>
            <kbd className="px-1 py-0.5 bg-bg-surface rounded text-[9px] border border-border">K</kbd>
          </div>
        </button>
      </div>

      {/* Right: Utility icons */}
      <div className="flex items-center gap-2 px-3 no-drag">
        {/* Voice API Balance */}
        {voiceBalance !== null && (
          <button
            onClick={() => navigate('/settings')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded transition-colors',
              'bg-bg-elevated/50 border border-border/50',
              'text-text-secondary hover:text-text-primary hover:bg-bg-hover hover:border-border'
            )}
            title={`Voice API Balance: ${voiceBalance.toLocaleString()} credits`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span className="text-xs font-medium tabular-nums">
              {isLoadingBalance ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                voiceBalance.toLocaleString()
              )}
            </span>
          </button>
        )}
        <button
          onClick={() => navigate('/settings')}
          className={cn(
            'p-1.5 rounded transition-colors',
            'text-text-tertiary hover:text-text-secondary hover:bg-bg-hover',
            location.pathname === '/settings' && 'text-text-primary bg-bg-hover'
          )}
          title="Settings"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      {/* Search Modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 no-drag" onClick={() => setSearchOpen(false)}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div
            className="absolute top-[15%] left-1/2 -translate-x-1/2 w-full max-w-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
              {/* Search Input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                {isSearching ? (
                  <Loader2 className="w-5 h-5 text-text-tertiary animate-spin" />
                ) : (
                  <Search className="w-5 h-5 text-text-tertiary" />
                )}
                <input
                  ref={inputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search projects, channels, categories..."
                  className="flex-1 bg-transparent text-text-primary placeholder:text-text-tertiary outline-none text-sm"
                  autoFocus
                />
                <kbd className="px-1.5 py-0.5 bg-bg-elevated rounded text-[10px] border border-border text-text-tertiary">
                  ESC
                </kbd>
              </div>

              {/* Search Results */}
              <div className="max-h-[400px] overflow-y-auto">
                {!searchQuery.trim() ? (
                  <div className="p-6 text-center text-text-tertiary text-sm">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>Start typing to search...</p>
                    <p className="text-xs mt-1">Search across projects, channels, and categories</p>
                  </div>
                ) : searchResults && searchResults.total === 0 ? (
                  <div className="p-6 text-center text-text-tertiary text-sm">
                    <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    <p>No results found</p>
                    <p className="text-xs mt-1">Try a different search term</p>
                  </div>
                ) : searchResults && searchResults.total > 0 ? (
                  <div className="py-2">
                    {/* Categories */}
                    {searchResults.categories.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 text-xs text-text-tertiary uppercase tracking-wider">
                          Categories
                        </div>
                        {searchResults.categories.map((result, index) => {
                          const Icon = getResultIcon(result.type)
                          const flatIndex = index
                          return (
                            <button
                              key={result.id}
                              onClick={() => navigateToResult(result)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                                selectedIndex === flatIndex
                                  ? 'bg-accent/10'
                                  : 'hover:bg-bg-hover'
                              )}
                            >
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center"
                                style={{ backgroundColor: `${result.color}20` }}
                              >
                                <Icon
                                  className="w-4 h-4"
                                  style={{ color: result.color }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {result.title}
                                </p>
                                <p className="text-xs text-text-tertiary truncate">
                                  {result.subtitle}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Channels */}
                    {searchResults.channels.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 text-xs text-text-tertiary uppercase tracking-wider">
                          Channels
                        </div>
                        {searchResults.channels.map((result, index) => {
                          const Icon = getResultIcon(result.type)
                          const flatIndex = searchResults.categories.length + index
                          return (
                            <button
                              key={result.id}
                              onClick={() => navigateToResult(result)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                                selectedIndex === flatIndex
                                  ? 'bg-accent/10'
                                  : 'hover:bg-bg-hover'
                              )}
                            >
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center"
                                style={{ backgroundColor: `${result.color}20` }}
                              >
                                <Icon
                                  className="w-4 h-4"
                                  style={{ color: result.color }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {result.title}
                                </p>
                                <p className="text-xs text-text-tertiary truncate">
                                  {result.subtitle}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}

                    {/* Projects */}
                    {searchResults.projects.length > 0 && (
                      <div>
                        <div className="px-4 py-1.5 text-xs text-text-tertiary uppercase tracking-wider">
                          Projects
                        </div>
                        {searchResults.projects.map((result, index) => {
                          const Icon = getResultIcon(result.type)
                          const flatIndex =
                            searchResults.categories.length +
                            searchResults.channels.length +
                            index
                          return (
                            <button
                              key={result.id}
                              onClick={() => navigateToResult(result)}
                              className={cn(
                                'w-full flex items-center gap-3 px-4 py-2 text-left transition-colors',
                                selectedIndex === flatIndex
                                  ? 'bg-accent/10'
                                  : 'hover:bg-bg-hover'
                              )}
                            >
                              <div
                                className="w-8 h-8 rounded-md flex items-center justify-center"
                                style={{ backgroundColor: `${result.color}20` }}
                              >
                                <Icon
                                  className="w-4 h-4"
                                  style={{ color: result.color }}
                                />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-text-primary truncate">
                                  {result.title}
                                </p>
                                <p className="text-xs text-text-tertiary truncate">
                                  {result.subtitle}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Footer */}
              {searchResults && searchResults.total > 0 && (
                <div className="px-4 py-2 border-t border-border flex items-center justify-between text-xs text-text-tertiary">
                  <span>{searchResults.total} results</span>
                  <div className="flex items-center gap-2">
                    <kbd className="px-1.5 py-0.5 bg-bg-elevated rounded border border-border">
                      ↑↓
                    </kbd>
                    <span>Navigate</span>
                    <kbd className="px-1.5 py-0.5 bg-bg-elevated rounded border border-border ml-2">
                      ↵
                    </kbd>
                    <span>Select</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
