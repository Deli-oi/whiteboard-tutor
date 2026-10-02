import { Readability } from '@mozilla/readability'
import { IRequest } from 'itty-router'
import { parseHTML } from 'linkedom'
import { Environment } from '../environment'

/**
 * Read a link for the tutor.
 *
 * GitHub pull requests and issues get structured handling through the GitHub
 * API (title, description, changed files, a trimmed diff). Anything else is
 * fetched and reduced to plain text. Output is capped so a link never costs
 * more than a few thousand tokens.
 */

const MAX_TEXT_CHARS = 9000
const MAX_PATCH_CHARS = 6000

export async function fetchLink(request: IRequest, env: Environment) {
	const body = (await request.json()) as { url?: string }
	const raw = (body.url ?? '').trim()

	let url: URL
	try {
		url = new URL(raw)
	} catch {
		return Response.json({ error: 'Not a valid URL' }, { status: 400 })
	}
	if (url.protocol !== 'https:' && url.protocol !== 'http:') {
		return Response.json({ error: 'Only http(s) links' }, { status: 400 })
	}
	if (isPrivateHost(url.hostname)) {
		return Response.json({ error: 'That host is not allowed' }, { status: 400 })
	}

	try {
		const gh = parseGitHubUrl(url)
		if (gh) return Response.json(await readGitHub(gh, env))
		return Response.json(await readPage(url))
	} catch (e: any) {
		return Response.json({ error: e?.message ?? 'Could not read the link' }, { status: 502 })
	}
}

/**
 * Blocks internal/private hosts, including numeric-IP forms that a plain
 * dotted-quad regex check misses (decimal/hex literals both resolve to a
 * real IP - `http://2130706433/` is `http://127.0.0.1/`) and the IPv6
 * private/link-local ranges beyond the literal `::1`.
 */
export function isPrivateHost(host: string): boolean {
	const h = host.toLowerCase().replace(/^\[|\]$/g, '')

	if (
		h === 'localhost' ||
		h.endsWith('.localhost') ||
		h.endsWith('.local') ||
		h.endsWith('.internal')
	) {
		return true
	}

	if (h.includes(':')) return isPrivateIPv6(h)

	const asIPv4 = parseIPv4Literal(h)
	if (asIPv4) return isPrivateIPv4(asIPv4)

	return false
}

/** Parses dotted-quad, bare-decimal, and hex IPv4 literals into 4 octets. */
function parseIPv4Literal(host: string): [number, number, number, number] | null {
	// Bare decimal (e.g. "2130706433") or bare hex ("0x7f000001") - a single
	// 32-bit integer encoding the whole address.
	if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/.test(host)) {
		const n = Number(host)
		if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null
		return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
	}

	const parts = host.split('.')
	if (parts.length !== 4) return null
	const octets: number[] = []
	for (const part of parts) {
		if (!/^(0x[0-9a-f]+|\d+)$/.test(part)) return null
		const n = Number(part)
		if (!Number.isFinite(n) || n < 0 || n > 255) return null
		octets.push(n)
	}
	return octets as [number, number, number, number]
}

function isPrivateIPv4([a, b]: [number, number, number, number]): boolean {
	return (
		a === 127 ||
		a === 10 ||
		a === 0 ||
		(a === 192 && b === 168) ||
		(a === 172 && b >= 16 && b <= 31) ||
		(a === 169 && b === 254) // link-local, includes the cloud metadata endpoint
	)
}

function isPrivateIPv6(host: string): boolean {
	return (
		host === '::1' || // loopback
		host === '::' || // unspecified
		/^fe[89ab][0-9a-f]:/.test(host) || // link-local, fe80::/10
		/^f[cd][0-9a-f]{2}:/.test(host) // unique local, fc00::/7
	)
}

interface GitHubRef {
	owner: string
	repo: string
	kind: 'pull' | 'issues' | 'repo'
	number: number
}

function parseGitHubUrl(url: URL): GitHubRef | null {
	if (url.hostname !== 'github.com') return null
	const pr = url.pathname.match(/^\/([^/]+)\/([^/]+)\/(pull|issues)\/(\d+)/)
	if (pr) return { owner: pr[1], repo: pr[2], kind: pr[3] as 'pull' | 'issues', number: Number(pr[4]) }
	// A bare repo link: use the API (description + README) instead of the HTML page.
	const repo = url.pathname.match(/^\/([^/]+)\/([^/]+)\/?$/)
	if (repo && repo[2] !== '') return { owner: repo[1], repo: repo[2].replace(/\.git$/, ''), kind: 'repo', number: 0 }
	return null
}

async function ghGet(path: string, env: Environment) {
	const headers: Record<string, string> = {
		Accept: 'application/vnd.github+json',
		'User-Agent': 'whiteboard-tutor',
	}
	if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`
	const res = await fetch(`https://api.github.com${path}`, { headers })
	if (!res.ok) throw new Error(`GitHub API ${res.status} for ${path}`)
	return res.json() as Promise<any>
}

async function readGitHub(ref: GitHubRef, env: Environment) {
	const base = `/repos/${ref.owner}/${ref.repo}`

	if (ref.kind === 'repo') {
		const [repo, readme] = await Promise.all([
			ghGet(base, env),
			ghGet(`${base}/readme`, env).catch(() => null),
		])
		let readmeText = ''
		if (readme?.content) {
			try {
				const bytes = Uint8Array.from(atob(readme.content.replace(/\n/g, '')), (c) => c.charCodeAt(0))
				readmeText = new TextDecoder().decode(bytes)
			} catch {
				readmeText = ''
			}
		}
		return {
			source: `github repository ${ref.owner}/${ref.repo}`,
			title: repo.full_name,
			description: repo.description,
			language: repo.language,
			topics: repo.topics ?? [],
			stars: repo.stargazers_count,
			readme: clip(readmeText, MAX_TEXT_CHARS),
		}
	}

	if (ref.kind === 'issues') {
		const issue = await ghGet(`${base}/issues/${ref.number}`, env)
		return {
			source: `github issue ${ref.owner}/${ref.repo}#${ref.number}`,
			title: issue.title,
			state: issue.state,
			author: issue.user?.login,
			labels: (issue.labels ?? []).map((l: any) => l.name),
			text: clip(issue.body ?? '', MAX_TEXT_CHARS),
		}
	}

	const [pr, files] = await Promise.all([
		ghGet(`${base}/pulls/${ref.number}`, env),
		ghGet(`${base}/pulls/${ref.number}/files?per_page=50`, env),
	])

	let patchBudget = MAX_PATCH_CHARS
	const changedFiles = (files as any[]).map((f) => {
		let patch: string | undefined
		if (f.patch && patchBudget > 0) {
			patch = clip(f.patch, Math.min(patchBudget, 2500))
			patchBudget -= patch.length
		}
		return {
			file: f.filename,
			status: f.status,
			additions: f.additions,
			deletions: f.deletions,
			...(patch ? { patch } : {}),
		}
	})

	return {
		source: `github pull request ${ref.owner}/${ref.repo}#${ref.number}`,
		title: pr.title,
		state: pr.merged ? 'merged' : pr.state,
		author: pr.user?.login,
		branch: `${pr.head?.ref} -> ${pr.base?.ref}`,
		changedFiles: pr.changed_files,
		additions: pr.additions,
		deletions: pr.deletions,
		description: clip(pr.body ?? '', MAX_TEXT_CHARS),
		files: changedFiles,
	}
}

const MAX_REDIRECTS = 5

/**
 * Follows redirects manually, re-checking `isPrivateHost` on every hop - a
 * public URL can redirect to an internal address or the cloud metadata
 * endpoint, and auto-following (`redirect: 'follow'`) would fetch it with
 * this worker's own network access before any check ran again.
 */
async function fetchFollowingRedirects(url: URL): Promise<Response> {
	let current = url
	for (let i = 0; i <= MAX_REDIRECTS; i++) {
		const res = await fetch(current.toString(), {
			headers: { 'User-Agent': 'whiteboard-tutor', Accept: 'text/html,text/plain,application/json' },
			redirect: 'manual',
		})
		if (res.status < 300 || res.status >= 400 || !res.headers.get('Location')) return res

		const next = new URL(res.headers.get('Location')!, current)
		if (next.protocol !== 'https:' && next.protocol !== 'http:') {
			throw new Error('Redirected to a non-http(s) URL')
		}
		if (isPrivateHost(next.hostname)) {
			throw new Error('Redirected to a disallowed host')
		}
		current = next
	}
	throw new Error('Too many redirects')
}

async function readPage(url: URL) {
	const res = await fetchFollowingRedirects(url)
	if (!res.ok) throw new Error(`HTTP ${res.status} fetching the page`)
	const type = res.headers.get('content-type') ?? ''
	const body = await res.text()

	if (!type.includes('html')) {
		return { source: url.toString(), title: undefined, text: clip(body, MAX_TEXT_CHARS) }
	}

	const extracted = extractReadableText(body)
	return {
		source: url.toString(),
		title: extracted.title,
		text: clip(extracted.text, MAX_TEXT_CHARS),
	}
}

/**
 * Real reader-mode extraction (the same Readability engine behind Firefox's
 * Reader View, running against a linkedom DOM - both work fine in Workers,
 * no native DOM required) instead of a hand-rolled regex stripper, which
 * mangles plenty of real pages (malformed HTML, nested comments, <template>
 * content). Falls back to a plain tag strip if Readability can't find an
 * article - common for non-article pages like a homepage or search results.
 */
export function extractReadableText(html: string): { title?: string; text: string } {
	try {
		const { document } = parseHTML(html)
		const titleFromDoc = document.title || undefined
		const article = new Readability(document as any, { charThreshold: 200 }).parse()
		if (article?.textContent && article.textContent.trim().length > 0) {
			return { title: article.title ?? titleFromDoc, text: article.textContent.trim() }
		}
		if (titleFromDoc) return { title: titleFromDoc, text: stripHtmlTags(html) }
	} catch (e) {
		console.warn('[fetchLink] Readability failed, falling back to a plain tag strip:', e)
	}
	const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
	return { title: titleMatch ? titleMatch[1].trim() : undefined, text: stripHtmlTags(html) }
}

function stripHtmlTags(html: string) {
	return html
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
		.replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
		.replace(/<(br|p|div|li|h[1-6]|tr)[^>]*>/gi, '\n')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/[ \t]+/g, ' ')
		.replace(/\n\s*\n+/g, '\n')
		.trim()
}

function clip(text: string, max: number) {
	return text.length > max ? text.slice(0, max) + '\n…[truncated]' : text
}
