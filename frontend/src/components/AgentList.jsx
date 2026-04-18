import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PanelLeftClose, PanelLeftOpen, Plus, Settings, Flag, ChevronRight, CheckCircle2, XCircle, Loader2, Clock, User, LogOut, CreditCard, MoreHorizontal } from 'lucide-react'

const DUMMY_EMAIL = 'demo@atome.com'
const DUMMY_PLAN = 'Free plan'

function initialsOf(name) {
  if (!name) return 'G'
  return name.trim().split(/\s+/).map(s => s[0]).slice(0, 2).join('').toUpperCase()
}

export default function Sidebar({
  open,
  onToggle,
  agents,
  selectedAgentId,
  isCreatingNew,
  panelMode,
  userName,
  forcedExpandedId = null,
  onSelectAgent,
  onOpenPanel,
  onCreateNew,
}) {
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const effectiveExpandedId = forcedExpandedId ?? expandedId

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('sidebarWidth') || '', 10)
      if (!Number.isNaN(saved)) return saved
    } catch {}
    return 224
  })
  const [resizing, setResizing] = useState(false)

  function clampWidth(w) {
    const max = Math.max(200, Math.floor(window.innerWidth * 0.25))
    return Math.min(Math.max(w, 180), max)
  }

  function handleResizeStart(e) {
    if (!open) return
    e.preventDefault()
    const startX = e.clientX
    const startW = sidebarWidth
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev) {
      const next = clampWidth(startW + (ev.clientX - startX))
      setSidebarWidth(next)
    }
    function onUp() {
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      try { localStorage.setItem('sidebarWidth', String(sidebarWidth)) } catch {}
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Re-clamp if window shrinks below stored width
  useEffect(() => {
    function onResize() { setSidebarWidth(w => clampWidth(w)) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('sidebarWidth', String(sidebarWidth)) } catch {}
  }, [sidebarWidth])

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
      style={{ width: open ? sidebarWidth : 40 }}
      className={`relative flex-shrink-0 flex flex-col border-r border-dark-border bg-dark-surface overflow-hidden ${
        resizing ? '' : 'transition-[width] duration-300 ease-in-out'
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
      <div className="agent-list flex-1 overflow-y-auto py-1">
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
          const isExpanded = effectiveExpandedId === agent.id && open

          return (
            <div key={agent.id}>
              <button
                onClick={() => handleAgentClick(agent.id)}
                className={`w-full flex items-center gap-2 px-2 py-2 text-left border-l-2 transition-colors ${
                  isSelected
                    ? 'bg-dark-accent/10 border-dark-accent dark:bg-white/5 dark:border-dark-accent'
                    : 'border-transparent hover:bg-dark-accent/5 dark:hover:bg-white/5'
                }`}
                title={open ? undefined : agent.name}
              >
                <StatusIcon status={agent.status} />
                {open && (
                  <>
                    <span className={`flex-1 text-sm truncate ${isSelected ? 'text-dark-accent font-medium dark:text-dark-text' : 'text-dark-text'}`}>{agent.name}</span>
                    <ChevronRight
                      size={12}
                      className={`flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''} ${isSelected ? 'text-dark-accent dark:text-dark-muted' : 'text-dark-muted'}`}
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
                      className="agent-settings-option"
                      icon={<Settings size={13} />}
                      label="Agent Settings"
                      active={panelMode === 'settings' && isSelected}
                      onClick={() => onOpenPanel('settings')}
                    />
                    <PanelOption
                      className="feedback-reports-option"
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

      {/* Account section pinned to the bottom */}
      <div className="flex-shrink-0 border-t border-dark-border px-2 py-2 relative">
        <button
          onClick={() => setAccountMenuOpen(v => !v)}
          className={`w-full flex items-center gap-2 px-1.5 py-1.5 rounded-md transition-colors ${
            accountMenuOpen ? 'bg-dark-bg/60' : 'hover:bg-dark-bg/50'
          }`}
          title={open ? undefined : userName || 'Guest'}
        >
          <div className="w-7 h-7 rounded-full bg-dark-accent/20 border border-dark-accent/40 flex items-center justify-center text-[11px] font-semibold text-dark-accent flex-shrink-0">
            {initialsOf(userName)}
          </div>
          {open && (
            <>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm text-dark-text truncate leading-tight">{userName || 'Guest'}</p>
                <p className="text-[11px] text-dark-muted truncate leading-tight">{DUMMY_PLAN}</p>
              </div>
              <MoreHorizontal size={14} className="text-dark-muted flex-shrink-0" />
            </>
          )}
        </button>

        {accountMenuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={() => setAccountMenuOpen(false)} />
            <div className="absolute bottom-full left-2 right-2 mb-1 z-30 bg-dark-surface border border-dark-border rounded-lg shadow-2xl p-1.5 flex flex-col">
              <div className="px-2 py-1.5 border-b border-dark-border mb-1">
                <p className="text-sm text-dark-text truncate">{userName || 'Guest'}</p>
                <p className="text-xs text-dark-muted truncate">{DUMMY_EMAIL}</p>
              </div>
              <AccountMenuItem icon={<User size={13} />} label="Account" />
              <AccountMenuItem icon={<Settings size={13} />} label="Settings" />
              <AccountMenuItem icon={<CreditCard size={13} />} label="Billing & Plan" />
              <div className="border-t border-dark-border my-1" />
              <AccountMenuItem icon={<LogOut size={13} />} label="Sign out" />
            </div>
          </>
        )}
      </div>

      {/* Drag-to-resize handle (only when expanded) */}
      {open && (
        <div
          onMouseDown={handleResizeStart}
          className={`absolute top-0 right-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${
            resizing ? 'bg-dark-accent/60' : 'hover:bg-dark-accent/40'
          }`}
          title="Drag to resize"
        />
      )}
    </aside>
  )
}

function AccountMenuItem({ icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2.5 px-2 py-1.5 text-xs text-dark-text hover:bg-dark-bg/60 rounded-md transition-colors text-left"
    >
      <span className="text-dark-muted">{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function PanelOption({ icon, label, active, onClick, className = '' }) {
  return (
    <button
      onClick={onClick}
      className={`${className} group relative flex items-center gap-2 pl-3 pr-2 py-1.5 text-xs rounded-md border transition-all duration-200 ease-in-out transform hover:translate-x-0.5 ${
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
  const ref = useRef(null)
  const [tip, setTip] = useState(null)

  function showTip() {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ top: rect.bottom + 6, left: rect.left })
  }

  let icon
  if (status === 'ready')
    icon = <CheckCircle2 size={14} className="text-green-400 flex-shrink-0" />
  else if (status === 'indexing')
    icon = <Loader2 size={14} className="text-amber-500 dark:text-yellow-400 flex-shrink-0 animate-spin" />
  else if (status === 'failed')
    icon = <XCircle size={14} className="text-red-400 flex-shrink-0" />
  else
    icon = <Clock size={14} className="text-gray-500 flex-shrink-0" />

  return (
    <span
      ref={ref}
      className="relative flex items-center flex-shrink-0"
      onMouseEnter={showTip}
      onMouseLeave={() => setTip(null)}
    >
      {icon}
      {tip && createPortal(
        <span
          role="tooltip"
          style={{ position: 'fixed', top: tip.top, left: tip.left }}
          className="pointer-events-none whitespace-nowrap rounded bg-dark-bg border border-dark-border px-2 py-1 text-xs text-dark-text z-[100] shadow-lg"
        >
          {label}
        </span>,
        document.body,
      )}
    </span>
  )
}
