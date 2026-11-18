import { expect, test } from 'claude-code/testing'

const message = (id: string, text: string) =>
  ({
    plugin: 'answer-heading',
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: id,
    props: { text, isFirstOfReply: true },
  }) as const

test('the Answer heading is drawn as its own bigger line', async ($, on) => {
  // The real app draws only one piece per reply, so count what it is asked.
  const asked: string[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    asked.push((e.props as { text: string }).text)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(
    message(
      'a1',
      '## Answer\n\nDone.\n\n---\n\n## Files\n\n[a.md](a.html)\n\n---\n\n## Next\n\n> **Next:** nothing.\n\n---\n',
    ),
  )
  expect((await ui.find({ type: 'Text', text: 'Answer' }))?.text).toBe('Answer')
  // Inside the Answer box: the answer's own text, drawn by the mod.
  expect((await ui.find({ type: 'Markdown', text: /Done/ }))?.text).toBe('Done.')
  // The app is asked for exactly one piece: Files, with its link.
  expect(asked).toEqual(['## Files\n\n[a.md](a.html)'])
  expect((await ui.find({ type: 'Text', text: /engine:## Files/ }))?.text).toBe('engine:## Files\n\n[a.md](a.html)')
  // Next in its own box, drawn by the mod; the closing rule dropped.
  expect((await ui.find({ type: 'Markdown', text: /Next/ }))?.text).toBe('## Next\n\n> **Next:** nothing.')
  await ui.unmount()
})

test('a reply with no --- rules still gets its Files drawn by the app', async ($, on) => {
  const asked: string[] = []
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    asked.push((e.props as { text: string }).text)
    return <Text>{'engine:' + (e.props as { text: string }).text}</Text>
  })
  const ui = await $.ui.mount(
    message('a4', '## Answer\n\nDone.\n\n## Files\n\n[a.md](a.html)\n\n## Next\n\n> **Next:** nothing.'),
  )
  // The Answer box ends at the Files heading; Next is split off from Files.
  expect((await ui.find({ type: 'Markdown', text: /Done/ }))?.text).toBe('Done.')
  expect(asked).toEqual(['## Files\n\n[a.md](a.html)'])
  expect((await ui.find({ type: 'Markdown', text: /Next/ }))?.text).toBe('## Next\n\n> **Next:** nothing.')
  await ui.unmount()
})

test('with no Files section the app is asked for nothing', async ($, on) => {
  const asked: string[] = []
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
