# AGENTS.md

Operating notes for coding agents working on this repo. The human runs a live
performance; you are preparing their show-day path. Read this before touching
anything.

## What this is

`index.html` is a single-file mobile page. An audience member answers three
questions (which one → what should it do → what happens to it) and one `SEND`
emits **one** frame to TouchDesigner. `server.js` relays that frame. There is no
build step, no framework, and nothing to compile.

## Hard rules

1. **Never let a public route outlive its test.** Two tunnels previously pointed
   at the same TouchDesigner port. If you start a tunnel, verify it, then stop
   every other route into `:9001`.
2. **Don't invent TouchDesigner APIs.** The Web Server DAT callback signature
   is exact and verified. Guessing here has already produced one wrong operator
   name in this project's history (WebSocket DAT has no server mode).
3. **Test the wire format, don't eyeball it.** Every change to what the page
   sends needs a round-trip test through the real callback code.
4. **One frame per send.** Do not "improve" this by splitting the bundle into
   multiple frames; the whole point of `bundle` is atomicity.
5. **Design changes go through `DESIGN.md` first.** It is the source of truth
   for appearance; update it, then the code, never the reverse.

## Startup walkthrough

The relay and TouchDesigner are separate processes. TD must be running first.

### 1. TouchDesigner

The human opens the project. Verify the operator exists and is configured:

- `Tab` → **DAT** → **Web Server**, named `in` if the callbacks reference it
- `Active` on, port `9001`, `Local Address` blank (all interfaces)
- `Callbacks DAT` → the Text DAT holding `touchdesigner/callbacks.py`
- That Text DAT's language must be **Python**, not Python3
- The CHOP named `in` needs channels `value` and `uid` created in advance

Check it's listening:

```bash
lsof -nP -iTCP:9001 -sTCP:LISTEN
```

If nothing is listed, TD is closed or the DAT is inactive. Do not start a
tunnel yet.

### 2. Relay

```bash
cd /Users/jj/Desktop/vibecoding/zzwebsite
npm install          # first time only; single dep (ws)
node server.js
```

Expected output, both lines:

```
[web] http://127.0.0.1:8080  ->  ws://127.0.0.1:9001
[td] connected 127.0.0.1:9001
```

`[td] error: connect ECONNREFUSED` means TouchDesigner isn't up. The relay
retries every second, so you can start it first and leave it.

If you see `EADDRINUSE :::8080`, something else holds the port. Check before
killing anything:

```bash
lsof -nP -iTCP:8080 -sTCP:LISTEN
```

### 3. Local check before exposing anything

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/    # 200
```

Then confirm a bundle actually reaches TD:

```bash
node -e "
const {WebSocket}=require('./node_modules/ws');
const c=new WebSocket('ws://localhost:8080/ws');
c.on('open',()=>c.send('bundle\tvalue=7;action=FOLLOW;time=STILL;uid=ab12c'));
setTimeout(()=>process.exit(0),1200);
"
```

The TD console must print:

```
recv: bundle {'value': '7', 'action': 'FOLLOW', 'time': 'STILL', 'uid': 'ab12c'}
```

No TD console, no proceeding. This is the single most important check in the
document: the relay accepting a socket proves nothing about TD.

### 4. Public link (optional)

The permanent URL is `https://mac.tail38622e.ts.net`, served through Tailscale
Funnel. It needs no `?wss=` parameter because the page comes from the same
origin as the socket.

`brew install tailscale` gives CLI only, so the daemon needs a writable socket:

```bash
tailscaled --tun=userspace-networking \
  --socket=$HOME/.local/share/tailscale/tailscaled.sock \
  --state=$HOME/.local/share/tailscale/tailscaled.state --port=0 &

tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock funnel status
```

`No serve config` after a reboot is expected until you re-run:

```bash
tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock funnel --bg 8080
```

**Do not treat a TLS failure as a real failure immediately.** The first minute
after Funnel is enabled, ACME is still issuing the certificate:

```
cert("mac.tail38622e.ts.net"): starting SetDNS call for _acme-challenge...
cert("mac.tail38622e.ts.net"): got cert
```

`got cert` appears ~35s in. Requests before that fail with
`SSL_ERROR_SYSCALL`. Wait for `got cert` in the daemon log, then retest. Also
allow 20–30s of retries on the `wss://` handshake after that; the first
successful attempt can still slip.

Verify through the public URL, not the local one:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://mac.tail38622e.ts.net/   # 200
```

Then the same bundle test against `wss://mac.tail38622e.ts.net/ws`, run it
three times. A single failure right after provisioning is not conclusive.

Stop competing routes once the funnel works:

```bash
pgrep -fl cloudflared     # legacy quick tunnel, safe to kill when funnel is good
```

## Helping the user set up TouchDesigner

You cannot install TouchDesigner operators for them. Give exact clicks, one
step at a time, and wait for confirmation. Do not mark TD setup done on the
strength of your own socket test.

### The callback

They paste the whole of `touchdesigner/callbacks.py` into a Text DAT
(`Tab` → **DAT** → **Text**), then point the Web Server DAT's `Callbacks DAT`
parameter at it. Set that Text DAT's language to **Python**.

Explain what each target is, so they can create or skip them:

| Target | Kind | Receives |
| --- | --- | --- |
| `in` | CHOP | channel `value` (float), channel `uid` (float) |
| `lastmsg` | Text DAT | readable summary, e.g. `7 FOLLOW STILL` |

Both are optional. The callback prints to the TD console regardless and raises
nothing if they're missing, so a half-built network still shows incoming data —
useful for isolating problems.

Point out that CHOP channels must exist before the CHOP does. A channel access
on a name the CHOP doesn't have is a silent no-op here.

### The CHOP

For `uid` to colour visuals per audience member, they add channels named
exactly `value` and `uid` to the CHOP called `in`. Suggest `uid` be multiplied
or normalized downstream into a colour — it's a `crc32 % 1000000` hash, not an
index, so it's stable but arbitrary.

### Wiring to visuals

`lastmsg` is a Text DAT, so route it to a display via an Art Block's Text
parameter, or `op('lastmsg')` into a DAT viewer during rehearsal. To make it
react live, they can use the Text DAT's `onChange` callback or a CHOP Expression
bound to the parameter.

### Verifying with them

Ask them to watch the TD console, then have them open the page on a second
device and tap through all three pages. They should see exactly one
`recv: bundle` line per `SEND`. If they see three, they're running a stale
callback or a stale cached page.

## Testing the wire format

`touchdesigner/callbacks.py` is plain Python and can be exercised off-TD by
stubbing the global `op`. Copy `parseBundle` and the callback into a scratch
script, inject a fake `op` returning objects with a `chan` dict, and assert:

- a full bundle sets `value`, a float `uid`, and the `lastmsg` text
- the same `uid` always yields the same `uid` channel value
- a value containing `;` or `=` survives the round trip (client percent-escapes)
- `action`/`time` omitted still parses and doesn't raise
- legacy `num`/`txt` frames are ignored, not misread
- a CHOP lacking `value`/`uid` raises nothing

Client-side, assert the relay forwards frame text byte-for-byte and that
messages from TD are broadcast to every connected phone. A frame arriving as
three messages instead of one is the regression this format exists to prevent.

## Things that will bite you

- **The relay buffers, the page doesn't.** The page queues up to 16 frames while
  its socket is down; the relay queues up to 16 per phone while TD is down, then
  flushes. Both are capped, and both drop silently when full.
- **Never log audience message content.** Messages are public performance input.
  The relay logs counts and lifecycle only; keep it that way.
- **Guardrails are URL params**, not config: `?min=`, `?max=`, `?rate=`,
  `?burst=`. Defaults: rate 8/s, burst 3, clamp ±1000. One token per `SEND`.
- **`clampNum` exists** because `value` is clamped to `?min=`/`?max=` before it
  reaches the wire. Don't delete it as unused; it's referenced by `bundle()`.
- **Google Fonts is a network dependency.** It degrades to Arial/mono offline,
  which changes metrics. For a venue with bad wifi, vendor the two families.
- **`Animated Section Menu.make`** is the Figma Make original. It's reference
  material, not build input. Nothing reads it.

## Files

| Path | Role |
| --- | --- |
| `index.html` | UI and client. The whole page; Figma design inlined |
| `server.js` | optional relay: serves page, terminates phone sockets, one upstream to TD |
| `touchdesigner/callbacks.py` | paste into a Text DAT on the TD side |
| `DESIGN.md` | design source of truth — read before any UI change |
| `README.md` | human-facing runbook and protocol reference |
| `package.json` | declares the one dependency (`ws`) |