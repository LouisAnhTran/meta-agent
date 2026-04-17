import { useState, useEffect } from 'react'
import AgentList from './components/AgentList'
import AgentEditor from './components/AgentEditor'
import ChatWindow from './components/ChatWindow'
import { api } from './api'

export default function App() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    api.health().then(setHealth).catch(() => setHealth({ status: 'error' }))
  }, [])

  return (
    <div className="flex h-screen bg-dark-bg text-dark-text">
      <aside className="w-64 border-r border-dark-border flex-shrink-0">
        <AgentList />
      </aside>
      <main className="flex flex-1 min-w-0">
        <div className="w-96 border-r border-dark-border flex-shrink-0">
          <AgentEditor />
        </div>
        <div className="flex-1">
          <ChatWindow />
        </div>
      </main>
      {health && (
        <div className="fixed bottom-2 right-2 text-xs text-dark-muted">
          API: {health.status}
        </div>
      )}
    </div>
  )
}
