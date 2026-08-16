export function splitText(text: string, max: number): string[] {
  if (max <= 0) return text === '' ? [] : [text]
  const chars = [...text]
  if (chars.length === 0) return []
  if (chars.length <= max) return [text]
  const parts: string[] = []
  let rest = chars
  while (rest.length > 0) {
    if (rest.length <= max) {
      parts.push(rest.join(''))
      break
    }
    const window = rest.slice(0, max)
    let cut = 0
    for (let i = window.length - 1; i >= 0; i -= 1) {
      if (window[i] === '\n') { cut = i + 1; break }
    }
    if (cut === 0) {
      for (let i = window.length - 1; i >= 0; i -= 1) {
        if ('。！？…；'.includes(window[i] ?? '')) { cut = i + 1; break }
      }
    }
    if (cut === 0) cut = max
    parts.push(rest.slice(0, cut).join(''))
    rest = rest.slice(cut)
  }
  if (parts.length <= 1) return parts
  return parts.map((part, index) => `（${index + 1}/${parts.length}）${part}`)
}
