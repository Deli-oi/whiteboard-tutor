import { describe, expect, it } from 'vitest'
import { isQuotaExceededError, isRetryableApiError, toErrorWithMessage } from './modelErrors'

describe('toErrorWithMessage', () => {
	it('passes an existing Error through unchanged', () => {
		const err = new Error('boom')
		expect(toErrorWithMessage(err)).toBe(err)
	})

	it('wraps a string into an Error', () => {
		const err = toErrorWithMessage('something broke')
		expect(err).toBeInstanceOf(Error)
		expect(err.message).toBe('something broke')
	})

	it('falls back to a generic message for anything else', () => {
		expect(toErrorWithMessage(undefined).message).toBe('The model request failed. Try again, or switch models.')
		expect(toErrorWithMessage({ weird: 'object' }).message).toBe(
			'The model request failed. Try again, or switch models.'
		)
	})
})

describe('isQuotaExceededError', () => {
	it('recognizes Gemini free-tier daily quota language', () => {
		expect(isQuotaExceededError(new Error('RESOURCE_EXHAUSTED: quota exceeded'))).toBe(true)
		expect(isQuotaExceededError(new Error('You have exceeded your current quota'))).toBe(true)
	})

	it('is case-insensitive', () => {
		expect(isQuotaExceededError(new Error('QUOTA exceeded'))).toBe(true)
	})

	it('does not flag an unrelated error', () => {
		expect(isQuotaExceededError(new Error('network timeout'))).toBe(false)
	})

	it('handles non-Error values via String() coercion', () => {
		expect(isQuotaExceededError('quota exceeded')).toBe(true)
		expect(isQuotaExceededError(null)).toBe(false)
	})
})

describe('isRetryableApiError', () => {
	it('is never retryable when it is actually a quota error, even with a 429', () => {
		const err = Object.assign(new Error('exceeded your current quota'), { statusCode: 429 })
		expect(isRetryableApiError(err)).toBe(false)
	})

	it('treats a transient 429 (no quota language) as retryable', () => {
		const err = Object.assign(new Error('rate limited'), { statusCode: 429 })
		expect(isRetryableApiError(err)).toBe(true)
	})

	it('treats 500/502/503/504 as retryable', () => {
		for (const statusCode of [500, 502, 503, 504]) {
			expect(isRetryableApiError(Object.assign(new Error('server error'), { statusCode }))).toBe(true)
		}
	})

	it('treats a 400 as not retryable', () => {
		expect(isRetryableApiError(Object.assign(new Error('bad request'), { statusCode: 400 }))).toBe(false)
	})

	it('falls back to message sniffing when there is no statusCode', () => {
		expect(isRetryableApiError(new Error('The model is currently overloaded, try again later'))).toBe(true)
		expect(isRetryableApiError(new Error('invalid model id'))).toBe(false)
	})
})
