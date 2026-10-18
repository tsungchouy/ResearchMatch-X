export function Citations({ ids, numbers }: { ids: string[]; numbers: Map<string, number> }) {
  const shown = ids.map((id) => numbers.get(id)).filter((n): n is number => Boolean(n))
  if (!shown.length) return null
  return (
    <span className="citation" aria-label={`Sources ${shown.join(', ')}`}>
      {' '}
      {shown.map((n) => `[${n}]`).join('')}
    </span>
  )
}
