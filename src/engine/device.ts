export function usesSimpleEngine(userAgent: string, maxTouchPoints: number) {
  if (/iPhone|iPad/.test(userAgent)) return true
  return /Mac/.test(userAgent) && maxTouchPoints > 1
}

export function isIosPlayback() {
  if (typeof navigator === "undefined") return false
  return usesSimpleEngine(navigator.userAgent ?? "", navigator.maxTouchPoints ?? 0)
}
