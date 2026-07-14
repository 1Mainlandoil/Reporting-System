import { useState } from 'react'
import Card from '../components/ui/Card'
import { useAppStore } from '../store/useAppStore'
import { APP_VERSION } from '../constants/appVersion'

const ToggleSetting = ({ label, value, onChange }) => (
  <label className="flex items-center justify-between gap-3 rounded-lg border border-white/8 px-3 py-2 dark:border-slate-800">
    <span className="text-sm text-slate-200 dark:text-slate-200">{label}</span>
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        value
          ? 'bg-emerald-600 text-white'
          : 'bg-slate-200 text-slate-200 dark:bg-slate-700 dark:text-slate-200'
      }`}
    >
      {value ? 'Enabled' : 'Disabled'}
    </button>
  </label>
)

const SettingsPage = () => {
  const [updateStatus, setUpdateStatus] = useState('idle') // idle | updating | done

  const handleUpdateApp = async () => {
    setUpdateStatus('updating')
    try {
      // Unregister all service workers
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((r) => r.unregister()))
      }
      // Clear all caches
      if (window.caches) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      localStorage.setItem('app_version', APP_VERSION)
      setUpdateStatus('done')
      // Hard reload after short delay so user sees the "done" state
      window.setTimeout(() => window.location.reload(true), 800)
    } catch {
      window.location.reload(true)
    }
  }

  const theme = useAppStore((state) => state.theme)
  const toggleTheme = useAppStore((state) => state.toggleTheme)
  const appSettings = useAppStore((state) => state.appSettings)
  const updateAppSettings = useAppStore((state) => state.updateAppSettings)

  const criticalMax = Number(appSettings.stockThresholds.criticalMax ?? 500)
  const warningMax = Number(appSettings.stockThresholds.warningMax ?? 999)
  const safeMin = warningMax + 1

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="text-lg font-semibold">Settings</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Configure alert rules, reporting behavior, and system preferences.
        </p>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-base font-semibold">Appearance</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Choose your preferred interface mode.
        </p>
        <div className="flex items-center justify-between rounded-lg border border-white/8 p-3 dark:border-slate-800">
          <p className="text-sm">
            Current mode: <span className="font-semibold capitalize">{theme}</span>
          </p>
          <button
            type="button"
            onClick={toggleTheme}
            className="rounded-lg border border-white/10 px-3 py-2 text-sm dark:border-slate-700"
          >
            Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
          </button>
        </div>
      </Card>

      <Card className="space-y-4">
        <h3 className="text-base font-semibold">Stock Alert Thresholds</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Set liter thresholds used to classify station stock status.
        </p>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="space-y-1">
            <span className="text-sm font-medium">Critical Max (L)</span>
            <input
              type="number"
              min="0"
              value={criticalMax}
              onChange={(event) =>
                updateAppSettings('stockThresholds', 'criticalMax', Number(event.target.value || 0))
              }
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm dark:border-slate-700 dark:bg-[#0d1220]"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Warning Max (L)</span>
            <input
              type="number"
              min={criticalMax + 1}
              value={warningMax}
              onChange={(event) => {
                const nextValue = Number(event.target.value || 0)
                updateAppSettings('stockThresholds', 'warningMax', Math.max(nextValue, criticalMax + 1))
              }}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm dark:border-slate-700 dark:bg-[#0d1220]"
            />
          </label>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Current bands: Critical: 0-{criticalMax}L, Warning: {criticalMax + 1}-{warningMax}L, Safe: {safeMin}L+
        </p>
      </Card>

      <Card className="space-y-3">
        <h3 className="text-base font-semibold">Notification Preferences</h3>
        <ToggleSetting
          label="Low stock alert"
          value={appSettings.notificationPreferences.lowStockAlertsEnabled}
          onChange={(value) => updateAppSettings('notificationPreferences', 'lowStockAlertsEnabled', value)}
        />
        <ToggleSetting
          label="Pending daily report alert"
          value={appSettings.notificationPreferences.pendingDailyReportAlertsEnabled}
          onChange={(value) =>
            updateAppSettings('notificationPreferences', 'pendingDailyReportAlertsEnabled', value)
          }
        />
        <ToggleSetting
          label="Escalation alert"
          value={appSettings.notificationPreferences.escalationAlertsEnabled}
          onChange={(value) => updateAppSettings('notificationPreferences', 'escalationAlertsEnabled', value)}
        />
      </Card>

      <Card className="space-y-3">
        <h3 className="text-base font-semibold">Reporting Configuration</h3>
        <ToggleSetting
          label="Daily opening stock format"
          value={appSettings.reportingConfiguration.dailyOpeningStockFormatEnabled}
          onChange={(value) => updateAppSettings('reportingConfiguration', 'dailyOpeningStockFormatEnabled', value)}
        />
        <ToggleSetting
          label="Expense line items"
          value={appSettings.reportingConfiguration.expenseLineItemsEnabled}
          onChange={(value) => updateAppSettings('reportingConfiguration', 'expenseLineItemsEnabled', value)}
        />
        <ToggleSetting
          label="Supervisor review workflow"
          value={appSettings.reportingConfiguration.supervisorReviewWorkflowEnabled}
          onChange={(value) =>
            updateAppSettings('reportingConfiguration', 'supervisorReviewWorkflowEnabled', value)
          }
        />
      </Card>
      <Card className="space-y-3">
        <div>
          <h3 className="text-base font-semibold text-white">App Update</h3>
          <p className="mt-1 text-sm text-slate-400">
            Clears cached files and reloads the latest version of the app. Use this if icons, logos, or features appear outdated.
          </p>
        </div>
        <button
          type="button"
          onClick={handleUpdateApp}
          disabled={updateStatus !== 'idle'}
          className={`w-full rounded-xl px-4 py-3 text-sm font-bold transition ${
            updateStatus === 'done'
              ? 'bg-[#a9cd39]/20 text-[#a9cd39]'
              : updateStatus === 'updating'
                ? 'cursor-not-allowed bg-white/5 text-slate-400'
                : 'bg-[#a9cd39] text-black hover:bg-[#bcd94a]'
          }`}
        >
          {updateStatus === 'updating' ? '⟳ Clearing cache...' : updateStatus === 'done' ? '✓ Updated — reloading...' : '↺ Update App'}
        </button>
        <p className="text-xs text-slate-600">
          Note: if the app icon on your phone home screen still looks old, remove and re-add the app to get the new icon.
        </p>
      </Card>
    </div>
  )
}

export default SettingsPage
