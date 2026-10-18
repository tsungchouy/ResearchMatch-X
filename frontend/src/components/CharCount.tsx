/** Shows a character count only once the text gets close to its limit. */
export function CharCount({ length, max }: { length: number; max: number }) {
  if (length < max * 0.8) return null
  return (
    <p className={`field__count${length >= max ? ' is-limit' : ''}`}>
      {length} / {max}
    </p>
  )
}
