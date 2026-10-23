#!/bin/bash
# Prueba instalar.sh en Macs falsas (HOME temporal) contra un servidor local con lo que se publica.
set -euo pipefail
cd "$(dirname "$0")"
RAIZ="$(mktemp -d)"
trap 'kill $SERVIDOR 2>/dev/null; rm -rf "$RAIZ"' EXIT
mkdir -p "$RAIZ/sitio"
# Como lo da GitHub: el repo entero dentro de una carpeta «barra-equipo-master».
mkdir -p "$RAIZ/repo/barra-equipo-master"
rsync -a --exclude .git --exclude dist ./ "$RAIZ/repo/barra-equipo-master/"
(cd "$RAIZ/repo" && zip -qr "$RAIZ/sitio/barra.zip" barra-equipo-master)
PUERTO=$((20000 + RANDOM % 20000))
(cd "$RAIZ/sitio" && exec python3 -m http.server "$PUERTO" --bind 127.0.0.1 >/dev/null 2>&1) &
SERVIDOR=$!
for _ in $(seq 50); do curl -fs "http://127.0.0.1:$PUERTO/barra.zip" -o /dev/null && break; sleep 0.1; done
export BARRA_ZIP="http://127.0.0.1:$PUERTO/barra.zip"
VERSION="$(grep -o '"version": "[^"]*"' .claude-plugin/plugin.json | cut -d'"' -f4)"
mal() { echo "✗ $*"; exit 1; }

# 1) Una Mac con la barra vieja: la barra vieja ya está en su cerebro (con espacios y emoji en la ruta) y otras cosas en sus ajustes.
H="$RAIZ/vieja"; BARRA="$H/MI CEREBRO/⚙️ Meta/mods/botones-sesion"
mkdir -p "$H/.claude" "$BARRA/hooks" "$BARRA/.claude-plugin/types/claude-code"
echo '{ "name": "botones-sesion", "version": "0.1.0" }' > "$BARRA/.claude-plugin/plugin.json"
echo 'vieja' > "$BARRA/hooks/register.tsx"; echo 'sobra' > "$BARRA/hooks/viejo.tsx"; echo 'tipos' > "$BARRA/.claude-plugin/types/claude-code/index.d.ts"
cat > "$H/.claude/settings.json" <<JSON
{ "env": { "CLAUDE_CODE_PLUGIN_DIRS": "$BARRA:/otra/carpeta", "VAULT_ROOT": "$H/MI CEREBRO" }, "model": "opus", "hooks": { "Stop": [] } }
JSON
HOME="$H" bash instalar.sh >/dev/null
grep -q "\"version\": \"$VERSION\"" "$BARRA/.claude-plugin/plugin.json" || mal "Vieja: no quedó la versión $VERSION"
grep -q "export const VERSION = '$VERSION'" "$BARRA/hooks/register.tsx" || mal "Vieja: register.tsx no es el nuevo"
[ ! -e "$BARRA/hooks/viejo.tsx" ] || mal "Vieja: quedó un archivo viejo"
[ "$(cat "$BARRA/.claude-plugin/types/claude-code/index.d.ts")" = "tipos" ] || mal "Vieja: borró los tipos del motor"
ls "$H/.claude/respaldos/" | grep -q '^botones-sesion-' || mal "Vieja: no guardó respaldo"
[ "$(plutil -extract env.CLAUDE_CODE_PLUGIN_DIR_WATCH raw -o - "$H/.claude/settings.json")" = "1" ] || mal "Vieja: no prendió la recarga"
[ "$(plutil -extract model raw -o - "$H/.claude/settings.json")" = "opus" ] || mal "Vieja: se perdieron sus ajustes"
[ "$(plutil -extract env.CLAUDE_CODE_PLUGIN_DIRS raw -o - "$H/.claude/settings.json")" = "$BARRA:/otra/carpeta" ] || mal "Vieja: cambió sus carpetas"
python3 -c "import json,sys; json.load(open(sys.argv[1]))" "$H/.claude/settings.json" || mal "Vieja: settings.json ya no es JSON"
# Correrlo otra vez (el botón «Actualizar barra») no rompe nada.
HOME="$H" bash instalar.sh >/dev/null || mal "Vieja: la segunda vez falló"

# 2) Mac nueva: sin barra, con VAULT_ROOT. La pone en el cerebro y la agrega a CLAUDE_CODE_PLUGIN_DIRS.
H="$RAIZ/nueva"; mkdir -p "$H/.claude"
echo "{ \"env\": { \"VAULT_ROOT\": \"$H/cerebro\" } }" > "$H/.claude/settings.json"
HOME="$H" bash instalar.sh >/dev/null
[ -f "$H/cerebro/⚙️ Meta/mods/botones-sesion/hooks/register.tsx" ] || mal "Nueva: no instaló"
[ "$(plutil -extract env.CLAUDE_CODE_PLUGIN_DIRS raw -o - "$H/.claude/settings.json")" = "$H/cerebro/⚙️ Meta/mods/botones-sesion" ] || mal "Nueva: no la agregó a CLAUDE_CODE_PLUGIN_DIRS"

# 2b) Ajustes sin «env»: lo crea.
H="$RAIZ/sinenv"; mkdir -p "$H/.claude"
echo '{ "model": "opus" }' > "$H/.claude/settings.json"
HOME="$H" bash instalar.sh >/dev/null 2>&1 && mal "Sin env ni VAULT_ROOT: debió negarse" || true
echo "{ \"model\": \"opus\", \"env\": { \"VAULT_ROOT\": \"$H/cerebro\" } }" > "$H/.claude/settings.json"
plutil -remove env.VAULT_ROOT "$H/.claude/settings.json"; plutil -replace env -dictionary "$H/.claude/settings.json"
plutil -insert env.VAULT_ROOT -string "$H/cerebro" "$H/.claude/settings.json"
HOME="$H" bash instalar.sh >/dev/null || mal "Con env: falló"
[ "$(plutil -extract env.CLAUDE_CODE_PLUGIN_DIR_WATCH raw -o - "$H/.claude/settings.json")" = "1" ] || mal "Con env: no prendió la recarga"

# 2c) Una carpeta botones-sesion que no es la barra: no la toca.
H="$RAIZ/ajena"; OTRA="$H/cosas/botones-sesion"; mkdir -p "$H/.claude" "$OTRA"; echo 'mío' > "$OTRA/notas.md"
echo "{ \"env\": { \"CLAUDE_CODE_PLUGIN_DIRS\": \"$OTRA\" } }" > "$H/.claude/settings.json"
if HOME="$H" bash instalar.sh >/dev/null 2>&1; then mal "Carpeta ajena: debió negarse"; fi
[ "$(ls "$OTRA")" = "notas.md" ] || mal "Carpeta ajena: la tocó"

# 2d) Lo que no es de la barra en su carpeta se queda (un ESTADO.md), y solo guarda los últimos 3 respaldos.
H="$RAIZ/vieja"; echo 'apuntes' > "$BARRA/ESTADO.md"
for _ in 1 2 3 4; do HOME="$H" bash instalar.sh >/dev/null; sleep 1; done
[ -f "$BARRA/ESTADO.md" ] || mal "Vieja: borró su ESTADO.md"
[ "$(ls -1d "$H/.claude/respaldos/botones-sesion-"* | wc -l | tr -d ' ')" = "3" ] || mal "Vieja: no podó los respaldos"

# 3) Sin barra ni VAULT_ROOT: se niega y no toca nada.
H="$RAIZ/sin"; mkdir -p "$H/.claude"; echo '{ "model": "opus" }' > "$H/.claude/settings.json"
if HOME="$H" bash instalar.sh >/dev/null 2>&1; then mal "Sin cerebro: debió negarse"; fi
[ "$(cat "$H/.claude/settings.json")" = '{ "model": "opus" }' ] || mal "Sin cerebro: tocó sus ajustes"

# 4) Lo que baja viene incompleto (sin hooks) o no es la barra: se niega y no toca la instalada.
(cd "$RAIZ" && rm -rf incompleto && mkdir -p incompleto/barra-equipo-master/.claude-plugin && cp "$OLDPWD/.claude-plugin/plugin.json" incompleto/barra-equipo-master/.claude-plugin/ && cd incompleto && rm -f ../sitio/barra.zip && zip -qr ../sitio/barra.zip barra-equipo-master)
if HOME="$RAIZ/vieja" bash instalar.sh >/dev/null 2>&1; then mal "Zip sin hooks: debió negarse"; fi
grep -q "export const VERSION = '$VERSION'" "$BARRA/hooks/register.tsx" || mal "Zip sin hooks: tocó la barra instalada"
echo 'no soy un zip' > "$RAIZ/sitio/barra.zip"
H="$RAIZ/vieja"
if HOME="$H" bash instalar.sh >/dev/null 2>&1; then mal "Zip roto: debió negarse"; fi
grep -q "export const VERSION = '$VERSION'" "$BARRA/hooks/register.tsx" || mal "Zip roto: tocó la barra instalada"

echo "✓ instalar.sh: 8 casos bien"
