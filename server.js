'use strict';
// Single-origin relay.
// Serves index.html AND terminates the browser WebSocket on the same port,
// then keeps exactly ONE upstream WebSocket open to TouchDesigner (port 9001).
//
// Why this exists:
//   1. TD sees a single connection no matter how many phones are live.
//   2. Served from its own origin, the page needs no ?wss= parameter, so the
//      public link can be a bare, permanent URL behind a stable hostname.
//   3. One process on one port is all a reverse proxy needs to expose.
//
// Usage:  node server.js
// Env:    PORT, TD_HOST, TD_PORT

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = parseInt(process.env.PORT || '8080', 10);
const TD_HOST = process.env.TD_HOST || '127.0.0.1';
const TD_PORT = parseInt(process.env.TD_PORT || '9001', 10);
const PAGE = path.join(__dirname, 'index.html');

const server = http.createServer((req, res) => {
  const route = req.url.split('?')[0];
  if (route !== '/' && route !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('not found');
  }
  fs.readFile(PAGE, (err, buf) => {
    if (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      return res.end('missing index.html');
    }
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws' });
let td = null;
let relayed = 0;
let live = 0;

function broadcast(msg) {
  for (const c of wss.clients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

function sendTD(line) {
  if (!td || td.readyState !== WebSocket.OPEN) return false;
  td.send(line);
  relayed++;
  if (relayed % 50 === 0) console.log(`[relay] ${relayed} messages forwarded`);
  return true;
}

function flush() {
  if (!td || td.readyState !== WebSocket.OPEN) return;
  for (const c of wss.clients) {
    if (!c._pending || !c._pending.length) continue;
    const queued = c._pending;
    c._pending = [];
    for (const line of queued) sendTD(line);
    console.log(`[relay] flushed ${queued.length} queued to a phone`);
  }
}

function connectTD() {
  const up = new WebSocket(`ws://${TD_HOST}:${TD_PORT}`);
  up.on('open', () => {
    td = up;
    console.log(`[td] connected ${TD_HOST}:${TD_PORT}`);
    flush();
  });
  up.on('message', (data, isBinary) => {
    if (isBinary) return;
    broadcast(data.toString());
  });
  up.on('close', () => {
    td = null;
    console.log('[td] closed, retrying in 1s');
    setTimeout(connectTD, 1000);
  });
  up.on('error', (e) => console.log(`[td] error: ${e.message}`));
}

wss.on('connection', (c) => {
  live++;
  c._pending = [];
  console.log(`[phone] open (${live} live)`);
  const ping = setInterval(() => {
    if (c.readyState !== WebSocket.OPEN) {
      clearInterval(ping);
      return;
    }
    c.ping();
  }, 25000);

  c.on('message', (data, isBinary) => {
    if (isBinary) return;
    if (sendTD(data.toString())) return;
    // TouchDesigner is restarting: hold a few frames instead of dropping them.
    if (c._pending.length < 16) c._pending.push(data.toString());
  });

  c.on('close', () => {
    live--;
    clearInterval(ping);
    console.log(`[phone] close (${live} live)`);
  });
});

server.listen(PORT, () => {
  console.log(`[web] http://127.0.0.1:${PORT}  ->  ws://${TD_HOST}:${TD_PORT}`);
});
connectTD();

process.on('SIGINT', () => {
  console.log('\n[web] bye');
  process.exit(0);
});