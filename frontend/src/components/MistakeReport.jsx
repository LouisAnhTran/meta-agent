import { useState } from 'react'
import { api } from '../api'

export default function MistakeReport({ agentId, userMessage, botResponse, onClose, onReported }) {
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit() {
    if (!description.trim()) return setError('Please describe what went wrong.')
    setSubmitting(true)
    setError(null)
    try {
      await api.createMistake(agentId, {
        user_message: userMessage,
        bot_response: botResponse,
        user_description: description.trim(),
      })
      onReported?.()
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-dark-surface border border-dark-border rounded-lg w-full max-w-md flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-dark-text">Report a Mistake</h2>
          <button onClick={onClose} className="text-dark-muted hover:text-dark-text text-lg leading-none">×</button>
        </div>

        <div className="text-xs text-dark-muted bg-dark-bg rounded p-2 border border-dark-border max-h-32 overflow-y-auto">
          <p className="font-medium text-dark-text mb-1">Bot response:</p>
          <p>{botResponse}</p>
        </div>

        <div>
          <label className="block text-xs text-dark-muted mb-1">What went wrong?</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            placeholder="Describe the mistake…"
            className="w-full bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-dark-text resize-none focus:outline-none focus:border-dark-accent"
          />
        </div>

        {error && <p className="text-red-400 text-xs">{error}</p>}

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-dark-border rounded hover:bg-dark-bg text-dark-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 py-2 text-sm bg-dark-accent text-white rounded hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? 'Submitting…' : 'Submit Report'}
          </button>
        </div>
      </div>
    </div>
  )
}
