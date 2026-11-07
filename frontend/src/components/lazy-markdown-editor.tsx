import { lazy, Suspense, type ComponentProps } from 'react'

// The editor (TipTap, tables, the markdown parser) is most of the bundle, so it loads
// only on pages that show it.
const MarkdownEditor = lazy(() =>
  import('./markdown-editor').then((module) => ({ default: module.MarkdownEditor })),
)

export function LazyMarkdownEditor(props: ComponentProps<typeof MarkdownEditor>) {
  return (
    <Suspense fallback={<div className="min-h-52 rounded-lg border" aria-busy="true" />}>
      <MarkdownEditor {...props} />
    </Suspense>
  )
}
