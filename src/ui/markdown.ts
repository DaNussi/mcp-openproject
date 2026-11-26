/**
 * Small, safe Markdown → HTML renderer for OpenProject descriptions and comments.
 * Everything is HTML-escaped first; only the tags produced here are emitted. Links become
 * `data-url` anchors the panel opens through `orca.shell.openExternal` (http/https/mailto only).
 */

export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

const SAFE_URL = /^(https?:\/\/|mailto:)/i

function renderLink(text: string, url: string): string {
  const cleanUrl = url.replace(/&amp;/g, '&').trim()
  if (!SAFE_URL.test(cleanUrl)) return text
  return `<a href="#" data-action="open-url" data-url="${escapeHtml(cleanUrl)}">${text}</a>`
}

/** Inline markup on already-escaped text. */
function renderInline(escaped: string): string {
  const codeSpans: string[] = []
  let s = escaped.replace(/`([^`]+)`/g, (_, code: string) => {
    codeSpans.push(`<code>${code}</code>`)
    return `\u0000${codeSpans.length - 1}\u0000`
  })
  // Images cannot load in the panel (no network); show their alt text as a link instead.
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt: string, url: string) =>
    renderLink(alt || url, url)
  )
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_, text: string, url: string) =>
    renderLink(text, url)
  )
  s = s.replace(/(^|[\s(])((?:https?:\/\/)[^\s<)]+)/g, (_, pre: string, url: string) =>
    `${pre}${renderLink(url, url)}`
  )
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>')
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
  s = s.replace(/(^|[^\w_])_([^_\s][^_]*)_(?!\w)/g, '$1<em>$2</em>')
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>')
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => codeSpans[Number(i)])
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'"
}

/**
 * Strips the inline HTML OpenProject's editor sometimes stores (e.g. `<br>`, `<p>`) down to text
 * and decodes the entities it writes (`&nbsp;`); the result is escaped again before output.
 */
function normalizeSource(raw: string): string {
  return raw
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39);/g, (_, name: string) => ENTITIES[name])
    .replace(/\r\n?/g, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|div|span|figure|mention)[^>]*>/gi, '')
}

export function renderMarkdown(raw: string): string {
  const lines = normalizeSource(raw).split('\n')
  const out: string[] = []
  let paragraph: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let inCode = false
  let codeLines: string[] = []
  let quote: string[] = []

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${paragraph.map((l) => renderInline(escapeHtml(l))).join('<br>')}</p>`)
      paragraph = []
    }
  }
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`)
      listType = null
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${renderMarkdown(quote.join('\n'))}</blockquote>`)
      quote = []
    }
  }

  for (const line of lines) {
    if (inCode) {
      if (/^\s*```/.test(line)) {
        out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
        codeLines = []
        inCode = false
      } else {
        codeLines.push(line)
      }
      continue
    }
    if (/^\s*```/.test(line)) {
      flushParagraph()
      closeList()
      flushQuote()
      inCode = true
      continue
    }
    const quoteMatch = /^\s*>\s?(.*)$/.exec(line)
    if (quoteMatch) {
      flushParagraph()
      closeList()
      quote.push(quoteMatch[1])
      continue
    }
    flushQuote()

    if (!line.trim()) {
      flushParagraph()
      closeList()
      continue
    }
    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      flushParagraph()
      closeList()
      const level = Math.min(heading[1].length + 2, 6)
      out.push(`<h${level}>${renderInline(escapeHtml(heading[2]))}</h${level}>`)
      continue
    }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flushParagraph()
      closeList()
      out.push('<hr>')
      continue
    }
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || ordered) {
      flushParagraph()
      const want = bullet ? 'ul' : 'ol'
      if (listType !== want) {
        closeList()
        out.push(`<${want}>`)
        listType = want
      }
      let item = (bullet ?? ordered)![1]
      let check = ''
      const task = /^\[( |x|X)\]\s*(.*)$/.exec(item)
      if (task) {
        check = `<span class="md-check${task[1].trim() ? ' done' : ''}"></span>`
        item = task[2]
      }
      out.push(`<li>${check}${renderInline(escapeHtml(item))}</li>`)
      continue
    }
    closeList()
    paragraph.push(line)
  }
  if (inCode) out.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  flushParagraph()
  closeList()
  flushQuote()
  return out.join('')
}
