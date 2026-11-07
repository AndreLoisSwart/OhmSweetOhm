// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, apiFetch, errorMessage, isConnectionError, validationMessage } from './fetcher'

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

describe('validationMessage', () => {
  it('says what a pattern means instead of showing it', () => {
    expect(
      validationMessage({
        type: 'string_pattern_mismatch',
        loc: ['body', 'pins', 2, 'name'],
        msg: "String should match pattern '^[^\\s.]+$'",
      }),
    ).toBe("Pin names can't have spaces or dots (pins are named ref.PIN)")
  })

  it('names the field for other problems', () => {
    expect(
      validationMessage({
        type: 'less_than_equal',
        loc: ['body', 'supply_max_v'],
        msg: 'Input should be less than or equal to 60',
      }),
    ).toBe('Supply max V: input should be less than or equal to 60')
  })

  it('keeps the rules’ own sentences', () => {
    expect(
      validationMessage({
        type: 'value_error',
        loc: ['body', 'pins'],
        msg: 'Value error, Two pins are called "GND". Number repeats, e.g. GND and GND2',
      }),
    ).toBe('Two pins are called "GND". Number repeats, e.g. GND and GND2')
  })
})
