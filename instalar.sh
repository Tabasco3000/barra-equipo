#!/bin/bash
# Instala o actualiza la barra de sesión del equipo (mod botones-sesion de Claude Code) en esta Mac.
#   curl -fsSL https://raw.githubusercontent.com/Tabasco3000/barra-equipo/master/instalar.sh | bash
# Busca la barra donde ya está (CLAUDE_CODE_PLUGIN_DIRS en ~/.claude/settings.json); si no hay, la pone en el cerebro
# (VAULT_ROOT). Antes de reemplazar guarda la versión anterior en ~/.claude/respaldos/.
set -euo pipefail
# Todo va dentro de main y se llama en la última línea: si la descarga llega cortada, no corre nada a medias.
falla() { echo "✗ $*" >&2; exit 1; }
main() {
# El repo entero en un zip (GitHub); de ahí se toman solo las piezas de la barra.
ZIP="${BARRA_ZIP:-https://github.com/Tabasco3000/barra-equipo/archive/refs/heads/master.zip}"
AJUSTES="$HOME/.claude/settings.json"

[ -f "$AJUSTES" ] || falla "No encontré $AJUSTES: ¿está instalado Claude Code?"
# plutil escribe su error en la salida normal cuando la clave no existe: solo vale lo que da con éxito.
leer() { local valor; valor="$(plutil -extract "$1" raw -o - "$AJUSTES" 2>/dev/null)" && printf '%s' "$valor" || true; }

# Primero se baja y se revisa; los ajustes y la barra se tocan solo si lo que bajó es la barra.
TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT
curl -fsSL "$ZIP" -o "$TEMPORAL/repo.zip" || falla "No pude bajar la barra de $ZIP"
mkdir "$TEMPORAL/repo" "$TEMPORAL/nueva"
unzip -q "$TEMPORAL/repo.zip" -d "$TEMPORAL/repo"
RAIZ="$(find "$TEMPORAL/repo" -mindepth 1 -maxdepth 1 -type d | head -1)"
[ -n "$RAIZ" ] || falla "Lo que bajé viene vacío."
for pieza in .claude-plugin/plugin.json hooks types/index.d.ts tsconfig.json .gitignore; do
  [ -e "$RAIZ/$pieza" ] || continue
  mkdir -p "$TEMPORAL/nueva/$(dirname "$pieza")"
  cp -R "$RAIZ/$pieza" "$TEMPORAL/nueva/$pieza"
done
grep -q '"name": "botones-sesion"' "$TEMPORAL/nueva/.claude-plugin/plugin.json" 2>/dev/null || falla "Lo que bajé no es la barra."
[ -f "$TEMPORAL/nueva/hooks/register.tsx" ] && [ -f "$TEMPORAL/nueva/hooks/hooks.json" ] || falla "Lo que bajé viene incompleto."
VERSION="$(grep -o '"version": "[^"]*"' "$TEMPORAL/nueva/.claude-plugin/plugin.json" | cut -d'"' -f4)"

CARPETAS="$(leer env.CLAUDE_CODE_PLUGIN_DIRS)"
DESTINO=""
IFS=':' read -r -a LISTA <<< "$CARPETAS"
for carpeta in "${LISTA[@]:-}"; do
  case "$carpeta" in /*) ;; *) continue ;; esac   # solo rutas completas
  [ "$(basename "${carpeta%/}")" = "botones-sesion" ] && DESTINO="${carpeta%/}" && break
done
# Si ya hay una carpeta, tiene que ser esta barra: nunca se escribe encima de otra cosa.
if [ -n "$DESTINO" ] && [ -e "$DESTINO" ] && ! grep -q '"name": "botones-sesion"' "$DESTINO/.claude-plugin/plugin.json" 2>/dev/null; then
  falla "$DESTINO no es la barra: no la toco."
fi
# plutil no puede escribir env.X si no existe env.
ponerEnv() {
  plutil -extract env raw -o - "$AJUSTES" >/dev/null 2>&1 || plutil -extract env json -o - "$AJUSTES" >/dev/null 2>&1 || plutil -insert env -dictionary "$AJUSTES"
  plutil -replace "env.$1" -string "$2" "$AJUSTES"
}
RESPALDO_AJUSTES="$AJUSTES.bak-barra"
if [ -z "$DESTINO" ]; then
  CEREBRO="$(leer env.VAULT_ROOT)"
  case "$CEREBRO" in /*) ;; *) CEREBRO="" ;; esac
  [ -n "$CEREBRO" ] || falla "No sé dónde va la barra: no hay botones-sesion en CLAUDE_CODE_PLUGIN_DIRS ni VAULT_ROOT en $AJUSTES."
  DESTINO="$CEREBRO/⚙️ Meta/mods/botones-sesion"
  NUEVAS="${CARPETAS:+$CARPETAS:}$DESTINO"
  cp "$AJUSTES" "$RESPALDO_AJUSTES"
  ponerEnv CLAUDE_CODE_PLUGIN_DIRS "$NUEVAS"
fi
# Que la barra se recargue sola al actualizarse, sin abrir sesión nueva.
if [ "$(leer env.CLAUDE_CODE_PLUGIN_DIR_WATCH)" != "1" ]; then
  cp "$AJUSTES" "$RESPALDO_AJUSTES"
  ponerEnv CLAUDE_CODE_PLUGIN_DIR_WATCH 1
fi

if [ -d "$DESTINO" ]; then
  RESPALDO="$HOME/.claude/respaldos/botones-sesion-$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$(dirname "$RESPALDO")"
  cp -R "$DESTINO" "$RESPALDO"
  ls -1d "$HOME/.claude/respaldos/botones-sesion-"* 2>/dev/null | sort -r | tail -n +4 | while read -r viejo; do rm -rf "$viejo"; done || true
fi
mkdir -p "$DESTINO"
# Solo se reemplazan las piezas de la barra (hooks/ entera, para que no queden archivos viejos); lo demás de la carpeta,
# como los tipos que escribe Claude Code en .claude-plugin/types/, se queda.
rm -rf "$DESTINO/hooks"
rsync -a "$TEMPORAL/nueva/" "$DESTINO/"
echo "✓ Barra $VERSION instalada en $DESTINO"
[ -n "${RESPALDO:-}" ] && echo "  (la anterior quedó en $RESPALDO)"
echo "  Si no la ves cambiar en un momento, abre una sesión nueva de Claude."
}
main "$@"
