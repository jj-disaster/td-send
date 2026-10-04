# Design language — Alter / Index

The page is a decision instrument. A stranger picks it up on a phone in a dark
room, while something is happening on a stage behind them, and answers three
questions in order: which one, what should it do, what happens to it. Their
answers are the performance's input.

This is the source of truth for how that page looks and behaves. `index.html`
implements it; change the file to match this document, not the reverse.

## Goals

1. **Three questions, one order.** The page is a sequence, not a form. Each page
   asks exactly one thing and offers no way to skip it.
2. **A tap is not a send.** Choices are held locally and visibly selected.
   Nothing reaches TouchDesigner until `SEND` on page 03, so a mis-tap costs
   nothing and the final transmission is a deliberate act.
3. **Every answer stays visible.** Selections persist across page visits and the
   whole path is re-sent together, so the audience member can see what they
   chose before committing it.
4. **Reads at arm's length, in the dark.** High contrast paper-on-ink, generous
   touch targets, one idea per screen.
5. **Nothing decorative that isn't load-bearing.** Hairlines, small caps and the
   blur transition exist to separate three states — now, leaving, arriving.
6. **No loading, no failure modes.** One HTML file, native `WebSocket`, no build
   step. It must work on a phone with one bar of signal.

## Colour

Ink on paper. Exactly three values, and hierarchy is expressed with size, weight
and opacity rather than by adding more greys.

| token | value | contrast on paper | use |
| --- | --- | --- | --- |
| `--ink` | `#090909` | 18.23:1 | all text that must be read, every border, the slider track and thumb, the `SEND` fill |
| `--muted` | `#555550` | 6.86:1 | status line, kickers, slider scale labels, disabled choice text |
| `--paper` | `#f5f5f2` | — | every surface; the page has no other fill |

- Off-white paper, never pure white — it is less harsh under stage lighting and
  keeps the ink from vibrating.
- No accent, no gradient, no shadow. Emphasis is achieved by inverting a fill
  (`--ink` background, `--paper` text), never by introducing a hue.
- Borders and the slider track are `--ink` at 1px. There are no soft hairlines:
  separation is done with space and with the 720ms blur, not with pale rules.
- Disabled controls drop to `opacity: .35` rather than to a lighter colour, so
  they stay legible while reading as unavailable.
- Contrast is never carried by colour alone. Every state also changes fill,
  border, opacity or position.

## Typography

Two families, strictly assigned.

| role | family | size | treatment |
| --- | --- | --- | --- |
| section title | Archivo 600 | `clamp(15px, 4.6vw, 24px)` | `line-height: .9`, tracking `-0.03em` |
| body, choices, buttons | IBM Plex Mono 400 | 13px | tracking `.04em` |
| slider readout | IBM Plex Mono | 15px | tracking `.14em`, set in `[ n ]` |
| kicker, prompt, status | IBM Plex Mono | 10px | `.08em`–`.14em` tracking |
| section number | IBM Plex Mono | 9px | sits inline before the title |
| `SEND` | IBM Plex Mono 700 | 13px | uppercase, `.14em` |

- Archivo is for the question being asked — the only thing on the page set in a
  proportional face, which is what makes it read as a headline.
- IBM Plex Mono carries everything the visitor reads or operates: choices,
  readouts, labels, status. Its alignment is what makes `[ 27 ]` and the `01 / 50`
  scale legible as data.
- Uppercase is reserved for short machine-like verbs (`WHAT SHOULD I DO?`,
  `SEND`) and status. The page's questions are sentence case with a question
  mark, because they are addressed to a person.
- Font loading is a live network dependency. `Arial` and the platform mono stack
  are the declared fallbacks, so the page degrades to a different but functional
  face rather than to invisible text.

## Geometry

- Fixed **320px** column, centred, `100dvh`, `overflow: hidden`. The layout is a
  fixed viewport composition, not a scrolling document; nothing reflows.
- Page padding `14px 18px 12px`, tightening to `12px 14px 10px` under 520px.
- The viewer is a two-row grid: a `96px` header band (`84px` on mobile) over a
  flexible content window.
- The header is a three-column grid — `40px` arrow, fluid title, `40px` arrow —
  so the title is always optically centred regardless of its length.
- Titles shrink to fit rather than wrap: `fitTitles()` steps the font down from
  its computed size in 1px increments to a floor of 11px, then gives up and
  allows a wrap. A long question must never push the arrows apart.
- Arrow buttons are `36px` circles (`border-radius: 50%`) — the one deliberate
  departure from the square language, marking them as chrome rather than content.
- Choices are `min-height: 48px`, `SEND` is `52px`. Slider thumb is `16px` on a
  `1px` track. Every target clears the 44px minimum.
- Borders are `1px` in `--ink`: the arrow buttons, the slider track and the `SEND`
  button edge. There is no pale hairline anywhere in the layout.

## Layout

```
topbar      status line only — live / reconnecting / blocked
header      ←   01  Which one?   →
content     kicker, prompt, control, (SEND on page 03)
```

- The status line is the only thing above the questions. It is 10px, centred, and
  turns `--ink` when live, `--muted` otherwise.
- Kicker is `NN / SUBCATEGORY` (`01 / SELECT`), which tells the visitor where
  they are in the sequence without a progress bar.
- Page 03 is the only page with a `SEND` button, and it is the full-width
  primary action at the bottom of the content window.

## Motion

One transition, 720ms, used for every page change.

- **Titles** slide horizontally 13% with `cubic-bezier(.76, 0, .24, 1)` — the
  outgoing title leaves in the direction of travel, the incoming enters against
  it.
- **Content** moves vertically with `cubic-bezier(.65, 0, .35, 1)` and blurs
  `0 → 5px` while translating 7px. The blur is what stops the outgoing copy from
  competing with the incoming copy for the same space.
- Arrows and choices invert over 180ms.
- `prefers-reduced-motion: reduce` collapses every animation and transition to
  1ms. The page-change logic and all state transitions are unchanged.

## Interaction

| input | result |
| --- | --- |
| arrow buttons, `←` `→` | previous / next page, wrapping |
| `1` `2` `3` | select the nth choice on the current page |
| horizontal swipe > 48px on the content window | page change |
| tap a choice | select it, persisted across page visits |
| drag the slider | set the number, `01`–`50` |
| `SEND` (page 03) | transmit the whole path |

- Swipes that begin on an `input`, `button` or `a` are ignored, so dragging the
  slider or tapping a choice can never flip the page.
- Page changes are locked out while a transition is running; the arrows disable
  for its duration.
- Hover inversion is suppressed on touch via both `@media (hover: none)` and a
  class set on the first `touchstart`, because some browsers report
  `hover: hover` through an emulation layer.
- All controls disable while the socket is not live, so a send can never be
  composed against a dead connection.

## Voice

- Questions are sentence case with question marks: `Which one?`,
  `What should I do?`, `What happens to it?`
- The prompt restates the question as an instruction, sometimes uppercase:
  `Choose one.` → `WHAT SHOULD I DO?` → `How should it continue?`
- Choice words are bare verbs or adverbs, three per page, uppercase: `FOLLOW /
  COMPLETE / RESIST`, `STILL / REPEAT / MOVE`.
- The status line reports state in three words or fewer and names the fix when
  there is one: `blocked: needs a wss tunnel`.
- No explanatory copy anywhere. Nothing tells the visitor what will happen with
  their input — that belongs to the performance, not the form.

## Transport

Unchanged from the first version of this page, and deliberately boring.

- `SEND` transmits three frames, in order: the slider as `num`, the action as
  `txt`, the time as `txt`.
- Wire format is one tab-separated text frame per value, with a per-visitor id:
  `num\t0.82\t3f9a2`.
- All tunables are URL parameters (`?wss=`, `?p=`, `?rate=`, `?burst=`, `?min=`,
  `?max=`) so a show can be retuned without editing or redeploying.
- Clamping and rate limiting are enforced here *and* again in TouchDesigner.
  The page is a convenience, never a trust boundary.

## Structural constraints

- One file. No build step, no package manager, no runtime dependency.
- Native browser `WebSocket` only.
- The Figma Make source this design came from is kept alongside as
  `Animated Section Menu.make`. The single-file `index.html` is the shipped
  artefact; the `.make` file is the reference, not a build input.

## Checks before shipping

- Only three tokens exist: `--ink`, `--muted`, `--paper`. No fourth grey, no hue.
- No undeclared custom property — every `var(--x)` resolves to one of the three.
- Titles never wrap on any supported width — verify by loading pages 02 and 03,
  whose labels are the longest.
- Slider drag does not change page; page swipe does not move the slider.
- Every control is disabled and the status line reads `reconnecting` with TD
  stopped, and flips to live within a second of TD starting.
- Works at 320px wide with a phone keyboard open, and with reduced motion on.