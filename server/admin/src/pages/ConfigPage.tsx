const configSections = [
  {
    title: 'Storage',
    description: 'Configure default storage quotas for new users.',
    fields: [
      { label: 'Default Storage Quota', value: '1 GB', type: 'text' as const },
    ],
  },
  {
    title: 'Notifications',
    description: 'Configure push notification schedule.',
    fields: [
      { label: 'Notification Time (UTC)', value: '09:00', type: 'text' as const },
    ],
  },
  {
    title: 'Distribution',
    description: 'Configure default distribution settings.',
    fields: [
      { label: 'Default Timer (days)', value: '7', type: 'text' as const },
      { label: 'Video Expiry After Distribution (days)', value: '7', type: 'text' as const },
    ],
  },
]

export default function ConfigPage() {
  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900">Configuration</h2>
      <p className="mt-1 text-sm text-gray-500">
        System-wide settings and defaults.
      </p>

      <div className="mt-6 space-y-6">
        {configSections.map((section) => (
          <div
            key={section.title}
            className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-gray-200"
          >
            <h3 className="text-lg font-semibold text-gray-900">{section.title}</h3>
            <p className="mt-1 text-sm text-gray-500">{section.description}</p>

            <div className="mt-4 space-y-4">
              {section.fields.map((field) => (
                <div key={field.label}>
                  <label className="block text-sm font-medium text-gray-700">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    defaultValue={field.value}
                    disabled
                    className="mt-1 block w-full max-w-xs rounded-md border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500 shadow-sm"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="flex justify-end">
          <button
            disabled
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white opacity-50 cursor-not-allowed"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  )
}
