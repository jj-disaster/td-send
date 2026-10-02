# Send → TouchDesigner

Audience members type text or a number on their phone; it lands in TouchDesigner in
real time. No build step, no npm, no framework, no backend.

```
phone browser  ──ws://──▶  TouchDesigner (websocket DAT, Server :9001)
      ▲
      └── index.html served from any static host (laptop, python http.server, Netlify)
```

Latency on a local network is ~1–5 ms, which is realtime enough for live input.

## Run it (2 steps)

1. **TouchDesigner** — add a `websocket` DAT (older TD: `webSockets`):
   - Network → Address `0.0.0.0`, Port `9001`
   - Mode → **Server**
   - Allow the macOS firewall prompt.
2. **Serve the page** on the same machine as the laptop that runs TD:

   ```bash
   python3 -m http.server 8080
   ```

   Everyone on the venue wifi opens `http://<laptop-ip>:8080`. Find the IP with
   `ipconfig getifaddr en0`.

The status pill under the input turns green when the connection to TD is live.
`?h=1.2.3.4` overrides the host, `?p=9001` the port — useful when the page is
hosted somewhere else.

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
- **Hosting the page on https (GitHub Pages, Netlify)** — browsers block
  `ws://` from an https page, and TD's websocket server has no TLS. Keep the page
  on `http://` for the show, or front it with a free Cloudflare Tunnel
  (`cloudflared tunnel --url http://localhost:8080`) which gives you `wss://`
  and still terminates TLS outside TD.
- **TD's websocket server gets flaky** — put a ~25-line Node relay in the middle
  (serves the page on the same origin, bridges `ws://127.0.0.1:9001`); TD then
  reconnects on a timer instead of you restarting it live. Only add this if the
  direct path actually misbehaves.

## Files

- `index.html` — UI + client. The whole thing.