import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'

interface User {
  id: string
  username: string
  is_admin: boolean
  storage_quota_bytes: string
  storage_used_bytes: string
  created_at: string
}

interface CreateUserPayload {
  username: string
  password: string
  is_admin: boolean
  storage_quota_bytes?: number
}

interface UpdateUserPayload {
  is_admin?: boolean
  storage_quota_bytes?: number
}

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr)
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function gbToBytes(gb: number): number {
  return gb * 1024 * 1024 * 1024
}

function bytesToGb(bytesStr: string): string {
  const bytes = Number(bytesStr)
  return (bytes / (1024 * 1024 * 1024)).toFixed(1)
}

export default function UsersPage() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingUser, setEditingUser] = useState<User | null>(null)
  const [deletingUser, setDeletingUser] = useState<User | null>(null)

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async (): Promise<User[]> => {
      const res = await fetch('/api/admin/users', { headers })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to fetch users')
      }
      const body = await res.json() as { users: User[] }
      return body.users
    },
  })

  const createMutation = useMutation({
    mutationFn: async (payload: CreateUserPayload) => {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to create user')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setShowCreateModal(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...payload }: UpdateUserPayload & { id: string }) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to update user')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setEditingUser(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers,
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to delete user')
      }
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      setDeletingUser(null)
    },
  })

  const users = data ?? []

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Users</h2>
          <p className="mt-1 text-sm text-gray-500">
            Manage user accounts, quotas, and permissions.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          Add User
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error instanceof Error ? error.message : 'Failed to load users'}
        </div>
      )}

      {/* Users table */}
      <div className="mt-6 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-gray-200">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Username
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Role
              </th>
              <th className="hidden sm:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Storage
              </th>
              <th className="hidden md:table-cell px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Created
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                  Loading users...
                </td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-sm text-gray-400">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {user.username}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        user.is_admin
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {user.is_admin ? 'Admin' : 'User'}
                    </span>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4 text-sm text-gray-500">
                    {formatBytes(user.storage_used_bytes)} / {formatBytes(user.storage_quota_bytes)}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4 text-sm text-gray-500">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-6 py-4 text-right text-sm space-x-2">
                    <button
                      onClick={() => setEditingUser(user)}
                      className="text-indigo-600 hover:text-indigo-800 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setDeletingUser(user)}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSubmit={(payload) => createMutation.mutate(payload)}
          isLoading={createMutation.isPending}
          error={createMutation.error}
        />
      )}

      {/* Edit User Modal */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSubmit={(payload) =>
            updateMutation.mutate({ id: editingUser.id, ...payload })
          }
          isLoading={updateMutation.isPending}
          error={updateMutation.error}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          onClose={() => setDeletingUser(null)}
          onConfirm={() => deleteMutation.mutate(deletingUser.id)}
          isLoading={deleteMutation.isPending}
          error={deleteMutation.error}
        />
      )}
    </div>
  )
}

function CreateUserModal({
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  onClose: () => void
  onSubmit: (payload: CreateUserPayload) => void
  isLoading: boolean
  error: Error | null
}) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [quotaGb, setQuotaGb] = useState('1')
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    const trimmed = username.trim()
    if (trimmed.length < 3) {
      setValidationError('Username must be at least 3 characters')
      return
    }
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters')
      return
    }
    const gb = parseFloat(quotaGb)
    if (isNaN(gb) || gb <= 0) {
      setValidationError('Storage quota must be a positive number')
      return
    }

    onSubmit({
      username: trimmed,
      password,
      is_admin: isAdmin,
      storage_quota_bytes: gbToBytes(gb),
    })
  }

  const displayError = validationError ?? (error?.message || null)

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Create User</h3>
      <p className="mt-1 text-sm text-gray-500">
        Add a new user account to the system.
      </p>

      {displayError && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
            placeholder="username"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
            placeholder="Minimum 8 characters"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Storage Quota (GB)
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={quotaGb}
            onChange={(e) => setQuotaGb(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="create-is-admin"
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            disabled={isLoading}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="create-is-admin" className="text-sm font-medium text-gray-700">
            Admin privileges
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function EditUserModal({
  user,
  onClose,
  onSubmit,
  isLoading,
  error,
}: {
  user: User
  onClose: () => void
  onSubmit: (payload: UpdateUserPayload) => void
  isLoading: boolean
  error: Error | null
}) {
  const [isAdmin, setIsAdmin] = useState(user.is_admin)
  const [quotaGb, setQuotaGb] = useState(bytesToGb(user.storage_quota_bytes))
  const [validationError, setValidationError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)

    const gb = parseFloat(quotaGb)
    if (isNaN(gb) || gb <= 0) {
      setValidationError('Storage quota must be a positive number')
      return
    }

    onSubmit({
      is_admin: isAdmin,
      storage_quota_bytes: gbToBytes(gb),
    })
  }

  const displayError = validationError ?? (error?.message || null)

  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Edit User</h3>
      <p className="mt-1 text-sm text-gray-500">
        Update settings for <span className="font-medium text-gray-700">{user.username}</span>.
      </p>

      {displayError && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Username</label>
          <input
            type="text"
            value={user.username}
            disabled
            className="mt-1 block w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 shadow-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700">
            Storage Quota (GB)
          </label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            value={quotaGb}
            onChange={(e) => setQuotaGb(e.target.value)}
            disabled={isLoading}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
          />
          <p className="mt-1 text-xs text-gray-400">
            Currently using {formatBytes(user.storage_used_bytes)}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <input
            id="edit-is-admin"
            type="checkbox"
            checked={isAdmin}
            onChange={(e) => setIsAdmin(e.target.checked)}
            disabled={isLoading}
            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
          />
          <label htmlFor="edit-is-admin" className="text-sm font-medium text-gray-700">
            Admin privileges
          </label>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:bg-indigo-400 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  )
}

function DeleteUserModal({
  user,
  onClose,
  onConfirm,
  isLoading,
  error,
}: {
  user: User
  onClose: () => void
  onConfirm: () => void
  isLoading: boolean
  error: Error | null
}) {
  return (
    <ModalOverlay onClose={onClose}>
      <h3 className="text-lg font-semibold text-gray-900">Delete User</h3>
      <p className="mt-2 text-sm text-gray-500">
        Are you sure you want to delete{' '}
        <span className="font-medium text-gray-700">{user.username}</span>?
        This will permanently remove the user and all their videos.
      </p>

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error.message}
        </div>
      )}

      <div className="mt-4 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading}
          className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors disabled:bg-red-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Deleting...' : 'Delete User'}
        </button>
      </div>
    </ModalOverlay>
  )
}

function ModalOverlay({
  onClose,
  children,
}: {
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        {children}
      </div>
    </div>
  )
}
