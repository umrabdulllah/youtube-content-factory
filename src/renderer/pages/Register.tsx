import * as React from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { Loader2, Youtube, UserPlus, AlertCircle } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { useToast } from '../components/ui/toaster'

export function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { isAuthenticated, isLoading: authLoading, login } = useAuth()
  const { toast } = useToast()

  // Form state
  const [inviteToken, setInviteToken] = React.useState(searchParams.get('token') || '')
  const [email, setEmail] = React.useState(searchParams.get('email') || '')
  const [displayName, setDisplayName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)

  // Redirect if already authenticated
  React.useEffect(() => {
    if (isAuthenticated && !authLoading) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, authLoading, navigate])

  const validateForm = (): string | null => {
    if (!inviteToken.trim()) {
      return 'Please enter your invite token'
    }
    if (!email.trim()) {
      return 'Please enter your email address'
    }
    if (!displayName.trim()) {
      return 'Please enter your display name'
    }
    if (!password) {
      return 'Please enter a password'
    }
    if (password.length < 8) {
      return 'Password must be at least 8 characters'
    }
    if (password !== confirmPassword) {
      return 'Passwords do not match'
    }
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const error = validateForm()
    if (error) {
      toast({
        title: 'Validation Error',
        description: error,
        variant: 'destructive',
      })
      return
    }

    setLoading(true)

    try {
      const result = await window.api.auth.registerWithInvite({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        inviteToken: inviteToken.trim(),
      })

      if (result.user) {
        toast({
          title: 'Account Created',
          description: 'Signing you in...',
          variant: 'success',
        })

        // Auto-login with the same credentials
        try {
          await login(email.trim(), password)
          navigate('/', { replace: true })
        } catch (loginError) {
          // If auto-login fails, redirect to login page
          toast({
            title: 'Account Created',
            description: 'Please sign in with your new credentials.',
            variant: 'success',
          })
          navigate('/login', { replace: true })
        }
      } else {
        throw new Error('Failed to create account')
      }
    } catch (error) {
      toast({
        title: 'Registration Failed',
        description: error instanceof Error ? error.message : 'Failed to create account. Please check your invite token.',
        variant: 'destructive',
      })
      setLoading(false)
    }
  }

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-base">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base p-4">
      <Card className="w-full max-w-md border-border-default">
        <CardHeader className="text-center space-y-2">
          <div className="flex justify-center mb-2">
            <div className="w-12 h-12 rounded-xl bg-accent/20 flex items-center justify-center">
              <Youtube className="w-6 h-6 text-accent" />
            </div>
          </div>
          <CardTitle className="text-2xl font-semibold text-text-primary">
            Accept Invitation
          </CardTitle>
          <CardDescription className="text-text-secondary">
            Set up your account to join the team
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Invite Token */}
            <div className="space-y-2">
              <Label htmlFor="inviteToken" className="text-text-secondary">
                Invite Token
              </Label>
              <Input
                id="inviteToken"
                type="text"
                value={inviteToken}
                onChange={(e) => setInviteToken(e.target.value)}
                placeholder="Paste your invite token here"
                required
                autoFocus={!inviteToken}
                className="bg-bg-elevated border-border-default font-mono text-sm"
              />
              <p className="text-xs text-text-tertiary">
                This was provided by your admin when they invited you
              </p>
            </div>

            {/* Email */}
            <div className="space-y-2">
              <Label htmlFor="email" className="text-text-secondary">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus={!!inviteToken && !email}
                autoComplete="email"
                className="bg-bg-elevated border-border-default"
              />
              <p className="text-xs text-text-tertiary">
                Use the same email address the invite was sent to
              </p>
            </div>

            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="displayName" className="text-text-secondary">
                Display Name
              </Label>
              <Input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Your name"
                required
                autoComplete="name"
                className="bg-bg-elevated border-border-default"
              />
            </div>

            {/* Password */}
            <div className="space-y-2">
              <Label htmlFor="password" className="text-text-secondary">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Create a secure password"
                required
                autoComplete="new-password"
                className="bg-bg-elevated border-border-default"
              />
              <p className="text-xs text-text-tertiary">
                At least 8 characters
              </p>
            </div>

            {/* Confirm Password */}
            <div className="space-y-2">
              <Label htmlFor="confirmPassword" className="text-text-secondary">
                Confirm Password
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                required
                autoComplete="new-password"
                className="bg-bg-elevated border-border-default"
              />
            </div>

            {/* Password mismatch warning */}
            {password && confirmPassword && password !== confirmPassword && (
              <div className="flex items-center gap-2 text-red-500 text-sm">
                <AlertCircle className="w-4 h-4" />
                <span>Passwords do not match</span>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <UserPlus className="mr-2 h-4 w-4" />
              Create Account
            </Button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-text-tertiary">
              Already have an account?{' '}
              <Link
                to="/login"
                className="text-accent hover:underline font-medium"
              >
                Sign in
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
