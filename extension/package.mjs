import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'fs'
import { join, relative, extname } from 'path'
import { crc32, deflateRawSync } from 'zlib'

/**
 * Builds the Chrome Web Store upload: dist/study-buddy-<version>.zip with only
 * the files Chrome loads - manifest, built .js bundles, .html pages, PNG
 * icons, and vendor/ (libraries + their license notices). Sources, tests,
 * and build tooling stay out. Written with Node's own zlib so it needs no
 * extra dependency and behaves the same on every OS.
 */
const root = 'extension'
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))

function shipped(path) {
	const [top, ...rest] = path.split('/')
	if (rest.length === 0) return top === 'manifest.json' || ['.js', '.html'].includes(extname(top))
	if (top === 'icons') return extname(path) === '.png'
	return top === 'vendor'
}

function listFiles(dir) {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name)
		return statSync(full).isDirectory() ? listFiles(full) : [relative(root, full).split('\\').join('/')]
	})
}

const files = listFiles(root).filter(shipped).sort()

const required = [
	'manifest.json',
	manifest.background.service_worker,
	'content-script.js',
	manifest.options_page,
	...manifest.sandbox.pages,
	...Object.values(manifest.icons),
	'vendor/THIRD_PARTY_NOTICES.txt',
]
const missing = required.filter((file) => !files.includes(file))
if (missing.length) {
	console.error(`Missing from the package: ${missing.join(', ')} - run npm run build:extension first.`)
	process.exit(1)
}

// Fixed timestamp (1980-01-01) so the same sources always produce the same zip.
const DOS_TIME = 0
const DOS_DATE = (0 << 9) | (1 << 5) | 1
const UTF8_FLAG = 0x0800

const localParts = []
const centralParts = []
let offset = 0
for (const file of files) {
	const data = readFileSync(join(root, file))
	const compressed = deflateRawSync(data, { level: 9 })
	const name = Buffer.from(file, 'utf8')
	const crc = crc32(data)

	const local = Buffer.alloc(30)
	local.writeUInt32LE(0x04034b50, 0)
	local.writeUInt16LE(20, 4)
	local.writeUInt16LE(UTF8_FLAG, 6)
	local.writeUInt16LE(8, 8)
	local.writeUInt16LE(DOS_TIME, 10)
	local.writeUInt16LE(DOS_DATE, 12)
	local.writeUInt32LE(crc, 14)
	local.writeUInt32LE(compressed.length, 18)
	local.writeUInt32LE(data.length, 22)
	local.writeUInt16LE(name.length, 26)
	local.writeUInt16LE(0, 28)
	localParts.push(local, name, compressed)

	const central = Buffer.alloc(46)
	central.writeUInt32LE(0x02014b50, 0)
	central.writeUInt16LE(20, 4)
	central.writeUInt16LE(20, 6)
	central.writeUInt16LE(UTF8_FLAG, 8)
	central.writeUInt16LE(8, 10)
	central.writeUInt16LE(DOS_TIME, 12)
	central.writeUInt16LE(DOS_DATE, 14)
	central.writeUInt32LE(crc, 16)
	central.writeUInt32LE(compressed.length, 20)
	central.writeUInt32LE(data.length, 24)
	central.writeUInt16LE(name.length, 28)
	central.writeUInt32LE(offset, 42)
	centralParts.push(central, name)

	offset += local.length + name.length + compressed.length
}

const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0)
const end = Buffer.alloc(22)
end.writeUInt32LE(0x06054b50, 0)
end.writeUInt16LE(files.length, 8)
end.writeUInt16LE(files.length, 10)
end.writeUInt32LE(centralSize, 12)
end.writeUInt32LE(offset, 16)

mkdirSync('dist', { recursive: true })
const out = join('dist', `study-buddy-${manifest.version}.zip`)
const zip = Buffer.concat([...localParts, ...centralParts, end])
writeFileSync(out, zip)
console.log(`${out}: ${files.length} files, ${(zip.length / 1024 / 1024).toFixed(2)} MB`)
