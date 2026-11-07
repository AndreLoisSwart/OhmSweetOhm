// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, errorMessage, isConnectionError } from './fetcher'

const respond = (status: number, body: string) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(body, { status }))

afterEach(() => vi.restoreAllMocks())

describe('apiFetch', () => {
  it('returns parsed JSON', async () => {
    respond(200, '{"ok":true}')
    expect(await apiFetch('/api/x', {})).toEqual({ ok: true })
  })

  it('keeps an HTML error page as text instead of failing to parse it', async () => {
    respond(502, '<html>Bad gateway</html>')
    const error = (await apiFetch('/api/x', {}).catch((e) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.body).toBe('<html>Bad gateway</html>')
  })
})

describe('isConnectionError', () => {
  it('spots requests that never reached the app', () => {
    expect(isConnectionError(new TypeError('Failed to fetch'))).toBe(true)
    expect(isConnectionError(new ApiError(502, undefined))).toBe(true)
    expect(isConnectionError(new ApiError(504, undefined))).toBe(true)
  })

  it("doesn't count the app's own errors", () => {
    expect(isConnectionError(new ApiError(404, undefined))).toBe(false)
    expect(isConnectionError(new ApiError(500, undefined))).toBe(false)
    expect(isConnectionError(new Error('bug'))).toBe(false)
  })
})

describe('errorMessage', () => {
  it('explains each kind of failure', () => {
    expect(errorMessage(new TypeError('Failed to fetch'))).toBe("Can't reach Ohm Sweet Ohm")
    expect(errorMessage(new ApiError(409, { detail: 'Name taken' }))).toBe('Name taken')
    expect(errorMessage(new ApiError(422, { detail: [{ msg: 'Value error, Too long' }] }))).toBe(
      'Too long',
    )
    expect(errorMessage(new ApiError(500, 'oops'))).toBe('Something went wrong (500)')
  })
})
