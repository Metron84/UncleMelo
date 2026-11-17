import { useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent, type RefObject } from "react"
import type { ThemeName } from "../app/theme.ts"
import type { PlayHistory } from "../brain/pick.ts"
import {
  artistInitial,
  artistLetter,
  browseModes,
  buildGroups,
  decadesNewest,
  displayArtist,
  genreCover,
  genres,
  genresPresent,
  homeTracks,
  searchTracks,
  type BrowseMode,
  type HomeList,
  type LibraryGroup,
} from "../library/browse.ts"
import type { ScanProgress } from "../library/builder.ts"
import type { TrackRecord } from "../library/types.ts"
import { ReadingProgress } from "./ReadingProgress.tsx"
import { SettingsMenu } from "./SettingsMenu.tsx"
import { phoneHeaderRows, phoneMiniPlayer, phoneTileGap, phoneTileMinHeight, phoneTilePaddingX } from "./phone-layout.ts"

const homePills: readonly HomeList[] = ["Recently played", "Most played", "Rediscover"]
const alphabet = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ", "#"]

type GroupPage = {
  title: string
  tracks: TrackRecord[]
  filterKind: "decade" | "genre" | null
}

type MenuState = { track: TrackRecord; x: number; y: number }

export type LibraryPanelProps = {
  layout: "sheet" | "pane" | "phone"
  tracks: TrackRecord[]
  history: PlayHistory[]
  art: Record<string, string>
  currentId: string | null
  playing: boolean
  busy: boolean
  message: string | null
  focusToken: number
  onPlay: (list: TrackRecord[], index: number) => void
  onPlayNext: (track: TrackRecord) => void
  onAddToQueue: (track: TrackRecord) => void
  onShuffleGroup: (list: TrackRecord[]) => void
  onShare: (title: string, tracks: TrackRecord[]) => void
  onRescan: () => void
  onCancelScan: () => void
  onLetUncleChoose: () => void
  onClose: () => void
  progress: ScanProgress | null
  sessionOnly: boolean
  theme?: ThemeName
  onToggleTheme?: () => void
  onImport?: (list: FileList) => void
  skipped?: string[]
}

export function LibraryPanel(props: LibraryPanelProps) {
  const [mode, setMode] = useState<BrowseMode>("Genre")
  const [query, setQuery] = useState("")
  const [page, setPage] = useState<GroupPage | null>(null)
  const [filter, setFilter] = useState<string | null>(null)
  const [decade, setDecade] = useState<string | null>(null)
  const [decadeGenre, setDecadeGenre] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [seenFocus, setSeenFocus] = useState(props.focusToken)
  const searchRef = useRef<HTMLInputElement>(null)
  const searching = query.trim().length > 0
  const compact = props.layout === "phone"
  if (compact && props.focusToken !== seenFocus) {
    setSeenFocus(props.focusToken)
    if (props.focusToken !== 0) setSearchOpen(true)
  }

  useEffect(() => {
    if (props.focusToken === 0 || compact) return
    searchRef.current?.focus()
  }, [props.focusToken, compact])

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus()
  }, [searchOpen])

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      if (menu) {
        setMenu(null)
        return
      }
      if (query || searchOpen) {
        setQuery("")
        setSearchOpen(false)
        return
      }
      if (props.layout === "sheet") props.onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [menu, query, searchOpen, props])

  function chooseMode(next: BrowseMode) {
    setMode(next)
    setPage(null)
    setFilter(null)
    setDecade(null)
    setDecadeGenre(null)
  }

  function openGroup(next: GroupPage) {
    setPage(next)
    setFilter(null)
  }

  const tone = props.layout === "sheet" ? "bg-surface" : "bg-bg"
  const filteredGroup = page ? applyFilter(page.tracks, page.filterKind, filter) : []
  const decadeTracks = decade ? props.tracks.filter((track) => track.decade === decade) : []
  const decadeShown = decadeGenre ? decadeTracks.filter((track) => track.genre === decadeGenre) : decadeTracks

  function closeSearch() {
    setQuery("")
    setSearchOpen(false)
  }

  return (
    <div className={`flex min-h-0 w-full flex-col text-text ${props.layout === "pane" ? "h-full" : "min-h-0 flex-1"} ${tone}`}>
      {compact ? (
        <PhoneHeader
          count={props.tracks.length}
          theme={props.theme ?? "night"}
          onToggleTheme={props.onToggleTheme ?? (() => {})}
          busy={props.busy}
          onRescan={props.onRescan}
          onImport={props.onImport}
          skipped={props.skipped ?? []}
          sessionOnly={props.sessionOnly}
          searchOpen={searchOpen}
          query={query}
          searchRef={searchRef}
          onQuery={setQuery}
          onOpenSearch={() => setSearchOpen(true)}
          onCloseSearch={closeSearch}
          onLetUncleChoose={props.onLetUncleChoose}
          onOpenList={(pill) => openGroup({ title: pill, tracks: homeTracks(pill, props.tracks, props.history, Date.now()), filterKind: null })}
          mode={mode}
          onMode={chooseMode}
        />
      ) : (
      <div className={`sticky top-0 z-10 ${tone}`}>
        <div className="flex items-start justify-between gap-4 px-6 pt-2">
          <div className="min-w-0">
            <h2 id="library-title" className="text-title font-medium">
              Library
            </h2>
            <p className="text-meta text-muted">{songs(props.tracks.length)} · offline</p>
            {props.sessionOnly && (
              <p className="text-meta text-muted">On this browser, you'll need to choose your files again next time.</p>
            )}
          </div>
          <button type="button" className="mt-1 h-11 shrink-0 px-1 text-meta text-muted disabled:opacity-60" onClick={props.onRescan} disabled={props.busy}>
            {props.busy ? "Reading" : "Rescan"}
          </button>
        </div>
        {props.progress && (
          <div className="px-6">
            <ReadingProgress done={props.progress.done} total={props.progress.total} label={props.progress.label} onCancel={props.onCancelScan} />
          </div>
        )}
        <button type="button" className="mx-6 mt-1 h-11 text-left text-body text-accent" onClick={props.onLetUncleChoose}>
          Let Uncle choose
        </button>
        {props.message && <p className="whitespace-pre-line px-6 text-meta text-muted">{props.message}</p>}
        <div className="px-6 pt-2">
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
        {!searching && (
          <div className="flex gap-2 overflow-x-auto px-6 pt-3">
            {homePills.map((pill) => (
              <button
                key={pill}
                type="button"
                className="h-11 shrink-0 rounded-full border border-line px-4 text-body"
                onClick={() => openGroup({ title: pill, tracks: homeTracks(pill, props.tracks, props.history, Date.now()), filterKind: null })}
              >
                {pill}
              </button>
            ))}
          </div>
        )}
        <div className="grid grid-cols-4 gap-1 px-6 pb-3 pt-3" role="tablist" aria-label="Browse by">
          {browseModes.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={item === mode}
              className={`h-11 rounded-full text-meta ${item === mode ? (props.layout === "pane" ? "bg-surface text-text" : "bg-bg text-text") : "text-muted"}`}
              onClick={() => chooseMode(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {!searching && page && (
          <GroupBar
            title={page.title}
            count={filteredGroup.length}
            onBack={() => {
              setPage(null)
              setFilter(null)
            }}
            onPlay={() => props.onPlay(filteredGroup, 0)}
            onShuffle={() => props.onShuffleGroup(filteredGroup)}
            onShare={() => props.onShare(page.title, filteredGroup)}
          />
        )}
        {!searching && page?.filterKind === "decade" && (
          <ChipRow layout={props.layout} label="Decades">
            {decadesNewest(page.tracks).map((name) => (
              <Chip key={name} selected={filter === name} onClick={() => setFilter(filter === name ? null : name)}>
                {name}
              </Chip>
            ))}
            {filter && <ClearChip onClick={() => setFilter(null)} />}
          </ChipRow>
        )}
        {!searching && page?.filterKind === "genre" && (
          <ChipRow layout={props.layout} label="Genres">
            {genresPresent(page.tracks).map((name) => (
              <Chip key={name} selected={filter === name} onClick={() => setFilter(filter === name ? null : name)}>
                {name}
              </Chip>
            ))}
            {filter && <ClearChip onClick={() => setFilter(null)} />}
          </ChipRow>
        )}
        {!searching && !page && mode === "Decade" && (
          <>
            <ChipRow layout={props.layout} label="Decades">
              {decadesNewest(props.tracks).map((name) => (
                <Chip
                  key={name}
                  selected={decade === name}
                  onClick={() => {
                    setDecade(decade === name ? null : name)
                    setDecadeGenre(null)
                  }}
                >
                  {name}
                </Chip>
              ))}
            </ChipRow>
            {decade && (
              <>
                <GroupBar
                  title={decadeGenre ? `${decade} · ${decadeGenre}` : decade}
                  count={decadeShown.length}
                  onBack={() => {
                    setDecade(null)
                    setDecadeGenre(null)
                  }}
                  onPlay={() => props.onPlay(decadeShown, 0)}
                  onShuffle={() => props.onShuffleGroup(decadeShown)}
                  onShare={() => props.onShare(decadeGenre ? `${decade} · ${decadeGenre}` : decade, decadeShown)}
                />
                <ChipRow layout={props.layout} label="Genres">
                  {genresPresent(decadeTracks).map((name) => (
                    <Chip key={name} selected={decadeGenre === name} onClick={() => setDecadeGenre(decadeGenre === name ? null : name)}>
                      {name}
                    </Chip>
                  ))}
                  {decadeGenre && <ClearChip onClick={() => setDecadeGenre(null)} />}
                </ChipRow>
              </>
            )}
          </>
        )}
      </div>
      )}
      {compact && props.progress && (
        <div className="px-6">
          <ReadingProgress done={props.progress.done} total={props.progress.total} label={props.progress.label} onCancel={props.onCancelScan} />
        </div>
      )}
      {compact && !searching && page && (
        <GroupBar
          title={page.title}
          count={filteredGroup.length}
          onBack={() => {
            setPage(null)
            setFilter(null)
          }}
          onPlay={() => props.onPlay(filteredGroup, 0)}
          onShuffle={() => props.onShuffleGroup(filteredGroup)}
          onShare={() => props.onShare(page.title, filteredGroup)}
        />
      )}
      {compact && !searching && page?.filterKind === "decade" && (
        <ChipRow layout="sheet" label="Decades">
          {decadesNewest(page.tracks).map((name) => (
            <Chip key={name} selected={filter === name} onClick={() => setFilter(filter === name ? null : name)}>
              {name}
            </Chip>
          ))}
          {filter && <ClearChip onClick={() => setFilter(null)} />}
        </ChipRow>
      )}
      {compact && !searching && page?.filterKind === "genre" && (
        <ChipRow layout="sheet" label="Genres">
          {genresPresent(page.tracks).map((name) => (
            <Chip key={name} selected={filter === name} onClick={() => setFilter(filter === name ? null : name)}>
              {name}
            </Chip>
          ))}
          {filter && <ClearChip onClick={() => setFilter(null)} />}
        </ChipRow>
      )}
      {compact && !searching && !page && mode === "Decade" && (
        <>
          <ChipRow layout="sheet" label="Decades">
            {decadesNewest(props.tracks).map((name) => (
              <Chip
                key={name}
                selected={decade === name}
                onClick={() => {
                  setDecade(decade === name ? null : name)
                  setDecadeGenre(null)
                }}
              >
                {name}
              </Chip>
            ))}
          </ChipRow>
          {decade && (
            <>
              <GroupBar
                title={decadeGenre ? `${decade} · ${decadeGenre}` : decade}
                count={decadeShown.length}
                onBack={() => {
                  setDecade(null)
                  setDecadeGenre(null)
                }}
                onPlay={() => props.onPlay(decadeShown, 0)}
                onShuffle={() => props.onShuffleGroup(decadeShown)}
                onShare={() => props.onShare(decadeGenre ? `${decade} · ${decadeGenre}` : decade, decadeShown)}
              />
              <ChipRow layout="sheet" label="Genres">
                {genresPresent(decadeTracks).map((name) => (
                  <Chip key={name} selected={decadeGenre === name} onClick={() => setDecadeGenre(decadeGenre === name ? null : name)}>
                    {name}
                  </Chip>
                ))}
                {decadeGenre && <ClearChip onClick={() => setDecadeGenre(null)} />}
              </ChipRow>
            </>
          )}
        </>
      )}
      <div className={compact ? "min-h-0 flex-1 overflow-hidden" : "min-h-0 flex-1"}>
        {searching ? (
          <TrackList
            tracks={searchTracks(props.tracks, query)}
            art={props.art}
            currentId={props.currentId}
            playing={props.playing}
            empty="No songs match."
            onPlay={props.onPlay}
            onMenu={setMenu}
          />
        ) : page ? (
          <TrackList tracks={filteredGroup} art={props.art} currentId={props.currentId} playing={props.playing} empty="No songs in this group." onPlay={props.onPlay} onMenu={setMenu} />
        ) : mode === "Genre" ? (
          <GenreGrid
            phone={compact}
            groups={buildGroups(props.tracks, "Genre")}
            onOpen={(group) => openGroup({ title: group.name, tracks: group.tracks, filterKind: "decade" })}
          />
        ) : mode === "Decade" ? (
          decade ? (
            <TrackList tracks={decadeShown} art={props.art} currentId={props.currentId} playing={props.playing} empty="No songs in this decade." onPlay={props.onPlay} onMenu={setMenu} />
          ) : (
            <p className="px-6 pt-2 text-body text-muted">Choose a decade.</p>
          )
        ) : mode === "Artist" ? (
          <ArtistList
            groups={buildGroups(props.tracks, "Artist")}
            tone={tone}
            onOpen={(group) => openGroup({ title: group.name, tracks: group.tracks, filterKind: null })}
          />
        ) : (
          <CollectionList
            phone={compact}
            groups={buildGroups(props.tracks, "Collections")}
            onOpen={(group) => openGroup({ title: group.name, tracks: group.tracks, filterKind: null })}
          />
        )}
      </div>
      {menu && (
        <TrackMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onPlayNext={() => {
            props.onPlayNext(menu.track)
            setMenu(null)
          }}
          onAdd={() => {
            props.onAddToQueue(menu.track)
            setMenu(null)
          }}
          onArtist={() => {
            const name = displayArtist(menu.track)
            const group = buildGroups(props.tracks, "Artist").find((item) => item.name === name)
            setMode("Artist")
            setQuery("")
            openGroup({ title: name, tracks: group?.tracks ?? props.tracks.filter((track) => displayArtist(track) === name), filterKind: null })
            setMenu(null)
          }}
        />
      )}
    </div>
  )
}

export function PhoneMiniPlayer({
  track,
  coverUrl,
  playing,
  elapsed,
  duration,
  onToggle,
  onOpen,
}: {
  track: TrackRecord | null
  coverUrl: string | null
  playing: boolean
  elapsed: number
  duration: number
  onToggle: () => void
  onOpen: () => void
}) {
  const progress = duration === 0 ? 0 : Math.min(100, (elapsed / duration) * 100)
  return (
    <div className="relative shrink-0 bg-bg" style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)", backgroundColor: "var(--bg)" }}>
      <div className="absolute inset-x-0 top-0 h-[2px] bg-line" aria-hidden="true">
        <div className="h-full bg-text" style={{ width: `${progress}%` }} />
      </div>
      <div className="flex items-center gap-3 px-4" style={{ height: phoneMiniPlayer }}>
        <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpen}>
          <span className="h-11 w-11 shrink-0 overflow-hidden rounded-[10px]" style={{ background: genreCover(track?.genre ?? "") }}>
            {coverUrl && <img src={coverUrl} alt="" className="h-full w-full object-cover" />}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[15px]">{track?.title ?? "Nothing playing"}</span>
            <span className="block truncate text-[12px] text-muted">{track?.artist ?? "Choose a song"}</span>
          </span>
        </button>
        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-on-accent" aria-label={playing ? "Pause" : "Play"} onClick={onToggle} disabled={!track}>
          {playing ? <PauseMark /> : <PlayMark />}
        </button>
      </div>
    </div>
  )
}

function PhoneHeader({
  count,
  theme,
  onToggleTheme,
  busy,
  onRescan,
  onImport,
  skipped,
  sessionOnly,
  searchOpen,
  query,
  searchRef,
  onQuery,
  onOpenSearch,
  onCloseSearch,
  onLetUncleChoose,
  onOpenList,
  mode,
  onMode,
}: {
  count: number
  theme: ThemeName
  onToggleTheme: () => void
  busy: boolean
  onRescan: () => void
  onImport?: (list: FileList) => void
  skipped: string[]
  sessionOnly: boolean
  searchOpen: boolean
  query: string
  searchRef: RefObject<HTMLInputElement | null>
  onQuery: (value: string) => void
  onOpenSearch: () => void
  onCloseSearch: () => void
  onLetUncleChoose: () => void
  onOpenList: (pill: HomeList) => void
  mode: BrowseMode
  onMode: (mode: BrowseMode) => void
}) {
  return (
    <header className="shrink-0 bg-bg" style={{ paddingTop: "env(safe-area-inset-top, 0px)", backgroundColor: "var(--bg)" }}>
      {searchOpen ? (
        <div className="flex items-center gap-2 px-4" style={{ height: phoneHeaderRows[0] }}>
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => onQuery(event.target.value)}
            placeholder="Search songs or artists"
            aria-label="Search songs or artists"
            autoComplete="off"
            className="h-10 min-w-0 flex-1 rounded-[14px] bg-surface px-3 text-[15px] text-text placeholder:text-muted"
          />
          <button type="button" className="h-11 shrink-0 px-1 text-[15px]" onClick={onCloseSearch}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center px-4" style={{ height: phoneHeaderRows[0] }}>
          <h2 id="library-title" className="shrink-0 text-title font-medium">Library</h2>
          <p className="ml-2 min-w-0 truncate text-[12px] text-muted">{songs(count)}</p>
          <div className="ml-auto flex shrink-0 items-center">
            <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Search" onClick={onOpenSearch}>
              <SearchIcon />
            </button>
            <SettingsMenu busy={busy} onRescan={onRescan} onImport={onImport} skipped={skipped} sessionOnly={sessionOnly} />
            <button
              type="button"
              className="grid h-11 w-11 place-items-center"
              aria-label={theme === "night" ? "Use daylight theme" : "Use late night theme"}
              onClick={onToggleTheme}
            >
              {theme === "night" ? <SunMark /> : <MoonMark />}
            </button>
          </div>
        </div>
      )}
      <div className="unclemelo-scroll flex items-center gap-2 overflow-x-auto px-4" style={{ height: phoneHeaderRows[1] }}>
        <button type="button" className="h-9 shrink-0 rounded-full bg-accent px-[14px] text-[12px] text-[#FFF8EE]" onClick={onLetUncleChoose}>
          Let Uncle choose
        </button>
        {homePills.map((pill) => (
          <button key={pill} type="button" className="h-9 shrink-0 rounded-full border border-line px-[14px] text-[12px]" onClick={() => onOpenList(pill)}>
            {pill}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-4 px-2" style={{ height: phoneHeaderRows[2] }} role="tablist" aria-label="Browse by">
        {browseModes.map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={item === mode}
            className={`h-10 rounded-full text-[12px] ${item === mode ? "bg-surface text-text" : "text-muted"}`}
            onClick={() => onMode(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </header>
  )
}

function GroupBar({
  title,
  count,
  onBack,
  onPlay,
  onShuffle,
  onShare,
}: {
  title: string
  count: number
  onBack: () => void
  onPlay: () => void
  onShuffle: () => void
  onShare: () => void
}) {
  return (
    <div className="px-6 pb-2">
      <div className="flex items-center">
        <button type="button" className="grid h-11 w-11 place-items-center" aria-label="Back" onClick={onBack}>
          <Chevron />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-medium">{title}</p>
          <p className="text-meta text-muted">{songs(count)}</p>
        </div>
        <button type="button" className="grid h-11 w-11 shrink-0 place-items-center" aria-label="Share" onClick={onShare}>
          <ShareIcon />
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" className="h-12 flex-1 rounded-full bg-accent text-body font-medium text-on-accent" onClick={onPlay}>
          Play
        </button>
        <button type="button" className="h-12 flex-1 rounded-full border border-line text-body" onClick={onShuffle}>
          Shuffle with Uncle
        </button>
      </div>
    </div>
  )
}

function ChipRow({ layout, label, children }: { layout: "sheet" | "pane" | "phone"; label: string; children: ReactNode }) {
  return (
    <div className={`gap-2 px-6 pb-3 ${layout === "pane" ? "flex flex-wrap" : "flex overflow-x-auto"}`} aria-label={label}>
      {children}
    </div>
  )
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={`h-11 shrink-0 rounded-full px-4 text-body ${selected ? "bg-accent text-on-accent" : "border border-line"}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function ClearChip({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-line text-body" aria-label="Clear filter" onClick={onClick}>
      ×
    </button>
  )
}

function GenreGrid({ phone, groups, onOpen }: { phone: boolean; groups: LibraryGroup[]; onOpen: (group: LibraryGroup) => void }) {
  const ordered = genres.map((genre) => {
    const found = groups.find((group) => group.name === genre.name)
    return found ?? { name: genre.name, count: 0, cover: genre.cover, tracks: [] }
  })
  if (phone) {
    return (
      <div className="h-full overflow-y-auto">
        <PhoneTiles groups={ordered} onOpen={onOpen} />
      </div>
    )
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="grid grid-cols-2 content-start gap-3 px-6 pb-6 sm:grid-cols-3 lg:grid-cols-4">
        {ordered.filter((group) => group.count > 0).map((group) => (
          <button
            key={group.name}
            type="button"
            className="relative aspect-square overflow-hidden rounded-card text-left"
            style={{ background: group.cover ?? genreCover(group.name) }}
            onClick={() => onOpen(group)}
          >
            <span className="absolute bottom-3 left-3 right-3 text-[#FFF8EE]">
              <span className="block text-body font-medium">{group.name}</span>
              <span className="block text-meta">{songs(group.count)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function CollectionList({ phone, groups, onOpen }: { phone: boolean; groups: LibraryGroup[]; onOpen: (group: LibraryGroup) => void }) {
  if (phone) {
    return (
      <div className="h-full overflow-y-auto">
        <PhoneTiles groups={groups} onOpen={onOpen} />
      </div>
    )
  }
  return (
    <div className="h-full overflow-y-auto">
      {groups.map((group) => (
        <button key={group.name} type="button" className="flex h-14 w-full items-center justify-between px-6 text-left" onClick={() => onOpen(group)}>
          <span className="truncate text-body">{group.name}</span>
          <span className="text-meta text-muted">{songs(group.count)}</span>
        </button>
      ))}
    </div>
  )
}

function PhoneTiles({ groups, onOpen }: { groups: LibraryGroup[]; onOpen: (group: LibraryGroup) => void }) {
  return (
    <div
      className="grid grid-cols-2 min-[640px]:grid-cols-3"
      style={{ gap: phoneTileGap, paddingLeft: phoneTilePaddingX, paddingRight: phoneTilePaddingX }}
    >
      {groups.map((group) => (
        <button
          key={group.name}
          type="button"
          className="flex min-w-0 flex-col justify-end text-left"
          style={{
            aspectRatio: "2 / 1",
            minHeight: phoneTileMinHeight,
            borderRadius: 16,
            padding: 14,
            background: group.cover ?? genreCover(group.name),
          }}
          onClick={() => onOpen(group)}
        >
          <span className="line-clamp-2 text-[15px] font-medium leading-[1.15] text-[#FFF8EE]">{group.name}</span>
          <span className="text-[12px] leading-[1.2] text-[#FFF8EE]/75">{songs(group.count)}</span>
        </button>
      ))}
    </div>
  )
}

function ArtistList({ groups, tone, onOpen }: { groups: LibraryGroup[]; tone: string; onOpen: (group: LibraryGroup) => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const rows = artistRows(groups)
  const windowed = rows.length > 200
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(640)

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const measure = () => setHeight(node.clientHeight || 640)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const offsets = rowOffsets(rows)
  function jump(letter: string) {
    const index = rows.findIndex((row) => row.kind === "letter" && row.letter === letter)
    if (index < 0 || !scroller.current) return
    scroller.current.scrollTop = offsets[index]
  }

  const start = windowed ? findStart(offsets, scrollTop) : 0
  const end = windowed ? findEnd(offsets, start, height) : rows.length
  const currentLetter = letterAt(rows, offsets, scrollTop)

  return (
    <div className="relative h-full">
      <div ref={scroller} className="h-full overflow-y-auto pr-8" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
        {windowed && (
          <div className={`sticky top-0 z-10 px-6 py-1 text-meta text-muted ${tone}`}>{currentLetter}</div>
        )}
        <div className="relative" style={{ height: windowed ? offsets[rows.length] : undefined }}>
          {rows.slice(start, end).map((row, offset) => {
            const index = start + offset
            const style = windowed
              ? { position: "absolute" as const, top: offsets[index], height: rowHeight(row), left: 0, right: 0 }
              : { height: rowHeight(row) }
            if (row.kind === "letter") {
              return (
                <div key={row.letter} className={`z-10 flex items-end px-6 text-meta text-muted ${tone} ${windowed ? "" : "sticky top-0"}`} style={style}>
                  {row.letter}
                </div>
              )
            }
            return (
              <div key={row.group.name} style={style}>
                <button type="button" className="flex h-14 w-full items-center gap-3 px-6 text-left" onClick={() => onOpen(row.group)}>
                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-body font-medium text-[#FFF8EE]"
                    style={{ background: row.group.cover ?? genreCover("") }}
                  >
                    {artistInitial(row.group.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body">{row.group.name}</span>
                    <span className="block text-meta text-muted">{songs(row.group.count)}</span>
                  </span>
                </button>
              </div>
            )
          })}
        </div>
      </div>
      <div
        className="absolute bottom-2 right-0 top-2 flex w-8 touch-none flex-col items-center justify-between py-1"
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId)
          jump(letterFromRail(event))
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) jump(letterFromRail(event))
        }}
      >
        {alphabet.map((letter) => (
          <span key={letter} className="text-[10px] leading-none text-muted">
            {letter}
          </span>
        ))}
      </div>
    </div>
  )
}

function TrackList({
  tracks,
  art,
  currentId,
  playing,
  empty,
  onPlay,
  onMenu,
}: {
  tracks: TrackRecord[]
  art: Record<string, string>
  currentId: string | null
  playing: boolean
  empty: string
  onPlay: (list: TrackRecord[], index: number) => void
  onMenu: (menu: MenuState) => void
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [height, setHeight] = useState(480)
  const windowed = tracks.length > 200
  const hold = useRef<number | null>(null)
  const suppress = useRef(false)

  useEffect(() => {
    const node = scroller.current
    if (!node) return
    const measure = () => setHeight(node.clientHeight || 480)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  if (tracks.length === 0) return <p className="px-6 pt-4 text-body text-muted">{empty}</p>

  const start = windowed ? Math.max(0, Math.floor(scrollTop / 56) - 8) : 0
  const count = windowed ? Math.ceil(height / 56) + 16 : tracks.length
  const slice = tracks.slice(start, start + count)

  function openMenu(track: TrackRecord, x: number, y: number) {
    suppress.current = true
    onMenu({ track, x, y })
  }

  return (
    <div ref={scroller} className="h-full overflow-y-auto" onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}>
      <div className="relative" style={{ height: windowed ? tracks.length * 56 : undefined }}>
        {slice.map((track, offset) => {
          const index = start + offset
          const current = track.id === currentId
          const cover = art[track.id]
          return (
            <div
              key={track.id}
              style={windowed ? { position: "absolute", top: index * 56, height: 56, left: 0, right: 0 } : { height: 56 }}
            >
              <button
                type="button"
                className="flex h-14 w-full items-center gap-3 px-6 text-left"
                onClick={() => {
                  if (suppress.current) {
                    suppress.current = false
                    return
                  }
                  onPlay(tracks, index)
                }}
                onContextMenu={(event) => {
                  event.preventDefault()
                  openMenu(track, event.clientX, event.clientY)
                }}
                onPointerDown={(event) => {
                  if (event.pointerType === "mouse" && event.button !== 0) return
                  hold.current = window.setTimeout(() => openMenu(track, event.clientX, event.clientY), 480)
                }}
                onPointerUp={() => {
                  if (hold.current) window.clearTimeout(hold.current)
                }}
                onPointerLeave={() => {
                  if (hold.current) window.clearTimeout(hold.current)
                }}
              >
                <span className="h-10 w-10 shrink-0 overflow-hidden rounded-[10px]" style={{ background: genreCover(track.genre) }}>
                  {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className="min-w-0">
                  <span className={`flex items-center gap-2 text-body ${current ? "text-accent" : ""}`}>
                    <span className="truncate">{track.title}</span>
                    {current && <Equaliser active={playing} />}
                  </span>
                  <span className="block truncate text-meta text-muted">
                    {track.artist} · {track.decade}
                  </span>
                </span>
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TrackMenu({
  menu,
  onClose,
  onPlayNext,
  onAdd,
  onArtist,
}: {
  menu: MenuState
  onClose: () => void
  onPlayNext: () => void
  onAdd: () => void
  onArtist: () => void
}) {
  const left = Math.min(menu.x, window.innerWidth - 196)
  const top = Math.min(menu.y, window.innerHeight - 160)
  return (
    <>
      <button type="button" className="fixed inset-0 z-40 cursor-default" aria-label="Close menu" onClick={onClose} />
      <div className="fixed z-50 w-44 overflow-hidden rounded-[14px] bg-surface shadow-art" style={{ left, top }} role="menu">
        <MenuButton label="Play next" onClick={onPlayNext} />
        <MenuButton label="Add to queue" onClick={onAdd} />
        <MenuButton label="Go to artist" onClick={onArtist} />
      </div>
    </>
  )
}

function MenuButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" role="menuitem" className="block h-11 w-full px-4 text-left text-body" onClick={onClick}>
      {label}
    </button>
  )
}

function Equaliser({ active }: { active: boolean }) {
  return (
    <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((bar) => (
        <span
          key={bar}
          className="w-0.5 origin-bottom bg-accent"
          style={{
            height: 12,
            animation: active ? `unclemelo-eq 0.8s ${bar * 0.15}s ease-in-out infinite` : undefined,
            transform: active ? undefined : "scaleY(0.45)",
          }}
        />
      ))}
    </span>
  )
}

function letterFromRail(event: ReactPointerEvent<HTMLDivElement>) {
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = (event.clientY - rect.top) / rect.height
  const index = Math.min(alphabet.length - 1, Math.max(0, Math.floor(ratio * alphabet.length)))
  return alphabet[index]
}

type ArtistRow = { kind: "letter"; letter: string } | { kind: "artist"; group: LibraryGroup }

function artistRows(groups: LibraryGroup[]): ArtistRow[] {
  const buckets = new Map<string, LibraryGroup[]>()
  for (const group of groups) {
    const letter = artistLetter(group.name)
    const list = buckets.get(letter)
    if (list) list.push(group)
    else buckets.set(letter, [group])
  }
  const rows: ArtistRow[] = []
  for (const letter of alphabet) {
    const items = buckets.get(letter)
    if (!items?.length) continue
    rows.push({ kind: "letter", letter })
    for (const group of items) rows.push({ kind: "artist", group })
  }
  return rows
}

function rowHeight(row: ArtistRow) {
  return row.kind === "letter" ? 32 : 56
}

function rowOffsets(rows: ArtistRow[]) {
  const offsets = [0]
  for (const row of rows) offsets.push(offsets[offsets.length - 1] + rowHeight(row))
  return offsets
}

function findStart(offsets: number[], scrollTop: number) {
  let low = 0
  let high = offsets.length - 1
  while (low < high) {
    const mid = Math.floor((low + high) / 2)
    if (offsets[mid + 1] <= scrollTop) low = mid + 1
    else high = mid
  }
  return Math.max(0, low - 6)
}

function findEnd(offsets: number[], start: number, height: number) {
  const limit = offsets[start] + height + 56 * 8
  let end = start
  while (end < offsets.length - 1 && offsets[end] < limit) end += 1
  return end
}

function letterAt(rows: ArtistRow[], offsets: number[], scrollTop: number) {
  let letter = "#"
  for (let index = 0; index < rows.length; index += 1) {
    if (offsets[index] > scrollTop + 8) break
    const row = rows[index]
    if (row.kind === "letter") letter = row.letter
  }
  return letter
}

function applyFilter(tracks: TrackRecord[], kind: GroupPage["filterKind"], filter: string | null) {
  if (!filter || !kind) return tracks
  return tracks.filter((track) => (kind === "decade" ? track.decade === filter : track.genre === filter))
}

function songs(count: number) {
  return `${count} song${count === 1 ? "" : "s"}`
}

function Chevron() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14.5 6.5 8.5 12l6 5.5" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="6" />
      <path d="M16 16.5 20 20.5" />
    </svg>
  )
}

function SunMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 3.5v1.75M12 18.75V20.5M3.5 12h1.75M18.75 12H20.5M5.7 5.7l1.25 1.25M17.05 17.05l1.25 1.25M18.3 5.7l-1.25 1.25M6.95 17.05l-1.25 1.25" />
    </svg>
  )
}

function MoonMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.2 14.8A6.2 6.2 0 0 1 9.2 7.8 6.4 6.4 0 1 0 16.2 14.8z" />
    </svg>
  )
}

function PlayMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8.75 6.25v11.5L17.75 12 8.75 6.25z" />
    </svg>
  )
}

function PauseMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M9 6.5v11M15 6.5v11" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 4v9" />
      <path d="M8.5 7 12 3.75 15.5 7" />
      <path d="M6 11.5V19h12v-7.5" />
    </svg>
  )
}
