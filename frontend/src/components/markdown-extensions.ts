import { Image } from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableKit } from '@tiptap/extension-table'
import { Markdown } from '@tiptap/markdown'
import { StarterKit } from '@tiptap/starter-kit'

/** The editor's schema. Shared with the round-trip test, so the test covers what users get. */
export const markdownExtensions = [
  StarterKit.configure({ link: { openOnClick: false } }),
  TaskList,
  TaskItem.configure({ nested: true }),
  TableKit,
  Image,
  Markdown,
]
