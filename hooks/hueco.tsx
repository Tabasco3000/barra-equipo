import type { ClientModule } from 'claude-code'

// Un hueco sin letra que se puede picar. Va encima de un dibujo (el micrófono): la app no deja picar un Svg, y un texto
// «en blanco» (braille) se veía como puntitos encima del dibujo.
const Hueco: ClientModule<{ ancho: number | string; texto?: string }> = ({ ancho }, surface) => {
  surface.onPointer(e => {
    if (e.type === 'down') surface.post(true)
  })
  const { Box } = surface.elements

  return <Box width={ancho} height={1} />
}

export default Hueco
