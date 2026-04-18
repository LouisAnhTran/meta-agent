import { useState, useEffect, useCallback, useRef } from 'react'
import Joyride, { STATUS } from 'react-joyride'
import Sidebar from './components/AgentList'
import AgentEditor from './components/AgentEditor'
import ChatWindow from './components/ChatWindow'
import MistakeDashboard from './components/MistakeDashboard'
import { X, Sun, Moon, HelpCircle, CheckCircle2, AlertTriangle } from 'lucide-react'
import { api } from './api'

const TOUR_DEMO_AGENT_ID = 'tour-demo-agent'
const TOUR_DEMO_AGENT = {
  id: TOUR_DEMO_AGENT_ID,
  name: 'Demo Agent',
  status: 'ready',
  kb_url: '',
  instructions: [],
  error_message: null,
  last_indexed_at: null,
  created_at: '',
  updated_at: '',
  is_demo: true,
}

const TOUR_STEPS = [
  {
    target: '.create-agent-btn',
    title: 'Step 1: Create an Agent',
    content: 'Start by clicking here to create a customer service agent. Give it a name and paste a Zendesk help center URL.',
    disableBeacon: true,
    placement: 'right',
  },
  {
    target: '.agent-settings-option',
    title: 'Step 2: Open Agent Settings',
    content: 'For any agent in the sidebar, expand it and click "Agent Settings" to open its editor.',
    placement: 'right',
  },
  {
    target: '.kb-url-input',
    title: 'Step 3: Knowledge Base URL',
    content: 'Inside the editor, paste a Zendesk Help Center category URL here. The system will fetch and index all articles automatically.',
    placement: 'right',
  },
  {
    target: '.instructions-section',
    title: 'Step 4: Add Instructions',
    content: 'Click "+ Add" to define how your agent behaves. Select a tool from the dropdown — the description pre-fills and you can rephrase it.',
    placement: 'right',
  },
  {
    target: '.save-reindex-btn',
    title: 'Step 5: Save & Index',
    content: 'Click "Save & Re-index" to save the agent and index its knowledge base. Takes ~30–60 seconds.',
    placement: 'top',
  },
  {
    target: '.chat-input',
    title: 'Step 6: Chat With Your Agent',
    content: 'Once the status dot turns green, ask your agent questions here.',
    placement: 'top',
  },
  {
    target: '.feedback-reports-option',
    title: 'Step 7: Open Feedback Reports',
    content: 'Expand the agent again and click "Feedback Reports" to review every mistake reported for this agent.',
    placement: 'right',
  },
  {
    target: '.demo-feedback',
    title: 'Step 8: Review & Fix',
    content: 'Each reported mistake shows the user question, the wrong bot reply, and your description. Click "Run Fix" to auto-diagnose and update instructions. (This is a demo item — fixes only work on real reports.)',
    placement: 'left',
  },
  {
    target: '.theme-toggle-btn',
    title: 'Step 9: Switch Theme',
    content: 'Prefer a lighter look? Toggle between dark and light mode here — your choice is remembered across sessions.',
    placement: 'bottom-end',
  },
]

export default function App() {
  const [agents, setAgents] = useState([])
  const [selectedAgentId, setSelectedAgentId] = useState(null)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [tools, setTools] = useState([])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [panelMode, setPanelMode] = useState(null) // 'settings' | 'feedback' | null
  const [runTour, setRunTour] = useState(false)
  const [tourStepIndex, setTourStepIndex] = useState(0)
  const [userName, setUserName] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [tourIntroOpen, setTourIntroOpen] = useState(false)
  const [darkMode, setDarkMode] = useState(() => document.documentElement.classList.contains('dark'))
  const [toasts, setToasts] = useState([])
  const prevStatusesRef = useRef({})

  const [settingsWidth, setSettingsWidth] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('settingsWidth') || '', 10)
      if (!Number.isNaN(saved)) return saved
    } catch {}
    return 420
  })
  const [settingsResizing, setSettingsResizing] = useState(false)

  function clampSettingsWidth(w) {
    const max = Math.min(560, Math.floor(window.innerWidth * 0.35))
    return Math.min(Math.max(w, 360), Math.max(360, max))
  }

  function handleSettingsResizeStart(e) {
    e.preventDefault()
    const startX = e.clientX
    const startW = settingsWidth
    setSettingsResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev) {
      setSettingsWidth(clampSettingsWidth(startW + (ev.clientX - startX)))
    }
    function onUp() {
      setSettingsResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    function onResize() { setSettingsWidth(w => clampSettingsWidth(w)) }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    try { localStorage.setItem('settingsWidth', String(settingsWidth)) } catch {}
  }, [settingsWidth])

  function pushToast(toast) {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, ...toast }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 5000)
  }

  function dismissToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) root.classList.add('dark')
    else root.classList.remove('dark')
    try { localStorage.setItem('theme', darkMode ? 'dark' : 'light') } catch {}
  }, [darkMode])

  const fetchAgents = useCallback(async () => {
    try {
      const data = await api.getAgents()
      setAgents(data)
      return data
    } catch (e) {
      console.error('Failed to fetch agents', e)
      return []
    }
  }, [])

  useEffect(() => {
    fetchAgents().then(data => {
      if (data.length > 0) {
        setSelectedAgentId(data[0].id)
      } else {
        setIsCreatingNew(true)
      }
    })
    api.getTools().then(setTools).catch(console.error)
  }, [])

  function handleSubmitName(e) {
    e.preventDefault()
    const trimmed = nameInput.trim()
    if (!trimmed) return
    setUserName(trimmed)
    setTourIntroOpen(true)
  }

  function handleStartTour() {
    setTourIntroOpen(false)
    setPanelMode('settings')
    setTourStepIndex(0)
    setTimeout(() => setRunTour(true), 400)
  }

  useEffect(() => {
    const hasIndexing = agents.some(a => a.status === 'indexing')
    if (!hasIndexing) return
    const id = setInterval(fetchAgents, 3000)
    return () => clearInterval(id)
  }, [agents, fetchAgents])

  // Detect indexing → ready/failed transitions and toast on them
  useEffect(() => {
    const prev = prevStatusesRef.current
    const next = {}
    for (const a of agents) {
      next[a.id] = a.status
      const was = prev[a.id]
      if (was === 'indexing' && a.status === 'ready') {
        pushToast({
          type: 'success',
          title: 'Indexing complete',
          message: `${a.name} is ready to chat.`,
        })
      } else if (was === 'indexing' && a.status === 'failed') {
        pushToast({
          type: 'error',
          title: 'Indexing failed',
          message: a.error_message ? `${a.name}: ${a.error_message}` : `${a.name} failed to index.`,
        })
      }
    }
    prevStatusesRef.current = next
  }, [agents])

  // During the tour we inject a demo agent into the sidebar so the Agent Settings
  // and Feedback Reports options are always reachable, even on a fresh install.
  const displayedAgents = runTour
    ? [TOUR_DEMO_AGENT, ...agents.filter(a => a.id !== TOUR_DEMO_AGENT_ID)]
    : agents

  const selectedAgent = isCreatingNew
    ? null
    : displayedAgents.find(a => a.id === selectedAgentId) ?? null

  function handleSelectAgent(id) {
    setSelectedAgentId(id)
    setIsCreatingNew(false)
  }

  function handleOpenPanel(mode) {
    setPanelMode(prev => prev === mode ? null : mode)
  }

  function handleCreateNew() {
    setSelectedAgentId(null)
    setIsCreatingNew(true)
    setPanelMode('settings')
  }

  async function handleSaved(savedAgent) {
    await fetchAgents()
    setSelectedAgentId(savedAgent.id)
    setIsCreatingNew(false)
  }

  function handleTourCallback(data) {
    const { status, type, index, action } = data

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status)) {
      setRunTour(false)
      setTourStepIndex(0)
      setPanelMode(null)
      setIsCreatingNew(false)
      return
    }

    // Controlled step progression: Joyride tells us the user clicked next/prev
    // or hit target_not_found. We decide the next index and set up UI state
    // BEFORE advancing so the next target exists in the DOM.
    const advancing =
      type === 'step:after' || type === 'error:target_not_found'
    if (!advancing) return

    let next = index
    if (action === 'prev') next = index - 1
    else if (action === 'next' || type === 'error:target_not_found') next = index + 1
    else return // close/skip handled by the STATUS branch above

    // Step 1 (create button) and step 2 (agent settings option) need the
    // sidebar unobscured — close the drawer, show the demo agent expanded.
    if (next === 0 || next === 1 || next === 6) {
      setPanelMode(null)
      setIsCreatingNew(false)
      setSelectedAgentId(TOUR_DEMO_AGENT_ID)
    }
    // Steps 3-5 live inside the Agent Settings editor — open it on the demo.
    if (next === 2 || next === 3 || next === 4) {
      setSelectedAgentId(TOUR_DEMO_AGENT_ID)
      setIsCreatingNew(false)
      setPanelMode('settings')
    }
    // Step 8 needs the Feedback Reports drawer open before Joyride measures.
    if (next === 7) {
      setSelectedAgentId(TOUR_DEMO_AGENT_ID)
      setPanelMode('feedback')
    }
    // Step 9 highlights the theme toggle — close the drawer.
    if (next === 8) {
      setPanelMode(null)
    }

    // Give React a moment to commit the DOM change (critical for steps 3 & 8,
    // whose targets live inside a just-mounted panel/drawer) before advancing.
    const delayMs = next === 7 || next === 2 ? 250 : 0
    setTimeout(() => setTourStepIndex(next), delayMs)
  }

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        agents={displayedAgents}
        selectedAgentId={selectedAgentId}
        isCreatingNew={isCreatingNew}
        panelMode={panelMode}
        userName={userName}
        forcedExpandedId={runTour ? TOUR_DEMO_AGENT_ID : null}
        onSelectAgent={handleSelectAgent}
        onOpenPanel={handleOpenPanel}
        onCreateNew={handleCreateNew}
      />

      {/* Agent Settings sidebar */}
      <div
        style={{ width: panelMode === 'settings' ? settingsWidth : 0 }}
        className={`relative flex-shrink-0 flex flex-col border-r bg-dark-surface overflow-hidden ${
          panelMode === 'settings' ? 'opacity-100 border-dark-border' : 'opacity-0 border-transparent'
        } ${settingsResizing ? '' : 'transition-[width,border-color,opacity] duration-300 ease-in-out'}`}
      >
        <div style={{ width: settingsWidth }} className="flex flex-col h-full flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
            <span className="text-sm font-semibold text-dark-text">Agent Settings</span>
            <button
              onClick={() => setPanelMode(null)}
              className="text-dark-muted hover:text-dark-text p-0.5 rounded"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 min-h-0">
            <AgentEditor
              agent={selectedAgent}
              isCreatingNew={isCreatingNew}
              tools={tools}
              onSaved={handleSaved}
            />
          </div>
        </div>

        {panelMode === 'settings' && (
          <div
            onMouseDown={handleSettingsResizeStart}
            className={`absolute top-0 right-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${
              settingsResizing ? 'bg-dark-accent/60' : 'hover:bg-dark-accent/40'
            }`}
            title="Drag to resize"
          />
        )}
      </div>

      {/* Chat (main) */}
      <main className="flex-1 min-w-0">
        <ChatWindow agent={selectedAgent} isCreatingNew={isCreatingNew} userName={userName} />
      </main>

      {/* Tour intro drawer — shown after name is entered */}
      {tourIntroOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-dark-border bg-dark-surface shadow-2xl p-6 flex flex-col gap-4">
            <div>
              <h2 className="text-lg font-semibold text-dark-text">Nice to meet you, {userName}! 🎉</h2>
              <p className="text-sm text-dark-muted mt-2">
                We'd like to show you a quick tour of the app — how to create an agent, connect a knowledge base,
                chat with it, and review feedback reports. Takes about a minute.
              </p>
            </div>
            <p className="text-xs text-dark-muted">
              You can skip the tour anytime by clicking <span className="text-dark-text font-medium">Skip</span> on any step.
            </p>
            <button
              onClick={handleStartTour}
              className="py-2 text-sm bg-dark-accent text-white rounded hover:opacity-90 transition-opacity"
            >
              Start Tour
            </button>
          </div>
        </div>
      )}

      {/* Name drawer — shows on every refresh until user submits */}
      {!userName && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <form
            onSubmit={handleSubmitName}
            className="w-full max-w-sm rounded-xl border border-dark-border bg-dark-surface shadow-2xl p-6 flex flex-col gap-4"
          >
            <div>
              <h2 className="text-lg font-semibold text-dark-text">Welcome! 👋</h2>
              <p className="text-sm text-dark-muted mt-1">What should we call you?</p>
            </div>
            <input
              autoFocus
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Your name"
              className="bg-dark-bg border border-dark-border rounded px-3 py-2 text-sm text-dark-text focus:outline-none focus:border-dark-accent"
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="py-2 bg-dark-accent text-white rounded text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
            >
              Continue
            </button>
          </form>
        </div>
      )}

      {/* Feedback Reports drawer (centered modal) */}
      {panelMode === 'feedback' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={() => setPanelMode(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[88vh] flex flex-col rounded-lg border border-dark-border bg-dark-surface shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
              <span className="text-sm font-semibold text-dark-text">Feedback Reports</span>
              <button
                onClick={() => setPanelMode(null)}
                className="text-dark-muted hover:text-dark-text p-0.5 rounded"
              >
                <X size={15} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              <MistakeDashboard agent={selectedAgent} />
            </div>
          </div>
        </div>
      )}

      {/* Top-right controls */}
      <div className="fixed top-3 right-4 z-30 flex items-center gap-1.5">
        <button
          onClick={() => setDarkMode(d => !d)}
          className="theme-toggle-btn w-8 h-8 flex items-center justify-center text-dark-muted hover:text-dark-text bg-dark-surface hover:bg-dark-bg border border-dark-border rounded-full shadow-lg transition-colors"
          title={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {darkMode ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <button
          onClick={() => setRunTour(true)}
          className="flex items-center gap-1.5 text-xs text-dark-muted hover:text-dark-text bg-dark-surface hover:bg-dark-bg border border-dark-border rounded-full px-3 h-8 shadow-lg transition-colors"
          title="Restart tour"
        >
          <HelpCircle size={13} />
          <span>Tour</span>
        </button>
      </div>

      <Joyride
        steps={TOUR_STEPS}
        run={runTour}
        stepIndex={tourStepIndex}
        continuous
        showSkipButton
        showProgress
        spotlightClicks
        disableScrolling
        callback={handleTourCallback}
        styles={{
          options: {
            primaryColor: darkMode ? '#6366f1' : '#1e293b',
            zIndex: 10000,
            backgroundColor: darkMode ? '#1e293b' : '#ffffff',
            textColor: darkMode ? '#cdd6f4' : '#0f172a',
            arrowColor: darkMode ? '#1e293b' : '#ffffff',
          },
          tooltip: { borderRadius: 8 },
        }}
      />

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  )
}

function Toaster({ toasts, onDismiss }) {
  if (toasts.length === 0) return null
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 max-w-sm">
      {toasts.map(t => {
        const isError = t.type === 'error'
        const Icon = isError ? AlertTriangle : CheckCircle2
        return (
          <div
            key={t.id}
            role="status"
            className={`flex items-start gap-3 px-4 py-3 rounded-lg border shadow-lg bg-dark-surface ${
              isError
                ? 'border-red-500/40'
                : 'border-dark-accent/40'
            } animate-toast-in`}
          >
            <Icon size={16} className={`mt-0.5 flex-shrink-0 ${isError ? 'text-red-400' : 'text-green-400'}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-dark-text">{t.title}</p>
              {t.message && <p className="text-xs text-dark-muted mt-0.5 break-words">{t.message}</p>}
            </div>
            <button
              onClick={() => onDismiss(t.id)}
              className="text-dark-muted hover:text-dark-text flex-shrink-0"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
