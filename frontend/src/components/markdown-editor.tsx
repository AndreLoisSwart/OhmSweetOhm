import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Code,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Quote,
  Strikethrough,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Toggle } from '@/components/ui/toggle'
import { cn } from '@/lib/utils'
import { markdownExtensions } from './markdown-extensions'

type Tool = {
  label: string
  icon: LucideIcon
  isActive: (editor: Editor) => boolean
  run: (editor: Editor) => void
}

const setLink = (editor: Editor) => {
  const current = editor.getAttributes('link').href as string | undefined
  const href = window.prompt('Link address', current ?? 'https://')
  if (href === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (href.trim() === '' || href === 'https://') chain.unsetLink().run()
  else chain.setLink({ href: href.trim() }).run()
}

const TOOLS: Tool[] = [
  {
    label: 'Heading',
    icon: Heading2,
    isActive: (e) => e.isActive('heading', { level: 2 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Subheading',
    icon: Heading3,
    isActive: (e) => e.isActive('heading', { level: 3 }),
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Bold',
    icon: Bold,
    isActive: (e) => e.isActive('bold'),
    run: (e) => e.chain().focus().toggleBold().run(),
  },
  {
    label: 'Italic',
    icon: Italic,
    isActive: (e) => e.isActive('italic'),
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    label: 'Strikethrough',
    icon: Strikethrough,
    isActive: (e) => e.isActive('strike'),
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
  { label: 'Link', icon: Link2, isActive: (e) => e.isActive('link'), run: setLink },
  {
    label: 'Bullet list',
    icon: List,
    isActive: (e) => e.isActive('bulletList'),
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    label: 'Numbered list',
    icon: ListOrdered,
    isActive: (e) => e.isActive('orderedList'),
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    label: 'Checklist',
    icon: ListTodo,
    isActive: (e) => e.isActive('taskList'),
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    label: 'Quote',
    icon: Quote,
    isActive: (e) => e.isActive('blockquote'),
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    label: 'Code block',
    icon: Code,
    isActive: (e) => e.isActive('codeBlock'),
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
]

function Toolbar({ editor }: { editor: Editor }) {
  // Re-render only when the active formatting changes, not on every keystroke.
  const active = useEditorState({
    editor,
    selector: ({ editor }) => TOOLS.map((tool) => tool.isActive(editor)),
  })
  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="sticky top-14 z-[5] flex flex-wrap gap-0.5 rounded-t-lg border-b bg-background/95 p-1 backdrop-blur"
    >
      {TOOLS.map((tool, index) => (
        <Toggle
          key={tool.label}
          size="sm"
          pressed={active[index]}
          // Keep focus (and the cursor and pending formatting) in the editor, and the
          // keyboard open on phones.
          onMouseDown={(event) => event.preventDefault()}
          onPressedChange={() => tool.run(editor)}
          aria-label={tool.label}
          title={tool.label}
        >
          <tool.icon />
        </Toggle>
      ))}
    </div>
  )
}

type Props = {
  /** The starting content. Later changes are ignored: give it a new key to load another document. */
  value: string
  onChange: (markdown: string) => void
  onBlur?: () => void
  placeholder?: string
  'aria-label': string
  className?: string
}

/** Edits markdown visually and hands back markdown. See markdown-roundtrip.test.ts. */
export function MarkdownEditor({
  value,
  onChange,
  onBlur,
  placeholder,
  className,
  ...rest
}: Props) {
  const callbacks = useRef({ onChange, onBlur })
  useEffect(() => {
    callbacks.current = { onChange, onBlur }
  })

  const editor = useEditor({
    extensions: [...markdownExtensions, Placeholder.configure({ placeholder })],
    content: value,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        'aria-label': rest['aria-label'],
        class:
          'prose prose-neutral dark:prose-invert max-w-none min-h-40 px-3 py-2 text-sm focus:outline-none',
      },
    },
    onUpdate: ({ editor }) => callbacks.current.onChange(editor.getMarkdown()),
    onBlur: () => callbacks.current.onBlur?.(),
  })

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
        className,
      )}
    >
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}
