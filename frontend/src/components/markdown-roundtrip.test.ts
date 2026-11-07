// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { describe, expect, test } from 'vitest'
import { markdownExtensions } from './markdown-extensions'

// Notes are stored as raw markdown, so the editor must give back what it was given.
// This is the gate for the editor choice: if something users write stops surviving
// a load and save, these tests fail.

function roundTrip(markdown: string): string {
  const editor = new Editor({
    extensions: markdownExtensions,
    content: markdown,
    contentType: 'markdown',
  })
  const result = editor.getMarkdown()
  editor.destroy()
  return result
}

/** Comes back exactly as written (ignoring leading and trailing blank lines). */
const preserved: Record<string, string> = {
  headings: '# One\n\n## Two\n\n### Three',
  emphasis: 'Some **bold**, *italic*, ~~struck~~ and `code`.',
  link: 'See [the manual](https://example.com/manual.pdf).',
  image: '![saw](https://example.com/saw.png)',
  bullets: '- one\n- two\n  - nested\n- three',
  ordered: '1. first\n2. second\n3. third',
  'ordered from 3': '3. three\n4. four',
  'ordered with bullets': '1. one\n   - sub\n2. two',
  tasks: '- [ ] todo\n- [x] done\n  - [ ] nested todo',
  'task with formatting': '- [ ] buy **glue** from [shop](https://s.example)',
  quote: '> quoted\n> text',
  'code block': '```python\nprint("hi")\n```',
  'code block with blank lines': '```\na\n\nb\n```',
  rule: 'above\n\n---\n\nbelow',
  'hard break': 'line one  \nline two',
  paragraphs: 'First paragraph.\n\nSecond paragraph.',
  table: '| Part | Qty |\n| ---- | --- |\n| Bolt | 4   |\n| Nut  | 4   |',
  mixed: '# Plan\n\nBuy timber:\n\n- [ ] 2x4 x6\n- [x] screws\n\nSee **notes** below.',
  empty: '',
}

/** Same content, tidied into one consistent style. */
const normalised: Record<string, [input: string, output: string]> = {
  'star bullets': ['* one\n* two', '- one\n- two'],
  'underscore emphasis': ['Some __bold__ and _italic_.', 'Some **bold** and *italic*.'],
  'literal symbols are escaped': ['5 * 3 = 15, 2_000', '5 \\* 3 = 15, 2\\_000'],
  'bare URLs become links': [
    'Visit https://example.com',
    'Visit [https://example.com](https://example.com)',
  ],
  'tables are aligned': [
    '| a | b |\n|---|---|\n| 1 | 2 |',
    '| a   | b   |\n| --- | --- |\n| 1   | 2   |',
  ],
  'inline html becomes markdown': ['Text with <b>html</b>', 'Text with **html**'],
}

describe('markdown round trip', () => {
  test.each(Object.entries(preserved))('preserves %s', (_, markdown) => {
    expect(roundTrip(markdown).trim()).toBe(markdown)
  })

  test.each(Object.entries(normalised))('normalises %s', (_, [input, output]) => {
    expect(roundTrip(input).trim()).toBe(output)
  })

  // Saving an unchanged note must not keep rewriting it.
  test.each([...Object.values(preserved), ...Object.values(normalised).map(([input]) => input)])(
    'is stable on a second save: %j',
    (markdown) => {
      const once = roundTrip(markdown)
      expect(roundTrip(once)).toBe(once)
    },
  )
})
