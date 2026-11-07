// @vitest-environment jsdom
import { Editor } from '@tiptap/core'
import { expect, test } from 'vitest'
import { markdownExtensions } from './markdown-extensions'

// Typing markdown syntax converts as you type. Characters go through the editor's
// text input handling one by one, the same path as a keyboard, so the shortcuts are
// checked against the exact extensions the editor uses.

function typeInto(text: string): string {
  const editor = new Editor({ extensions: markdownExtensions })
  for (const char of text) {
    const { view } = editor
    const { from, to } = view.state.selection
    if (char === '\n') {
      editor.commands.enter()
      continue
    }
    const insert = () => view.state.tr.insertText(char, from, to)
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, char, insert),
    )
    if (!handled) view.dispatch(insert())
  }
  const markdown = editor.getMarkdown()
  editor.destroy()
  return markdown.trim()
}

test.each([
  ['## Cuts', '## Cuts'],
  ['- one\ntwo', '- one\n- two'],
  ['1. first\nsecond', '1. first\n2. second'],
  ['[ ] todo', '- [ ] todo'],
  ['[x] done', '- [x] done'],
  ['> quoted', '> quoted'],
  ['Use **galvanised** screws', 'Use **galvanised** screws'],
  ['an *italic* word', 'an *italic* word'],
  ['some `code` here', 'some `code` here'],
])('typing %j gives %j', (typed, markdown) => {
  expect(typeInto(typed)).toBe(markdown)
})
