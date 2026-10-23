import type { ClientModule } from 'claude-code'

// El botón rojo de la terminal, donde no hay Svg: un texto con fondo que se puede picar.
const Pastilla: ClientModule<{ texto: string; fondo: string }> = ({ texto, fondo }, surface) => {
  surface.onPointer(e => {
    if (e.type === 'down') surface.post(true)
  })
  const { Box, Text } = surface.elements

  return (
    <Box backgroundColor={fondo} paddingX={1}>
      <Text bold color="#ffffff">
        {texto}
      </Text>
    </Box>
  )
}

export default Pastilla
