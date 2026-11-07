// Parsing and formatting for the part page's typed fields.

type Parsed<T> = { value: T } | { error: string }

export const formatAddresses = (addresses: number[]) =>
  addresses.map((a) => `0x${a.toString(16).padStart(2, '0')}`).join(', ')

/** "0x76, 0x77" or decimal; 7-bit addresses, the first is the default. */
export function parseAddresses(text: string): Parsed<number[]> {
  const values: number[] = []
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const value = /^0x[0-9a-f]+$/i.test(token)
      ? parseInt(token, 16)
      : /^\d+$/.test(token)
        ? Number(token)
        : NaN
    if (!(value >= 0 && value <= 0x7f)) return { error: `"${token}" isn't a 7-bit I2C address` }
    if (!values.includes(value)) values.push(value)
  }
  return { value: values }
}

export const formatVolts = (volts: number | null) => (volts === null ? '' : String(volts))

export function parseVolts(text: string): Parsed<number | null> {
  const trimmed = text.trim().replace(/\s*v$/i, '').replace(',', '.')
  if (!trimmed) return { value: null }
  const value = Number(trimmed)
  if (!(value > 0 && value <= 60)) return { error: 'Voltages are above 0 and at most 60' }
  return { value }
}

export function parseOptionalId(text: string): Parsed<number | null> {
  const trimmed = text.trim().replace(/^#/, '')
  if (!trimmed) return { value: null }
  if (!/^\d+$/.test(trimmed)) return { error: 'A Shelf-help item id is a whole number' }
  return { value: Number(trimmed) }
}

export function parseUrl(text: string): Parsed<string> {
  const trimmed = text.trim()
  if (trimmed && !/^https?:\/\//i.test(trimmed))
    return { error: 'Links start with http:// or https://' }
  return { value: trimmed }
}
