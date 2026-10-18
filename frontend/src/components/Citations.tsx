export function Citations({ ids, numbers, onSelect }: { ids: string[]; numbers: Map<string, number>; onSelect?: (id: string) => void }) {
  const shown = ids.map((id) => numbers.get(id)).filter((n): n is number => Boolean(n))
  if (!shown.length) return null
  return (
    <span className="citation" aria-label={`Sources ${shown.join(', ')}`}>
      {' '}
      {onSelect
        ? ids.filter((id) => numbers.has(id)).map((id) => (
          <button key={id} type="button" className="citation__button" aria-label={`View source ${numbers.get(id)}`} onClick={() => onSelect(id)}>[{numbers.get(id)}]</button>
        ))
        : shown.map((n) => `[${n}]`).join('')}
    </span>
  )
}
