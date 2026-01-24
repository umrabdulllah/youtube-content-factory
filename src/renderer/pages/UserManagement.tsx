import * as React from 'react'
import { Navigate } from 'react-router-dom'
import { UserPlus, Mail, Trash2, Copy, Users, Clock, Shield, ShieldCheck } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../components/ui/dialog'
import { Badge } from '../components/ui/badge'
import { useToast } from '../components/ui/toaster'
import type { UserProfile, InviteToken, UserRole } from '@shared/types'

export function UserManagement() {
  const { isAdmin, user: currentUser } = useAuth()
  const { toast } = useToast()

  const [users, setUsers] = React.useState<UserProfile[]>([])
  const [invites, setInvites] = React.useState<InviteToken[]>([])
  const [loading, setLoading] = React.useState(true)

  // Invite dialog state
  const [showInviteDialog, setShowInviteDialog] = React.useState(false)
  const [inviteEmail, setInviteEmail] = React.useState('')
  const [inviteRole, setInviteRole] = React.useState<UserRole>('editor')
  const [creatingInvite, setCreatingInvite] = React.useState(false)

  // Redirect non-admins
  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      const [usersData, invitesData] = await Promise.all([
        window.api.users.getAll(),
        window.api.users.getInvites(),
      ])
      setUsers(usersData)
      setInvites(invitesData)
    } catch (error) {
      console.error('Failed to load users:', error)
      toast({
        title: 'Error',
        description: 'Failed to load users',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleCreateInvite = async () => {
    if (!inviteEmail) {
      toast({
        title: 'Error',
        description: 'Please enter an email address',
        variant: 'destructive',
      })
      return
    }

    setCreatingInvite(true)
    try {
      const invite = await window.api.users.createInvite({
        email: inviteEmail,
        role: inviteRole,
      })
      setInvites([invite, ...invites])
      setShowInviteDialog(false)
      setInviteEmail('')
      setInviteRole('editor')

      // Copy invite instructions to clipboard
      const inviteInfo = `You've been invited to YouTube Content Factory!

To set up your account:
1. Open the app and click "Have an invite? Create your account"
2. Or go directly to the Register page

Your invite details:
- Email: ${invite.email}
- Invite Token: ${invite.token}
- Expires: ${new Date(invite.expiresAt).toLocaleDateString()}

Enter your email, the invite token above, and choose a password to complete your registration.`
      await navigator.clipboard.writeText(inviteInfo)

      toast({
        title: 'Invite Created',
        description: 'Invite instructions copied to clipboard. Share them with your new team member.',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to create invite',
        variant: 'destructive',
      })
    } finally {
      setCreatingInvite(false)
    }
  }

  const handleUpdateRole = async (userId: string, role: UserRole) => {
    try {
      const updated = await window.api.users.updateRole(userId, role)
      setUsers(users.map((u) => (u.id === userId ? updated : u)))
      toast({
        title: 'Success',
        description: 'User role updated',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to update role',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteUser = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this user? They will no longer have access to the app.')) {
      return
    }

    try {
      await window.api.users.delete(userId)
      setUsers(users.filter((u) => u.id !== userId))
      toast({
        title: 'Success',
        description: 'User removed',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to remove user',
        variant: 'destructive',
      })
    }
  }

  const handleRevokeInvite = async (inviteId: string) => {
    try {
      await window.api.users.revokeInvite(inviteId)
      setInvites(invites.filter((i) => i.id !== inviteId))
      toast({
        title: 'Success',
        description: 'Invite revoked',
        variant: 'success',
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to revoke invite',
        variant: 'destructive',
      })
    }
  }

  const copyInviteToken = async (invite: InviteToken) => {
    const inviteInfo = `You've been invited to YouTube Content Factory!

To set up your account:
1. Open the app and click "Have an invite? Create your account"
2. Or go directly to the Register page

Your invite details:
- Email: ${invite.email}
- Invite Token: ${invite.token}
- Expires: ${new Date(invite.expiresAt).toLocaleDateString()}

Enter your email, the invite token above, and choose a password to complete your registration.`
    await navigator.clipboard.writeText(inviteInfo)
    toast({
      title: 'Copied',
      description: 'Invite instructions copied to clipboard',
      variant: 'success',
    })
  }

  const pendingInvites = invites.filter((i) => !i.usedAt)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">User Management</h1>
          <p className="text-text-secondary">Manage team members and invitations</p>
        </div>
        <Button onClick={() => setShowInviteDialog(true)} className="gap-2">
          <UserPlus className="w-4 h-4" />
          Invite User
        </Button>
      </div>

      {/* Active Users */}
      <Card className="border-border-default">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-accent" />
            <CardTitle className="text-base">Team Members</CardTitle>
          </div>
          <CardDescription>{users.length} active users</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 rounded-lg bg-bg-elevated border border-border-default"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center text-accent font-medium">
                    {user.displayName?.[0]?.toUpperCase() || user.email[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">
                      {user.displayName || user.email}
                      {user.id === currentUser?.id && (
                        <span className="ml-2 text-xs text-text-tertiary">(You)</span>
                      )}
                    </p>
                    <p className="text-sm text-text-tertiary">{user.email}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {user.id === currentUser?.id ? (
                    <Badge variant="secondary" className="gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      {user.role}
                    </Badge>
                  ) : (
                    <Select
                      value={user.role}
                      onValueChange={(value) => handleUpdateRole(user.id, value as UserRole)}
                    >
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <span className="flex items-center gap-2">
                            <ShieldCheck className="w-3 h-3" />
                            Admin
                          </span>
                        </SelectItem>
                        <SelectItem value="manager">
                          <span className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            Manager
                          </span>
                        </SelectItem>
                        <SelectItem value="editor">
                          <span className="flex items-center gap-2">
                            <Shield className="w-3 h-3" />
                            Editor
                          </span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  )}

                  {user.id !== currentUser?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDeleteUser(user.id)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}

            {users.length === 0 && (
              <p className="text-center text-text-tertiary py-8">
                No users yet. Invite your first team member!
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Pending Invites */}
      <Card className="border-border-default">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-accent" />
            <CardTitle className="text-base">Pending Invites</CardTitle>
          </div>
          <CardDescription>{pendingInvites.length} pending invitations</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingInvites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between p-4 rounded-lg bg-bg-elevated border border-border-default"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-yellow-500" />
                  </div>
                  <div>
                    <p className="font-medium text-text-primary">{invite.email}</p>
                    <div className="flex items-center gap-2 text-sm text-text-tertiary">
                      <Clock className="w-3 h-3" />
                      Expires {new Date(invite.expiresAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <Badge variant={invite.role === 'admin' ? 'default' : 'secondary'}>
                    {invite.role}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyInviteToken(invite)}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleRevokeInvite(invite.id)}
                    className="text-red-500 hover:text-red-600 hover:bg-red-500/10"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}

            {pendingInvites.length === 0 && (
              <p className="text-center text-text-tertiary py-8">
                No pending invitations
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Invite New User</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email Address</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="bg-bg-elevated border-border-default"
              />
            </div>

            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">
                    <span className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      Editor (Channel Manager)
                    </span>
                  </SelectItem>
                  <SelectItem value="manager">
                    <span className="flex items-center gap-2">
                      <Shield className="w-3 h-3" />
                      Manager (Own API Keys)
                    </span>
                  </SelectItem>
                  <SelectItem value="admin">
                    <span className="flex items-center gap-2">
                      <ShieldCheck className="w-3 h-3" />
                      Admin (Full Access)
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-text-tertiary">
                {inviteRole === 'admin'
                  ? 'Admins can manage users, settings, and all content.'
                  : inviteRole === 'manager'
                    ? 'Managers have their own API keys and isolated content.'
                    : 'Editors can create and manage projects within their assigned channels.'}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateInvite} disabled={creatingInvite}>
              {creatingInvite ? 'Creating...' : 'Create Invite'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
