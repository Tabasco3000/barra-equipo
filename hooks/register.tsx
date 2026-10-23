import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

// Barra de sesión del equipo. La misma copia sirve en cualquier cerebro: busca sola la carpeta del diario y lee los meses en
// español o en inglés. Se publica en GitHub (Tabasco3000/barra-equipo) y avisa cuando hay versión nueva.

// La versión instalada: la misma de .claude-plugin/plugin.json (la prueba lo cuida).
export const VERSION = '1.0.1'
export const PUBLICADA = 'https://raw.githubusercontent.com/Tabasco3000/barra-equipo/master'

// A cuántos tokens compacta esta sesión; «default» = sin tope propio: el límite del modelo (~1 millón).
const ventana = atom({ plugin: 'botones-sesion', key: 'ventana' } as const, 'default')
// Prendido desde que se aprieta «Cierra y archiva»: el cierre lo contesta Sonnet.
const cerrando = atom({ plugin: 'botones-sesion', key: 'cerrando' } as const, false)
// La versión nueva publicada, si la hay.
const nueva = atom({ plugin: 'botones-sesion', key: 'nueva' } as const, '')

const SONNET = 'claude-sonnet-5-5'
const OPCIONES = [
  { value: 'default', label: '1M' },
  ...['800', '600', '500', '400', '300', '200'].map(mil => ({ value: `${mil}000`, label: `${mil}k` })),
]
const EN_QUE_VAMOS =
  'Deja el estado al día: si este proyecto tiene docs/ESTADO.md (o ESTADO.md), actualízalo; si no tiene, sáltate ese paso. ' +
  'Luego dime en corto: 1) qué hemos hecho en esta sesión, 2) qué estamos haciendo ahora y 3) qué nos falta por hacer en la sesión.'
const DIA = 86_400_000
const ROJO = '#a8504c'
const ROJO_CLARO = '#e07a74'
// El gris de los botones de la app (medido en una captura, 23-oct-2026).
const GRIS_BOTON = '#464646'
// La carpeta del diario según el cerebro: en español o como la deja el Brain Starter.
const CARPETAS_DIARIO = ['📓 Diarios', '📓 Journals']
const MESES = [
  'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' '),
  'january february march april may june july august september october november december'.split(' '),
]

const enK = (tokens: number) => `${Math.round(tokens / 1000)}k`
// '2026-09-09T22:39' -> '09/09'
const corta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// 'Octubre 2026' o 'October 2026' -> 202609 (para ordenar); NaN si la carpeta no es de un mes.
export const mesDe = (carpeta: string) => {
  const [mes, anio] = carpeta.toLowerCase().split(' ')
  const i = Math.max(...MESES.map(nombres => nombres.indexOf(mes)))
  return i < 0 || !/^\d{4}$/.test(anio ?? '') ? NaN : Number(anio) * 100 + i
}
// '1.10.0' > '1.9.2'
export const esMasNueva = (otra: string, mia: string) => {
  const [a, b] = [otra, mia].map(v => v.trim().split('.').map(Number))
  for (let i = 0; i < 3; i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0)
  return false
}

// Fecha del último diario y del último brain mapping, leídas del cerebro. `diario` vacío si no hay diario; `mapping` vacío si
// nunca se ha corrido (el botón sale «Map pendiente»).
const ultimos = async ($: EngineInterface): Promise<{ diario?: string; mapping?: string }> => {
  const vault = await $.env.get('VAULT_ROOT')
  if (!vault) return {}
  let diario = ''
  for (const carpeta of CARPETAS_DIARIO) {
    const diarios = `${vault}/${carpeta}`
    let meses
    try {
      meses = (await $.fs.list(diarios))
        .map(mes => ({ nombre: mes.name, cuando: mesDe(mes.name) }))
        .filter(mes => !Number.isNaN(mes.cuando))
        .sort((a, b) => b.cuando - a.cuando)
    } catch {
      continue
    }
    // El archivo no trae fecha en el nombre y su fecha de modificación la mueve el mapping: se lee creationDate,
    // del mes más nuevo hacia atrás.
    for (const mes of meses) {
      for (const nota of await $.fs.list(`${diarios}/${mes.nombre}`).catch(() => [])) {
        const texto = await $.fs.read(`${diarios}/${mes.nombre}/${nota.name}`).catch(() => '')
        const fecha = /^creationDate: (\S+)/m.exec(texto)?.[1] ?? ''
        if (fecha > diario) diario = fecha
      }
      if (diario) break
    }
    if (diario) break
  }
  let mapping = ''
  try {
    const fases: Record<string, string | null> = JSON.parse(await $.fs.read(`${vault}/⚙️ Meta/.second-brain-mapping-state.json`))
    mapping = Object.values(fases).filter((f): f is string => !!f).sort().at(-1) ?? ''
  } catch {}

  return { diario: diario || undefined, mapping: mapping || undefined }
}

// Cuándo se lanzó cada comando. Si Claude está ocupado, cada clic se forma en la fila y luego corre entero:
// el 21-oct, ocho clics a «Map pendiente» en 18 s fueron ocho /second-brain-mapping seguidos (en una de las Macs).
const lanzados = new Map<string, number>()
const ESPERA_RELANZAR = 60_000

const lanzar = async ($: EngineInterface, comando: string) => {
  const ahora = await $.clock.now()
  if (ahora - (lanzados.get(comando) ?? -Infinity) < ESPERA_RELANZAR) {
    $.ui.toast(`/${comando} ya va en camino`)
    return
  }
  lanzados.set(comando, ahora)
  await $.command.run({ command: comando }).catch(() => {
    lanzados.delete(comando)
    $.ui.toast(`No pude lanzar /${comando}`)
  })
}

// Una sola consulta chiquita al abrir la sesión (un archivo de texto con la versión, 5 s máximo): si hay versión nueva,
// aparece el botón «Actualizar barra». Sin internet o con la página caída, no pasa nada.
const revisarVersion = async ($: EngineInterface) => {
  const { exitCode, stdout } = await $.process.run(['/usr/bin/curl', '-fsS', '--max-time', '5', `${PUBLICADA}/version.txt`])
  const publicada = stdout.trim()
  if (exitCode === 0 && /^\d+\.\d+\.\d+$/.test(publicada) && esMasNueva(publicada, VERSION)) await update($, nueva, () => publicada)
}

// Baja la versión publicada y la pone encima de esta carpeta; el motor recarga la barra solo.
const actualizar = async ($: EngineInterface) => {
  const version = await read($, nueva)
  $.ui.toast(`Actualizando la barra a la ${version}…`)
  // Se baja a un archivo y luego se corre: con `curl | bash` una descarga fallida terminaba en «éxito» sin instalar nada.
  const { exitCode, stderr } = await $.process.run([
    '/bin/bash',
    '-c',
    `set -e; f="$(mktemp)"; trap 'rm -f "$f"' EXIT; /usr/bin/curl -fsSL ${PUBLICADA}/instalar.sh -o "$f"; /bin/bash "$f"`,
  ])
  if (exitCode !== 0) {
    $.ui.toast(`No pude actualizar la barra: ${stderr.trim().split('\n').at(-1) ?? 'error'}`)
    return
  }
  await update($, nueva, () => '')
  $.ui.toast(`Barra actualizada a la ${version}. Si no cambia, abre una sesión nueva.`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    // Si la app se reinicia, el proceso nuevo no trae la variable: se repone de lo guardado en la sesión.
    const tokens = await read($, ventana)
    if (tokens !== 'default') await $.env.set('CLAUDE_CODE_AUTO_COMPACT_WINDOW', tokens)
    void revisarVersion($).catch(() => {})

    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    return yield* next((await read($, cerrando)) ? { ...e, model: SONNET } : e)
  })

  // Deja a la vista qué modelo contestó de verdad el cierre.
  on('turn.complete', async ($, e, next) => {
    if ((await read($, cerrando)) && e.usage) $.ui.log(`Cierre contestado por ${e.usage.model}`)

    return next(e)
  })

  // Los clics de las piezas propias (hueco.tsx, letra.tsx, pastilla.tsx) llegan aquí, con la key de la que se picó.
  on('ui.message', async ($, e, next) => {
    if (e.element === 'cerrar') {
      const estaba = await read($, cerrando)
      await update($, cerrando, () => !estaba)
      if (!estaba) void $.prompt.submit({ text: 'cierra y archiva', asUser: true })
    }
    const comando = { 'diario-letra': 'daily-journal', 'mapping-letra': 'second-brain-mapping', compactar: 'compact' }[e.element]
    if (comando) void lanzar($, comando)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (e.surface !== 'terminal' && e.surface !== 'desktop')) return next(e)

    const { Box, Button, Client, Select, Text } = $.ui.resolve(e)
    const { context } = await $.session.usage()
    const { diario, mapping } = await ultimos($)
    const ahora = await $.clock.now()
    // Botón con la fecha, que lanza su comando. Cuando ya se pasó (diario semanal, mapping mensual) o nunca se ha hecho, la letra
    // va roja. La app no pinta el color de la letra en sus botones, así que en la app es un dibujo del gris y el alto de sus
    // botones con la letra roja adentro, obligada a caber, y un hueco encima que recibe el clic; en la terminal, la letra roja sola.
    const fecha = (key: string, nombre: string, iso: string | undefined, dias: number, comando: string) => {
      const texto = iso ? `${nombre} ${corta(iso)}` : `${nombre} pendiente`
      if (iso && ahora - Date.parse(iso) <= dias * DIA)
        return <Button key={key} label={texto} onPress={() => void lanzar($, comando)} />
      if (e.surface !== 'desktop')
        return <Client key={`${key}-letra`} module="./letra.tsx" props={{ texto, color: ROJO_CLARO, fuerte: false }} />

      const { Svg } = $.ui.resolve(e)
      const letra = Math.round(texto.length * 6.4)
      const ancho = letra + 20

      return (
        <Box position="relative" flexShrink={0}>
          <Svg
            alt={texto}
            width={ancho}
            height={28}
            source={`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="28"><rect width="${ancho}" height="28" rx="7" fill="${GRIS_BOTON}"/><text x="${ancho / 2}" y="18.5" text-anchor="middle" textLength="${letra}" lengthAdjust="spacingAndGlyphs" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="14" fill="${ROJO_CLARO}">${texto}</text></svg>`}
          />
          <Box position="absolute" top={0} bottom={0} left={0} right={0}>
            <Client key={`${key}-letra`} module="./hueco.tsx" props={{ ancho: '100%', texto }} />
          </Box>
        </Box>
      )
    }
    const lleno = context.percent ?? 0
    const color = lleno < 50 ? '#3fb950' : lleno < 80 ? '#d29922' : '#f85149'

    // Barrita de qué tan lleno va el contexto; solo la app de escritorio dibuja Svg.
    let llenado = null
    if (e.surface === 'desktop' && context.percent !== undefined) {
      const { Svg } = $.ui.resolve(e)
      llenado = (
        <Svg
          alt={`Contexto al ${lleno} %`}
          width={30}
          height={8}
          source={`<svg xmlns="http://www.w3.org/2000/svg" width="30" height="8"><rect width="30" height="8" rx="4" fill="#444"/><rect width="${Math.min(100, lleno) * 0.3}" height="8" rx="4" fill="${color}"/></svg>`}
        />
      )
    }

    // «Cierra y archiva»: en la app, una pastilla roja con la letra dentro del dibujo; `textLength` la obliga a caber aunque la
    // app cambie su letra. Encima, un hueco sin letra del ancho de la pastilla: el que recibe el clic.
    const cierre = (await read($, cerrando)) ? 'Sonnet · deshacer' : 'Cierra y archiva'
    let cerrar = <Client key="cerrar" module="./pastilla.tsx" props={{ texto: cierre, fondo: ROJO }} />
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      const ancho = Math.round(cierre.length * 7) + 18
      cerrar = (
        <Box position="relative" flexShrink={0}>
          <Svg
            alt={cierre}
            width={ancho}
            height={22}
            source={`<svg xmlns="http://www.w3.org/2000/svg" width="${ancho}" height="22"><rect width="${ancho}" height="22" rx="6" fill="${ROJO}"/><text x="${ancho / 2}" y="15" text-anchor="middle" textLength="${ancho - 18}" lengthAdjust="spacingAndGlyphs" font-family="-apple-system,BlinkMacSystemFont,Helvetica,sans-serif" font-size="12" font-weight="600" fill="#ffffff">${cierre}</text></svg>`}
          />
          <Box position="absolute" top={0} bottom={0} left={0} right={0}>
            <Client key="cerrar" module="./hueco.tsx" props={{ ancho: '100%', texto: cierre }} />
          </Box>
        </Box>
      )
    }

    // Compactar: en la app, un icono de dos flechas hacia el centro con un hueco encima que recibe el clic; en la terminal, el
    // botón con su nombre. Lanza /compact como si se escribiera (en la app $.session.compact no existe).
    let compactar = <Button key="compactar" label="Compactar" onPress={() => void lanzar($, 'compact')} />
    if (e.surface === 'desktop') {
      const { Svg } = $.ui.resolve(e)
      compactar = (
        <Box position="relative" flexShrink={0}>
          <Svg
            alt="Compactar"
            width={26}
            height={22}
            source={`<svg xmlns="http://www.w3.org/2000/svg" width="26" height="22"><rect width="26" height="22" rx="6" fill="#3a3a3a"/><path d="M19 4.5l-4.5 4.5M14.5 5.5v3.5h3.5M7 17.5l4.5-4.5M11.5 16.5V13H8" fill="none" stroke="#c9c9c9" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`}
          />
          <Box position="absolute" top={0} bottom={0} left={0} right={0}>
            <Client key="compactar" module="./hueco.tsx" props={{ ancho: '100%', texto: 'Compactar' }} />
          </Box>
        </Box>
      )
    }

    const versionNueva = await read($, nueva)

    // Una línea cuando cabe; en un panel angosto baja a otro renglón en vez de cortarse.
    const fila = (
      <Box gap={1} rowGap={1} flexWrap="wrap" alignItems="center">
        {cerrar}
        <Button
          key="estado"
          label="¿En qué vamos?"
          onPress={() => void $.prompt.submit({ text: EN_QUE_VAMOS, asUser: true })}
        />
        {compactar}
        {/* Sin encogerse: en la app el selector es más ancho de lo que mide y se encimaba a lo de al lado. */}
        <Box flexShrink={0}>
          <Select
            key="ventana"
            label="Tope"
            options={OPCIONES}
            value={await read($, ventana)}
            onSelect={async tokens => {
              await $.env.set('CLAUDE_CODE_AUTO_COMPACT_WINDOW', tokens === 'default' ? undefined : tokens)
              await update($, ventana, () => tokens)
              // Se le pregunta al motor, no se supone: el aviso dice lo que de verdad quedó.
              const { breakdown } = (await $.session.usage({ breakdown: 'summary' })).context
              const real = breakdown?.autoCompactThreshold ?? breakdown?.rawMaxTokens
              $.ui.toast(real === undefined ? 'No pude leer la ventana' : `Esta sesión compacta a ${enK(real)}`)
            }}
          />
        </Box>
        {/* Sin encogerse: con la fila llena el número se aplastaba debajo de «Diario». */}
        <Box gap={1} alignItems="center" flexShrink={0}>
          {llenado}
          {context.tokens !== undefined && <Text color={color}>{enK(context.tokens)}</Text>}
        </Box>
        {diario && fecha('diario', 'Diario', diario, 7, 'daily-journal')}
        {diario && fecha('mapping', 'Map', mapping, 31, 'second-brain-mapping')}
        {versionNueva && (
          <Button key="actualizar" variant="primary" label={`Actualizar barra (${versionNueva})`} onPress={() => void actualizar($)} />
        )}
      </Box>
    )

    // Lo que dibuje otro mod en esta misma barra va encima de esta fila, no tapado por ella.
    return (
      <Box flexDirection="column">
        {await next(e)}
        {fila}
      </Box>
    )
  })
}
