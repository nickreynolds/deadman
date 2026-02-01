const stats = [
  { label: 'Total Users', value: '--', description: 'Registered accounts' },
  { label: 'Total Videos', value: '--', description: 'Uploaded videos' },
  { label: 'Active Videos', value: '--', description: 'Awaiting distribution' },
  { label: 'Storage Used', value: '--', description: 'Total disk usage' },
]

export default function DashboardPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Dashboard</h2>
      <p className="mt-1 text-sm text-gray-500">
        System overview and statistics.
      </p>

      {/* Stats grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-gray-200"
          >
            <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            <p className="mt-2 text-3xl font-semibold text-gray-900">{stat.value}</p>
            <p className="mt-1 text-xs text-gray-400">{stat.description}</p>
          </div>
        ))}
      </div>

      {/* Placeholder sections */}
      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
          <p className="mt-2 text-sm text-gray-500">
            Recent video uploads and distributions will appear here.
          </p>
          <div className="mt-4 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12">
            <span className="text-sm text-gray-400">No recent activity</span>
          </div>
        </div>

        <div className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
          <p className="mt-2 text-sm text-gray-500">
            Server status and background job health.
          </p>
          <div className="mt-4 flex items-center justify-center rounded-lg border-2 border-dashed border-gray-200 py-12">
            <span className="text-sm text-gray-400">System status will appear here</span>
          </div>
        </div>
      </div>
    </div>
  )
}
