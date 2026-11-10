import { Check, Loader2 } from 'lucide-react'
import type { Job } from '../lib/api'
import { SeverityBadge } from './ui'

export function Running({ job }: { job: Job | null }) {
  const steps = job?.steps ?? [
    { key: 'lint', label: 'Config lint', status: 'running' as const },
    { key: 'audio', label: 'Audio checks', status: 'pending' as const },
    { key: 'transcribe', label: 'Transcribing', status: 'pending' as const },
    { key: 'score', label: 'Scoring', status: 'pending' as const },
  ]
  return (
    <div className="rise mx-auto max-w-3xl">
      <h1 className="text-[28px] font-semibold tracking-tight">Checking the eval…</h1>
      <p className="mt-1.5 text-[15px] text-zinc-500">Findings show up as each step finishes.</p>

      <ol className="card mt-8 grid grid-cols-4 divide-x divide-zinc-200 overflow-hidden dark:divide-zinc-800">
        {steps.map((s, i) => (
          <li key={s.key} className={`relative px-5 py-4 transition-colors ${s.status === 'running' ? 'bg-teal-50/60 dark:bg-teal-950/20' : ''}`}>
            <div className="flex items-center gap-2.5">
              <span className={`flex size-6 items-center justify-center rounded-full text-xs font-semibold transition ${
                s.status === 'done' ? 'bg-teal-600 text-white'
                  : s.status === 'running' ? 'bg-white text-teal-700 ring-2 ring-teal-500 dark:bg-zinc-900'
                  : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}>
                {s.status === 'done' ? <Check className="size-3.5" strokeWidth={3} />
                  : s.status === 'running' ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              <span className={`text-sm font-medium ${s.status === 'pending' ? 'text-zinc-400' : ''}`}>{s.label}</span>
            </div>
            {s.key === 'transcribe' && job && job.total > 0 && (
              <p className="mt-1 pl-8 text-xs tabular-nums text-zinc-500">{job.transcribed} / {job.total} files</p>
            )}
            {s.status === 'running' && <span className="absolute inset-x-0 bottom-0 h-0.5 animate-pulse bg-teal-500" />}
          </li>
        ))}
      </ol>

      <div className="mt-6 space-y-2">
        {(job?.findings ?? []).map((f, i) => (
          <div key={`${f.id}-${f.file ?? ''}-${i}`} className="rise card flex items-center gap-3 px-4 py-3">
            <SeverityBadge severity={f.severity} />
            <span className="text-sm font-medium">{f.title}</span>
            {f.file && <span className="ml-auto font-mono text-xs text-zinc-400">{f.file}</span>}
          </div>
        ))}
        {(!job || job.findings.length === 0) && [0, 1, 2].map((i) => <div key={i} className="skeleton h-12" />)}
      </div>
    </div>
  )
}
