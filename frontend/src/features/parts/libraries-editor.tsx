import { Plus, X } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import type { PartLibrary, Platform } from '@/api/generated/model'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PLATFORM_LABELS, PLATFORMS } from './labels'

const platformsText = (platforms?: Platform[]) =>
  platforms?.length ? platforms.map((p) => PLATFORM_LABELS[p]).join(', ') : 'All'

/**
 * The libraries firmware for a part needs, as PlatformIO specs (`owner/Name@^1.2`), each
 * for every platform or just one (the SG90 uses Servo on AVR, ESP32Servo on ESP32).
 * Saved whole on every change.
 */
export function LibrariesEditor({
  value,
  onChange,
}: {
  value: PartLibrary[]
  onChange: (libraries: PartLibrary[]) => void
}) {
  const [spec, setSpec] = useState('')
  const [platform, setPlatform] = useState<Platform | ''>('')
  const trimmed = spec.trim()
  const invalid = /[,;\n]/.test(trimmed)

  const add = (e: FormEvent) => {
    e.preventDefault()
    if (!trimmed || invalid) return
    onChange([...value, { spec: trimmed, platforms: platform ? [platform] : [] }])
    setSpec('')
    setPlatform('')
  }

  return (
    <div className="grid gap-2">
      {value.length > 0 && (
        <ul className="grid gap-1">
          {value.map((library) => (
            <li key={library.spec} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-mono text-xs" title={library.spec}>
                {library.spec}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {platformsText(library.platforms)}
              </span>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove ${library.spec}`}
                onClick={() => onChange(value.filter((l) => l !== library))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-center gap-2">
        <Input
          value={spec}
          onChange={(e) => setSpec(e.target.value)}
          placeholder="e.g. adafruit/Adafruit BME280 Library@^2.2"
          aria-label="Library"
          aria-invalid={invalid || undefined}
          title="A PlatformIO library: owner/Name@^version"
          className="min-w-0 flex-1 font-mono text-xs sm:min-w-56"
        />
        <NativeSelect
          value={platform}
          onChange={(e) => setPlatform(e.target.value as Platform | '')}
          aria-label="For which boards"
        >
          <option value="">All boards</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]} only
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline" size="sm" disabled={!trimmed || invalid}>
          <Plus />
          Add
        </Button>
      </form>
      {invalid && <p className="text-xs text-destructive">One library per line, no commas.</p>}
    </div>
  )
}
