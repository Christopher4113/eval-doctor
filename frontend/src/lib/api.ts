export type Severity = 'error' | 'warning' | 'info'

export interface Finding {
  id: string
  severity: Severity
  title: string
  detail: string
  fix: string
  file?: string
  snippet?: string
}

export type DiffOp =
  | { op: 'eq'; ref: string }
  | { op: 'del'; ref: string }
  | { op: 'sub'; ref: string; hyp: string }
  | { op: 'ins'; hyp: string }

export interface FileResult {
  name: string
  truth_name: string
  language: string
  speech_model_used: string | null
  duration: number
  sample_rate: number
  channels: number
  raw_wer: number
  normalized_wer: number
  ref_words: number
  findings_count: number
  truth_text: string
  hyp_text: string
  diff: { raw: DiffOp[]; normalized: DiffOp[] }
}

export interface Job {
  status: 'running' | 'done' | 'error'
  step: string
  progress: number
  steps: { key: string; label: string; status: 'pending' | 'running' | 'done' }[]
  transcribed: number
  total: number
  findings: Finding[]
  files: FileResult[]
  aggregate: { raw_wer: number; normalized_wer: number; ref_words: number } | null
  health: number | null
  report_md: string
  fixed_config: Record<string, unknown> | null
  mock: boolean
  error: string | null
  error_kind?: string
}

export interface DemoManifest {
  customer: string
  audio: { name: string; size: number }[]
  truth: { name: string; size: number }[]
  config: Record<string, unknown>
  stream_config: Record<string, unknown>
}

async function json<T>(r: Response): Promise<T> {
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `Request failed (${r.status})`)
  return body as T
}

export const api = {
  health: () => fetch('/api/health').then((r) => json<{ ok: boolean; mock: boolean }>(r)),
  manifest: () => fetch('/api/demo/manifest').then((r) => json<DemoManifest>(r)),
  job: (id: string) => fetch(`/api/jobs/${id}`).then((r) => json<Job>(r)),
  analyze: (form: FormData) =>
    fetch('/api/analyze', { method: 'POST', body: form }).then((r) => json<{ job_id: string }>(r)),
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`
