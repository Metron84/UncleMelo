import { describe, expect, it } from "vitest"
import type { TrackRecord } from "../library/types.ts"
import { pickNext, type PlayHistory } from "./pick.ts"

function track(partial: Pick<TrackRecord, "id" | "artist" | "genre"> & Partial<TrackRecord>): TrackRecord {
  return {
    title: partial.title ?? partial.id,
    album: "",
    year: 1990,
    duration: 200,
    decade: partial.decade ?? "1990s",
    collections: [],
    path: `${partial.artist}/${partial.id}.mp3`,
    ...partial,
  }
}

function play(partial: Partial<PlayHistory> & Pick<PlayHistory, "trackId" | "startedAt">): PlayHistory {
  return {
    playedSeconds: 180,
    completed: true,
    skipped: false,
    hour: 21,
    mode: "Late Night",
    ...partial,
  }
}

function mulberry32(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

const now = Date.parse("2026-11-17T22:00:00")

describe("pickNext", () => {
  it("never repeats the current primary artist when another artist exists", () => {
    const library = [
      track({ id: "bob", artist: "Bob Dylan", genre: "Folk" }),
      track({ id: "bob-live", artist: "Bob Dylan feat. The Band", genre: "Folk" }),
      track({ id: "joni", artist: "Joni Mitchell", genre: "Folk" }),
      track({ id: "nick", artist: "Nick Drake", genre: "Singer-Songwriter" }),
    ]
    for (let seed = 1; seed <= 25; seed += 1) {
      const choice = pickNext(library[0], library, [], "Late Night", now, mulberry32(seed))
      expect(choice).not.toBeNull()
      expect(choice?.track.artist.toLocaleLowerCase().startsWith("bob dylan")).toBe(false)
    }
  })

  it("excludes tracks played in the last 3 hours or the last 60 plays", () => {
    const current = track({ id: "now", artist: "Vashti Bunyan", genre: "Folk" })
    const recentHour = track({ id: "hour", artist: "Nick Drake", genre: "Folk" })
    const recentSixty = track({ id: "sixty", artist: "Karen Dalton", genre: "Folk" })
    const open = track({ id: "open", artist: "Jackson C. Frank", genre: "Folk" })
    const history = [
      play({ trackId: "hour", startedAt: now - 60 * 60 * 1000 }),
      ...Array.from({ length: 60 }, (_, index) =>
        play({ trackId: "sixty", startedAt: now - (40 + index) * 24 * 60 * 60 * 1000 }),
      ),
    ]
    const choice = pickNext(current, [current, recentHour, recentSixty, open], history, "Late Night", now, () => 0)
    expect(choice?.track.id).toBe("open")
  })

  it("keeps Late Night away from the avoid list when enough other songs exist", () => {
    const current = track({ id: "now", artist: "Nils Frahm", genre: "Soundtrack & Score" })
    const folk = Array.from({ length: 30 }, (_, index) =>
      track({ id: `folk-${index}`, artist: `Folk Artist ${index}`, genre: "Folk", title: `Folk ${index}` }),
    )
    const hipHop = Array.from({ length: 8 }, (_, index) =>
      track({ id: `hop-${index}`, artist: `Hop Artist ${index}`, genre: "Hip-Hop", title: `Hop ${index}` }),
    )
    for (let seed = 1; seed <= 20; seed += 1) {
      const choice = pickNext(current, [...folk, ...hipHop], [], "Late Night", now, mulberry32(seed))
      expect(choice?.track.genre).not.toBe("Hip-Hop")
      expect(choice?.track.genre).not.toBe("Electronic & Dance")
    }
  })

  it("returns the same track for the same seeded random", () => {
    const current = track({ id: "now", artist: "Nils Frahm", genre: "Soundtrack & Score" })
    const library = [
      current,
      ...Array.from({ length: 12 }, (_, index) =>
        track({
          id: `song-${index}`,
          artist: `Artist ${index}`,
          genre: index % 2 === 0 ? "Folk" : "Singer-Songwriter",
          decade: index % 3 === 0 ? "1970s" : "1990s",
        }),
      ),
    ]
    const first = pickNext(current, library, [], "Late Night", now, mulberry32(42))
    const second = pickNext(current, library, [], "Late Night", now, mulberry32(42))
    const other = pickNext(current, library, [], "Late Night", now, mulberry32(99))
    expect(first?.track.id).toBe(second?.track.id)
    expect(other).not.toBeNull()
    expect(pickNext(current, library, [], "Late Night", now, mulberry32(99))?.track.id).toBe(other?.track.id)
  })

  it("names a song you always finish when that is the strongest pull", () => {
    const current = track({ id: "now", artist: "Nils Frahm", genre: "Soundtrack & Score" })
    const loved = track({ id: "loved", artist: "Joan Baez", genre: "Folk" })
    const plain = track({ id: "plain", artist: "Sandy Denny", genre: "Folk" })
    const fillers = Array.from({ length: 60 }, (_, index) =>
      play({ trackId: `filler-${index}`, startedAt: now - (2 + index) * 24 * 60 * 60 * 1000 }),
    )
    const history = [
      ...fillers,
      play({ trackId: "loved", startedAt: now - 80 * 24 * 60 * 60 * 1000, completed: true, skipped: false }),
      play({ trackId: "loved", startedAt: now - 90 * 24 * 60 * 60 * 1000, completed: true, skipped: false }),
    ]
    const choice = pickNext(current, [current, loved, plain], history, "Focus", now, () => 0)
    expect(choice?.track.id).toBe("loved")
    expect(choice?.reason).toBe("One you always finish")
  })
})
