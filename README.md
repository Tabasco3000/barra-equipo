# Barra de sesión

Mod de Claude Code (`botones-sesion`): una barra arriba del prompt con «Cierra y archiva», «¿En qué vamos?», compactar, tope de compactación, contexto usado, último diario y último mapa del cerebro. Busca sola el diario (`📓 Diarios` o `📓 Journals`, meses en español o en inglés).

## Instalar o actualizar
```bash
curl -fsSL https://raw.githubusercontent.com/Tabasco3000/barra-equipo/master/instalar.sh | bash
```
Busca la barra en `CLAUDE_CODE_PLUGIN_DIRS` de `~/.claude/settings.json`; si no está, la pone en el cerebro (`VAULT_ROOT`). Guarda la anterior en `~/.claude/respaldos/`.

Después ya no hace falta: al abrir cada sesión la barra consulta `version.txt` una vez y, si hay versión nueva, sale el botón «Actualizar barra».

## Subir una versión
Sube el número en `.claude-plugin/plugin.json`, en `VERSION` de `hooks/register.tsx` y en `version.txt`, escribe `CAMBIOS.md`, corre `bash revisar.sh` y `git push`.
