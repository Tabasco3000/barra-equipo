#!/bin/bash
# Antes de subir una versión: que coincidan las versiones, que «Qué cambió» la traiga y que pasen las pruebas.
# Publicar es solo `git push`: las Macs consultan version.txt en GitHub.
set -euo pipefail
cd "$(dirname "$0")"
EN_PLUGIN="$(grep -o '"version": "[^"]*"' .claude-plugin/plugin.json | cut -d'"' -f4)"
EN_CODIGO="$(grep -o "^export const VERSION = '[^']*'" hooks/register.tsx | cut -d"'" -f2)"
[ "$EN_PLUGIN" = "$EN_CODIGO" ] && [ "$EN_PLUGIN" = "$(cat version.txt)" ] || { echo "✗ Versiones distintas: plugin.json $EN_PLUGIN, register.tsx $EN_CODIGO, version.txt $(cat version.txt)"; exit 1; }
grep -q "^## $EN_PLUGIN " CAMBIOS.md || { echo "✗ CAMBIOS.md no trae la $EN_PLUGIN"; exit 1; }
claude plugin test . 2>&1 | grep -q ' 0 fail' || { echo "✗ Las pruebas de la barra no pasan"; exit 1; }
bash prueba-instalar.sh >/dev/null 2>&1 || { echo "✗ La prueba del instalador no pasa"; exit 1; }
echo "✓ Versión $EN_PLUGIN lista: git push"
