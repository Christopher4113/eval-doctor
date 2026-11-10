import { KeyRound, Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_CONFIG, Intake, type Item } from './components/Intake'
import { Results } from './components/Results'
import { Running } from './components/Running'
import { Wordmark } from './components/ui'
import { api, type DemoManifest, type Job } from './lib/api'

type View = 'intake' | 'running' | 'results'
const DEFAULT_STREAM = `{\n  "sample_rate": 16000,\n  "encoding": "pcm_s16le"\n}`
const pretty = (o: unknown) => JSON.stringify(o, null, 2)

export default function App() {
  const [view, setView] = useState<View>('intake')
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const [mock, setMock] = useState(false)
  const [demo, setDemo] = useState<DemoManifest | null>(null)
  const [audio, setAudio] = useState<Item[]>([])
  const [truth, setTruth] = useState<Item[]>([])
  const [config, setConfig] = useState(DEFAULT_CONFIG)
  const [stream, setStream] = useState(DEFAULT_STREAM)
  const [job, setJob] = useState<Job | null>(null)
  const [error, setError] = useState('')
  const [fatal, setFatal] = useState<Job | null>(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try { localStorage.setItem('theme', dark ? 'dark' : 'light') } catch { /* private mode */ }
  }, [dark])

  useEffect(() => { api.health().then((h) => setMock(h.mock)).catch(() => {}) }, [])

  const loadDemo = async () => {
    try {
      const m = await api.manifest()
      setDemo(m)
      setAudio(m.audio)
      setTruth(m.truth)
      setConfig(pretty(m.config))
      setStream(pretty(m.stream_config))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const analyze = async () => {
    const form = new FormData()
    form.set('config', config)
    form.set('stream_config', stream)
    const isDemo = demo && audio.every((a) => !a.file) && truth.every((t) => !t.file)
    if (isDemo) form.set('demo', '1')
    else {
      audio.forEach((a) => a.file && form.append('audio', a.file))
      truth.forEach((t) => t.file && form.append('truth', t.file))
      if (!isDemo) setDemo(null)
    }
    try {
      const { job_id } = await api.analyze(form)
      setJob(null)
      setFatal(null)
      setView('running')
      poll(job_id)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const poll = (id: string) => {
    const tick = async () => {
      const j = await api.job(id).catch(() => null)
      if (!j) return setTimeout(tick, 500)
      setJob(j)
      if (j.status === 'running') return setTimeout(tick, 200)
      if (j.status === 'error') { setFatal(j); setView('intake'); return }
      setMock(j.mock)
      setTimeout(() => setView('results'), 450)
    }
    tick()
  }

  const reset = () => { setView('intake'); setJob(null); window.scrollTo({ top: 0 }) }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-zinc-50/80 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-14 max-w-[1180px] items-center justify-between px-8">
          <button type="button" onClick={reset} aria-label="Eval Doctor home"><Wordmark /></button>
          <div className="flex items-center gap-3">
            {mock && (
              <span className="rounded-full border border-zinc-200 px-2.5 py-0.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-700" title="No ASSEMBLYAI_API_KEY set: using cached transcripts from demo/cached">
                Mock mode · cached transcripts
              </span>
            )}
            <button type="button" onClick={() => setDark(!dark)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800" aria-label="Toggle dark mode">
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1180px] px-8 pb-56 pt-10">
        {fatal && view === 'intake' && (
          <div className="rise card mb-6 flex items-start gap-3 border-amber-200 bg-amber-50/60 p-4 dark:border-amber-900 dark:bg-amber-950/30">
            <KeyRound className="mt-0.5 size-4 text-amber-600" />
            <div className="text-sm">
              <p className="font-semibold">{fatal.error_kind === 'no_key' ? 'We need an API key for new audio' : 'Analysis failed'}</p>
              <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">
                {fatal.error_kind === 'no_key'
                  ? <>Add <code className="font-mono text-[12px]">ASSEMBLYAI_API_KEY</code> to <code className="font-mono text-[12px]">.env</code> and restart, or click Load demo customer to use cached transcripts.</>
                  : fatal.error}
              </p>
            </div>
          </div>
        )}
        {view === 'intake' && (
          <Intake onAnalyze={analyze} onLoadDemo={loadDemo} demo={demo} busy={false} error={error}
            audio={audio} setAudio={setAudio} truth={truth} setTruth={setTruth}
            config={config} setConfig={setConfig} stream={stream} setStream={setStream} />
        )}
        {view === 'running' && <Running job={job} />}
        {view === 'results' && job && <Results job={job} customer={demo?.customer ?? null} onReset={reset} />}
      </main>
    </div>
  )
}
