import { cn } from 'cn'
import { Cable, MousePointer2, Plug, Scissors } from 'lucide-react'
import type { ConnectorType } from '@/api/generated/model'
import { NativeSelect } from '@/components/native-select'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CONNECTOR_TYPES, type ConnectorDraft, type Tool } from './board/tools'

const TOOLS: { tool: Tool; label: string; key: string; Icon: typeof Scissors }[] = [
  { tool: 'select', label: 'Select and move', key: 'V', Icon: MousePointer2 },
  { tool: 'cut', label: 'Cut the copper', key: 'C', Icon: Scissors },
  { tool: 'jumper', label: 'Jumper', key: 'J', Icon: Cable },
  { tool: 'connector', label: 'Connector', key: 'K', Icon: Plug },
]

/** Over the board: the tools, and what the current one needs. */
export function BoardToolbar({
  tool,
  onTool,
  canCut,
  flipped,
  jumperStarted,
  connector,
  onConnector,
}: {
  tool: Tool
  onTool: (tool: Tool) => void
  canCut: boolean
  flipped: boolean
  jumperStarted: boolean
  connector: ConnectorDraft
  onConnector: (draft: ConnectorDraft) => void
}) {
  const hint =
    tool === 'cut'
      ? 'Click a hole to cut the strip there, or the gap between two holes to cut between them. Click a cut to remove it.'
      : tool === 'jumper'
        ? jumperStarted
          ? 'Now click the other end. Esc cancels.'
          : `Click one end, then the other. It goes on the ${flipped ? 'copper side (a bottom link)' : 'component side'}: turn the board over for the other.`
        : tool === 'connector'
          ? connector.pins.some(Boolean)
            ? `Click where pin 1 goes: ${connector.pins.filter(Boolean).join(', ')}.`
            : 'Click where pin 1 goes. Assign its pins in the Inspector.'
          : null
  return (
    <div className="pointer-events-none absolute inset-x-2 top-2 z-10 flex flex-col items-center gap-1.5">
      <div
        className="pointer-events-auto flex items-center gap-0.5 rounded-lg border bg-card p-0.5 shadow-sm"
        role="toolbar"
        aria-label="Board tools"
      >
        {TOOLS.map(({ tool: t, label, key, Icon }) => {
          const disabled = t === 'cut' && !canCut
          return (
            <Button
              key={t}
              variant={tool === t ? 'secondary' : 'ghost'}
              size="sm"
              aria-pressed={tool === t}
              disabled={disabled}
              title={disabled ? 'A breadboard pattern has no strips to cut' : `${label} (${key})`}
              onClick={() => onTool(t)}
            >
              <Icon />
              <span className="hidden md:inline">{label.split(' ')[0]}</span>
            </Button>
          )
        })}
        {tool === 'connector' && (
          <div className="ml-1 flex items-center gap-1 border-l pl-1.5">
            <NativeSelect
              value={connector.type}
              aria-label="Connector type"
              className="h-7 text-xs"
              onChange={(e) => onConnector({ ...connector, type: e.target.value as ConnectorType })}
            >
              {CONNECTOR_TYPES.map((c) => (
                <option key={c.type} value={c.type}>
                  {c.label}
                </option>
              ))}
            </NativeSelect>
            <Input
              type="number"
              min={1}
              max={40}
              value={connector.pinCount}
              aria-label="Pins"
              className="h-7 w-14 text-xs"
              onChange={(e) =>
                onConnector({
                  ...connector,
                  pinCount: Math.max(1, Math.min(40, Number(e.target.value) || 1)),
                })
              }
            />
            <span className="text-xs text-muted-foreground">pins</span>
          </div>
        )}
      </div>
      {hint && (
        <p
          className={cn(
            'pointer-events-none max-w-md rounded-md bg-card/90 px-2 py-1 text-center text-xs text-muted-foreground shadow-sm',
          )}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
