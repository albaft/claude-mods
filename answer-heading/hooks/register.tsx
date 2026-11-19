import type { EngineInterface, Register, RenderInput } from 'claude-code'

// The "Answer" heading (any level, alone on its line). The desktop app draws
// every markdown heading level at one size, so this mod draws this one line
// itself, a size up (Alba, 18 Nov 2026). Kept apart from working-fold.
const ANSWER_HEADING = /^[ \t]*#{1,6}[ \t]*Answer[ \t]*$/m

// A section that opens with a "Next" heading.
const NEXT_HEADING = /^\s*#{1,6}[ \t]*Next[ \t]*(\n|$)/

// The --- rules between sections (Answer, Files, Next).
const RULES = /^[ \t]*-{3,}[ \t]*$/gm

// Where the Answer section ends: the first --- rule, or a "Files" or "Next"
// heading, whichever comes first. A reply that leaves out the rule still
// gets Files drawn by the app, with its Run buttons (fix of 18 Nov 2026).
const END_OF_ANSWER = /^[ \t]*(-{3,}|#{1,6}[ \t]*(Files|Next))[ \t]*$/m

// A "Next" heading inside a section: Files and Next run together without a rule.
const NEXT_LINE = /^[ \t]*#{1,6}[ \t]*Next[ \t]*$/m

function splitAtNext(section: string): string[] {
  const at = NEXT_LINE.exec(section)
  return at && at.index > 0 ? [section.slice(0, at.index), section.slice(at.index)] : [section]
}

export type AnswerSplit = { before: string; body: string; files: string; next: string }

export function splitAnswer(text: string): AnswerSplit | null {
  const head = ANSWER_HEADING.exec(text)
  if (!head) return null
  const after = text.slice(head.index + head[0].length)
  const end = END_OF_ANSWER.exec(after)
  const rest = end ? after.slice(end.index) : ''
  // The sections after the Answer; the rules themselves are dropped, since
  // each box's edge does their job.
  const sections = rest
    .split(RULES)
    .flatMap(splitAtNext)
    .map(s => s.trim())
    .filter(s => s !== '')
  const next = sections.find(s => NEXT_HEADING.test(s)) ?? ''
  return {
    before: text.slice(0, head.index).trim(),
    body: (end ? after.slice(0, end.index) : after).trim(),
    // Files, and anything else that is not Next, in one piece.
    files: sections.filter(s => s !== next).join('\n\n---\n\n'),
    next,
  }
}

// Files (Alba, 19 Nov 2026). A line whose first link goes to a .md stays with
// the app: a click opens it formatted in Claude's side pane, and the app's own
// right-click "Show in Finder" shows the .md. A line whose first link goes to
// any other file on the Mac is drawn by the mod instead: a click opens the
// file in its default app (Chrome, Acrobat, Excel, Preview...), and a
// right-click on the message offers "Show in Finder: <name>" for each one.
const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/

export type OtherFile = { name: string; path: string }
export type FilesSplit = { appText: string; otherText: string; others: OtherFile[] }

function toPath(target: string, cwd: string): string | null {
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null // a web or other address: the app's
  let rel = target
  try {
    rel = decodeURI(target)
  } catch {
    // Not percent-encoded as expected: use it as written.
  }
  if (rel.startsWith('/')) return rel
  return cwd.replace(/\/$/, '') + '/' + rel.replace(/^\.\//, '')
}

export function splitFiles(files: string, cwd: string): FilesSplit {
  const app: string[] = []
  const other: string[] = []
  const others: OtherFile[] = []
  for (const line of files.split('\n')) {
    const m = LINK.exec(line)
    const path = m && !/\.md(#.*)?$/i.test(m[2] ?? '') ? toPath(m[2] ?? '', cwd) : null
    if (!m || path === null) {
      app.push(line)
      continue
    }
    others.push({ name: m[1] ?? path, path })
    other.push(line.replace(m[0], `[${m[1]}](file://${encodeURI(path)})`))
  }
  return { appText: app.join('\n').trim(), otherText: other.join('\n\n'), others }
}

// The mod-drawn files of each message, by its id, for the right-click menu.
const filesOf = new Map<string, OtherFile[]>()

function remember(id: string, others: OtherFile[]) {
  filesOf.delete(id)
  if (others.length > 0) filesOf.set(id, others)
  if (filesOf.size > 300) filesOf.delete(filesOf.keys().next().value as string)
}

async function openFile($: EngineInterface, argv: string[]) {
  try {
    const { exitCode, stderr } = await $.process.run(argv)
    if (exitCode !== 0) $.ui.toast(`Could not open: ${stderr.trim()}`)
  } catch (err) {
    $.ui.toast(`Could not open: ${String(err)}`)
  }
}

function pathOfLink(href: string, others: OtherFile[]): string | null {
  const hit = others.find(f => href === `file://${encodeURI(f.path)}` || href.endsWith(encodeURI(f.path)))
  if (hit) return hit.path
  if (!href.startsWith('file://')) return null
  try {
    return decodeURI(href.slice('file://'.length))
  } catch {
    return null
  }
}

// Each section in a thin rounded box, in the colour of the message box.
// The app draws only ONE piece of a reply that a mod hands back to it (a
// second next() is silently dropped: that hid Files and Next, 18 Nov 2026).
// So the mod draws the Answer and Next itself, with Markdown, and hands the
// app only Files, whose file links and Run buttons need the app's own drawing.
function drawAnswer($: EngineInterface, e: RenderInput, parts: AnswerSplit, files: unknown, split: FilesSplit) {
  const { Box, Text, Markdown } = $.ui.resolve(e)
  const box = { borderStyle: 'round', borderColor: 'promptBorder', paddingX: 'md', paddingY: 'sm' } as const
  return (
    <Box flexDirection="column" rowGap="md">
      {parts.before !== '' && <Markdown text={parts.before} />}
      {/* rowGap: about one line of space under the heading (Alba: "too squished"). */}
      <Box flexDirection="column" rowGap="md" {...box}>
        <Text size="title" weight="semibold">
          Answer
        </Text>
        {parts.body !== '' && <Markdown text={parts.body} />}
      </Box>
      {(files !== null || split.otherText !== '') && (
        <Box flexDirection="column" {...box}>
          {files as never}
          {split.otherText !== '' && (
            <Markdown
              key={`files-${e.requestId}`}
              text={split.otherText}
              onLinkPress={link => {
                const path = pathOfLink(link.href, split.others)
                if (path !== null) void openFile($, ['open', path])
              }}
            />
          )}
        </Box>
      )}
      {parts.next !== '' && (
        <Box flexDirection="column" {...box}>
          <Markdown text={parts.next} />
        </Box>
      )}
    </Box>
  )
}

// The whole reply to a Run button press: the button already shows its own
// output under it, so this reply (which the app requires) is not drawn
// (Alba, 18 Nov 2026).
const RUN_PRESS_REPLY = /^\s*(Opened|Done)\.?\s*$/

function drawNothing($: EngineInterface, e: RenderInput) {
  const { Box } = $.ui.resolve(e)
  return <Box display="none" />
}

export const register: Register = on => {
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    if (RUN_PRESS_REPLY.test(e.props.text)) return drawNothing($, e)
    const found = splitAnswer(e.props.text)
    if (!found) return next(e)
    // Files: .md lines for the app, other files for the mod.
    const split = splitFiles(found.files, found.files === '' ? '' : await $.session.cwd())
    remember(e.requestId, split.others)
    // The one piece the app draws: the Files heading and the .md lines.
    const files =
      split.appText === '' ? null : await next({ ...e, props: { ...e.props, text: split.appText, isFirstOfReply: false } })
    return drawAnswer($, e, found, files, split)
  })

  // Right-click on a message with mod-drawn files: one Show in Finder row per
  // file (the menu says which message was clicked, not which link).
  on('ui.render', { component: 'ContextMenu' }, ($, e, next) => {
    const others = e.props.row ? filesOf.get(e.props.row.requestId) : undefined
    if (!others) return next(e)
    const { Box, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column">
        {others.map(f => (
          <Button key={`finder-${f.path}`} onPress={() => openFile($, ['open', '-R', f.path])}>
            Show in Finder: {f.name}
          </Button>
        ))}
      </Box>
    )
  })
}
