import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Los compose que levantan este backend con la imagen del repositorio (P2-3, auditoría
 * 2026-09-29). La imagen de producción BORRA npm (Dockerfile), así que un `npm run` en un compose
 * mata el servicio al arrancar; y sin `worker-outbox` los eventos del ERP no salen nunca.
 */
const root = join(__dirname, '..');
const read = (file: string) => readFileSync(join(root, file), 'utf8');
const STACKS = ['docker-compose.yml', 'docker-compose.dev.yml', 'docker-compose.coolify.yml'];

/** Las órdenes efectivas (`command:` de una línea o de bloque), sin los comentarios. */
function commands(yaml: string): string[] {
  const lines = yaml.split('\n').filter((line) => !line.trim().startsWith('#'));
  const found: string[] = [];
  lines.forEach((line, index) => {
    const match = /^\s*command:\s*(.*)$/.exec(line);
    if (!match) return;
    const inline = match[1]!.trim();
    if (inline && inline !== '>' && inline !== '|') {
      found.push(inline);
      return;
    }
    const indent = /^\s*/.exec(line)![0].length;
    const block: string[] = [];
    for (const next of lines.slice(index + 1)) {
      if (next.trim() && /^\s*/.exec(next)![0].length <= indent) break;
      block.push(next.trim());
    }
    found.push(block.join(' '));
  });
  return found;
}

describe('Compose del ERP', () => {
  it.each(STACKS)('%s no ejecuta npm ni npx (la imagen no los trae)', (file) => {
    const list = commands(read(file));
    expect(list.length).toBeGreaterThan(0);
    list.forEach((command) => expect(command).not.toMatch(/\bnp[mx]\b/));
  });

  it.each(STACKS)('%s levanta el worker del outbox junto a la API', (file) => {
    const yaml = read(file);
    expect(yaml).toMatch(/^ {2}api:/m);
    expect(yaml).toMatch(/^ {2}worker-outbox:/m);
    expect(commands(yaml)).toContain("['node', 'dist/src/workers/outbox/outbox.worker.js']");
  });
});
