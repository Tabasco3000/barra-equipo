import { test, expect, mock } from 'claude-code/testing'
import { esMasNueva, mesDe } from './register'

const BANDA = {
  plugin: 'botones-sesion',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 100,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

// Un cerebro en español: diario en «📓 Diarios». Otro en inglés: «📓 Journals» y sin mapping.
const ESPANOL = {
  archivos: {
    '/cerebro/📓 Diarios/Octubre 2026/Uno.md': '---\ncreationDate: 2026-10-10T22:51\n---\n',
    '/cerebro/📓 Diarios/Septiembre 2026/Dos.md': '---\ncreationDate: 2026-09-20T23:25\n---\n',
    '/cerebro/⚙️ Meta/.second-brain-mapping-state.json':
      '{"phase_1_metadata":"2026-10-13T22:32:43-06:00","phase_2_graphify":"2026-10-14T16:47:30-06:00","phase_3_wikilinks":null}',
  } as Record<string, string>,
  // «Resúmenes» no es un mes: se brinca. Octubre gana a septiembre aunque venga después en la lista.
  carpetas: {
    '/cerebro/📓 Diarios': ['Resúmenes', 'Septiembre 2026', 'Octubre 2026'],
    '/cerebro/📓 Diarios/Octubre 2026': ['Uno.md'],
    '/cerebro/📓 Diarios/Septiembre 2026': ['Dos.md'],
  } as Record<string, string[]>,
}
const INGLES = {
  archivos: { '/cerebro/📓 Journals/October 2026/Uno.md': '---\ncreationDate: 2026-10-18T09:00\n---\n' } as Record<string, string>,
  carpetas: { '/cerebro/📓 Journals': ['October 2026'], '/cerebro/📓 Journals/October 2026': ['Uno.md'] } as Record<string, string[]>,
}

const montar = (on: any, cerebro: typeof ESPANOL) => {
  mock.env(on, { VAULT_ROOT: '/cerebro' })
  mock.clock(on, { now: Date.parse('2026-10-21T12:00') })
  on('fs.list', ($: any, e: any) => {
    const lista = cerebro.carpetas[e.path ?? '']
    if (!lista) throw new Error('ENOENT')
    return { value: lista.map(name => ({ name, kind: 'dir', size: 0 })) } as never
  })
  on('fs.read', ($: any, e: any) => {
    if (!(e.path in cerebro.archivos)) throw new Error('ENOENT')
    return { value: cerebro.archivos[e.path] } as never
  })
  on('ui.render', ($: any, e: any) => $.ui.resolve(e).Text({ children: 'debajo' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 1000000, tokens: 246000, percent: 25 }, rateLimits: [] } }) as never)
}

test('los meses en español o en inglés, y la versión publicada contra la instalada', () => {
  expect(mesDe('Octubre 2026')).toBe(202609)
  expect(mesDe('October 2026')).toBe(202609)
  expect(mesDe('Resúmenes')).toBeNaN()
  expect(esMasNueva('1.0.1', '1.0.0')).toBe(true)
  expect(esMasNueva('1.10.0', '1.9.2')).toBe(true)
  expect(esMasNueva('1.0.0', '1.0.0')).toBe(false)
  expect(esMasNueva('0.9.9', '1.0.0')).toBe(false)
})

test('cerebro en español: el diario en «📓 Diarios», el mapping, compactar, tope y cierre, sin micrófono', async ($, on) => {
  const prompts: string[] = []
  const variables: [string, string | undefined][] = []
  const comandos: string[] = []
  on('command.run', ($, e) => { comandos.push(e.command); return { text: '' } })
  on('prompt.submit', ($, e) => { prompts.push(e.text); return { text: e.text } })
  on('env.set', ($, e) => { variables.push([e.name, e.value]); return { value: undefined } as never })
  montar(on, ESPANOL)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BANDA, surface })
    expect((await ui.find({ type: 'Text', text: /k$/ }))?.text).toBe('246k')
    expect((await ui.find({ type: 'Text', text: 'debajo' }))?.text).toBe('debajo')
    // Una línea cuando cabe; en un panel angosto baja a otro renglón en vez de cortarse.
    expect((await ui.findAll({ type: 'Box' })).some((box: any) => box.props.flexWrap === 'wrap')).toBe(true)
    // Diario de hace 11 días: letra roja. Mapping de hace 7: botón normal. Sin micrófono ni botón de actualizar.
    expect((await ui.find({ key: 'mapping' }))?.props.label).toBe('Map 14/10')
    expect(await ui.find({ key: 'voz' })).toBeFalsy()
    expect(await ui.find({ key: 'actualizar' })).toBeFalsy()
    if (surface === 'desktop') {
      const dibujos = await ui.findAll({ type: 'Svg' })
      expect(dibujos.map((svg: any) => [svg.props.alt, svg.props.width, svg.props.height])).toEqual([
        ['Cierra y archiva', 130, 22], ['Compactar', 26, 22], ['Contexto al 25 %', 30, 8], ['Diario 10/10', 97, 28],
      ])
      // La letra va dentro del dibujo, obligada a caber.
      expect(dibujos[3].props.source).toContain('textLength="77"')
      expect(dibujos[3].props.source).toContain('fill="#e07a74">Diario 10/10</text>')
      await ui.post(true, { in: 'compactar' })
    } else {
      expect((await ui.find({ key: 'diario-letra' }))?.props.props).toEqual({ texto: 'Diario 10/10', color: '#e07a74', fuerte: false })
      await ui.press({ key: 'compactar' })
    }
    await ui.press({ key: 'estado' })
    await ui.select({ key: 'ventana', value: '400000' })
    await ui.select({ key: 'ventana', value: 'default' })
    await ui.post(true, { in: 'cerrar' })
    expect((await ui.find({ key: 'cerrar' }))?.props.props).toMatchObject({ texto: 'Sonnet · deshacer' })
    await ui.post(true, { in: 'cerrar' })
    expect((await ui.find({ key: 'cerrar' }))?.props.props).toMatchObject({ texto: 'Cierra y archiva' })
    await ui.unmount()
  }

  // El mismo minuto en las dos superficies: el segundo «Compactar» no se vuelve a formar en la fila.
  expect(comandos).toEqual(['compact'])
  expect(prompts.map(texto => texto.slice(0, 16))).toEqual(['Deja el estado a', 'cierra y archiva', 'Deja el estado a', 'cierra y archiva'])
  expect(variables).toEqual([
    ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', '400000'], ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', undefined],
    ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', '400000'], ['CLAUDE_CODE_AUTO_COMPACT_WINDOW', undefined],
  ])
})

test('cerebro en inglés: diario en «📓 Journals» con meses en inglés y «Map pendiente» si nunca se ha corrido el mapping', async ($, on) => {
  montar(on, INGLES)
  const ui = await $.ui.mount({ ...BANDA, surface: 'terminal' })
  expect((await ui.find({ key: 'diario' }))?.props.label).toBe('Diario 18/10')
  expect((await ui.find({ key: 'mapping-letra' }))?.props.props).toMatchObject({ texto: 'Map pendiente', color: '#e07a74' })
  await ui.unmount()
})

test('el aviso de versión nueva: una consulta al abrir la sesión, el botón y la actualización', async ($, on) => {
  const corridos: string[][] = []
  let publicada = '1.1.0'
  let instala = 0
  on('process.run', ($, e) => {
    corridos.push([...e.argv])
    return { value: { exitCode: instala, stdout: e.argv[0] === '/usr/bin/curl' ? `${publicada}\n` : '', stderr: 'sin red' } } as never
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  montar(on, ESPANOL)

  // Sin versión nueva (la misma o una vieja), no sale el botón.
  for (const vieja of ['1.0.0', '0.9.0', 'una página de error']) {
    publicada = vieja
    await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
    const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
    expect(await ui.find({ key: 'actualizar' })).toBeFalsy()
    await ui.unmount()
  }
  expect(corridos[0]).toEqual(['/usr/bin/curl', '-fsS', '--max-time', '5', 'https://raw.githubusercontent.com/Tabasco3000/barra-equipo/master/version.txt'])

  publicada = '1.1.0'
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...BANDA, surface: 'desktop' })
  expect((await ui.find({ key: 'actualizar' }))?.props.label).toBe('Actualizar barra (1.1.0)')
  // Si la instalación falla, el botón se queda para intentarlo otra vez.
  instala = 1
  await ui.press({ key: 'actualizar' })
  expect(corridos.at(-1)?.slice(0, 2)).toEqual(['/bin/bash', '-c'])
  expect(corridos.at(-1)?.[2]).toContain('/usr/bin/curl -fsSL https://raw.githubusercontent.com/Tabasco3000/barra-equipo/master/instalar.sh -o "$f"; /bin/bash "$f"')
  expect(await ui.find({ key: 'actualizar' })).toBeTruthy()
  instala = 0
  await ui.press({ key: 'actualizar' })
  expect(await ui.find({ key: 'actualizar' })).toBeFalsy()
  await ui.unmount()
})
