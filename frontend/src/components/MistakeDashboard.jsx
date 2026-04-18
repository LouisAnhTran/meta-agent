import { useState, useEffect } from 'react'
import { api } from '../api'

export default function MistakeDashboard({ agent }) {
  // feedback-panel class used as tour target
  const [mistakes, setMistakes] = useState([])
  const [loading, setLoading] = useState(false)
  const [fixing, setFixing] = useState(null)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!agent) return
    setLoading(true)
    api.getMistakes(agent.id)
      .then(setMistakes)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [agent?.id])

  async function handleRunFix(mistake) {
    setFixing(mistake.id)
    try {
      const updated = await api.runFix(mistake.id)
      setMistakes(prev => prev.map(m => m.id === mistake.id ? { ...m, ...updated } : m))
    } catch (e) {
      alert(e.message || 'Fix failed')
    } finally {
      setFixing(null)
    }
  }

  if (!agent) return null

  if (loading) {
    return <p className="feedback-panel text-dark-muted text-sm p-4 text-center">Loading…</p>
  }

  if (mistakes.length === 0) {
    return <p className="feedback-panel text-dark-muted text-sm p-4 text-center">No mistake reports yet.</p>
  }

  return (
    <div className="feedback-panel flex flex-col gap-2 p-3">
      {mistakes.map(m => (
        <div key={m.id} className="border border-dark-border rounded bg-dark-bg">
          <button
            onClick={() => setExpanded(expanded === m.id ? null : m.id)}
            className="w-full text-left px-3 py-2 flex items-center justify-between gap-2"
          >
            <span className="text-sm text-dark-text truncate flex-1">{m.user_message}</span>
            <StatusPill status={m.status} />
          </button>

          {expanded === m.id && (
            <div className="px-3 pb-3 flex flex-col gap-2 border-t border-dark-border pt-2">
              <Field label="User question" value={m.user_message} />
              <Field label="Bot response" value={m.bot_response} />
              <Field label="Reported issue" value={m.user_description} />

              {m.fix_comment && (
                <Field label="Fix applied" value={m.fix_comment} accent />
              )}

              {m.verified_response && (
                <div className="flex flex-col gap-1">
                  <p className="text-xs text-dark-muted uppercase tracking-wide">After fix</p>
                  <p className="text-xs text-green-400 bg-green-900/20 border border-green-700/40 rounded p-2">{m.verified_response}</p>
                </div>
              )}

              {m.status === 'pending' && (
                <button
                  onClick={() => handleRunFix(m)}
                  disabled={fixing === m.id}
                  className="mt-1 w-full py-1.5 text-xs bg-dark-accent text-white rounded hover:opacity-90 disabled:opacity-50"
                >
                  {fixing === m.id ? 'Running…' : 'Run Fix'}
                </button>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function Field({ label, value, accent }) {
  return (
    <div>
      <p className="text-xs text-dark-muted uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-xs rounded p-2 border ${accent ? 'text-dark-accent bg-dark-accent/10 border-dark-accent/30' : 'text-dark-text bg-dark-surface border-dark-border'}`}>
        {value}
      </p>
    </div>
  )
}

function StatusPill({ status }) {
  const map = {
    pending: 'bg-yellow-500/20 text-yellow-400',
    fixed: 'bg-green-500/20 text-green-400',
    wont_fix: 'bg-gray-500/20 text-gray-400',
  }
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded flex-shrink-0 ${map[status] ?? map.pending}`}>
      {status}
    </span>
  )
}
