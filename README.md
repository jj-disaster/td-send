# Send → TouchDesigner

Audience members type text or a number on their phone; it lands in TouchDesigner in
real time. No build step, no npm, no framework, no backend.

Live at **https://jj-disaster.github.io/td-send/**

```
phone browser ──wss://──▶ cloudflared ──▶ localhost:9001 ──▶ TouchDesigner
      ▲                     (TLS here)      (Web Server DAT :9001)
      └── index.html on GitHub Pages (https)
```

Without the tunnel the page talks straight to TouchDesigner over `ws://`, which is
the fastest path and the one to use when you're on the same network as the
laptop running TD.

## Show day: GitHub Pages

GitHub Pages is https-only, and browsers refuse to open a `ws://` connection from
an https page. The Web Server DAT can do TLS, but not with a certificate phones
trust, so something has to terminate TLS in the middle. Cloudflare's free tunnel
does it in one command:

```bash
cloudflared tunnel --url http://localhost:9001
```

It prints a hostname like `https://something.trycloudflare.com`. Share the page
with that hostname attached:

```
https://jj-disaster.github.io/td-send/?wss=something.trycloudflare.com
```

`?wss=` switches the client to `wss://` on port 443. The hostname is random and
changes every run, so build the share link after starting the tunnel. Pin guests
to the venue wifi SSID — cellular traffic will not reach the tunnel reliably.

## Local fast path (no tunnel, lowest latency)

Same page, served over http so `ws://` is allowed:

```bash
python3 -m http.server 8080
```

Then share `http://<laptop-ip>:8080`. Find the IP with `ipconfig getifaddr en0`.
Works with the real TD directly, no cloudflared in the loop.

## TouchDesigner setup

Use the **Web Server DAT** — not the WebSocket DAT. The WebSocket DAT is a
*client* only ("the network address of the server computer"), so it can never
receive from a browser. The Web Server DAT is the one that listens.

1. `Tab` → **DAT** → **Web Server**. Set:
   - **Active** → on
   - **Port** → `9001` (or share the page with `?p=9980` etc.)
   - **Local Address** → leave blank to listen on all interfaces
2. Create a **Text DAT** (e.g. `callbacks1`) and paste the contents of
   [`touchdesigner/callbacks.py`](touchdesigner/callbacks.py) into it.
3. Point the Web Server DAT's **Callbacks DAT** parameter at that Text DAT.

The status pill turns green when the browser's connection lands. Every send then
prints `recv: num 0.82 3f9a2` to TD's Python console, which is the fastest way
to confirm the whole path works.

There is no server/client mode switch to find: the Web Server DAT is always a
server. That's also why an https page needs TLS somewhere in the middle — see
the GitHub Pages section above.

### Optional: wire it to visuals

Create a CHOP (e.g. `in`) in **Channel** mode with channels `num`, `txt`, `uid`,
and the callbacks will fill it in. `num` is clamped to ±1000 again inside TD, so
a malicious client can't blow up your network. `txt` also lands in a Text DAT
called `lastmsg` if you want the string on its own.

Useful members on the Web Server DAT:

- `webSocketConnections` — list of connected client addresses, e.g. `192.168.1.10:65432`
- `webSocketSendText(client, data)` — send a string back to one phone
- `webSocketClose(client)` — kick a client off

An Info CHOP on the Web Server DAT gives you `server_running` and
`websocket_connections` channels if you want to show connection count on stage.

### HTTPS directly from TD

The Web Server DAT has a **Secure (TLS)** page: turn it on and give it a private
key and certificate, then connect with `wss://host:port`. The certificate has to
be trusted by phones, so you need a real domain and a Let's Encrypt cert — a
self-signed one will just produce a browser certificate error. For a show on
untrusted wifi, the free Cloudflare tunnel is less setup.

## Wire protocol

One text frame per send, tab separated, newline terminated:

```
num\t0.82\t3f9a2      number, clamped
txt\thello world\t3f9a2   text, tabs/newlines stripped, 120 chars max
```

`3f9a2` is a random per-visitor id so you can tell senders apart. One field in,
one field out: the smallest thing TouchDesigner can parse without a JSON library.

## Guardrails

Built into the client so one enthusiastic person can't flood the show:

| param | default | what it does |
| --- | --- | --- |
| `?rate=` | 8 | messages per second per visitor |
| `?burst=` | 3 | token bucket depth |
| `?min=` `?max=` | -1000 / 1000 | number clamp |

Clamp again inside TouchDesigner — never trust the client on stage.

## If it breaks on show

- **Pill stays red** — TD isn't listening on 9001, or macOS firewall is blocking
  it. Test from a laptop first, then let the phone join.
- **Works on laptop, not phones** — wrong IP, or the phone is on cellular
  instead of venue wifi. Pin guests to the venue SSID.
- **Pages page says `blocked: needs a wss tunnel`** — you forgot the `?wss=` or
  the tunnel died. A quick tunnel's hostname changes every restart, so re-copy
  the share link each time.
- **Nothing prints in TD but the pill is green** — the Callbacks DAT parameter is
  pointing at the wrong DAT, or the Text DAT's language isn't Python.
- **Pill green on laptop, red on phones** — the laptop is on the same machine as
  TD so it can hit `localhost`; phones need the LAN IP. Share `http://<laptop-ip>:8080`,
  not `localhost`.
- **TD's Web Server DAT gets flaky under load** — put a ~25-line Node relay in
  the middle (bridges `ws://127.0.0.1:9001`) so TD holds one connection instead
  of hundreds. Only add this if the direct path actually misbehaves in rehearsal.

## Files

- `index.html` — UI + client. The whole thing.
- `touchdesigner/callbacks.py` — paste into a Text DAT, point the Web Server DAT at it.