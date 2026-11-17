export const phoneHeaderRows = [48, 40, 40] as const
export const phoneMiniPlayer = 64
export const phoneTileGap = 10
export const phoneTilePaddingX = 24
export const phoneTileMinHeight = 76
export const phoneGenreCount = 12

export function phoneGenreFit(width: number, height: number, safeTop = 0, safeBottom = 0) {
  const header = phoneHeaderRows.reduce((sum, row) => sum + row, 0) + safeTop
  const mini = phoneMiniPlayer + safeBottom
  const inner = width - phoneTilePaddingX * 2
  const tileWidth = (inner - phoneTileGap) / 2
  const tileHeight = Math.max(phoneTileMinHeight, tileWidth / 2)
  const grid = phoneGenreCount / 2 * tileHeight + (phoneGenreCount / 2 - 1) * phoneTileGap
  const used = header + grid + mini
  return { header, tileWidth, tileHeight, grid, mini, used, fits: used <= height }
}
