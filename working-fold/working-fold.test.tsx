import { expect, test } from 'claude-code/testing'

const message = (id: string, text: string) =>
  ({
    plugin: 'working-fold',
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: id,
    props: { text, isFirstOfReply: false },
  }) as const

const group = (id: string, toolUseId: string) =>
  ({
    plugin: 'working-fold',
    surface: 'desktop',
    component: 'ToolGroup',
    requestId: id,
    props: {
      calls: [
        { tool_use_id: toolUseId, tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
      ],
      isActive: false,
      isExpanded: false,
    },
  }) as never

test('a finished turn folds under one Working button, in order', async ($, on) => {
  // Stands for the app drawing each row itself.
  let expandedSeen = false
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const p = e.props as { text?: string; isExpanded?: boolean }
    if (e.component === 'ToolGroup' && p.isExpanded) {
      expandedSeen = true
      return <Text>{'engine:expanded'}</Text>
    }
    return <Text>{'engine:' + e.component + ':' + (p.text ?? '')}</Text>
  })
  let toolUseId = ''
  on('tool.call', (_, e) => {
    toolUseId = e.tool_use_id
    return { result: {} } as never
  })
  on('turn.start', (_, e) => e as never)
  on('turn.complete', () => ({ text: '' }))

  let answer = ''
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null } as never
  })

  await $.turn.start({ turnId: 't1', text: 'hi' } as never)
  answer = 'Checking the files.'
  for await (const _ of $.turn.step({ turnId: 't1', index: 0, model: 'x', messageCount: 1 } as never)) {
    // drain
  }
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  answer = '## Answer\n\nDone.'
  for await (const _ of $.turn.step({ turnId: 't1', index: 1, model: 'x', messageCount: 2 } as never)) {
    // drain
  }

  await $.turn.complete({
    turnId: 't1',
    answer: '## Answer\n\nDone.',
    reason: 'answer',
    isAborted: false,
    durationMs: 1000,
  } as never)

  // The app draws the rows only once the turn has ended.
  const first = await $.ui.mount(message('u1', 'Checking the files.'))
  const rows = await $.ui.mount(group('g1', toolUseId))
  const final = await $.ui.mount(message('f1', '## Answer\n\nDone.'))

  // Closed: the button in place of the first update, the group unfolded (so
  // the app draws single rows, each hidden), the answer kept.
  expect(await first.find({ type: 'Text', text: /Checking/ })).toBeUndefined()
  // The group line draws nothing while closed: the app is not asked for it.
  expect(expandedSeen).toBe(false)
  expect(await rows.find({ type: 'Text', text: /ToolGroup/ })).toBeUndefined()
  expect((await final.find({ type: 'Text', text: /Done/ }))?.text).toBe(
    'engine:AssistantMessage:## Answer\n\nDone.',
  )

  // Opened: the update and the tool line come back where they were.
  await first.press({ key: 'fold-t1' })
  expect((await first.find({ type: 'Text', text: /Checking/ }))?.text).toBe(
    'engine:AssistantMessage:Checking the files.',
  )
  expect(await rows.find({ type: 'Text', text: /ToolGroup/ })).toBeDefined()

  // Closed again.
  await first.press({ key: 'fold-t1' })

  await first.unmount()
  await rows.unmount()
  await final.unmount()
})

test('an old-style reply still folds its own Working section', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(message('old', '## Working\n\nSynced.\n\n---\n\n## Answer\n\nHello.'))
  expect((await ui.find({ type: 'Text', text: /engine:/ }))?.text).toBe('engine:## Answer\n\nHello.')
  expect(await ui.find({ type: 'Markdown', text: /Synced/ })).toBeUndefined()
  await ui.press({ key: 'working-old' })
  expect((await ui.find({ type: 'Markdown', text: /Synced/ }))?.text).toBe('Synced.')
  await ui.unmount()
})

test('a turn with no written update gets its button on top of the answer', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const p = e.props as { text?: string }
    return <Text>{'engine:' + e.component + ':' + (p.text ?? '')}</Text>
  })
  let toolUseId = ''
  on('tool.call', (_, e) => {
    toolUseId = e.tool_use_id
    return { result: {} } as never
  })
  on('turn.start', (_, e) => e as never)
  on('turn.complete', () => ({ text: '' }))
  let answer = ''
  on('turn.step', async function* (_$, e) {
    return { turnId: e.turnId, index: e.index, answer, toolUses: [], stopReason: 'end_turn', usage: null } as never
  })

  await $.turn.start({ turnId: 't2', text: 'hi' } as never)
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  answer = '## Answer\n\nDone.'
  for await (const _ of $.turn.step({ turnId: 't2', index: 0, model: 'x', messageCount: 1 } as never)) {
    // drain
  }
  await $.turn.complete({ turnId: 't2', answer, reason: 'answer', isAborted: false, durationMs: 1 } as never)

  const row = await $.ui.mount({
    plugin: 'working-fold', surface: 'desktop', component: 'ToolUse', requestId: toolUseId,
    props: { tool_use_id: toolUseId, tool: 'Bash', input: {}, isRunning: false, isErrored: false, isInterrupted: false },
  } as never)
  const final = await $.ui.mount({
    plugin: 'working-fold', surface: 'desktop', component: 'AssistantMessage', requestId: 'f2',
    props: { text: answer, isFirstOfReply: true },
  } as never)

  // The grey line is hidden; the answer shows, with the one button on top.
  expect(await row.find({ type: 'Text', text: /ToolUse/ })).toBeUndefined()
  expect((await final.find({ type: 'Text', text: /Done/ }))?.text).toBe('engine:AssistantMessage:## Answer\n\nDone.')
  await final.press({ key: 'fold-t2' })
  expect((await row.find({ type: 'Text', text: /ToolUse/ }))?.text).toBe('engine:ToolUse:')
  await row.unmount()
  await final.unmount()
})
