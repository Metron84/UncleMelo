import { useEffect, useRef, useState, type ReactNode } from "react"
import { browseModes, buildGroups, genreCover, searchTracks, type BrowseMode, type LibraryGroup } from "../library/browse.ts"
import type { TrackRecord } from "../library/types.ts"

type LibrarySheetProps = {
  tracks: TrackRecord[]
  currentId: string | null
  busy: boolean
  message: string | null
  onClose: () => void
  onPlay: (list: TrackRecord[], index: number) => void
  onRescan: () => void
}

export function LibrarySheet({ tracks, currentId, busy, message, onClose, onPlay, onRescan }: LibrarySheetProps) {
  const [mode, setMode] = useState<BrowseMode>("Genre")
  const [query, setQuery] = useState("")
  const [group, setGroup] = useState<LibraryGroup | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    searchRef.current?.focus()
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  const searching = query.trim().length > 0
  const results = searching ? searchTracks(tracks, query) : []
  const groups = searching ? [] : buildGroups(tracks, mode)
  const songLabel = `${tracks.length} song${tracks.length === 1 ? "" : "s"} · offline`

  function chooseMode(next: BrowseMode) {
    setMode(next)
    setGroup(null)
  }

  return (
    <div className="fixed inset-0 z-30">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close library" onClick={onClose} />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
        className="absolute inset-x-0 bottom-0 mx-auto flex h-[82%] w-full max-w-[480px] flex-col rounded-t-[28px] bg-surface text-text"
      >
        <button type="button" className="flex h-11 w-full items-center justify-center" aria-label="Close library" onClick={onClose}>
          <span className="h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        </button>
        <div className="flex items-start justify-between gap-4 px-6">
          <div className="min-w-0">
            <h2 id="library-title" className="text-title font-medium">
              Library
            </h2>
            <p className="text-meta text-muted">{songLabel}</p>
          </div>
          <button
            type="button"
            className="mt-1 h-11 shrink-0 px-1 text-meta text-muted disabled:opacity-60"
            onClick={onRescan}
            disabled={busy}
          >
            {busy ? "Reading" : "Rescan"}
          </button>
        </div>
        {message && <p className="px-6 pt-2 text-meta text-muted">{message}</p>}
        <div className="px-6 pt-4">
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search songs or artists"
            aria-label="Search songs or artists"
            autoComplete="off"
            className="h-12 w-full rounded-[14px] bg-bg px-4 text-body text-text placeholder:text-muted"
          />
        </div>
        <div className="grid grid-cols-4 gap-1 px-6 pt-4" role="tablist" aria-label="Browse by">
          {browseModes.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === mode}
              className={`h-11 rounded-full text-meta ${item === mode ? "bg-bg text-text" : "text-muted"}`}
              onClick={() => chooseMode(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-3 min-h-0 flex-1">
          {searching ? (
            <TrackList tracks={results} currentId={currentId} empty="No songs match." onPlay={onPlay} />
          ) : group ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex items-center px-3">
                <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Back to groups" onClick={() => setGroup(null)}>
                  <Chevron />
                </button>
                <p className="min-w-0 truncate text-body font-medium">{group.name}</p>
              </div>
              <div className="min-h-0 flex-1">
                <TrackList tracks={group.tracks} currentId={currentId} empty="No songs in this group." onPlay={onPlay} />
              </div>
            </div>
          ) : (
            <GroupList groups={groups} onOpen={setGroup} />
          )}
        </div>
      </section>
    </div>
  )
}

function GroupList({ groups, onOpen }: { groups: LibraryGroup[]; onOpen: (group: LibraryGroup) => void }) {
  return (
    <Window
      items={groups}
      rowHeight={64}
      getKey={(group) => group.name}
      empty="Nothing in this view yet."
      render={(group) => (
        <button type="button" className="flex h-16 w-full items-center gap-3 px-6 text-left" onClick={() => onOpen(group)}>
          {group.cover && (
            <span className="h-10 w-10 shrink-0 rounded-[12px]" style={{ background: group.cover }} aria-hidden="true" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body">{group.name}</span>
            <span className="block text-meta text-muted">{group.count} songs</span>
          </span>
        </button>
      )}
    />
  )
}

function TrackList({
  tracks,
  currentId,
  empty,
  onPlay,
}: {
  tracks: TrackRecord[]
  currentId: string | null
  empty: string
  onPlay: (list: TrackRecord[], index: number) => void
}) {
  return (
    <Window
      items={tracks}
      rowHeight={64}
      getKey={(track) => track.id}
      empty={empty}
      render={(track) => {
        const current = track.id === currentId
        return (
          <button
            type="button"
            className="flex h-16 w-full items-center gap-3 px-6 text-left"
            onClick={() => onPlay(tracks, tracks.indexOf(track))}
          >
            <span
              className="h-12 w-12 shrink-0 rounded-[12px]"
              style={{ background: genreCover(track.genre) }}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className={`flex min-w-0 items-center gap-2 text-body ${current ? "text-accent" : ""}`}>
                <span className="truncate">{track.title}</span>
                {current && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" aria-hidden="true" />}
              </span>
              <span className="block truncate text-meta text-muted">
                {track.artist} · {track.decade}
              </span>
            </span>
          </button>
        )
      }}
    />
  )
}

function Window<T>({
  items,
  rowHeight,
  getKey,
  empty,
  render,
}: {
  items: T[]
  rowHeight: number
  getKey: (item: T) => string
  empty: string
  render: (item: T) => ReactNode
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(480)
  const [scrollTop, setScrollTop] = useState(0)
  const windowed = items.length > 200

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const measure = () => setHeight(node.clientHeight || 480)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (items.length === 0) {
    return <p className="px-6 pt-6 text-body text-muted">{empty}</p>
  }

  const overscan = 8
  const start = windowed ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0
  const count = windowed ? Math.ceil(height / rowHeight) + overscan * 2 : items.length
  const slice = items.slice(start, start + count)

  return (
    <div ref={scroller} className="h-full overflow-y-auto" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="relative" style={{ height: windowed ? items.length * rowHeight : undefined }}>
        {slice.map((item, offset) => (
          <div
            key={getKey(item)}
            style={
              windowed
                ? { position: "absolute", top: (start + offset) * rowHeight, height: rowHeight, left: 0, right: 0 }
                : { height: rowHeight }
            }
          >
            {render(item)}
          </div>
        ))}
      </div>
    </div>
  )
}

function Chevron() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 6.5 8.5 12l6 5.5" />
    </svg>
  )
}
