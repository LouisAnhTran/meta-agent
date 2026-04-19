import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { PulseLoader } from 'react-spinners'
import {
  AlertTriangle, Sparkles, ChevronRight, Wrench,
  Copy, Check, RotateCw, ThumbsUp, ThumbsDown, Flag,
  Plus, ArrowUp, ChevronDown, Paperclip, Camera, FolderPlus,
  BookOpen, Link2, Globe, Microscope, Brain,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '../api'
import MistakeReport from './MistakeReport'

const REASONING_LABELS = ['Reasoning', 'Searching knowledge base', 'Thinking it through', 'Composing an answer']

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 mb-2 last:mb-0 flex flex-col gap-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 mb-2 last:mb-0 flex flex-col gap-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  h1: ({ children }) => <h1 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h1>,
  h2: ({ children }) => <h2 className="text-base font-semibold mb-2 mt-3 first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-semibold mb-1.5 mt-3 first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h4>,
  strong: ({ children }) => <strong className="font-semibold text-dark-text">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-dark-accent hover:underline">
      {children}
    </a>
  ),
  code: ({ inline, children }) =>
    inline
      ? <code className="bg-dark-surface border border-dark-border px-1 py-0.5 rounded text-xs font-mono">{children}</code>
      : <code className="block bg-dark-surface border border-dark-border rounded-md p-3 text-xs font-mono overflow-x-auto">{children}</code>,
  pre: ({ children }) => <pre className="mb-2 last:mb-0">{children}</pre>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-dark-border pl-3 text-dark-muted mb-2 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="border-dark-border my-3" />,
}

export default function ChatWindow({ agent, isCreatingNew, userName }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [articleUrl, setArticleUrl] = useState(null)
  const [articleWidth, setArticleWidth] = useState(420)
  const [resizing, setResizing] = useState(false)
  const [reportTarget, setReportTarget] = useState(null)
  const bottomRef = useRef(null)

  function handleAskQuestion(question) {
    handleSend(question)
  }

  function startArticleResize(e) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = articleWidth
    setResizing(true)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    function onMove(ev) {
      const delta = startX - ev.clientX
      const maxW = Math.max(320, window.innerWidth * 0.75)
      const next = Math.min(Math.max(startWidth + delta, 280), maxW)
      setArticleWidth(next)
    }
    function onUp() {
      setResizing(false)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useEffect(() => {
    setMessages([])
    setArticleUrl(null)
  }, [agent?.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function handleSend(textOverride) {
    const override = typeof textOverride === 'string' ? textOverride.trim() : null
    const text = override ?? input.trim()
    if (!text || loading || !agent) return
    if (override === null) setInput('')

    const userMsg = { role: 'user', content: text, createdAt: Date.now() }
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
          createdAt: Date.now(),
        },
      ])
    } catch (e) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Error: ${e.message}`, isError: true, createdAt: Date.now() },
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
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-dark-accent">
        <PulseLoader color="currentColor" size={14} speedMultiplier={0.9} />
        <div className="text-center flex flex-col gap-1">
          <p className="text-sm font-medium text-dark-text">Indexing knowledge base…</p>
          <p className="text-xs text-dark-muted">This usually takes 30–60 seconds.</p>
        </div>
      </div>
    )
  }

  if (agent.status === 'failed') {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
        <div className="w-12 h-12 rounded-full bg-red-500/15 border border-red-500/30 flex items-center justify-center">
          <AlertTriangle size={22} className="text-red-400" />
        </div>
        <div className="text-center flex flex-col gap-1">
          <p className="text-sm font-medium text-dark-text">Indexing failed</p>
          <p className="text-xs text-dark-muted">Open Agent Settings and click <span className="text-dark-text">Re-index</span> to try again.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full">
      {/* Chat pane */}
      <div className="chat-pane flex flex-col flex-1 min-w-0">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto px-6 py-8 flex flex-col gap-6">
            {messages.length === 0 && (
              <div className="text-center mt-8 flex flex-col gap-3">
                <p className="text-3xl font-semibold text-dark-text tracking-tight">
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
                onViewArticle={setArticleUrl}
                onAskQuestion={handleAskQuestion}
                onReport={() => setReportTarget(msg)}
              />
            ))}

            {loading && <ReasoningIndicator />}
            <div ref={bottomRef} />
          </div>
        </div>

        {/* Input */}
        <div className="flex-shrink-0 px-6 pb-6 pt-2">
          <div className="max-w-3xl mx-auto">
            <Composer
              agentName={agent.name}
              input={input}
              setInput={setInput}
              onSend={handleSend}
              onKeyDown={handleKeyDown}
              loading={loading}
            />
            <p className="text-xs text-dark-muted text-center mt-2">Press Enter to send, Shift+Enter for new line</p>
          </div>
        </div>
      </div>

      {/* Article viewer */}
      {articleUrl && (
        <div
          className="border-l border-dark-border flex flex-col flex-shrink-0 relative"
          style={{ width: articleWidth }}
        >
          {/* Drag handle */}
          <div
            onMouseDown={startArticleResize}
            className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-20 transition-colors ${
              resizing ? 'bg-dark-accent/60' : 'hover:bg-dark-accent/40'
            }`}
            title="Drag to resize"
          />
          <div className="flex items-center justify-between px-3 py-2 border-b border-dark-border flex-shrink-0">
            <span className="text-xs text-dark-muted truncate">Article Preview</span>
            <button onClick={() => setArticleUrl(null)} className="text-dark-muted hover:text-dark-text text-lg leading-none ml-2">×</button>
          </div>
          <iframe
            src={`/api/proxy-article?url=${encodeURIComponent(articleUrl)}`}
            className="flex-1 w-full"
            title="Article preview"
          />
          {/* Overlay captures mouse events during resize so they don't get swallowed by the iframe */}
          {resizing && <div className="absolute inset-0 z-30" />}
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

const MODEL_GROUPS = [
  {
    label: 'Anthropic',
    models: ['Claude Opus 4.7', 'Claude Sonnet 4.6', 'Claude Haiku 4.5'],
  },
  {
    label: 'OpenAI',
    models: ['GPT-5', 'GPT-5 mini', 'GPT-4.1', 'o4-mini'],
  },
  {
    label: 'Google',
    models: ['Gemini 2.5 Pro', 'Gemini 2.5 Flash', 'Gemini 2.0 Pro'],
  },
]

const PLUS_MENU_ITEMS = [
  { icon: Paperclip, label: 'Add file' },
  { icon: Camera, label: 'Take screenshot' },
  { icon: FolderPlus, label: 'Add to project' },
  { icon: BookOpen, label: 'Skills' },
  { icon: Link2, label: 'Connections' },
]

function Composer({ agentName, input, setInput, onSend, onKeyDown, loading }) {
  const [plusOpen, setPlusOpen] = useState(false)
  const [modelOpen, setModelOpen] = useState(false)
  const [model, setModel] = useState('Claude Opus 4.7')
  const [research, setResearch] = useState(false)
  const [webSearch, setWebSearch] = useState(false)
  const [reasoning, setReasoning] = useState(true)
  const textareaRef = useRef(null)
  const canSend = !loading && input.trim().length > 0

  return (
    <div className="relative flex flex-col bg-dark-surface border border-dark-border rounded-2xl shadow-lg focus-within:border-dark-accent transition-colors">
      <textarea
        ref={textareaRef}
        value={input}
        onChange={e => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={`Message ${agentName}…`}
        rows={2}
        className="chat-input bg-transparent px-4 pt-3 pb-1 text-sm text-dark-text resize-none focus:outline-none placeholder:text-dark-muted"
      />

      <div className="flex items-center justify-between gap-2 px-2 pb-2 pt-1">
        {/* Left cluster */}
        <div className="flex items-center gap-1">
          <div className="relative">
            <ComposerIconButton label="Add" onClick={() => setPlusOpen(v => !v)} active={plusOpen}>
              <Plus size={16} />
            </ComposerIconButton>
            {plusOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setPlusOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 z-30 w-56 bg-dark-surface border border-dark-border rounded-lg shadow-2xl p-1.5 flex flex-col">
                  {PLUS_MENU_ITEMS.map(({ icon: Icon, label }) => (
                    <button
                      key={label}
                      onClick={() => setPlusOpen(false)}
                      className="flex items-center justify-between gap-2.5 px-2 py-1.5 text-xs text-dark-text hover:bg-dark-bg/60 rounded-md transition-colors text-left"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={13} className="text-dark-muted" />
                        <span>{label}</span>
                      </span>
                      <span className="text-[10px] text-dark-muted">Soon</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <ComposerPill
            icon={<Microscope size={12} />}
            label="Research"
            active={research}
            onClick={() => setResearch(v => !v)}
          />
          <ComposerPill
            icon={<Globe size={12} />}
            label="Web search"
            active={webSearch}
            onClick={() => setWebSearch(v => !v)}
          />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-1">
          <ComposerPill
            icon={<Brain size={12} />}
            label={reasoning ? 'Adaptive' : 'Reasoning'}
            active={reasoning}
            onClick={() => setReasoning(v => !v)}
          />

          <div className="relative">
            <button
              onClick={() => setModelOpen(v => !v)}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs border transition-colors ${
                modelOpen
                  ? 'bg-dark-bg/60 border-dark-border text-dark-text'
                  : 'border-transparent text-dark-muted hover:text-dark-text hover:bg-dark-bg/40'
              }`}
            >
              <span>{model}</span>
              <ChevronDown size={12} />
            </button>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-20" onClick={() => setModelOpen(false)} />
                <div className="absolute bottom-full right-0 mb-2 z-30 w-60 max-h-80 overflow-y-auto bg-dark-surface border border-dark-border rounded-lg shadow-2xl p-1.5 flex flex-col">
                  {MODEL_GROUPS.map((group, gi) => (
                    <div key={group.label} className={gi > 0 ? 'mt-1 pt-1 border-t border-dark-border' : ''}>
                      <p className="px-2 pt-1 pb-0.5 text-[10px] uppercase tracking-wide text-dark-muted">{group.label}</p>
                      {group.models.map(name => (
                        <button
                          key={name}
                          onClick={() => { setModel(name); setModelOpen(false) }}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs rounded-md transition-colors text-left ${
                            model === name ? 'text-dark-accent bg-dark-accent/10' : 'text-dark-text hover:bg-dark-bg/60'
                          }`}
                        >
                          <span>{name}</span>
                          {model === name && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="border-t border-dark-border my-1" />
                  <p className="px-2 py-1 text-[10px] text-dark-muted">Selection is decorative — coming soon</p>
                </div>
              </>
            )}
          </div>

          <button
            onClick={onSend}
            disabled={!canSend}
            title="Send"
            className={`ml-1 w-8 h-8 flex items-center justify-center rounded-full transition-opacity ${
              canSend
                ? 'bg-dark-accent text-white hover:opacity-90'
                : 'bg-dark-bg/60 text-dark-muted cursor-not-allowed'
            }`}
          >
            <ArrowUp size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}

function ComposerIconButton({ label, onClick, active, children }) {
  const ref = useRef(null)
  const [tip, setTip] = useState(null)

  function showTip() {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setTip({ top: rect.top - 8, left: rect.left + rect.width / 2 })
  }

  return (
    <div ref={ref} className="relative" onMouseEnter={showTip} onMouseLeave={() => setTip(null)}>
      <button
        onClick={() => { setTip(null); onClick?.() }}
        className={`p-1.5 rounded-md transition-colors ${
          active
            ? 'bg-dark-accent/15 text-dark-accent'
            : 'text-dark-muted hover:text-dark-text hover:bg-dark-bg/40'
        }`}
      >
        {children}
      </button>
      {tip && createPortal(
        <span
          role="tooltip"
          style={{ position: 'fixed', top: tip.top, left: tip.left, transform: 'translate(-50%, -100%)' }}
          className="pointer-events-none whitespace-nowrap rounded bg-dark-bg border border-dark-border px-2 py-1 text-xs text-dark-text z-[100] shadow-lg"
        >
          {label}
        </span>,
        document.body,
      )}
    </div>
  )
}

function ComposerPill({ icon, label, active, onClick }) {
  return (
    <div className="relative group/btn">
      <button
        onClick={onClick}
        className={`flex items-center gap-1 px-2 py-1 rounded-full border text-xs transition-colors ${
          active
            ? 'bg-dark-accent/15 border-dark-accent/40 text-dark-accent'
            : 'bg-transparent border-dark-border text-dark-muted hover:text-dark-text hover:border-dark-accent/40'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 whitespace-nowrap rounded bg-dark-bg border border-dark-border px-1.5 py-0.5 text-[10px] text-dark-text opacity-0 group-hover/btn:opacity-100 transition-opacity duration-100 z-20 shadow"
      >
        Coming soon
      </span>
    </div>
  )
}

function ToolCallsPanel({ toolCalls }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="max-w-[80%] flex flex-col gap-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="self-start flex items-center gap-1 text-[11px] text-dark-muted hover:text-dark-text transition-colors"
      >
        <Wrench size={11} />
        <span>
          {open ? 'Hide' : 'Show'} tool call{toolCalls.length > 1 ? 's' : ''} ({toolCalls.length})
        </span>
        <ChevronRight size={11} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="flex flex-col gap-1">
          {toolCalls.map((tc, i) => (
            <div key={i} className="text-xs bg-dark-bg border border-dark-border rounded px-2 py-1 text-dark-muted font-mono break-all">
              🔧 {tc.name}({JSON.stringify(tc.args)})
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReasoningIndicator() {
  const [labelIdx, setLabelIdx] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setLabelIdx(i => (i + 1) % REASONING_LABELS.length)
    }, 2200)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="flex items-center gap-2.5 py-1">
      <Sparkles size={14} className="text-dark-accent animate-pulse" />
      <span
        className="text-sm font-medium bg-clip-text text-transparent animate-shimmer"
        style={{
          backgroundImage:
            'linear-gradient(90deg, #64748b 0%, #64748b 35%, #e2e8f0 50%, #64748b 65%, #64748b 100%)',
          backgroundSize: '200% 100%',
        }}
      >
        {REASONING_LABELS[labelIdx]}…
      </span>
    </div>
  )
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch { return '' }
}

function IconTooltipButton({ label, onClick, disabled, active, activeClass = '', children }) {
  return (
    <div className="relative group/btn">
      <button
        onClick={onClick}
        disabled={disabled}
        className={`p-1 rounded transition-colors ${
          active
            ? activeClass || 'bg-dark-accent/15 text-dark-accent'
            : 'hover:bg-dark-surface hover:text-dark-text'
        } ${disabled ? 'cursor-not-allowed' : ''}`}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1 whitespace-nowrap rounded bg-dark-bg border border-dark-border px-1.5 py-0.5 text-[10px] text-dark-text opacity-0 group-hover/btn:opacity-100 transition-opacity duration-100 z-20 shadow"
      >
        {label}
      </span>
    </div>
  )
}

function BotMessageActions({ msg, onReport }) {
  const [copied, setCopied] = useState(false)
  const [vote, setVote] = useState(null) // 'up' | 'down' | null

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  const hasVote = vote !== null
  return (
    <div className={`flex items-center gap-1 transition-opacity text-dark-muted text-[11px] mt-0.5 ${hasVote ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
      <span className="px-1">{formatTime(msg.createdAt)}</span>
      <IconTooltipButton label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </IconTooltipButton>
      <IconTooltipButton label="Retry (coming soon)" disabled>
        <RotateCw size={12} />
      </IconTooltipButton>
      <IconTooltipButton
        label="Good response"
        active={vote === 'up'}
        onClick={() => setVote(v => (v === 'up' ? null : 'up'))}
      >
        <ThumbsUp size={12} fill={vote === 'up' ? 'currentColor' : 'none'} />
      </IconTooltipButton>
      <IconTooltipButton
        label="Bad response"
        active={vote === 'down'}
        activeClass="bg-red-500/15 text-red-400"
        onClick={() => setVote(v => (v === 'down' ? null : 'down'))}
      >
        <ThumbsDown size={12} fill={vote === 'down' ? 'currentColor' : 'none'} />
      </IconTooltipButton>

      {/* Highlighted Report button — stands out in the hover row */}
      <button
        onClick={onReport}
        className="mistake-flag flex items-center gap-1 ml-1 px-2 py-1 rounded-full border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/70 transition-colors"
        title="Report a mistake in this reply"
      >
        <Flag size={12} />
        <span className="text-[11px] font-medium">Report</span>
      </button>
    </div>
  )
}

function UserMessageActions({ msg }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(msg.content)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity text-dark-muted text-[11px]">
      <span className="px-1">{formatTime(msg.createdAt)}</span>
      <IconTooltipButton label={copied ? 'Copied' : 'Copy'} onClick={handleCopy}>
        {copied ? <Check size={12} /> : <Copy size={12} />}
      </IconTooltipButton>
      <IconTooltipButton label="Retry (coming soon)" disabled>
        <RotateCw size={12} />
      </IconTooltipButton>
    </div>
  )
}

function MessageBubble({ msg, onViewArticle, onAskQuestion, onReport }) {
  const isUser = msg.role === 'user'

  return (
    <div className={`group flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}>
      <div className={`text-sm leading-relaxed ${
        isUser
          ? 'max-w-[80%] rounded-2xl px-4 py-2.5 bg-slate-100 text-slate-900 dark:bg-dark-accent dark:text-white whitespace-pre-wrap'
          : msg.isError
          ? 'max-w-full rounded-lg px-4 py-2 bg-red-900/30 border border-red-700 text-red-300 whitespace-pre-wrap'
          : 'max-w-full text-dark-text'
      }`}>
        {isUser || msg.isError ? (
          msg.content
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={MARKDOWN_COMPONENTS}>
            {msg.content}
          </ReactMarkdown>
        )}
      </div>

      {isUser && <UserMessageActions msg={msg} />}

      {/* Tool calls — hidden behind a toggle */}
      {msg.tool_calls?.length > 0 && <ToolCallsPanel toolCalls={msg.tool_calls} />}

      {/* References */}
      {msg.references?.length > 0 && (
        <div className="max-w-[80%] flex flex-col gap-1.5 mt-1">
          <p className="text-xs text-dark-muted uppercase tracking-wide">Relevant sources</p>
          <div className="flex flex-wrap gap-1.5">
            {msg.references.map((ref, i) => (
              <button
                key={i}
                onClick={() => onViewArticle(ref.article_url)}
                className="inline-flex items-start gap-1 text-xs px-2 py-1 rounded-full border border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-400 dark:border-blue-400/40 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 transition-colors text-left"
              >
                <span className="flex-shrink-0">📄</span>
                <span className="break-words">{ref.article_title}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related questions — clicking populates the input so the user can edit/send */}
      {msg.related_questions?.length > 0 && (
        <div className="max-w-[80%] flex flex-col gap-1.5 mt-1">
          <p className="text-xs text-dark-muted uppercase tracking-wide">Other related questions</p>
          <div className="flex flex-wrap gap-1.5">
            {msg.related_questions.map((q, i) => (
              <button
                key={i}
                onClick={() => onAskQuestion?.(q.question)}
                title="Click to ask this question"
                className="inline-flex items-start gap-1 text-xs px-2 py-1 rounded-full border border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:border-emerald-400 dark:border-emerald-400/40 dark:bg-emerald-500/10 dark:text-emerald-300 dark:hover:bg-emerald-500/20 transition-colors text-left"
              >
                <span className="flex-shrink-0">→</span>
                <span className="break-words">{q.question}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bot message actions (copy, retry, 👍, 👎, flag) */}
      {!isUser && !msg.isError && <BotMessageActions msg={msg} onReport={onReport} />}
    </div>
  )
}
