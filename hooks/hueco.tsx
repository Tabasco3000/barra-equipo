import type { ClientModule } from 'claude-code'

// La capa sin letra que va encima de un dibujo (la pastilla de cierre, el micrófono, compactar, la fecha roja): la app no deja
// picar un Svg. Mide lo mismo que el dibujo (el Client va con width y height al 100 %) y le avisa a la barra cuando el puntero
// entra, sale, aprieta y suelta, para que el dibujo se ilumine como los botones de la app. El clic cuenta al soltar adentro.
// (23-oct-2026: la capa no tomaba el tamaño del dibujo y el clic no llegaba.)
const Hueco: ClientModule<{ texto?: string }> = (_, surface) => {
  surface.onPointer(e => {
    if (e.type === 'enter') surface.post({ encima: true })
    if (e.type === 'leave') surface.post({ encima: false })
    if (e.type === 'down') surface.post({ apretado: true })
    if (e.type === 'up') {
      const adentro = e.x >= 0 && e.y >= 0 && e.x < surface.columns && e.y < surface.rows
      surface.post({ apretado: false, clic: adentro })
    }
  })
  const { Box } = surface.elements

  return <Box width="100%" height="100%" />
}

export default Hueco
