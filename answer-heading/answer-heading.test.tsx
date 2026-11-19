import { expect, test } from 'claude-code/testing'

const message = (id: string, text: string) =>
  ({
    plugin: 'answer-heading',
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: id,
    props: { text, isFirstOfReply: true },
  }) as const

test('other files are drawn by the mod, with Show in Finder on right-click', async ($, on) => {
  const asked: string[] = []
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    asked.push((e.props as { text: string }).text)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const cwd = '/work'
  const ui = await $.ui.mount(
    message(
      'a7',
      '## Answer\n\nDone.\n\n---\n\n## Files\n\n**[a.md](notes/a.md)** (the notes)\n\n[b chart.png](out/b%20chart.png) (the chart)\n\n---\n\n## Next\n\n> **Next:** nothing.',
    ),
  )
  // The app draws the heading and the .md line only.
  expect(asked).toEqual(['## Files\n\n**[a.md](notes/a.md)** (the notes)'])
  // The mod draws the other file as a file link, after the .md line.
  const other = await ui.find({ type: 'Markdown', text: /chart/ })
  expect(other?.text).toBe(`[b chart.png](file://${encodeURI(cwd.replace(/\/$/, '') + '/out/b chart.png')}) (the chart)`)
  await ui.unmount()

  // Right-click on that message: one Show in Finder row, naming the file.
  const menu = await $.ui.mount({
    plugin: 'answer-heading',
    surface: 'desktop',
    component: 'ContextMenu',
    requestId: 'menu-1',
    props: { row: { component: 'AssistantMessage', requestId: 'a7' } },
  } as never)
  expect(await menu.find({ type: 'Button', text: /Show in Finder: b chart\.png/ })).toBeDefined()
  await menu.unmount()
})

test('the Answer heading is drawn as its own bigger line', async ($, on) => {
  // The real app draws only one piece per reply, so count what it is asked.
  const asked: string[] = []
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    asked.push((e.props as { text: string }).text)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(
    message(
      'a1',
      '## Answer\n\nDone.\n\n---\n\n## Files\n\n[a.md](a.md)\n\n---\n\n## Next\n\n> **Next:** nothing.\n\n---\n',
    ),
  )
  expect((await ui.find({ type: 'Text', text: 'Answer' }))?.text).toBe('Answer')
  // Inside the Answer box: the answer's own text, drawn by the mod.
  expect((await ui.find({ type: 'Markdown', text: /Done/ }))?.text).toBe('Done.')
  // The app is asked for exactly one piece: Files, with its link.
  expect(asked).toEqual(['## Files\n\n[a.md](a.md)'])
  expect((await ui.find({ type: 'Text', text: /engine:## Files/ }))?.text).toBe('engine:## Files\n\n[a.md](a.md)')
  // Next in its own box, drawn by the mod; the closing rule dropped.
  expect((await ui.find({ type: 'Markdown', text: /Next/ }))?.text).toBe('## Next\n\n> **Next:** nothing.')
  await ui.unmount()
})

test('a reply with no --- rules still gets its Files drawn by the app', async ($, on) => {
  const asked: string[] = []
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    asked.push((e.props as { text: string }).text)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(
    message('a4', '## Answer\n\nDone.\n\n## Files\n\n[a.md](a.md)\n\n## Next\n\n> **Next:** nothing.'),
  )
  // The Answer box ends at the Files heading; Next is split off from Files.
  expect((await ui.find({ type: 'Markdown', text: /Done/ }))?.text).toBe('Done.')
  expect(asked).toEqual(['## Files\n\n[a.md](a.md)'])
  expect((await ui.find({ type: 'Markdown', text: /Next/ }))?.text).toBe('## Next\n\n> **Next:** nothing.')
  await ui.unmount()
})

test('the one-word reply to a Run button press is not drawn', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(message('a5', 'Opened.'))
  expect(await ui.find({ type: 'Text', text: /engine:/ })).toBeUndefined()
  await ui.unmount()
  // A longer reply that starts the same way is drawn as usual.
  const other = await $.ui.mount(message('a6', 'Opened the file, but it is empty.'))
  expect((await other.find({ type: 'Text', text: /engine:/ }))?.text).toBe('engine:Opened the file, but it is empty.')
  await other.unmount()
})

test('with no Files section the app is asked for nothing', async ($, on) => {
  const asked: string[] = []
  on('session.cwd', () => ({ value: '/work' }) as never)
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    asked.push((e.props as { text: string }).text)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(message('a3', '## Answer\n\nDone.\n\n---\n\n## Next\n\n> **Next:** nothing.\n\n---'))
  expect(asked).toEqual([])
  expect((await ui.find({ type: 'Markdown', text: /Next/ }))?.text).toBe('## Next\n\n> **Next:** nothing.')
  await ui.unmount()
})

test('a reply without an Answer heading is left alone', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(message('a2', 'Checking the files.'))
  expect((await ui.find({ type: 'Text', text: /engine:/ }))?.text).toBe('engine:Checking the files.')
  expect(await ui.find({ type: 'Text', text: 'Answer' })).toBeUndefined()
  await ui.unmount()
})
