import { FileAudio, FileText, Sparkles, Upload, X } from 'lucide-react'
import { useRef, useState, type DragEvent } from 'react'
import type { DemoManifest } from '../lib/api'
import { JsonEditor } from './ui'

export const DEFAULT_CONFIG = `{
  "speech_models": ["universal-3-5-pro", "universal-2"],
  "language_detection": true,
  "punctuate": true,
  "format_text": true
}`

type Item = { name: string; size: number; file?: File }

const kb = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`)

function DropZone({
  title, hint, accept, items, onAdd, onRemove, icon: Icon,
}: {
  title: string; hint: string; accept: string; items: Item[]
  onAdd: (f: File[]) => void; onRemove: (name: string) => void; icon: typeof FileAudio
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const drop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    onAdd([...e.dataTransfer.files])
  }
  return (
    <div className="card flex flex-col p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="text-xs text-zinc-400">{items.length ? `${items.length} file${items.length > 1 ? 's' : ''}` : hint}</span>
      </div>
      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={drop}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-5 text-center transition ${
          over ? 'border-teal-500 bg-teal-50/60 dark:bg-teal-950/30' : 'border-zinc-300 hover:border-zinc-400 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50'
        }`}
      >
        <Upload className="size-4 text-zinc-400" />
        <span className="text-xs text-zinc-500">Drop files or <span className="font-medium text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100">browse</span></span>
      </button>
      <input ref={input} type="file" multiple accept={accept} className="hidden" onChange={(e) => onAdd([...(e.target.files ?? [])])} />
      <ul className="mt-3 space-y-1.5">
        {items.map((it, i) => (
          <li key={it.name} className="rise flex items-center gap-2.5 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50" style={{ animationDelay: `${i * 60}ms` }}>
            <Icon className="size-4 shrink-0 text-zinc-400" />
            <span className="truncate font-mono text-[12.5px]">{it.name}</span>
            <span className="ml-auto text-[11px] tabular-nums text-zinc-400">{kb(it.size)}</span>
            <button type="button" onClick={() => onRemove(it.name)} className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200" aria-label={`Remove ${it.name}`}>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function Intake({
  onAnalyze, onLoadDemo, demo, busy, error,
  audio, setAudio, truth, setTruth, config, setConfig, stream, setStream,
}: {
  onAnalyze: () => void; onLoadDemo: () => void; demo: DemoManifest | null; busy: boolean; error: string
  audio: Item[]; setAudio: (v: Item[]) => void; truth: Item[]; setTruth: (v: Item[]) => void
  config: string; setConfig: (v: string) => void; stream: string; setStream: (v: string) => void
}) {
  const [tab, setTab] = useState<'request' | 'stream'>('request')
  const add = (list: Item[], set: (v: Item[]) => void) => (files: File[]) =>
    set([...list.filter((x) => !files.some((f) => f.name === x.name)), ...files.map((f) => ({ name: f.name, size: f.size, file: f }))])
  const ready = audio.length > 0 && !busy

  return (
    <div className="rise">
      <div className="mb-8 flex items-end justify-between gap-6">
        <div>
          <h1 className="text-[28px] font-semibold tracking-tight">
            {demo ? <>Eval check for <span className="text-teal-600 dark:text-teal-400">{demo.customer}</span></> : 'Check an eval before you trust it'}
          </h1>
          <p className="mt-1.5 max-w-xl text-[15px] text-zinc-500 dark:text-zinc-400">
            Drop in the customer's audio, truth transcripts and request config. We lint the setup, run AssemblyAI, and show how much of the WER is real.
          </p>
        </div>
        <button type="button" onClick={onLoadDemo} className="btn-ghost shrink-0" data-demo="load">
          <Sparkles className="size-4 text-teal-600" />
          Load demo customer
        </button>
      </div>

      <div className="grid grid-cols-[1fr_1fr_1.25fr] gap-4">
        <DropZone title="Audio" hint=".mp3 .wav .m4a" accept="audio/*" icon={FileAudio} items={audio}
          onAdd={add(audio, setAudio)} onRemove={(n) => setAudio(audio.filter((x) => x.name !== n))} />
        <DropZone title="Truth files" hint=".txt .srt" accept=".txt,.srt,.vtt" icon={FileText} items={truth}
          onAdd={add(truth, setTruth)} onRemove={(n) => setTruth(truth.filter((x) => x.name !== n))} />
        <div className="card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Config</h3>
            <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs dark:bg-zinc-800">
              {(['request', 'stream'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setTab(t)}
                  className={`rounded-md px-2.5 py-1 font-medium transition ${tab === t ? 'bg-white shadow-sm dark:bg-zinc-950' : 'text-zinc-500'}`}>
                  {t === 'request' ? 'Request' : 'Streaming'}
                </button>
              ))}
            </div>
          </div>
          {tab === 'request'
            ? <JsonEditor value={config} onChange={setConfig} rows={11} />
            : <JsonEditor value={stream} onChange={setStream} rows={11} />}
        </div>
      </div>

      <div className="mt-6 flex items-center justify-end gap-4">
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button type="button" onClick={onAnalyze} disabled={!ready} className="btn-primary px-6" data-demo="analyze">
          Analyze
        </button>
      </div>
    </div>
  )
}

export type { Item }
