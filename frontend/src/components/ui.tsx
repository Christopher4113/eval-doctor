import { AlertTriangle, Check, Copy, Info, OctagonAlert } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { Severity } from '../lib/api'

export const SEV: Record<Severity, { label: string; icon: typeof Info; text: string; bg: string; ring: string; dot: string }> = {
  error: {
    label: 'Error', icon: OctagonAlert,
    text: 'text-red-700 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/40',
    ring: 'ring-red-200 dark:ring-red-900/60', dot: 'bg-red-500',
  },
  warning: {
    label: 'Warning', icon: AlertTriangle,
    text: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/40',
    ring: 'ring-amber-200 dark:ring-amber-900/60', dot: 'bg-amber-500',
  },
  info: {
    label: 'Info', icon: Info,
    text: 'text-sky-700 dark:text-sky-400', bg: 'bg-sky-50 dark:bg-sky-950/40',
    ring: 'ring-sky-200 dark:ring-sky-900/60', dot: 'bg-sky-500',
  },
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  const s = SEV[severity]
  const Icon = s.icon
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${s.text} ${s.bg} ${s.ring}`}>
      <Icon className="size-3" strokeWidth={2.5} aria-hidden />
      {s.label}
    </span>
  )
}

export function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-zinc-900 dark:fill-white" />
        <path d="M7 17h4l2.5-6 4 11 2.5-5H25" fill="none" stroke="#14b8a6" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight">
        Eval Doctor
      </span>
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', className = '' }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(text)
        setDone(true)
        setTimeout(() => setDone(false), 1400)
      }}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 ${className}`}
    >
      {done ? <Check className="size-3.5 text-teal-600" /> : <Copy className="size-3.5" />}
      {done ? 'Copied' : label}
    </button>
  )
}

const TOKEN = /("(?:\\.|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g

export function highlightJson(src: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  for (const m of src.matchAll(TOKEN)) {
    const i = m.index ?? 0
    if (i > last) out.push(src.slice(last, i))
    const t = m[0]
    const cls = m[2]
      ? 'text-zinc-900 dark:text-zinc-100 font-medium'
      : t.startsWith('"')
        ? 'text-teal-700 dark:text-teal-400'
        : 'text-orange-600 dark:text-orange-400'
    out.push(<span key={i} className={cls}>{t}</span>)
    last = i + t.length
  }
  out.push(src.slice(last))
  return out
}

export function CodeBlock({ code }: { code: string }) {
  return (
    <div className="group relative rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950">
      <pre className="overflow-x-auto p-3 pr-20 font-mono text-[12.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">{highlightJson(code)}</pre>
      <CopyButton text={code} className="absolute right-1.5 top-1.5" />
    </div>
  )
}

export function JsonEditor({ value, onChange, rows = 12 }: { value: string; onChange: (v: string) => void; rows?: number }) {
  let error = ''
  try {
    if (value.trim()) JSON.parse(value)
  } catch (e) {
    error = (e as Error).message
  }
  const shared = 'm-0 whitespace-pre-wrap break-words p-4 font-mono text-[13px] leading-[1.65]'
  return (
    <div>
      <div className="relative rounded-lg border border-zinc-200 bg-zinc-50 focus-within:border-teal-500 focus-within:ring-2 focus-within:ring-teal-500/20 dark:border-zinc-800 dark:bg-zinc-950">
        <pre aria-hidden className={`${shared} pointer-events-none text-zinc-500 dark:text-zinc-400`} style={{ minHeight: `${rows * 1.65 + 2}em` }}>
          {highlightJson(value)}
          {'\n'}
        </pre>
        <textarea
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${shared} absolute inset-0 resize-none bg-transparent text-transparent caret-zinc-900 outline-none dark:caret-white`}
          aria-label="Request config JSON"
        />
      </div>
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">Invalid JSON: {error}</p>}
    </div>
  )
}
