import { useState, useEffect } from 'react'
import { Plus, Trash2, Wrench, FileText, Sliders, Link as LinkIcon, User, Pencil, Check, Loader2 } from 'lucide-react'
import { api } from '../api'

const EMPTY_INSTRUCTION = { instruction_text: '', tool_name: null }

export default function AgentEditor({ agent, isCreatingNew, tools, onSaved, refreshTick, onDirtyChange }) {
  const [name, setName] = useState('')
  const [kbUrl, setKbUrl] = useState('')
  const [instructions, setInstructions] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Track the saved kb_url to determine if re-index is mandatory
  const savedKbUrl = agent?.kb_url ?? ''

  useEffect(() => {
    if (isCreatingNew) {
      setName('')
      setKbUrl('')
      setInstructions([])
      setError(null)
    } else if (agent) {
      setName(agent.name)
      setKbUrl(agent.kb_url || '')
      setInstructions(Array.isArray(agent.instructions) ? agent.instructions : [])
      setError(null)
    }
    // Reload from server when the *agent identity* changes, or when the
    // parent signals an explicit refresh (e.g. settings panel re-opened).
    // Polling (e.g. while another agent is indexing) replaces the `agent`
    // object reference without changing id — ignoring it here prevents
    // clobbering in-progress form edits (name/kb_url/instructions/editingIdx).
  }, [agent?.id, isCreatingNew, refreshTick])

  // Tools available in dropdowns (never show always_enabled tools like search_knowledge_base)
  const selectableTools = tools.filter(t => !t.always_enabled)
  const toolByName = Object.fromEntries(selectableTools.map(t => [t.name, t]))
  const usedTools = new Set(instructions.map(i => i.tool_name).filter(Boolean))

  const kbUrlChanged = !isCreatingNew && kbUrl.trim() !== savedKbUrl
  const mustReindex = isCreatingNew || kbUrlChanged
  const isFailed = !isCreatingNew && agent?.status === 'failed'
  const isIndexing = !isCreatingNew && agent?.status === 'indexing'
  const locked = isIndexing || saving

  // Only one instruction can be edited at a time. Tracked by array index.
  const [editingIdx, setEditingIdx] = useState(null)
  const anyEditing = editingIdx !== null

  // Reset editing state when switching agents
  useEffect(() => { setEditingIdx(null) }, [agent?.id, isCreatingNew])

  // Notify parent whenever the form diverges from the saved agent, so
  // external UI (e.g. chat input) can block actions until the user saves.
  useEffect(() => {
    if (!onDirtyChange) return
    if (isCreatingNew || !agent) {
      onDirtyChange(false)
      return
    }
    const savedInstructions = Array.isArray(agent.instructions) ? agent.instructions : []
    const dirty =
      name !== (agent.name ?? '') ||
      kbUrl !== (agent.kb_url ?? '') ||
      JSON.stringify(instructions) !== JSON.stringify(savedInstructions)
    onDirtyChange(dirty)
  }, [name, kbUrl, instructions, agent, isCreatingNew, onDirtyChange])

  // When this editor unmounts, clear the dirty flag so the chat is not
  // perma-blocked after the panel closes.
  useEffect(() => {
    return () => { onDirtyChange?.(false) }
  }, [onDirtyChange])

  function addInstruction() {
    setInstructions(prev => {
      const next = [...prev, { ...EMPTY_INSTRUCTION }]
      setEditingIdx(next.length - 1)
      return next
    })
  }

  function removeInstruction(idx) {
    setInstructions(prev => prev.filter((_, i) => i !== idx))
    setEditingIdx(current => {
      if (current === null) return null
      if (current === idx) return null
      if (current > idx) return current - 1
      return current
    })
  }

  function updateInstruction(idx, field, value) {
    setInstructions(prev =>
      prev.map((ins, i) => (i === idx ? { ...ins, [field]: value || null } : ins))
    )
  }

  async function handleSave(reindex) {
    if (!name.trim()) return setError('Name is required')
    if (!kbUrl.trim()) return setError('Knowledge base URL is required')
    setSaving(true)
    setError(null)
    try {
      const payload = { name: name.trim(), kb_url: kbUrl.trim(), instructions, reindex }
      const saved = isCreatingNew
        ? await api.createAgent(payload)
        : await api.updateAgent(agent.id, payload)
      onSaved(saved)
    } catch (e) {
      setError(e.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  if (!agent && !isCreatingNew) {
    return (
      <div className="flex items-center justify-center h-full text-dark-muted text-sm p-8 text-center">
        Select an agent or create a new one to get started.
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 min-h-0">
      {/* Name */}
      <Section icon={<User size={13} />} label="Agent Name">
        <input
          value={name}
          onChange={e => setName(e.target.value)}
          disabled={locked}
          placeholder="e.g. Acme Support Bot"
          className="w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-dark-text focus:outline-none focus:border-dark-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
      </Section>

      {/* KB URL */}
      <Section icon={<LinkIcon size={13} />} label="Knowledge Base URL" hint="Zendesk Help Center category URL">
        <input
          value={kbUrl}
          onChange={e => setKbUrl(e.target.value)}
          disabled={locked}
          placeholder="https://support.example.com/hc/en-us/categories/..."
          className="kb-url-input w-full bg-dark-bg border border-dark-border rounded-md px-3 py-2 text-sm text-dark-text focus:outline-none focus:border-dark-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {kbUrlChanged && (
          <p className="text-xs text-yellow-400 mt-2">⚠ URL changed — re-indexing is required to update the knowledge base.</p>
        )}
      </Section>

      {/* Instructions */}
      <div className="instructions-section">
        <div className="flex items-center gap-1.5 mb-1">
          <Wrench size={13} className="text-dark-muted" />
          <label className="text-xs text-dark-muted uppercase tracking-wide font-semibold">Instructions</label>
        </div>
        <p className="text-xs text-dark-muted mb-3">
          Each instruction binds the agent to one predefined tool. Select a tool, then edit its description to tell the agent when to use it.
        </p>

        <div className="flex flex-col gap-3">
          {instructions.map((ins, idx) => (
            <InstructionRow
              key={idx}
              index={idx + 1}
              instruction={ins}
              selectableTools={selectableTools}
              toolByName={toolByName}
              usedTools={usedTools}
              disabled={locked}
              isEditing={editingIdx === idx}
              onStartEdit={() => setEditingIdx(idx)}
              onFinishEdit={() => setEditingIdx(null)}
              onChange={(field, value) => updateInstruction(idx, field, value)}
              onRemove={() => removeInstruction(idx)}
            />
          ))}
          {instructions.length === 0 && (
            <div className="border border-dashed border-dark-border rounded-md p-4 text-center">
              <p className="text-xs text-dark-muted italic">No instructions yet. Click <span className="text-dark-accent">+ Add Instruction</span> below to bind a tool.</p>
            </div>
          )}
        </div>

        <button
          onClick={addInstruction}
          disabled={locked || anyEditing}
          title={anyEditing ? 'Click Done on the current instruction before adding another.' : undefined}
          className="mt-3 w-full flex items-center justify-center gap-1.5 py-2 text-xs font-medium text-dark-accent border border-dashed border-dark-border hover:border-dark-accent hover:bg-dark-accent/10 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-dark-border disabled:hover:bg-transparent dark:bg-dark-accent dark:text-white dark:border-solid dark:border-dark-accent dark:hover:bg-dark-accent-hover dark:hover:border-dark-accent-hover dark:shadow-sm dark:shadow-dark-accent/30 dark:disabled:bg-dark-bg dark:disabled:border-dark-border dark:disabled:text-dark-muted dark:disabled:shadow-none"
        >
          <Plus size={13} />
          Add Instruction
        </button>
        {anyEditing && (
          <p className="text-[11px] text-dark-muted mt-1.5 text-center">
            Click <span className="text-dark-accent">Done</span> on the current instruction before adding another.
          </p>
        )}
      </div>

      {error && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
          <p className="text-red-400 text-xs">{error}</p>
        </div>
      )}

      {agent?.status === 'failed' && agent?.error_message && (
        <div className="bg-red-900/20 border border-red-700/40 rounded-md px-3 py-2">
          <p className="text-red-400 text-xs">{agent.error_message}</p>
        </div>
      )}
      </div>

      {/* Save bar — pinned to the bottom of the sidebar */}
      <div className="flex-shrink-0 px-5 py-4 border-t border-dark-border bg-dark-surface">
        {isIndexing ? (
          <div className="flex items-center justify-center gap-2.5 py-2 rounded-md bg-dark-accent/10 border border-dark-accent/30">
            <Loader2 size={15} className="text-dark-accent animate-spin" />
            <span className="text-sm text-dark-accent font-medium">Indexing knowledge base…</span>
          </div>
        ) : isFailed ? (
          <button
            onClick={() => handleSave(true)}
            disabled={locked}
            className="save-reindex-btn w-full flex items-center justify-center gap-2 py-2 text-sm font-medium bg-dark-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            {saving ? 'Re-indexing…' : 'Re-index'}
          </button>
        ) : (
          <div className="flex gap-2">
            {!mustReindex && (
              <button
                onClick={() => handleSave(false)}
                disabled={locked}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-sm border border-dark-border rounded-md hover:bg-dark-bg text-dark-text disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {saving ? 'Saving…' : 'Save'}
              </button>
            )}
            <button
              onClick={() => handleSave(true)}
              disabled={locked}
              className="save-reindex-btn flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium bg-dark-accent text-white rounded-md hover:opacity-90 disabled:opacity-50 transition-opacity shadow-sm"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? 'Saving…' : 'Save & Re-index'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ icon, label, hint, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-dark-muted">{icon}</span>
        <label className="text-xs text-dark-muted uppercase tracking-wide font-semibold">{label}</label>
      </div>
      {children}
      {hint && <p className="text-xs text-dark-muted mt-1.5">{hint}</p>}
    </div>
  )
}

function InstructionRow({ index, instruction, selectableTools, toolByName, usedTools, disabled, isEditing, onStartEdit, onFinishEdit, onChange, onRemove }) {
  const currentToolName = instruction.tool_name
  const currentTool = currentToolName ? toolByName[currentToolName] : null
  const isDangling = currentToolName && !currentTool

  const availableTools = selectableTools.filter(
    t => !usedTools.has(t.name) || t.name === currentToolName
  )

  function handleToolChange(newToolName) {
    const newTool = newToolName ? toolByName[newToolName] : null
    onChange('tool_name', newToolName)
    if (newTool && !instruction.instruction_text) {
      onChange('instruction_text', newTool.description)
    }
  }

  // Collapsed summary view
  if (!isEditing && currentTool) {
    return (
      <div className={`flex items-center gap-2 bg-dark-bg/40 border border-dark-border rounded-lg px-3 py-2 shadow-sm transition-colors group ${disabled ? 'opacity-60' : 'hover:border-dark-accent/40'}`}>
        <span className="text-[10px] text-dark-muted uppercase tracking-wider font-semibold flex-shrink-0">#{index}</span>
        <Wrench size={12} className="text-dark-accent flex-shrink-0" />
        <span className="text-sm text-dark-text font-mono flex-1 truncate">{currentTool.name}</span>
        <button
          onClick={onStartEdit}
          disabled={disabled}
          className="text-dark-muted hover:text-dark-accent p-1 rounded hover:bg-dark-accent/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-muted"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="text-dark-muted hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-muted"
          title="Remove"
        >
          <Trash2 size={13} />
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 bg-dark-bg/40 border border-dark-accent/40 rounded-lg p-3 shadow-sm transition-colors">
      {/* Header: index + remove */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-dark-muted uppercase tracking-wider font-semibold">Instruction #{index}</span>
        <button
          onClick={onRemove}
          disabled={disabled}
          className="text-dark-muted hover:text-red-400 p-1 rounded hover:bg-red-500/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-dark-muted"
          title="Remove instruction"
        >
          <Trash2 size={13} />
        </button>
      </div>

      {/* Tool selector */}
      <div>
        <div className="flex items-center gap-1.5 mb-1.5">
          <Wrench size={11} className="text-dark-muted" />
          <label className="text-[11px] text-dark-muted uppercase tracking-wide font-semibold">Tool</label>
        </div>
        <p className="text-xs text-dark-muted mb-1.5">Select a tool from the predefined tools.</p>
        <select
          value={currentToolName || ''}
          onChange={e => handleToolChange(e.target.value)}
          disabled={disabled}
          className="tool-dropdown w-full bg-dark-bg border border-dark-border rounded-md px-2 py-1.5 text-xs text-dark-text focus:outline-none focus:border-dark-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">— Select a tool —</option>
          {isDangling && (
            <option value={currentToolName} disabled>
              ⚠️ {currentToolName} (no longer available)
            </option>
          )}
          {availableTools.map(t => (
            <option key={t.name} value={t.name}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Editable tool description */}
      {currentTool && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText size={11} className="text-dark-muted" />
            <label className="text-[11px] text-dark-muted uppercase tracking-wide font-semibold">Tool Description</label>
          </div>
          <p className="text-xs text-dark-muted mb-1.5">Edit how this tool should be used by the agent.</p>
          <textarea
            value={instruction.instruction_text}
            onChange={e => onChange('instruction_text', e.target.value)}
            disabled={disabled}
            placeholder="Describe when and how the agent should use this tool…"
            rows={3}
            className="w-full bg-dark-bg border border-dark-border rounded-md px-2 py-1.5 text-sm text-dark-text resize-none focus:outline-none focus:border-dark-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      )}

      {/* Fixed parameters panel */}
      {currentTool?.parameters?.properties && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sliders size={11} className="text-dark-muted" />
            <label className="text-[11px] text-dark-muted uppercase tracking-wide font-semibold">Required Parameters</label>
          </div>
          <p className="text-xs text-dark-muted mb-1.5">The tool requires these parameters. They're fixed and can't be edited.</p>
          <ul className="bg-dark-bg/80 border border-dark-border rounded-md px-2.5 py-2 text-xs flex flex-col gap-1">
            {Object.entries(currentTool.parameters.properties).map(([pname, pdef]) => {
              const required = currentTool.parameters.required?.includes(pname)
              return (
                <li key={pname} className="flex flex-wrap items-baseline gap-1">
                  <span className="font-mono text-dark-text">{pname}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-dark-surface border border-dark-border text-dark-muted">
                    {pdef.type}{required ? ' · required' : ''}
                  </span>
                  {pdef.description && (
                    <span className="text-dark-muted">— {pdef.description}</span>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Per-card done button — collapses the card */}
      <button
        onClick={onFinishEdit}
        disabled={!currentTool || disabled}
        className="flex items-center justify-center gap-1.5 mt-1 py-1.5 text-xs font-medium bg-dark-accent/15 text-dark-accent border border-dark-accent/30 rounded-md hover:bg-dark-accent/25 disabled:opacity-40 disabled:cursor-not-allowed transition-colors dark:bg-dark-accent dark:text-white dark:border-dark-accent dark:hover:bg-dark-accent-hover dark:shadow-sm dark:shadow-dark-accent/30 dark:disabled:bg-dark-bg dark:disabled:text-dark-muted dark:disabled:border-dark-border dark:disabled:shadow-none"
      >
        <Check size={13} />
        Done
      </button>
    </div>
  )
}
