import { defineConfig } from 'orval'

// Generates TanStack Query hooks from the backend's OpenAPI spec.
// Run `npm run gen:api` after any API change.
export default defineConfig({
  ohmSweetOhm: {
    input: './openapi.json',
    output: {
      mode: 'tags-split',
      target: './src/api/generated',
      schemas: './src/api/generated/model',
      client: 'react-query',
      httpClient: 'fetch',
      clean: true,
      prettier: true,
      override: {
        mutator: { path: './src/api/fetcher.ts', name: 'apiFetch' },
        fetch: { includeHttpResponseReturnType: false },
      },
    },
  },
})
