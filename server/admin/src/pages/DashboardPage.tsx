import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthContext'

interface RecentVideo {
  id: string
  title: string
  username: string
  file_size_bytes: string
  status: string
  created_at: string
}

interface RecentDistribution {
  id: string
  title: string
  username: string
  distributed_at: string
}

interface SystemStats {
  total_users: number
  total_videos: number
  active_videos: number
  distributed_videos: number
  pending_videos: number
  expired_videos: number
  total_storage_used_bytes: string
  total_storage_quota_bytes: string
  recent_uploads: RecentVideo[]
  recent_distributions: RecentDistribution[]
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
    hour: 'numeric',
    minute: '2-digit',
  })
}

function storagePercent(used: string, quota: string): number {
  const u = Number(used)
  const q = Number(quota)
  if (q === 0) return 0
  return Math.min(Math.round((u / q) * 100), 100)
}

function statusColor(status: string): string {
  switch (status) {
    case 'ACTIVE':
      return 'bg-green-100 text-green-700'
    case 'DISTRIBUTED':
      return 'bg-blue-100 text-blue-700'
    case 'PENDING':
      return 'bg-yellow-100 text-yellow-700'
    case 'EXPIRED':
      return 'bg-gray-100 text-gray-600'
    default:
      return 'bg-gray-100 text-gray-600'
  }
}

export default function DashboardPage() {
  const { token } = useAuth()

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  }

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async (): Promise<SystemStats> => {
      const res = await fetch('/api/admin/stats', { headers })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? 'Failed to fetch stats')
      }
      const body = await res.json() as { stats: SystemStats }
      return body.stats
    },
    refetchInterval: 30_000,
  })

  const statCards = [
    { label: 'Total Users', value: stats?.total_users.toString() ?? '--', description: 'Registered accounts' },
    { label: 'Total Videos', value: stats?.total_videos.toString() ?? '--', description: 'Uploaded videos' },
    { label: 'Active Videos', value: stats?.active_videos.toString() ?? '--', description: 'Awaiting distribution' },
    { label: 'Storage Used', value: stats ? formatBytes(stats.total_storage_used_bytes) : '--', description: stats ? `of ${formatBytes(stats.total_storage_quota_bytes)} total quota` : 'Total disk usage' },
  ]

  const pct = stats ? storagePercent(stats.total_storage_used_bytes, stats.total_storage_quota_bytes) : 0

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
      <p className="mt-1 text-sm text-gray-500">
        System overview and statistics.
      </p>

      {/* Error state */}
      {error && (
        <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
          {error instanceof Error ? error.message : 'Failed to load stats'}
        </div>
      )}

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            {isLoading ? (
              <div className="mt-2 h-9 w-16 animate-pulse rounded bg-gray-200" />
            ) : (
              <p className="mt-2 text-3xl font-semibold text-gray-900">{stat.value}</p>
            )}
            <p className="mt-1 text-xs text-gray-400">{stat.description}</p>
            {stat.label === 'Storage Used' && stats && (
              <div className="mt-2">
                <div className="h-1.5 w-full rounded-full bg-gray-200">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-400">{pct}% utilized</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Video status breakdown */}
      {stats && (
        <div className="mt-6 rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200">
          <h3 className="text-sm font-medium text-gray-500">Videos by Status</h3>
          <div className="mt-3 flex flex-wrap gap-4">
            {[
              { label: 'Active', count: stats.active_videos, color: 'bg-green-100 text-green-700' },
              { label: 'Pending', count: stats.pending_videos, color: 'bg-yellow-100 text-yellow-700' },
              { label: 'Distributed', count: stats.distributed_videos, color: 'bg-blue-100 text-blue-700' },
              { label: 'Expired', count: stats.expired_videos, color: 'bg-gray-100 text-gray-600' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-2">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${item.color}`}>
                  {item.label}
                </span>
                <span className="text-sm font-semibold text-gray-900">{item.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent activity sections */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Uploads</h3>
          <p className="mt-1 text-sm text-gray-500">
            Most recently uploaded videos across all users.
          </p>
          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : stats && stats.recent_uploads.length > 0 ? (
            <div className="mt-4 divide-y divide-gray-100">
              {stats.recent_uploads.map((video) => (
                <div key={video.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{video.title}</p>
                    <p className="text-xs text-gray-400">
                      {video.username} &middot; {formatBytes(video.file_size_bytes)}
                    </p>
                  </div>
                  <div className="ml-3 flex flex-col items-end gap-1">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(video.status)}`}>
                      {video.status}
                    </span>
                    <span className="text-xs text-gray-400">{formatDate(video.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12">
              <span className="text-sm text-gray-400">No recent uploads</span>
            </div>
          )}
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Distributions</h3>
          <p className="mt-1 text-sm text-gray-500">
            Videos recently distributed to recipients.
          </p>
          {isLoading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 animate-pulse rounded bg-gray-100" />
              ))}
            </div>
          ) : stats && stats.recent_distributions.length > 0 ? (
            <div className="mt-4 divide-y divide-gray-100">
              {stats.recent_distributions.map((video) => (
                <div key={video.id} className="flex items-center justify-between py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{video.title}</p>
                    <p className="text-xs text-gray-400">{video.username}</p>
                  </div>
                  <span className="ml-3 text-xs text-gray-400">
                    {formatDate(video.distributed_at)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12">
              <span className="text-sm text-gray-400">No distributions yet</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
