import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderInput } from 'claude-code'

import type { Folds, OpenMap } from '../types'

// Old-style replies with a "## Working" heading: opened ones, by message id.
const open = atom({ plugin: 'working-fold', key: 'open' } as const, {} as OpenMap, {
  shape: 'open-1',
})
// Finished turns: everything before the answer folds under one Working button.
const EMPTY: Folds = { members: {}, heads: {}, kept: {}, opened: {} }
const folds = atom({ plugin: 'working-fold', key: 'folds' } as const, EMPTY, {
  shape: 'folds-1',
})

// A "Working" heading (any level), then everything up to the first --- rule.
const HEADING = /^[ \t]*#{1,6}[ \t]*Working\b[^\n]*$/m
const RULE = /^[ \t]*-{3,}[ \t]*$/m

export type Split = { before: string; working: string; after: string }

export function split(text: string): Split | null {
  const head = HEADING.exec(text)
  if (!head) return null
  const before = text.slice(0, head.index).trim()
  const rest = text.slice(head.index + head[0].length)
  const rule = RULE.exec(rest)
  const working = (rule ? rest.slice(0, rule.index) : rest).trim()
  const after = rule ? rest.slice(rule.index + rule[0].length).trim() : ''
  return { before, working, after }
}

// Keeps a record to its newest `limit` entries.
function trim<V>(map: Record<string, V>, limit: number): Record<string, V> {
  const keys = Object.keys(map)
  if (keys.length <= limit) return map
  return Object.fromEntries(keys.slice(-limit).map(k => [k, map[k] as V]))
}

// What a row of a finished turn does: stay, hide, or carry the button.
type Role =
  | { kind: 'normal' }
  | { kind: 'hidden' }
  | { kind: 'head'; turn: string; isOpen: boolean }
  | { kind: 'answerHead'; turn: string; isOpen: boolean }

function roleOf(f: Folds, keys: string[]): Role {
  for (const key of keys) {
    const turn = f.members[key]
    if (turn === undefined) continue
    const isOpen = f.opened[turn] === true
    if (f.kept[key]) {
      return f.heads[turn] === key ? { kind: 'answerHead', turn, isOpen } : { kind: 'normal' }
    }
    if (f.heads[turn] === key || keys.includes(f.heads[turn] ?? '')) {
      return { kind: 'head', turn, isOpen }
    }
    return isOpen ? { kind: 'normal' } : { kind: 'hidden' }
  }
  return { kind: 'normal' }
}

// The Working button, with the row beneath it when the turn is opened.
function drawButton($: EngineInterface, e: RenderInput, turn: string, isOpen: boolean, row: unknown) {
  const { Box, Button } = $.ui.resolve(e)
  const toggle = async () => {
    await update($, folds, f => ({
      ...f,
      opened: trim({ ...f.opened, [turn]: !f.opened[turn] }, 1000),
    }))
    await saveFolds($)
  }
  return (
    <Box flexDirection="column">
      <Button key={`fold-${turn}`} label={isOpen ? '▾ Working' : '▸ Working'} onPress={toggle} />
      {isOpen ? (row as never) : null}
    </Box>
  )
}

// A reply written the old way, with its own "## Working" section: fold that.
function drawOldStyle($: EngineInterface, e: RenderInput, id: string, parts: Split, isOpen: boolean, rest: unknown) {
  const { Box, Button, Markdown } = $.ui.resolve(e)
  const toggle = () => update($, open, map => trim({ ...map, [id]: !map[id] }, 300))
  return (
    <Box flexDirection="column">
      {parts.before !== '' && <Markdown text={parts.before} />}
      <Button key={`working-${id}`} label={isOpen ? '▾ Working' : '▸ Working'} onPress={toggle} />
      {isOpen && <Markdown text={parts.working} dimColor />}
      {rest as never}
    </Box>
  )
}

// The fold record survives a restart in the cross-session store.
const STORE_KEY = 'folds-1'

async function saveFolds($: EngineInterface) {
  try {
    await $.store.set(STORE_KEY, await read($, folds))
  } catch {
    // Keeping the record is a help; never let it break the fold.
  }
}

async function loadFolds($: EngineInterface) {
  try {
    const saved = (await $.store.get(STORE_KEY)) as Folds | undefined
    if (!saved || typeof saved !== 'object' || !saved.members) return
    await update($, folds, f =>
      Object.keys(f.members).length >= Object.keys(saved.members).length ? f : saved,
    )
    $.ui.invalidate('ui.render')
  } catch {
    // Nothing saved yet, or unreadable: start empty.
  }
}

// An update that opens with its own "Working" heading: the button says it already.
const LEADING_WORKING = /^\s*#{1,6}[ \t]*Working\b[^\n]*\n+/

// A text row that belongs to a folded turn and is not its answer.
function isFoldedUpdate(f: Folds, key: string): boolean {
  return f.members[key] !== undefined && !f.kept[key]
}

function drawEmpty($: EngineInterface, e: RenderInput) {
  const { Box } = $.ui.resolve(e)
  // Zero height, clipped: the row takes no room. "display none" still left the
  // app's row gap (19 Nov 2026; technique from the public "textless" mod).
  return <Box height={0} overflow="hidden" />
}

// A short, stable key for an update's text.
export function textKey(text: string): string {
  const t = text.trim()
  let h = 5381
  for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0
  return `x:${h.toString(36)}:${t.length}`
}

export const register: Register = on => {
  // The running turn: its id, and its items in the order they appeared.
  let turnId: string | null = null
  let order: string[] = []
  const texts = new Set<string>()
  const tools = new Map<string, string>()

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await loadFolds($)
    return started
  })

  on('turn.start', async ($, e, next) => {
    if (!e.agentId) {
      turnId = e.turnId
      order = []
      texts.clear()
      tools.clear()
    }
    return next(e)
  })

  // Each model response: its visible text is an update (or, last, the answer).
  on('turn.step', async function* (_$, e, next) {
    const result = yield* next(e)
    if (!e.agentId && turnId !== null && e.turnId === turnId && result.answer.trim() !== '') {
      const key = textKey(result.answer)
      if (!order.includes(key)) order.push(key)
      texts.add(key)
    }
    return result
  })

  on('tool.call', (_$, e, next) => {
    if (turnId !== null && !e.agentId) {
      const key = `t:${e.tool_use_id}`
      if (!order.includes(key)) order.push(key)
      tools.set(key, e.tool)
    }
    return next(e)
  }).catch((_$, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId || turnId === null || e.turnId !== turnId) return done
    const turn = turnId
    const items = order
    turnId = null
    order = []
    // Fold only a turn that ended with an answer.
    if (e.reason !== 'answer') return done
    // The final reply is the turn's last item, when that is text.
    const last = items[items.length - 1]
    const kept = last !== undefined && texts.has(last) ? [last] : []
    const folded = items.filter(key => !kept.includes(key))
    // The button goes on the first update; else on the first drawn tool row.
    // The button goes on the first written update. With none, it goes at the
    // top of the answer. Never on a grey line: the app draws some of those itself.
    const head = folded.find(key => texts.has(key)) ?? kept[0]
    if (head === undefined || folded.length === 0) return done
    await update($, folds, f => {
      const members = { ...f.members }
      for (const key of items) members[key] = turn
      const keptMap = { ...f.kept }
      for (const key of kept) keptMap[key] = true
      return {
        members: trim(members, 5000),
        heads: trim({ ...f.heads, [turn]: head }, 1000),
        kept: trim(keptMap, 1000),
        opened: f.opened,
      }
    })
    await saveFolds($)
    // Rows the app drew while the turn ran are drawn again, folded.
    $.ui.invalidate('ui.render')
    return done
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) return next(e)
    const key = textKey(e.props.text)
    const role = roleOf(await read($, folds), [key])
    if (role.kind === 'hidden') return drawEmpty($, e)
    const stripped = e.props.text.replace(LEADING_WORKING, '')
    const isUpdate = role.kind === 'head' || (role.kind === 'normal' && isFoldedUpdate(await read($, folds), key))
    const shown = isUpdate && stripped !== e.props.text && stripped.trim() !== ''
      ? () => next({ ...e, props: { ...e.props, text: stripped } })
      : () => next(e)
    if (role.kind === 'head') {
      return drawButton($, e, role.turn, role.isOpen, role.isOpen ? await shown() : null)
    }
    if (isUpdate) return shown()
    if (role.kind === 'answerHead') {
      return drawButton($, e, role.turn, true, await next(e))
    }
    const parts = split(e.props.text)
    if (!parts || parts.working === '') return next(e)
    const isOpen = (await read($, open))[e.requestId] === true
    const rest =
      parts.after === '' ? null : await next({ ...e, props: { ...e.props, text: parts.after } })
    return drawOldStyle($, e, e.requestId, parts, isOpen, rest)
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    const role = roleOf(await read($, folds), [`t:${e.props.tool_use_id}`])
    if (role.kind === 'hidden') return drawEmpty($, e)
    if (role.kind === 'head') {
      return drawButton($, e, role.turn, role.isOpen, role.isOpen ? await next(e) : null)
    }
    return next(e)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    const role = roleOf(await read($, folds), [`t:${e.props.tool_use_id}`])
    if (role.kind === 'hidden' || (role.kind === 'head' && !role.isOpen)) return drawEmpty($, e)
    return next(e)
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    const keys = e.props.calls
      .map(call => call.tool_use_id)
      .filter((id): id is string => typeof id === 'string')
      .map(id => `t:${id}`)
    const role = roleOf(await read($, folds), keys)
    // A folded turn's group line: draw nothing in its place, without handing it
    // back to the app (19 Nov 2026; unfolding it was ignored by the desktop app).
    if (role.kind === 'hidden') return drawEmpty($, e)
    if (role.kind === 'head') {
      return drawButton($, e, role.turn, role.isOpen, role.isOpen ? await next(e) : null)
    }
    return next(e)
  })
}
