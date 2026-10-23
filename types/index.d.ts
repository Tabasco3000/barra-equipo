export type Ventana = string

declare module 'claude-code' {
  interface PluginState {
    // `nueva`: la versión más nueva publicada, si es mayor que la instalada; vacío si no hay.
    'botones-sesion': { ventana: Ventana; cerrando: boolean; nueva: string }
  }
}
