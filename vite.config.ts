import { tmpdir } from 'os'
import { join } from 'path'
import { fileURLToPath } from 'url'
import { cloudflare } from '@cloudflare/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { zodLocalePlugin } from './scripts/vite-zod-locale-plugin.js'

// https://vitejs.dev/config/
export default defineConfig(() => {
	return {
		// Default cacheDir (node_modules/.vite) lives inside this project's
		// Dropbox-synced folder. Dropbox grabs a file lock mid-rename while the
		// dep optimizer atomically swaps its temp dir into place, which throws
		// EBUSY and can crash the dev server on a cold start right after adding
		// a new dependency. Keeping the cache outside Dropbox avoids the race.
		cacheDir: join(tmpdir(), 'vite-cache-whiteboard-tutor'),
		plugins: [
			zodLocalePlugin(fileURLToPath(new URL('./scripts/zod-locales-shim.js', import.meta.url))),
			cloudflare(),
			react(),
		],
	}
})
