# Send → TouchDesigner (Alter / Index)

Audience members tap through a 3-step menu on their phone; each choice lands
in TouchDesigner in real time. UI transported from Figma Make
`Animated Section Menu.make`. No build step, no framework. The page itself is a
single file; the optional relay adds one npm dependency.

Live at **https://jj-disaster.github.io/td-send/**

```
phone browser ──wss://──▶ relay (server.js, TLS via funnel/tunnel) ──▶ localhost:9001 ──▶ TD
                                    ▲ one upstream socket               ▲ (Web Server DAT :9001)
                                    └── index.html served from same origin
```

Without any tunnel the page talks straight to TouchDesigner over `ws://`, which is
the fastest path and the one to use when you're on the same network as the
laptop running TD.

## UI

Three pages, arrows on both sides of the header:

- `01 WHICH ONE?` — slider `01–50` (`[ 1 ]` readout), selects the number
- `02 ACTION` — `FOLLOW / COMPLETE / RESIST`, tap to select (highlighted)
- `03 TIME` — `STILL / REPEAT / MOVE` + `SEND` → transmits the full path
  (slider as `num`, action + time as `txt`, one frame each)

Tapping a choice only selects it (persistent highlight, kept across page
visits). Nothing is sent until `SEND` on page 3. Arrows, ←/→ keys,
`1/2/3` shortcuts, and swipe navigate with a 720ms slide/blur transition
(swipes starting on controls are ignored so slider drags never flip pages).
All controls disable while offline; the status line shows
`live / reconnecting / blocked: needs a wss tunnel`.

## Show day: the relay + a stable hostname

`server.js` serves the page **and** terminates the phone WebSockets on one port,
then holds a single upstream socket to TouchDesigner. Three things fall out of
that:

- TD sees **one** connection no matter how many phones are live.
- Served from its own origin, the page needs **no `?wss=` parameter**.
- One port is all a reverse proxy needs to expose, so the public link can be a
  bare, permanent URL.

```bash
npm install
node server.js          # http://<laptop-ip>:8080
```

### Stable link, no domain to buy: Tailscale Funnel

Cloudflare's *named* tunnel needs "a domain on Cloudflare (required to publish
applications)". Tailscale Funnel hands you a predictable hostname instead
(`<machine>.<tailnet>.ts.net`) on any plan, so the link survives restarts:

```bash
brew install tailscale
tailscale up             # browser login, once
tailscale funnel 8080    # prints your permanent https URL
node server.js
```

Share the printed hostname with nothing appended — no `?wss=`. The certificate
is provisioned automatically. Restarting TD, the relay, or the laptop does not
change the URL; only `tailscale funnel reset` does.

Note: Funnel only listens on 443/8443/10000 and proxies to `127.0.0.1`, which is
why the relay binds locally. Also, Funnel strips query parameters from the
WebSocket URL — harmless here, because the page sends none.

## Alternative: keep Pages, point it at a stable tunnel

Skip the relay and give the TD socket a stable host instead. Page stays on Pages:

```
https://jj-disaster.github.io/td-send/?wss=<machine>.<tailnet>.ts.net
```

Works because `?wss=` still switches the client to `wss://` on 443. Simpler, but
every phone still opens its own connection to TouchDesigner.

## Legacy: quick tunnel (hostname changes every run)

Fallback only, because the hostname is random and must be pasted into the share
link each time:

```bash
cloudflared tunnel --url http://localhost:9001
```

```
https://jj-disaster.github.io/td-send/?wss=something.trycloudflare.com
```

## Local fast path (no tunnel, lowest latency)

Serve over http so `ws://` is allowed, no tunnel in the loop:

```bash
node server.js           # or: python3 -m http.server 8080
```

Then share `http://<laptop-ip>:8080`. Find the IP with `ipconfig getifaddr en0`.
If you use `python3 -m http.server`, add `?wss=`-free routing with
`?h=<laptop-ip>&p=9001`, or run the relay so the page finds `/ws` itself.

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
- **TD's Web Server DAT gets flaky under load** — this is what `server.js` is for.
  It bridges `ws://127.0.0.1:9001` so TD holds one connection instead of hundreds,
  and it buffers up to 16 frames per phone while TD restarts instead of dropping
  them.
- **Link changed after a restart** — a quick tunnel hostname. Run
  `tailscale funnel status` and re-open your permanent URL, or re-copy the
  `?wss=` hostname from the tunnel output.

## Files

- `index.html` — UI + client. The whole thing (single file, Figma design inlined).
- `server.js` — optional single-origin relay: serves the page, terminates phone
  sockets, keeps one upstream connection to TD. `npm install && node server.js`.
- `package.json` — declares the single dependency (`ws`).
- `DESIGN.md` — design language for the page. Read before changing the UI.
- `Animated Section Menu.make` — original Figma Make source (code in `make_repos/*.zip`, design in `canvas.fig`).
- `touchdesigner/callbacks.py` — paste into a Text DAT, point the Web Server DAT at it.
