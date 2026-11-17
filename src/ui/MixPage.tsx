import { useEffect, useState } from "react"
import { appleMusicSearch, decodeMix, spotifySearch, type MixPayload } from "../share/mix.ts"
import { ReflectiveMark } from "./ReflectiveMark.tsx"

export function MixPage() {
  const [mix, setMix] = useState<MixPayload | null>(() => decodeMix(window.location.hash))

  useEffect(() => {
    const read = () => setMix(decodeMix(window.location.hash))
    window.addEventListener("hashchange", read)
    return () => window.removeEventListener("hashchange", read)
  }, [])

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[640px] flex-col bg-bg px-6 py-10 text-text">
      <p className="text-body font-medium">UncleMelo</p>
      {mix ? (
        <>
          <h1 className="mt-8 text-title font-medium">{mix.t}</h1>
          <p className="mt-2 text-body text-muted">Shared from UncleMelo</p>
          {mix.by && <p className="mt-1 text-meta text-muted">{mix.by}</p>}
          <ol className="mt-8">
            {mix.s.map(([artist, title], index) => (
              <li key={`${artist}-${title}-${index}`} className="flex items-start justify-between gap-4 border-b border-line py-3">
                <span className="min-w-0">
                  <span className="text-body">
                    <span className="mr-3 text-meta text-muted">{index + 1}</span>
                    {title}
                  </span>
                  <span className="mt-0.5 block pl-6 text-meta text-muted">{artist}</span>
                </span>
                <span className="shrink-0 pt-0.5 text-meta">
                  <a className="text-muted" href={spotifySearch(artist, title)} target="_blank" rel="noreferrer">
                    Spotify
                  </a>
                  <a className="ml-3 text-muted" href={appleMusicSearch(artist, title)} target="_blank" rel="noreferrer">
                    Apple Music
                  </a>
                </span>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-title font-medium">This mix link is incomplete.</h1>
          <p className="mt-2 text-body text-muted">Shared from UncleMelo</p>
        </>
      )}
      <a href="/" className="mt-10 text-body text-accent">
        Get UncleMelo for your own music
      </a>
      <ReflectiveMark className="mt-8" />
    </main>
  )
}
