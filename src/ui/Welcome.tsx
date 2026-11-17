import type { LibraryView } from "../app/useLibrary.ts"

type WelcomeProps = {
  view: Exclude<LibraryView, "ready">
  busy: boolean
  message: string | null
  onChoose: () => void
  onReconnect: () => void
}

export function Welcome({ view, busy, message, onChoose, onReconnect }: WelcomeProps) {
  const reconnecting = view === "reconnect"
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col justify-center bg-bg px-6 text-text">
      <p className="text-body font-medium">UncleMelo</p>
      {view !== "loading" && (
        <>
          <h1 className="mt-8 text-title font-medium">Your music. Your folders. No internet needed.</h1>
          <p className="mt-4 text-body text-muted">Point UncleMelo at your UncleMelo Music folder once.</p>
          {view === "unsupported" ? (
            <p className="mt-8 text-body">UncleMelo needs Chrome or Edge on desktop for now.</p>
          ) : (
            <button
              type="button"
              className="mt-8 h-12 self-start rounded-full bg-accent px-6 text-body font-medium text-on-accent disabled:opacity-60"
              onClick={reconnecting ? onReconnect : onChoose}
              disabled={busy}
              aria-busy={busy}
            >
              {reconnecting ? "Reconnect music" : "Choose music folder"}
            </button>
          )}
          {message && <p className="mt-4 text-body text-muted">{message}</p>}
          <p className="mt-6 text-meta text-muted">Nothing is uploaded. Files stay where they are.</p>
        </>
      )}
    </main>
  )
}
