import type { ClientModule } from 'claude-code'

type Letra = { texto: string; color: string; fuerte: boolean }

// Un texto de color que se puede picar. Va pintado encima de un botón, porque la app no deja colorear los suyos.
// `fuerte` lo pone en negrita y le da aire a los lados, para que el clic agarre casi todo el botón de abajo.
const Letra: ClientModule<Letra> = ({ texto, color, fuerte }, surface) => {
  surface.onPointer(e => {
    if (e.type === 'down') surface.post(true)
  })
  const { Box, Text } = surface.elements

  return (
    <Box paddingX={fuerte ? 1 : 0}>
      <Text bold={fuerte} color={color}>
        {texto}
      </Text>
    </Box>
  )
}

export default Letra
