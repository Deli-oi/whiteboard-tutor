import { describe, expect, it } from 'vitest'
import { isPrivateHost } from './fetchLink'

describe('isPrivateHost', () => {
	it('blocks plain private/reserved hostnames and dotted-quad IPs', () => {
		expect(isPrivateHost('localhost')).toBe(true)
		expect(isPrivateHost('foo.localhost')).toBe(true)
		expect(isPrivateHost('127.0.0.1')).toBe(true)
		expect(isPrivateHost('10.0.0.5')).toBe(true)
		expect(isPrivateHost('192.168.1.1')).toBe(true)
		expect(isPrivateHost('172.16.0.1')).toBe(true)
		expect(isPrivateHost('172.31.255.255')).toBe(true)
		expect(isPrivateHost('169.254.169.254')).toBe(true) // cloud metadata endpoint
		expect(isPrivateHost('0.0.0.0')).toBe(true)
	})

	it('blocks decimal and hex IP literals that resolve to the same private addresses', () => {
		expect(isPrivateHost('2130706433')).toBe(true) // decimal for 127.0.0.1
		expect(isPrivateHost('0x7f000001')).toBe(true) // hex for 127.0.0.1
		expect(isPrivateHost('0x7f.0.0.1')).toBe(true) // mixed hex/dotted
	})

	it('blocks IPv6 loopback, link-local, and unique-local ranges', () => {
		expect(isPrivateHost('::1')).toBe(true)
		expect(isPrivateHost('fe80::1')).toBe(true)
		expect(isPrivateHost('fc00::1')).toBe(true)
		expect(isPrivateHost('fd12:3456::1')).toBe(true)
	})

	it('allows real public hosts', () => {
		expect(isPrivateHost('github.com')).toBe(false)
		expect(isPrivateHost('8.8.8.8')).toBe(false)
		expect(isPrivateHost('example.com')).toBe(false)
	})
})
