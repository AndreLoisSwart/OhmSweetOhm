import { Check, Copy, Eye, EyeOff, RefreshCw } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { useGetMcpToken, useRegenerateMcpToken } from '@/api/generated/mcp/mcp'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { copyText } from '@/lib/copy-text'

const MASK = '•'.repeat(12)

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } else {
      toast.error("Couldn't copy. Select the text and copy it instead.")
    }
  }
  return (
    <Button variant="outline" size="sm" onClick={copy} aria-label={label}>
      {copied ? <Check /> : <Copy />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

/** A command or config to paste, shown with the token hidden unless revealed. */
function Snippet({
  title,
  text,
  token,
  shown,
}: {
  title: string
  text: string
  token: string
  shown: boolean
}) {
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <CopyButton text={text} label={`Copy ${title}`} />
      </div>
      <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
        {shown ? text : text.replaceAll(token, MASK)}
      </pre>
    </div>
  )
}

/** Connecting Claude Code and Claude Desktop over the direct port (docs/mcp.md). */
export function McpSetting() {
  const { data } = useGetMcpToken()
  const regenerate = useRegenerateMcpToken()
  const [shown, setShown] = useState(false)
  // The address HA was opened on is usually right; the port is the add-on's host port.
  const [host, setHost] = useState(window.location.hostname)
  const [port, setPort] = useState('8097')

  const token = data?.token ?? ''
  const url = `http://${host.trim() || 'homeassistant.local'}:${port.trim() || '8097'}/mcp`
  const claudeCode = `claude mcp add --transport http ohm-sweet-ohm ${url} --header "Authorization: Bearer ${token}"`
  const claudeDesktop = JSON.stringify(
    {
      mcpServers: {
        'ohm-sweet-ohm': {
          command: 'npx',
          // The header comes from env, as some systems split arguments on spaces.
          args: [
            '-y',
            'mcp-remote',
            url,
            '--allow-http',
            '--header',
            'Authorization:${AUTH_HEADER}',
          ],
          env: { AUTH_HEADER: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  )

  return (
    <section className="grid gap-4">
      <div>
        <h2 className="text-lg font-semibold">Claude (MCP)</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Lets Claude Code and Claude Desktop on your network or VPN read your parts and build
          designs. Every change Claude makes to a design is saved in its History first, so it can be
          undone. First give port 8097 a host port in the add-on's Network settings in Home
          Assistant. That port only serves Claude, and only with this token.
        </p>
      </div>

      <div className="grid gap-2">
        <Label>Token</Label>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-3 py-2 text-xs">
            {token ? (shown ? token : MASK) : 'Loading…'}
          </code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShown(!shown)}
            aria-label={shown ? 'Hide token' : 'Show token'}
          >
            {shown ? <EyeOff /> : <Eye />}
            {shown ? 'Hide' : 'Show'}
          </Button>
          {token && <CopyButton text={token} label="Copy token" />}
          <ConfirmDialog
            title="Make a new token?"
            description="Claude Code and Claude Desktop stop working until you update them with the new token."
            confirmLabel="Make new token"
            onConfirm={() => regenerate.mutate()}
            trigger={
              <Button variant="outline" size="sm">
                <RefreshCw />
                New token
              </Button>
            }
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
        <div className="grid gap-2">
          <Label htmlFor="mcp-host">Home Assistant address</Label>
          <Input id="mcp-host" value={host} onChange={(e) => setHost(e.target.value)} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="mcp-port">Host port</Label>
          <Input
            id="mcp-port"
            value={port}
            onChange={(e) => setPort(e.target.value)}
            inputMode="numeric"
          />
        </div>
      </div>

      {token && (
        <>
          <Snippet
            title="Claude Code: run in a terminal"
            text={claudeCode}
            token={token}
            shown={shown}
          />
          <Snippet
            title="Claude Desktop: add to claude_desktop_config.json (needs Node.js)"
            text={claudeDesktop}
            token={token}
            shown={shown}
          />
        </>
      )}
    </section>
  )
}
