import { useState } from 'react'
import { CommitInput } from '@/components/commit-input'
import { NativeSelect } from '@/components/native-select'

const PITCHES = [
  { mm: 2.54, label: '2.54 mm (0.1 in, standard)' },
  { mm: 2, label: '2.0 mm' },
  { mm: 1.27, label: '1.27 mm (0.05 in)' },
]

/** A board's hole spacing: one of the usual ones, or another typed in mm (1–10). */
export function PitchPicker({
  value,
  onChange,
}: {
  value: number
  onChange: (pitch: number) => void
}) {
  const usual = PITCHES.some((p) => p.mm === value)
  const [other, setOther] = useState(!usual)
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <NativeSelect
        value={other ? 'other' : String(value)}
        aria-label="Hole spacing"
        className="h-7 text-xs"
        onChange={(e) => {
          if (e.target.value === 'other') return setOther(true)
          setOther(false)
          onChange(Number(e.target.value))
        }}
      >
        {PITCHES.map((p) => (
          <option key={p.mm} value={String(p.mm)}>
            {p.label}
          </option>
        ))}
        <option value="other">Other…</option>
      </NativeSelect>
      {other && (
        <CommitInput<number>
          value={value}
          format={(mm) => String(mm)}
          parse={(text) => {
            const mm = Number(text.replace(',', '.'))
            return mm >= 1 && mm <= 10
              ? { value: Math.round(mm * 100) / 100 }
              : { error: 'Hole spacing is 1–10 mm' }
          }}
          onSave={onChange}
          inputMode="decimal"
          aria-label="Hole spacing in mm"
          className="h-7 w-20 font-mono text-xs"
        />
      )}
      {other && <span className="text-xs text-muted-foreground">mm</span>}
    </span>
  )
}
