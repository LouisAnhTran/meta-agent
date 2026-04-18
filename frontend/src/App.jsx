import { useState, useEffect, useCallback } from 'react'
import Joyride, { STATUS } from 'react-joyride'
import Sidebar from './components/AgentList'
import AgentEditor from './components/AgentEditor'
import ChatWindow from './components/ChatWindow'
import MistakeDashboard from './components/MistakeDashboard'
import { X } from 'lucide-react'
import { api } from './api'

const TOUR_STEPS = [
  {
    target: '.create-agent-btn',
    title: 'Step 1: Create an Agent',
    content: 'Start by clicking here to create a customer service agent. Give it a name and paste a Zendesk help center URL.',
    disableBeacon: true,
    placement: 'right',
  },
  {
    target: '.kb-url-input',
    title: 'Step 2: Knowledge Base URL',
    content: 'Paste a Zendesk Help Center category URL here. The system will fetch and index all articles automatically.',
    placement: 'right',
  },
  {
    target: '.instructions-section',
    title: 'Step 3: Add Instructions',
    content: 'Click "+ Add" to define how your agent behaves. Select a tool from the dropdown — the description pre-fills and you can rephrase it.',
    placement: 'right',
  },
  {
    target: '.save-reindex-btn',
    title: 'Step 4: Save & Index',
    content: 'Click "Save & Re-index" to save the agent and index its knowledge base. Takes ~30–60 seconds.',
    placement: 'top',
  },
  {
    target: '.chat-input',
    title: 'Step 5: Chat With Your Agent',
    content: 'Once the status dot turns green, ask your agent questions here.',
    placement: 'top',
  },
  {
    target: 'body',
    title: 'Step 6: Report a Mistake',
    content: 'If the agent gives a wrong answer, click the 🚩 flag icon below the bot response to report a mistake.',
    placement: 'center',
  },
  {
    target: 'body',
    title: 'Step 7: Review & Fix',
    content: 'Click an agent in the sidebar and choose "Feedback Reports" to see all reported mistakes. Click "Run Fix" to auto-diagnose and update instructions.',
    placement: 'center',
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
  const [userName, setUserName] = useState(null)
  const [nameInput, setNameInput] = useState('')
  const [tourIntroOpen, setTourIntroOpen] = useState(false)

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
    setTimeout(() => setRunTour(true), 400)
  }

  function handleSkipTour() {
    setTourIntroOpen(false)
  }

  useEffect(() => {
    const hasIndexing = agents.some(a => a.status === 'indexing')
    if (!hasIndexing) return
    const id = setInterval(fetchAgents, 3000)
    return () => clearInterval(id)
  }, [agents, fetchAgents])

  const selectedAgent = isCreatingNew ? null : agents.find(a => a.id === selectedAgentId) ?? null

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
    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(data.status)) {
      setRunTour(false)
      setPanelMode(null)
      setIsCreatingNew(false)
    }
  }

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        agents={agents}
        selectedAgentId={selectedAgentId}
        isCreatingNew={isCreatingNew}
        panelMode={panelMode}
        onSelectAgent={handleSelectAgent}
        onOpenPanel={handleOpenPanel}
        onCreateNew={handleCreateNew}
      />

      {/* Agent Settings sidebar */}
      <div
        className={`flex-shrink-0 flex flex-col border-r bg-dark-surface overflow-hidden transition-[width,border-color,opacity] duration-300 ease-in-out ${
          panelMode === 'settings'
            ? 'w-[420px] opacity-100 border-dark-border'
            : 'w-0 opacity-0 border-transparent'
        }`}
      >
        <div className="w-[420px] flex flex-col h-full flex-shrink-0">
          <div className="flex items-center justify-between px-4 py-3 border-b border-dark-border flex-shrink-0">
            <span className="text-sm font-semibold text-dark-text">Agent Settings</span>
            <button
              onClick={() => setPanelMode(null)}
              className="text-dark-muted hover:text-dark-text p-0.5 rounded"
            >
              <X size={15} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto min-h-0">
            <AgentEditor
              agent={selectedAgent}
              isCreatingNew={isCreatingNew}
              tools={tools}
              onSaved={handleSaved}
            />
          </div>
        </div>
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
            <div className="flex gap-2">
              <button
                onClick={handleSkipTour}
                className="flex-1 py-2 text-sm border border-dark-border rounded hover:bg-dark-bg text-dark-text transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleStartTour}
                className="flex-1 py-2 text-sm bg-dark-accent text-white rounded hover:opacity-90 transition-opacity"
              >
                Start Tour
              </button>
            </div>
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
            className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-lg border border-dark-border bg-dark-surface shadow-2xl"
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

      {/* Tour button */}
      <button
        onClick={() => setRunTour(true)}
        className="fixed bottom-4 right-4 text-xs text-dark-muted hover:text-dark-text bg-dark-surface border border-dark-border rounded-full px-3 py-1.5 shadow-lg"
        title="Restart tour"
      >
        ❓ Tour
      </button>

      <Joyride
        steps={TOUR_STEPS}
        run={runTour}
        continuous
        showSkipButton
        showProgress
        spotlightClicks
        disableScrolling
        callback={handleTourCallback}
        styles={{
          options: { primaryColor: '#6366f1', zIndex: 10000, backgroundColor: '#1e293b', textColor: '#cdd6f4' },
          tooltip: { borderRadius: 8 },
        }}
      />
    </div>
  )
}
