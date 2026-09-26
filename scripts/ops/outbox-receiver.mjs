#!/usr/bin/env node
/**
 * Receptor LOCAL del outbox para ensayos (restore drill y banco de carga). No es un consumidor de
 * producción: cuenta lo que le llega para poder afirmar «tras restaurar, lo ya PUBLISHED no se
 * reenvió» con un número y no con una suposición.
 *
 *   node scripts/ops/outbox-receiver.mjs --port 4599 --secret <OUTBOX_DELIVERY_SIGNING_SECRET> \
 *     [--reject-every 5] [--out entregas.json]
 *
 * - Verifica la firma `x-atlas-signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<cuerpo>")>`
 *   con el cuerpo CRUDO (el mismo contrato que `verifyOutboxSignature`). Firma inválida → 401.
 * - `--reject-every N`: responde 422 (rechazo definitivo → DEAD) a los eventos cuyo `eventKey`
 *   cae en 1 de cada N por hash estable. Sirve para fabricar eventos DEAD de forma determinista.
 * - Responde 2xx a todo lo demás, también a un duplicado (como exige el contrato).
 * - `GET /stats` devuelve el recuento; en SIGTERM/SIGINT lo escribe en `--out` y termina.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { writeFileSync } from 'node:fs';

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2)
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
const PORT = Number(args.get('port') ?? 4599);
const SECRET = args.get('secret') ?? process.env.OUTBOX_DELIVERY_SIGNING_SECRET ?? '';
const REJECT_EVERY = Number(args.get('reject-every') ?? 0);
const OUT = args.get('out') ?? '';

const deliveries = new Map(); // eventKey -> número de entregas
const stats = { requests: 0, accepted: 0, rejected422: 0, badSignature: 0 };

function validSignature(header, raw) {
  if (!SECRET) return true;
  const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(header ?? '');
  if (!match) return false;
  const expected = createHmac('sha256', SECRET).update(`${match[1]}.${raw}`).digest();
  const given = Buffer.from(match[2], 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function rejects(eventKey) {
  if (!REJECT_EVERY) return false;
  return createHash('sha256').update(eventKey).digest()[0] % REJECT_EVERY === 0;
}

function snapshot() {
  const counts = [...deliveries.values()];
  return {
    ...stats,
    distinctEvents: deliveries.size,
    eventsDeliveredMoreThanOnce: counts.filter((n) => n > 1).length,
    eventKeys: [...deliveries.keys()],
  };
}

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/stats') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(snapshot()));
    return;
  }
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    stats.requests += 1;
    const raw = Buffer.concat(chunks).toString('utf8');
    if (!validSignature(req.headers['x-atlas-signature'], raw)) {
      stats.badSignature += 1;
      res.writeHead(401).end();
      return;
    }
    const eventKey = String(req.headers['x-atlas-event-key'] ?? '');
    if (rejects(eventKey)) {
      stats.rejected422 += 1;
      res.writeHead(422).end();
      return;
    }
    deliveries.set(eventKey, (deliveries.get(eventKey) ?? 0) + 1);
    stats.accepted += 1;
    res.writeHead(204).end();
  });
});

function finish() {
  if (OUT) writeFileSync(OUT, `${JSON.stringify(snapshot(), null, 2)}\n`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}
process.on('SIGTERM', finish);
process.on('SIGINT', finish);
server.listen(PORT, '127.0.0.1', () => console.log(`receptor del outbox en 127.0.0.1:${PORT}`));
