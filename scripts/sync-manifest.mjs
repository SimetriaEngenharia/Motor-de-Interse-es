#!/usr/bin/env node
/* Regenera app/manifest.json a partir de app/src.
 *
 * Por que existe: o Omelette roda o app sem build, compilando os fontes no
 * navegador (app/loader.js). O navegador não sabe listar diretórios, então o
 * loader precisa da lista de arquivos pronta. O Vite não precisa dela.
 *
 * REGRA: criou, renomeou ou apagou arquivo em app/src? Rode `npm run sync`.
 * (dev e build já rodam sozinhos.)
 */
import { readdirSync, statSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const base = join(raiz, 'app');
const src = join(base, 'src');
const EXT = /\.(tsx|ts|jsx|js|css)$/;

function varrer(dir) {
  return readdirSync(dir).flatMap((nome) => {
    const p = join(dir, nome);
    if (statSync(p).isDirectory()) return varrer(p);
    if (!EXT.test(nome) || nome.endsWith('.d.ts')) return [];
    return [relative(base, p).split('\\').join('/')];
  });
}

const lista = varrer(src).sort();
const destino = join(base, 'manifest.json');
const anterior = (() => { try { return readFileSync(destino, 'utf8'); } catch { return ''; } })();
const novo = JSON.stringify(lista);
if (anterior === novo) {
  console.log('manifest.json em dia (' + lista.length + ' arquivos)');
} else {
  writeFileSync(destino, novo);
  console.log('manifest.json atualizado: ' + lista.length + ' arquivos');
}
