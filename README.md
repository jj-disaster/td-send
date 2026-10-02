# Send → TouchDesigner

Audience members type text or a number on their phone; it lands in TouchDesigner in
real time. No build step, no npm, no framework, no backend.

Live at **https://jj-disaster.github.io/td-send/**

```
phone browser ──wss://──▶ cloudflared ──▶ localhost:9001 ──▶ TouchDesigner
      ▲                     (TLS here)      (websocket DAT, Server :9001)
      └── index.html on GitHub Pages (https)
```

Without the tunnel the page talks straight to TouchDesigner over `ws://`, which is
the fastest path and the one to use when you're on the same network as the
laptop running TD.

## Show day: GitHub Pages

GitHub Pages is https-only, and browsers refuse to open a `ws://` connection from
an https page. TouchDesigner's websocket DAT has no TLS, so something has to
terminate TLS in the middle. Cloudflare's free tunnel does it in one command:

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

Add a `websocket` DAT (older TD: `webSockets`):

- Network → Address `0.0.0.0`, Port `9001`
- Mode → **Server**
- Allow the macOS firewall prompt.

The status pill under the input turns green when the connection to TD is live;
on an https page with no tunnel it says `blocked: needs a wss tunnel` instead of
spinning silently.

## Wire protocol

One text frame per send, tab separated, newline terminated:

```
num\t0.82\t3f9a2      number, clamped
txt\thello world\t3f9a2   text, tabs/newlines stripped, 120 chars max
```

`3f9a2` is a random per-visitor id so you can tell senders apart. One field in,
one field out: the smallest thing TouchDesigner can parse without a JSON library.

## TouchDesigner side

In the websocket DAT's `onWebSocketMessage` callback, add a CHOP DAT named `in`
in **Channel** mode with channels `num`, `txt`, `uid`:

```python
def onWebSocketMessage(clientIndex, message, details):
    parts = str(details.payload).strip().split("\t")
    if len(parts) < 2:
        return
    kind, value = parts[0], parts[1]
    if kind == "num":
        n = float(value)
        op("in").chan["num"].value = n
        op("in").chan["uid"].value = float(parts[2]) if len(parts) > 2 else 0
    else:
        op("in").chan["txt"].val = value
```

If `payload` arrives as bytes, wrap it: `str(details.payload, "utf-8", "ignore")`.
If your CHOP type is read-only, use a Constant or Math CHOP, or skip the CHOP
entirely and set parameters directly with `op("mycomp").par.value = n`.

Now wire `in`'s `num` channel into whatever you animate — audio-reactivity,
camera params, a lookup texture, trigger thresholds. `op("in").chan["txt"]` as a
text channel works for LED-matrix / typography output.

TouchPlayer handles this fine as long as the DAT is saved in the `.toe`.

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
- **TD's websocket server gets flaky** — put a ~25-line Node relay in the middle
  (bridges `ws://127.0.0.1:9001`); TD then reconnects on a timer instead of you
  restarting it live. Only add this if the direct path actually misbehaves.

## Files

- `index.html` — UI + client. The whole thing.