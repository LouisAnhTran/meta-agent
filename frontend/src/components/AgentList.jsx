import { useState } from 'react'
import { PanelLeftClose, PanelLeftOpen, Plus, Settings, Flag, ChevronRight, CheckCircle2, XCircle, Loader2, Clock } from 'lucide-react'

export default function Sidebar({
  open,
  onToggle,
  agents,
  selectedAgentId,
  isCreatingNew,
  panelMode,
  onSelectAgent,
  onOpenPanel,
  onCreateNew,
}) {
  const [expandedId, setExpandedId] = useState(null)

  function handleAgentClick(id) {
    if (selectedAgentId !== id) {
      onSelectAgent(id)
      setExpandedId(id)
    } else {
      setExpandedId(prev => (prev === id ? null : id))
    }
  }

  return (
    <aside
      className={`flex-shrink-0 flex flex-col border-r border-dark-border bg-dark-surface overflow-hidden transition-[width] duration-300 ease-in-out ${
        open ? 'w-56' : 'w-10'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-2 py-3 border-b border-dark-border flex-shrink-0">
        {open && (
          <span className="text-sm font-semibold text-dark-accent truncate ml-1">CS Meta-Agent</span>
        )}
        <button
          onClick={onToggle}
          className="text-dark-muted hover:text-dark-text p-1 rounded ml-auto flex-shrink-0"
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
        >
          {open ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </button>
      </div>

      {/* New agent button */}
      <div className="px-2 py-2 border-b border-dark-border flex-shrink-0">
        <button
          onClick={onCreateNew}
          className="create-agent-btn w-full flex items-center gap-2 px-2 py-1.5 rounded bg-dark-accent/10 hover:bg-dark-accent/20 text-dark-accent text-sm transition-colors"
          title="New Agent"
        >
          <Plus size={14} className="flex-shrink-0" />
          {open && <span className="truncate">New Agent</span>}
        </button>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto py-1">
        {isCreatingNew && (
          <div className={`flex items-center gap-2 px-2 py-2 bg-dark-accent/10 border-l-2 border-dark-accent`}>
            <div className="w-2 h-2 rounded-full bg-dark-accent flex-shrink-0" />
            {open && <span className="text-xs text-dark-accent font-medium truncate">New Agent</span>}
          </div>
        )}

        {agents.length === 0 && !isCreatingNew && open && (
          <p className="text-xs text-dark-muted px-3 py-4 text-center leading-relaxed">
            No agents yet.<br />Create one to get started.
          </p>
        )}

        {agents.map(agent => {
          const isSelected = selectedAgentId === agent.id && !isCreatingNew
          const isExpanded = expandedId === agent.id && open

          return (
            <div key={agent.id}>
              <button
                onClick={() => handleAgentClick(agent.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 text-left hover:bg-dark-bg/50 transition-colors ${
                  isSelected ? 'bg-dark-bg/60' : ''
                }`}
                title={open ? undefined : agent.name}
              >
                <StatusIcon status={agent.status} />
                {open && (
                  <>
                    <span className="flex-1 text-sm text-dark-text truncate">{agent.name}</span>
                    <ChevronRight
                      size={12}
                      className={`text-dark-muted flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    />
                  </>
                )}
              </button>

              {/* Expanded actions */}
              <div
                className={`grid transition-[grid-template-rows,opacity] duration-300 ease-in-out ${
                  isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                }`}
              >
                <div className="overflow-hidden">
                  <div className="flex flex-col mx-2 mb-1 gap-1 pt-1">
                    <PanelOption
                      icon={<Settings size={13} />}
                      label="Agent Settings"
                      active={panelMode === 'settings' && isSelected}
                      onClick={() => onOpenPanel('settings')}
                    />
                    <PanelOption
                      icon={<Flag size={13} />}
                      label="Feedback Reports"
                      active={panelMode === 'feedback' && isSelected}
                      onClick={() => onOpenPanel('feedback')}
                    />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </aside>
  )
}

function PanelOption({ icon, label, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex items-center gap-2 pl-3 pr-2 py-1.5 text-xs rounded-md border transition-all duration-200 ease-in-out transform hover:translate-x-0.5 ${
        active
          ? 'bg-dark-accent/15 border-dark-accent/40 text-dark-accent shadow-sm'
          : 'bg-dark-bg/40 border-dark-border text-dark-muted hover:bg-dark-surface hover:border-dark-accent/40 hover:text-dark-text'
      }`}
    >
      <span
        className={`flex items-center transition-transform duration-200 ${
          active ? 'scale-110' : 'group-hover:scale-110'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 text-left">{label}</span>
      <ChevronRight
        size={12}
        className={`transition-all duration-200 ${
          active
            ? 'opacity-100 text-dark-accent translate-x-0'
            : 'opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0'
        }`}
      />
    </button>
  )
}

const STATUS_LABELS = {
  ready: 'Successfully indexed — ready to chat',
  indexing: 'Indexing in progress…',
  failed: 'Indexing failed — please re-index',
  pending: 'Pending — not yet indexed',
}

function StatusIcon({ status }) {
  const label = STATUS_LABELS[status] ?? STATUS_LABELS.pending
  let icon
  if (status === 'ready')
    icon = <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
  else if (status === 'indexing')
    icon = <Loader2 size={14} className="text-yellow-400 flex-shrink-0 animate-spin" />
  else if (status === 'failed')
    icon = <XCircle size={14} className="text-red-400 flex-shrink-0" />
  else
    icon = <Clock size={14} className="text-gray-500 flex-shrink-0" />

  return (
    <span className="relative group flex items-center flex-shrink-0">
      {icon}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-1.5 whitespace-nowrap rounded bg-dark-bg border border-dark-border px-2 py-1 text-xs text-dark-text opacity-0 group-hover:opacity-100 transition-opacity duration-100 z-50 shadow-lg"
      >
        {label}
      </span>
    </span>
  )
}
