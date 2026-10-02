import { defineConfig } from 'vitest/config'

// Deliberately standalone, not an extension of vite.config.ts - that config
// wires in @cloudflare/vite-plugin (a Workers runtime), which the pure
// TS functions under test here (graph layout, algorithm traces) have no need
// for and which isn't worth the risk of interfering with the test runner.
export default defineConfig({
	test: {
		environment: 'node',
		include: ['**/*.test.ts'],
	},
})
