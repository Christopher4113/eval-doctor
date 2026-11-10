import { ArrowRight, Download, FileText, RotateCcw, X } from 'lucide-react'
import { marked } from 'marked'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { pct, type DiffOp, type FileResult, type Finding, type Job, type Severity } from '../lib/api'
import { CodeBlock, CopyButton, SEV, SeverityBadge } from './ui'

const ORDER: Severity[] = ['error', 'warning', 'info']
// Report text can echo user-supplied config values: drop any raw HTML before rendering.
marked.use({ renderer: { html: () => '' } })

function HealthRing({ score }: { score: number }) {
  const r = 42
  const c = 2 * Math.PI * r
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const t = setTimeout(() => setShown(score), 80)
    return () => clearTimeout(t)
  }, [score])
  const color = score >= 80 ? 'stroke-teal-500' : score >= 50 ? 'stroke-amber-500' : 'stroke-red-500'
  const verdict = score >= 80 ? 'Looks fair' : score >= 50 ? 'Needs fixes' : 'Not ready'
  return (
    <div className="flex items-center gap-5">
      <div className="relative size-[104px] shrink-0">
        <svg viewBox="0 0 100 100" className="size-full -rotate-90">
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" className="stroke-zinc-100 dark:stroke-zinc-800" />
          <circle cx="50" cy="50" r={r} fill="none" strokeWidth="9" strokeLinecap="round" className={`${color} transition-[stroke-dashoffset] duration-1000 ease-out`}
            strokeDasharray={c} strokeDashoffset={c - (c * shown) / 100} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-semibold tabular-nums tracking-tight">{score}</span>
          <span className="text-[10px] text-zinc-400">/ 100</span>
        </div>
      </div>
      <div>
        <p className="label">Eval health</p>
        <p className={`mt-1 whitespace-nowrap text-[17px] font-semibold ${score >= 50 ? '' : 'text-red-600 dark:text-red-400'}`}>{verdict}</p>
        <p className="mt-0.5 text-xs text-zinc-500">{score < 50 ? 'Fix errors before quoting WER' : '−25 per error, −8 per warning'}</p>
      </div>
    </div>
  )
}

function WerBars({ raw, norm, words }: { raw: number; norm: number; words: number }) {
  const max = Math.max(raw, 0.25) * 1.1
  const gap = (raw - norm) * 100
  const [grow, setGrow] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setGrow(true), 150)
    return () => clearTimeout(t)
  }, [])
  const Row = ({ label, v, cls }: { label: string; v: number; cls: string }) => (
    <div className="grid grid-cols-[96px_1fr_64px] items-center gap-3">
      <span className="text-sm text-zinc-500">{label}</span>
      <div className="h-7 rounded-md bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-full rounded-md ${cls} transition-[width] duration-1000 ease-out`} style={{ width: grow ? `${(v / max) * 100}%` : '0%' }} />
      </div>
      <span className="text-right text-lg font-semibold tabular-nums">{pct(v)}</span>
    </div>
  )
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="label">Aggregate WER</p>
        {gap > 1 && (
          <span className="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-700 ring-1 ring-inset ring-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:ring-sky-900">
            {gap.toFixed(1)} pts of this is formatting
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        <Row label="Raw" v={raw} cls="bg-zinc-400 dark:bg-zinc-500" />
        <Row label="Normalized" v={norm} cls="bg-teal-500" />
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        Weighted by reference word count ({words} words), not a mean of per-file WERs.
      </p>
    </div>
  )
}

function FindingCard({ f, i }: { f: Finding; i: number }) {
  const s = SEV[f.severity]
  return (
    <div className="rise card flex flex-col p-4" style={{ animationDelay: `${i * 40}ms` }} data-finding={f.id}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 h-full w-1 shrink-0 self-stretch rounded-full ${s.dot}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={f.severity} />
            {f.file && <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11.5px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">{f.file}</span>}
          </div>
          <h4 className="mt-2 text-[15px] font-semibold leading-snug">{f.title}</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">{f.detail}</p>
          <p className="mt-2.5 flex gap-1.5 text-[13px] leading-relaxed">
            <ArrowRight className="mt-[3px] size-3.5 shrink-0 text-teal-600" strokeWidth={2.5} />
            <span><span className="font-semibold">Fix: </span>{f.fix}</span>
          </p>
          {f.snippet && <div className="mt-3"><CodeBlock code={f.snippet} /></div>}
        </div>
      </div>
    </div>
  )
}

function WerCell({ v }: { v: number }) {
  return (
    <div className="flex items-center justify-end gap-2.5">
      <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-zinc-400" style={{ width: `${Math.min(100, (v / 0.4) * 100)}%` }} />
      </div>
      <span className="w-12 text-right tabular-nums">{pct(v)}</span>
    </div>
  )
}

function Diff({ file }: { file: FileResult }) {
  const [mode, setMode] = useState<'raw' | 'normalized'>('raw')
  const ops = file.diff[mode]
  const count = (o: DiffOp[]) => o.filter((x) => x.op !== 'eq').length
  return (
    <div className="card p-6" data-demo="diff">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="label">Word alignment</p>
          <h3 className="mt-1 font-mono text-[15px] font-medium">{file.name}</h3>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm tabular-nums text-zinc-500">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{count(ops)}</span> errors · WER{' '}
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{pct(mode === 'raw' ? file.raw_wer : file.normalized_wer)}</span>
          </span>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-sm dark:bg-zinc-800" role="tablist">
            {(['raw', 'normalized'] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} data-demo={`diff-${m}`}
                className={`rounded-md px-3 py-1.5 font-medium capitalize transition ${mode === m ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div key={mode} className="rise font-mono text-[14.5px] leading-[2.1]">
        {ops.map((o, i) => {
          if (o.op === 'eq') return <span key={i}>{o.ref} </span>
          if (o.op === 'del') return <span key={i} className="mr-1 rounded bg-red-100 px-1 text-red-700 line-through decoration-red-500/70 dark:bg-red-950/60 dark:text-red-300">{o.ref}</span>
          if (o.op === 'ins') return <span key={i} className="mr-1 rounded bg-emerald-100 px-1 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">{o.hyp}</span>
          return (
            <span key={i} className="mr-1 rounded bg-amber-100 px-1 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200" title={`truth: ${o.ref}`}>
              <span className="text-amber-700/60 line-through dark:text-amber-300/50">{o.ref}</span> {o.hyp}
            </span>
          )
        })}
      </div>
      <div className="mt-5 flex gap-5 border-t border-zinc-100 pt-4 text-xs text-zinc-500 dark:border-zinc-800">
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-amber-300" />Substitution (truth → transcript)</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-red-300" />Deletion</span>
        <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-emerald-300" />Insertion</span>
      </div>
    </div>
  )
}

function ReportDrawer({ md, onClose }: { md: string; onClose: () => void }) {
  const [view, setView] = useState<'preview' | 'markdown'>('preview')
  const html = useMemo(() => marked.parse(md, { async: false }) as string, [md])
  const download = () => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }))
    a.download = 'eval-doctor-report.md'
    a.click()
  }
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Customer report">
      <div className="absolute inset-0 animate-[rise_.2s_ease_both] bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside className="relative flex h-full w-[600px] animate-[slidein_.3s_cubic-bezier(.2,.7,.2,1)_both] flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900" data-demo="report">
        <style>{'@keyframes slidein{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}'}</style>
        <header className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
          <div>
            <p className="label">Customer report</p>
            <h2 className="mt-0.5 font-semibold">Ready to paste into Slack</h2>
          </div>
          <div className="flex items-center gap-1">
            <CopyButton text={md} label="Copy" />
            <button type="button" onClick={download} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:hover:bg-zinc-800 dark:hover:text-zinc-100">
              <Download className="size-3.5" />Download .md
            </button>
            <button type="button" onClick={onClose} className="ml-2 rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800" aria-label="Close report">
              <X className="size-4" />
            </button>
          </div>
        </header>
        <div className="flex gap-1 px-6 pt-4 text-sm">
          {(['preview', 'markdown'] as const).map((v) => (
            <button key={v} type="button" onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize ${view === v ? 'bg-zinc-100 dark:bg-zinc-800' : 'text-zinc-500'}`}>{v}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4" data-demo="report-body">
          {view === 'preview' ? (
            <div className="flex gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-sm font-semibold text-white">SE</div>
              <div className="min-w-0 text-[14px] text-zinc-700 dark:text-zinc-300">
                <p className="text-sm"><span className="font-semibold text-zinc-900 dark:text-white">Solutions Engineer</span> <span className="text-xs text-zinc-400">just now</span></p>
                <div className="prose-report" dangerouslySetInnerHTML={{ __html: html }} />
              </div>
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-relaxed text-zinc-600 dark:text-zinc-300">{md}</pre>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  )
}

export function Results({ job, customer, onReset }: { job: Job; customer: string | null; onReset: () => void }) {
  const [selected, setSelected] = useState(job.files[0]?.name)
  const [report, setReport] = useState(false)
  const agg = job.aggregate!
  const counts = Object.fromEntries(ORDER.map((s) => [s, job.findings.filter((f) => f.severity === s).length])) as Record<Severity, number>
  const file = job.files.find((f) => f.name === selected)

  return (
    <div className="rise space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <p className="label">Results</p>
          <h1 className="mt-1 text-[28px] font-semibold tracking-tight">{customer ?? 'Your eval'}</h1>
          <p className="mt-1 text-sm text-zinc-500">{job.files.length} files · {agg.ref_words} reference words · {job.findings.length} findings</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onReset} className="btn-ghost"><RotateCcw className="size-4" />New analysis</button>
          <button type="button" onClick={() => setReport(true)} className="btn-primary" data-demo="generate-report"><FileText className="size-4" />Generate report</button>
        </div>
      </div>

      <section className="grid grid-cols-[1.05fr_1.6fr_0.85fr] gap-4" data-demo="summary">
        <div className="card p-6"><HealthRing score={job.health ?? 0} /></div>
        <div className="card p-6"><WerBars raw={agg.raw_wer} norm={agg.normalized_wer} words={agg.ref_words} /></div>
        <div className="card flex flex-col justify-center gap-3 p-6">
          {ORDER.map((s) => {
            const Icon = SEV[s].icon
            return (
              <div key={s} className="flex items-center gap-3">
                <Icon className={`size-4 ${SEV[s].text}`} strokeWidth={2.5} />
                <span className="text-sm text-zinc-500">{s === 'info' ? 'Info' : `${SEV[s].label}s`}</span>
                <span className="ml-auto text-xl font-semibold tabular-nums">{counts[s]}</span>
              </div>
            )
          })}
        </div>
      </section>

      {ORDER.filter((s) => counts[s]).map((s) => (
        <section key={s} data-demo={`findings-${s}`}>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <span className={`size-2 rounded-full ${SEV[s].dot}`} />
            {s === 'info' ? 'Info' : `${SEV[s].label}s`} <span className="font-normal text-zinc-400">{counts[s]}</span>
          </h2>
          <div className="grid grid-cols-2 items-start gap-3">
            {job.findings.filter((f) => f.severity === s).map((f, i) => <FindingCard key={`${f.id}-${f.file}`} f={f} i={i} />)}
          </div>
        </section>
      ))}

      <section data-demo="files">
        <h2 className="mb-3 text-sm font-semibold">Per file</h2>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50/80 text-left text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
              <tr>
                {['File', 'Language', 'speech_model_used', 'Duration', 'Raw WER', 'Normalized WER', 'Findings'].map((h, i) => (
                  <th key={h} className={`px-4 py-2.5 font-medium ${i >= 3 ? 'text-right' : ''} ${h === 'speech_model_used' ? 'font-mono' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {job.files.map((f) => (
                <tr key={f.name} onClick={() => setSelected(f.name)} data-file={f.name}
                  className={`cursor-pointer border-b border-zinc-100 transition last:border-0 dark:border-zinc-800 ${selected === f.name ? 'bg-teal-50/70 dark:bg-teal-950/20' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'}`}>
                  <td className="px-4 py-3 font-mono text-[13px]">
                    <span className={`mr-2 inline-block size-1.5 rounded-full align-middle ${selected === f.name ? 'bg-teal-500' : 'bg-transparent'}`} />{f.name}
                  </td>
                  <td className="px-4 py-3 uppercase text-zinc-500">{f.language}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[12px] ${f.speech_model_used === 'universal-2' && (job.fixed_config?.speech_models as string[] | undefined)?.[0] !== 'universal-2'
                      ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900' : 'bg-zinc-100 dark:bg-zinc-800'}`}>{f.speech_model_used ?? '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-zinc-500">{f.duration.toFixed(1)}s</td>
                  <td className="px-4 py-3 text-zinc-500"><WerCell v={f.raw_wer} /></td>
                  <td className="px-4 py-3 font-medium"><WerCell v={f.normalized_wer} /></td>
                  <td className="px-4 py-3 text-right tabular-nums">{f.findings_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {file && <Diff key={file.name} file={file} />}

      {report && <ReportDrawer md={job.report_md} onClose={() => setReport(false)} />}
    </div>
  )
}
