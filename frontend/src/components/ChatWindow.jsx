import { useState, useRef, useEffect } from 'react'
import { api } from '../api'
import MistakeReport from './MistakeReport'

export default function ChatWindow({ agent, isCreatingNew, userName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [articleUrl, setArticleUrl] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
  const bottomRef = useRef(null)

  useEffect(() => {
    setMessages([])
    setArticleUrl(null)
  }, [agent?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading || !agent) return
    setInput('')

    const userMsg = { role: 'user', content: text }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    try {
      const history = [...messages, userMsg].map(m => ({ role: m.role, content: m.content }))
      const result = await api.chat(agent.id, { messages: history })
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: result.reply,
          references: result.references,
          related_questions: result.related_questions,
          tool_calls: result.tool_calls,
        },
      ])
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${e.message}`, isError: true },
      ])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  if (isCreatingNew || !agent) {
    return (
      <div className="flex items-center justify-center h-full text-dark-muted text-sm p-8 text-center">
        {isCreatingNew ? 'Save the agent first to start chatting.' : 'Select an agent to start chatting.'}
      </div>
    )
  }

  if (agent.status === 'indexing') {
    return (
      <div className="flex items-center justify-center h-full text-yellow-400 text-sm p-8 text-center">
        ⏳ Agent is indexing. Please wait…
      </div>
    )
  }

  if (agent.status === 'failed') {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm p-8 text-center">
        ✗ Indexing failed. Re-index the agent to chat.
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Chat pane */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
            {messages.length === 0 && (
              <div className="text-center mt-8 flex flex-col gap-1.5">
                <p className="text-base font-medium text-dark-text">
                  Hello {userName ?? 'there'} 👋
                </p>
                <p className="text-sm text-dark-muted">
                  I'm <span className="text-dark-text font-medium">{agent.name}</span>, your customer service assistant.
                  Ask me anything about our products or services.
                </p>
              </div>
            )}

            {messages.map((msg, idx) => (
              <MessageBubble
                key={idx}
                msg={msg}
                agent={agent}
                onViewArticle={setArticleUrl}
                onReport={() => setReportTarget(msg)}
              />
            ))}

            {loading && (
              <div className="flex gap-2">
                <div className="text-sm text-dark-muted animate-pulse">Thinking…</div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-6 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <div className="relative flex items-end gap-2 bg-dark-surface border border-dark-border rounded-2xl shadow-lg focus-within:border-dark-accent transition-colors">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${agent.name}…`}
                rows={2}
                className="chat-input flex-1 bg-transparent px-4 py-3 text-sm text-dark-text resize-none focus:outline-none placeholder:text-dark-muted"
              />
              <button
                onClick={handleSend}
                disabled={loading || !input.trim()}
                className="m-2 px-4 py-2 bg-dark-accent text-white rounded-xl text-sm hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity flex-shrink-0"
              >
                Send
              </button>
            </div>
            <p className="text-xs text-dark-muted text-center mt-2">Press Enter to send, Shift+Enter for new line</p>
          </div>
        </div>
      </div>

      {/* Article viewer */}
      {articleUrl && (
        <div className="w-96 border-l border-dark-border flex flex-col flex-shrink-0">
          <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border flex-shrink-0">
            <span className="text-xs text-dark-muted truncate">Article Preview</span>
            <button onClick={() => setArticleUrl(null)} className="text-dark-muted hover:text-dark-text text-lg leading-none ml-2">×</button>
          </div>
          <iframe
            src={`/api/proxy-article?url=${encodeURIComponent(articleUrl)}`}
            className="flex-1 w-full"
            title="Article preview"
          />
        </div>
      )}

      {/* Mistake report modal */}
      {reportTarget && (
        <MistakeReport
          agentId={agent.id}
          userMessage={messages[messages.indexOf(reportTarget) - 1]?.content ?? ''}
          botResponse={reportTarget.content}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  )
}

function MessageBubble({ msg, agent, onViewArticle, onReport }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`flex flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`text-sm whitespace-pre-wrap leading-relaxed ${
        isUser
          ? 'max-w-[80%] rounded-2xl px-4 py-2.5 bg-dark-accent text-white'
          : msg.isError
          ? 'max-w-full rounded-lg px-4 py-2 bg-red-900/30 border border-red-700 text-red-300'
          : 'max-w-full text-dark-text'
      }`}>
        {msg.content}
      </div>

      {/* Tool calls */}
      {msg.tool_calls?.length > 0 && (
        <div className="max-w-[80%] flex flex-col gap-1">
          {msg.tool_calls.map((tc, i) => (
            <div key={i} className="text-xs bg-dark-bg border border-dark-border rounded px-2 py-1 text-dark-muted font-mono">
              🔧 {tc.name}({JSON.stringify(tc.args)})
            </div>
          ))}
        </div>
      )}

      {/* References */}
      {msg.references?.length > 0 && (
        <div className="max-w-[80%] flex flex-col gap-1">
          <p className="text-xs text-dark-muted">Sources:</p>
          {msg.references.map((ref, i) => (
            <button
              key={i}
              onClick={() => onViewArticle(ref.article_url)}
              className="text-xs text-dark-accent hover:underline text-left"
            >
              📄 {ref.article_title}
            </button>
          ))}
        </div>
      )}

      {/* Related questions */}
      {msg.related_questions?.length > 0 && (
        <div className="max-w-[80%] flex flex-col gap-1">
          <p className="text-xs text-dark-muted">Related:</p>
          {msg.related_questions.map((q, i) => (
            <button
              key={i}
              onClick={() => onViewArticle(q.url)}
              className="text-xs text-dark-muted hover:text-dark-text text-left hover:underline"
            >
              → {q.question}
            </button>
          ))}
        </div>
      )}

      {/* Flag button */}
      {!isUser && !msg.isError && (
        <button
          onClick={onReport}
          className="mistake-flag text-xs text-dark-muted hover:text-red-400 mt-0.5"
          title="Report a mistake"
        >
          🚩 Flag
        </button>
      )}
    </div>
  )
}
