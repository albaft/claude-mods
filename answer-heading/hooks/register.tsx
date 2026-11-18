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

// Each section in a thin rounded box, in the colour of the message box.
// The app draws only ONE piece of a reply that a mod hands back to it (a
// second next() is silently dropped: that hid Files and Next, 18 Nov 2026).
// So the mod draws the Answer and Next itself, with Markdown, and hands the
// app only Files, whose file links and Run buttons need the app's own drawing.
function drawAnswer($: EngineInterface, e: RenderInput, parts: AnswerSplit, files: unknown) {
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
      {files !== null && (
        <Box flexDirection="column" {...box}>
          {files as never}
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

// The whole reply to a Run button press: the button itself already prints
// "Opened in Finder" or "Opened in Chrome" under it in the Files box, so this
// reply (which the app requires) is not drawn (Alba, 18 Nov 2026).
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
    // The one piece the app draws: the Files section.
    const files =
      found.files === '' ? null : await next({ ...e, props: { ...e.props, text: found.files, isFirstOfReply: false } })
    return drawAnswer($, e, found, files)
  })
}
