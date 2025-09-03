// src/screens/Spectator.tsx
import { useEffect, useState } from 'react'
import { observeSession, type Session } from '../components/session'

export default function Spectator({ sessionId }: { sessionId: string }) {
  const [s, setS] = useState<Session | null>(null)
  useEffect(() => observeSession(sessionId, setS as any), [sessionId])
  if (!s) return <div className="p-6">Loading…</div>

  const rows = [...(s.players || [])].sort(
    (a, b) => (b.totalPoints || 0) - (a.totalPoints || 0)
  )

  return (
    <div className="min-h-screen p-6 bg-black text-white">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-2xl font-bold">{s.name || s.code}</div>
            <div className="text-neutral-400">
              Game: {s.game} • Players: {rows.length}
            </div>
          </div>
          <div className="font-mono text-neutral-300">Code: {s.code}</div>
        </div>

        <div className="rounded-2xl border border-neutral-800">
          {rows.map((p, i) => (
            <div
              key={p.uid}
              className="flex items-center gap-4 px-4 py-3 border-b border-neutral-900 last:border-0"
            >
              <div className="w-8 text-right text-neutral-500">{i + 1}.</div>
              <div className="flex-1">
                <div className="font-medium">{p.name}</div>
                <div className="h-2 bg-neutral-800 rounded-xl overflow-hidden mt-1">
                  <div
                    className="h-full bg-sky-500"
                    style={{ width: `${Math.min(100, (p.totalPoints || 0) / 1.2)}%` }}
                  />
                </div>
              </div>
              <div className="w-16 text-right text-xl font-semibold">
                {p.totalPoints || 0}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
