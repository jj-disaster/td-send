# SHOW MACHINE HANDOFF

Read this first if you are setting up the computer that will run the live show.
This is the whole procedure, start to finish, written for a human following it
once with someone available to check results.

The other docs assume you already know the project. This one assumes nothing.

---

## What you are building

An audience member opens a web page on their phone, answers three questions,
and taps `SEND`. Their answers appear in TouchDesigner on the show machine,
instantly. The stage visuals react to what the room sends.

Three moving parts:

| Part | Runs on | Job |
| --- | --- | --- |
| `index.html` | GitHub Pages | the page guests open |
| `server.js` | **this machine** | accepts sockets from phones, forwards to TD |
| TouchDesigner | **this machine** | receives messages, drives the visuals |

The relay exists so TouchDesigner only ever sees **one** connection, no matter
how many phones are live.

---

## Part 1 — Prerequisites

You need these installed before anything works:

- **Node.js 18 or newer.** Check with `node -v`. If missing: `brew install node`
- **TouchDesigner.** Install and launch it once so it registers as an app.
- **Tailscale.** `brew install tailscale` (see Part 5, do this later)

Check both:
```bash
node -v
ls -d /Applications/TouchDesigner.app
```

---

## Part 2 — Get the code

```bash
git clone https://github.com/jj-disaster/td-send.git
cd td-send
npm ci
```

`npm ci` installs one dependency (`ws`). It takes a few seconds.

You should now have:
```
index.html   server.js   package.json   callbacks.py (in touchdesigner/)
```

---

## Part 3 — TouchDesigner setup

This is the fiddly part. Do it before the show, not during.

Open TouchDesigner. Press `Tab` to open the operator dialog, or use the menu.

### 3a. Create the Web Server DAT

1. `Tab` → **DAT** → **Web Server**
2. Set these parameters:
   - `Active` → **on**
   - `Port` → **9001**
   - `Local Address` → **leave blank** (blank means all interfaces, which is
     what lets phones on the venue wifi reach it)
3. Keep it open. Don't close it.

> **Do not use the WebSocket DAT.** It looks similar and it will waste an
> afternoon. It is a *client* only — it connects out to a server and can never
> receive from a browser. The Web Server DAT is the one that listens.

### 3b. Paste the callback

1. `Tab` → **DAT** → **Text**
2. Open the file `touchdesigner/callbacks.py` in this repo, select all, copy
3. Paste into the Text DAT
4. Set the Text DAT's **Language** parameter to **Python** (not "Python3",
   not "Python3.11" — pick exactly `Python`)

### 3c. Point the Web Server at it

1. Select the Web Server DAT
2. Set `Callbacks DAT` to the Text DAT you just filled

### 3d. Optional: the CHOP for numbers

Only needed if visuals change per audience member. The callback will work
without it.

1. `Tab` → **CHOP** → **Constant** or **L Chop**
2. Rename it to exactly `in`
3. In its channel list, add **two** channels named exactly `value` and `uid`
   - channels must exist before the callback can write to them
   - `value` is the number the guest chose (1–50)
   - `uid` is a stable per-guest number, useful for giving each person their
     own colour

### 3e. Optional: readable text

Create a Text DAT named exactly `lastmsg`. The callback writes a summary like
`7 FOLLOW STILL` into it. Route it to a Text parameter to show it.

Both `in` and `lastmsg` are optional. If they're missing the callback still
prints to the TouchDesigner console and raises no errors, so you can test
before building any of it.

### 3f. Verify TouchDesigner is listening

```bash
lsof -nP -iTCP:9001 -sTCP:LISTEN
```

You must see `TouchDesigner` in the output. If nothing is listed, the Web Server
DAT is off or TouchDesigner isn't running.

---

## Part 4 — Start the relay and test locally

```bash
node server.js
```

You should see exactly these two lines:
```
[web] http://127.0.0.1:8080  ->  ws://127.0.0.1:9001
[td] connected 127.0.0.1:9001
```

- If you see `[td] error: connect ECONNREFUSED`, TouchDesigner isn't up. Go back
  to Part 3f. The relay retries every second on its own, so you can leave it
  running and fix TD in parallel.
- If you see `EADDRINUSE :::8080`, something else has that port. Find it with
  `lsof -nP -iTCP:8080 -sTCP:LISTEN` before killing anything.

Leave this running. Open a new terminal tab for the next steps.

### Send a test message

Open TouchDesigner's console (the Python Console window, or `Window` →
`Console`) so you can watch for messages.

Then, in the terminal:

```bash
node -e "
const {WebSocket}=require('./node_modules/ws');
const c=new WebSocket('ws://localhost:8080/ws');
c.on('open',()=>c.send('bundle\tvalue=7;action=FOLLOW;time=STILL;uid=ab12c'));
setTimeout(()=>process.exit(0),1500);
"
```

The TD console must print:
```
recv: bundle {'value': '7', 'action': 'FOLLOW', 'time': 'STILL', 'uid': 'ab12c'}
```

**This is the single most important check in this document.** A green status
pill on a phone means the relay accepted a socket, which proves nothing about
TouchDesigner. If you don't see that `recv: bundle` line, stop and fix it before
going any further.

---

## Part 5 — Public link

Guests need HTTPS, because phones refuse mixed content. Without HTTPS a page
can't open a `wss://` socket, and browsers reject it silently.

This project uses Tailscale Funnel, which gives a permanent HTTPS address at no
cost and needs no domain purchase. (Cloudflare's named tunnels were the
alternative, but they require a domain registered on Cloudflare.)

### 5a. First run only

```bash
brew install tailscale
```

Homebrew gives you the command line tool only, and the daemon needs a socket
path you can write to. Start it:

```bash
tailscaled --tun=userspace-networking \
  --socket=$HOME/.local/share/tailscale/tailscaled.sock \
  --state=$HOME/.local/share/tailscale/tailscaled.state --port=0 &
```

Optionally add a short alias to `~/.zshrc` so you don't retype the long path:
```bash
alias ts="tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock"
```
The rest of this document uses `ts` for readability, but only after that line
is in effect. Anywhere it matters (recovery after a reboot), the full path is
written out instead, so nothing depends on the alias existing.

### 5b. Sign in

```bash
ts up
```

It prints a URL. Open it in a browser and approve the machine. **You must open
the URL it prints** — being signed in to tailscale.com in a browser is not the
same as authorizing the machine.

Confirm:
```bash
ts status
```
You should see your machine name and an IP like `100.x.x.x`.

### 5c. Enable Funnel (first time only)

```bash
ts funnel 8080
```

It prints a link to enable Funnel on the tailnet. Open it and confirm. Then
start it in the background:

```bash
ts funnel --bg 8080
```

Check it:
```bash
ts funnel status
```

You should see your public URL and this line:
```
|-- / proxy http://127.0.0.1:8080
```

### 5d. Wait for the certificate

**The first 35–60 seconds after enabling Funnel will fail.** The certificate is
still being issued. `SSL_ERROR_SYSCALL` or
`socket disconnected before secure TLS connection` during this window is
expected, not a real fault.

Watch for success:
```bash
grep "got cert" ~/.local/share/tailscale/tailscaled.state 2>/dev/null
# or check the daemon log:
grep -i cert /path/to/tailscaled.log | tail -5
```

Wait until you see `got cert`, then test.

### 5e. Verify the public link

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<your-machine>.ts.net/
```
Expect `200`.

Then test the socket three times — run this same command three times, because
the handshake can still slip on the first attempt after provisioning:
```bash
node -e "
const {WebSocket}=require('./node_modules/ws');
const c=new WebSocket('wss://<your-machine>.ts.net/ws');
c.on('open',()=>{c.send('bundle\tvalue=7;uid=ab12c');console.log('OPEN');process.exit(0)});
c.on('error',e=>{console.log('ERR',e.message);process.exit(1)});
"
```

All three must print `OPEN`.

**Your public URL is the Funnel hostname with nothing appended.** No `?wss=`
parameter, because the page is served from the same origin as the socket and
finds it by itself.

The URL is derived from the machine name. If you rename the computer, the URL
changes.

### 5f. Rehearse on real phones

Do this before the show, not on the day. Open the public URL on two or three
phones, using **cellular data**, not venue wifi — the phones must reach the
internet, not your local network.

Each `SEND` should produce **exactly one** `recv: bundle` line in the TD
console. If you see three, the TD callback is stale (see below) or the phone is
running a cached page.

---

## Part 6 — Before the show

Checklist:

- [ ] `node server.js` running, shows both `[web]` and `[td] connected`
- [ ] TD console prints `recv: bundle {...}` when you send a test
- [ ] `funnel status` shows your URL pointing at `127.0.0.1:8080`
- [ ] `curl` on the public URL returns `200`
- [ ] `wss://` test passed three times
- [ ] Two or three real phones tested on cellular
- [ ] No other tunnel running (see below)
- [ ] Venue wifi tested if you intend to use it

Confirm nothing else is pointed at TouchDesigner:
```bash
pgrep -fl cloudflared    # should print nothing
lsof -nP -iTCP:9001 -sTCP:LISTEN
```

Two tunnels pointing at the same TD port is a mistake that has already
happened once in this project. One route, one port.

---

## Recovery

**After a reboot**, the URL does not change, but all three processes need
restarting:

```bash
cd td-send
node server.js &

tailscaled --tun=userspace-networking \
  --socket=$HOME/.local/share/tailscale/tailscaled.sock \
  --state=$HOME/.local/share/tailscale/tailscaled.state --port=0 &

tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock funnel --bg 8080
```

Those `tailscale` calls use the full path deliberately — an alias won't be
defined in a fresh shell. Order matters: relay first, then Funnel, so Funnel
never proxies into a dead port. Sign-in state persists in the state file, so
`up` isn't needed again.

All of these survive you closing the terminal they ran in, but none survive a
reboot.

**Page loads but status stays "reconnecting"** — the relay isn't running, or the
public hostname changed because the machine was renamed. Check with:
```bash
tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock funnel status
```
and use the URL it prints now.

**Laptop wifi only, and that's fine** — you don't need the public link for
testing. Find your local IP with `ipconfig getifaddr en0`, start the relay, and
share `http://<that-ip>:8080` to phones on the same wifi. Lowest latency of any
option, no TLS involved. Note that some venue networks isolate devices from each
other, so this can fail on wifi that otherwise works.

**If TouchDesigner is closed mid-show**, the relay logs `ECONNREFUSED` and keeps
retrying. Nothing crashes. Reopen TD and traffic resumes within a second.

---

## Two traps to know about

**Stale callback.** If the TD Text DAT holds an older version of
`callbacks.py`, incoming messages are ignored and the console prints
`recv: ignored ...` instead of `recv: bundle ...`. The relay and page look
completely healthy while nothing reaches your visuals. This is the most likely
cause of "the page works but nothing happens".

**Stale page.** Phones cache aggressively. When you change `index.html`, a
previously-loaded page on someone's phone may keep running the old code. Hard
reload, or open in a private/incognito window when testing changes.

---

## Reference

| Where | What |
| --- | --- |
| `index.html` | the whole page, single file |
| `server.js` | the relay — serves the page and forwards to TD |
| `touchdesigner/callbacks.py` | paste into the TD Text DAT |
| `DESIGN.md` | design language, read before changing the UI |
| `AGENTS.md` | notes for coding agents working on this repo |
| `README.md` | runbook and wire protocol reference |

---

## One-screen version

If you already know TouchDesigner, this is the whole thing:

```bash
# 1. TD: Web Server DAT, Active, port 9001, Local Address blank
#    paste touchdesigner/callbacks.py into a Text DAT, Language = Python
#    point Web Server's Callbacks DAT at it

# 2. code
cd td-send && npm ci && node server.js
#    expect: [web] http://127.0.0.1:8080 ... and [td] connected 127.0.0.1:9001

# 3. prove TD received something (watch the TD console)
node -e "const{WebSocket}=require('./node_modules/ws');const c=new WebSocket('ws://localhost:8080/ws');c.on('open',()=>c.send('bundle\tvalue=7;action=FOLLOW;time=STILL;uid=ab12c'));setTimeout(()=>process.exit(0),1500)"
#    TD console MUST print: recv: bundle {'value': '7', ...}

# 4. public link
tailscaled --tun=userspace-networking --socket=$HOME/.local/share/tailscale/tailscaled.sock --state=$HOME/.local/share/tailscale/tailscaled.state --port=0 &
tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock up
tailscale --socket=$HOME/.local/share/tailscale/tailscaled.sock funnel --bg 8080
#    wait ~35s for "got cert", then:
curl -s -o /dev/null -w "%{http_code}\n" https://<machine>.ts.net/    # 200
```

**Share the bare funnel URL. No `?wss=`.**

After a reboot: `node server.js &` then `ts funnel --bg 8080`.

### URL parameters

All optional, appended to the page URL:

| Param | Default | Effect |
| --- | --- | --- |
| `?wss=host` | same origin | connect to a specific host instead |
| `?min=` / `?max=` | `-1000` / `1000` | clamp the number |
| `?rate=` | `8` | messages per second allowed |
| `?burst=` | `3` | initial burst allowance |

### Wire format

One audience member = one text frame:
```
bundle<TAB>value=7;action=FOLLOW;time=STILL;uid=ab12c
```
Fields are `;`-separated pairs. Values are percent-escaped, so a choice can
never break the parse.

TouchDesigner side:
- CHOP `in` → `value` (float) and `uid` (float, stable per guest)
- Text DAT `lastmsg` → `7 FOLLOW STILL`