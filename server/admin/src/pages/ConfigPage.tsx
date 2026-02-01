import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'

interface ConfigData {
  default_storage_quota_bytes: string
  notification_time_utc: string
  video_expiration_days: string
  distribution_check_interval_minutes: string
  [key: string]: string
}

function bytesToGbStr(bytesStr: string): string {
  const bytes = Number(bytesStr)
  if (isNaN(bytes) || bytes === 0) return '0'
  return (bytes / (1024 * 1024 * 1024)).toFixed(1)
}

function gbToBytesStr(gb: number): string {
  return String(Math.round(gb * 1024 * 1024 * 1024))
}

export default function ConfigPage() {
  const { token } = useAuth()
  const queryClient = useQueryClient()

  const [quotaGb, setQuotaGb] = useState('')
  const [notificationTime, setNotificationTime] = useState('')
  const [expirationDays, setExpirationDays] = useState('')
  const [checkInterval, setCheckInterval] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const { data: config, isLoading, error } = useQuery({
    queryKey: ['admin-config'],
    queryFn: async (): Promise<ConfigData> => {
      const res = await fetch('/api/admin/config', { headers })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to fetch configuration')
      }
      const body = await res.json() as { config: ConfigData }
      return body.config
    },
  })

  useEffect(() => {
    if (config) {
      setQuotaGb(bytesToGbStr(config.default_storage_quota_bytes))
      setNotificationTime(config.notification_time_utc)
      setExpirationDays(config.video_expiration_days)
      setCheckInterval(config.distribution_check_interval_minutes)
    }
  }, [config])

  const saveMutation = useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await fetch('/api/admin/config', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to save configuration')
      }
      return res.json() as Promise<{ config: ConfigData }>
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-config'] })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setValidationError(null)
    setSaveSuccess(false)

    const gb = parseFloat(quotaGb)
    if (isNaN(gb) || gb <= 0) {
      setValidationError('Default storage quota must be a positive number')
      return
    }

    const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(notificationTime.trim())
    if (!timeMatch) {
      setValidationError('Notification time must be in HH:MM format (00:00 - 23:59)')
      return
    }

    const expDays = parseInt(expirationDays, 10)
    if (isNaN(expDays) || expDays < 1) {
      setValidationError('Video expiration must be at least 1 day')
      return
    }

    const interval = parseInt(checkInterval, 10)
    if (isNaN(interval) || interval < 1) {
      setValidationError('Distribution check interval must be at least 1 minute')
      return
    }

    saveMutation.mutate({
      default_storage_quota_bytes: gbToBytesStr(gb),
      notification_time_utc: notificationTime.trim(),
      video_expiration_days: String(expDays),
      distribution_check_interval_minutes: String(interval),
    })
  }

  const hasChanges = config
    ? bytesToGbStr(config.default_storage_quota_bytes) !== quotaGb ||
      config.notification_time_utc !== notificationTime ||
      config.video_expiration_days !== expirationDays ||
      config.distribution_check_interval_minutes !== checkInterval
    : false

  const displayError = validationError ?? (saveMutation.error?.message || null)

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Configuration</h2>
      <p className="mt-1 text-sm text-gray-500">
        System-wide settings and defaults.
      </p>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error instanceof Error ? error.message : 'Failed to load configuration'}
        </div>
      )}

      {isLoading ? (
        <div className="mt-6 text-sm text-gray-400">Loading configuration...</div>
      ) : config ? (
        <form onSubmit={handleSubmit}>
          {displayError && (
            <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
              {displayError}
            </div>
          )}

          {saveSuccess && (
            <div className="mt-4 rounded-md bg-green-50 px-4 py-3 text-sm text-green-700 ring-1 ring-green-200">
              Configuration saved successfully.
            </div>
          )}

          <div className="mt-6 space-y-6">
            {/* Storage Section */}
            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Storage</h3>
              <p className="mt-1 text-sm text-gray-500">
                Configure default storage quotas for new users.
              </p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Default Storage Quota (GB)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={quotaGb}
                  onChange={(e) => setQuotaGb(e.target.value)}
                  disabled={saveMutation.isPending}
                  className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Applied to newly created users. Does not affect existing users.
                </p>
              </div>
            </div>

            {/* Notifications Section */}
            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Notifications</h3>
              <p className="mt-1 text-sm text-gray-500">
                Configure push notification schedule.
              </p>
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700">
                  Notification Time (UTC)
                </label>
                <input
                  type="time"
                  value={notificationTime}
                  onChange={(e) => setNotificationTime(e.target.value)}
                  disabled={saveMutation.isPending}
                  className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Daily check-in reminders are sent at this time (UTC).
                </p>
              </div>
            </div>

            {/* Distribution Section */}
            <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Distribution</h3>
              <p className="mt-1 text-sm text-gray-500">
                Configure default distribution settings.
              </p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Video Expiry After Distribution (days)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={expirationDays}
                    onChange={(e) => setExpirationDays(e.target.value)}
                    disabled={saveMutation.isPending}
                    className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    Distributed videos are automatically deleted after this many days.
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">
                    Distribution Check Interval (minutes)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={checkInterval}
                    onChange={(e) => setCheckInterval(e.target.value)}
                    disabled={saveMutation.isPending}
                    className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    How often the system checks for videos due for distribution.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saveMutation.isPending || !hasChanges}
              className={`rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors ${
                saveMutation.isPending || !hasChanges
                  ? 'bg-indigo-400 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700'
              }`}
            >
              {saveMutation.isPending ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  )
}
