# Handoff: SAAC Books — Admin/Staff screens (Home, Check out, Check in)

## Overview
Staff-facing screens for SAAC Books, the FIU Student-Athlete Academic Center book and tech lending app. Three screens: **Home** (admin dashboard), **Check out**, **Check in**. Nothing on the student side is included.

## About the design files
The files in `designs/` are **design references built in HTML**. They are prototypes that show the intended look and behavior. They are not production code. Rebuild them in **React + TypeScript** using the target codebase's patterns: router, data fetching, component library and auth. Open any `.dc.html` in a browser to see it running; `support.js` is only the prototype runtime and should not be ported.

Every file has two parts:
- **Markup:** inline-styled HTML with `{{ }}` holes, `<sc-for>` loops and `<sc-if>` conditionals.
- **Logic:** a `class Component` with `state` and `renderVals()`.

Mapping to React:
- `renderVals()` → hooks + derived values
- `<sc-for list as>` → `.map()`
- `<sc-if value>` → `{cond && …}`
- `style-hover` / `style-focus` → `:hover` / `:focus-visible` in your styling system

## Fidelity
**High fidelity.** Colors, type, spacing, radii and copy are final. Recreate them exactly, using the tokens below. All data is mock data and must come from the API.

## Roles
Role is `ADMIN` or `STAFF`. In the prototype it's a prop (`role`); in production it comes from the session.
- Only ADMIN sees:
  - the sidebar "Admin" group
  - the Import buttons
  - Recent activity, Imports and System health
  - "Import rows to review" and "Holds waiting for an admin"
  - the due-date override on Check out
- Hiding things in the UI is not enough. Enforce every one of these on the server too.

## App shell (all screens)
- **Layout:** `display:flex; min-height:100vh; background:#F5F6F8`.
- **Sidebar** (`<nav aria-label="Main">`)
  - Box: 232px wide, `#081E3F`, padding 20px 12px, gap 4px, sticky, `height:100vh; overflow-y:auto`. Every child has `flex-shrink:0`.
  - **Brand block:** white panel, radius 14, padding 10px 12px, margin-bottom 20px. Holds `assets/fiu-panther.png` (40px wide) and `assets/saac-wordmark.png` (max 140px wide).
  - **Nav items:** 40px tall, padding 0 12px, radius 12, 15px white text. Hover background `rgba(255,255,255,.06)`.
  - **Active item:** background `rgba(255,255,255,.12)`, weight 500, plus a 3px gold `#D1A644` bar at the left (top/bottom inset 10px). Set `aria-current="page"`.
  - **Main nav:** Home · Check out · Check in · Checked-out items · Checked-out books.
  - **Admin group** (ADMIN only): label "Admin" (12px/500, `#B9C4D6`, padding 20px 12px 6px), then Imports · Inventory · Terms · Users · Audit log · Backups · Settings. Text `#B9C4D6`, white on hover.
  - **User footer:** pinned to the bottom with `margin-top:auto` and a 1px `rgba(255,255,255,.12)` top border. 32px round initials avatar, name (13/500), role (12px, `#B9C4D6`).
- **Main:** `flex:1; padding:20px 24px 32px; gap:16px; max-width:1440px`.

## Screen 1 — Home (`Admin Dashboard.dc.html`)
Everything is scoped to the selected term. Refresh every 60 s and when the window regains focus. Show times in America/New_York.

1. **Title row**
   - Left: "Home" (H1 24/600, tracking -0.01em), with "Weekday, Month D · Updated h:mm AM · refreshes every 60 s" below it (13px, `#5D6B82`, tabular numbers).
   - Right: quick-action links, 40px tall, radius 12.
     - Primary: Check out (`#081E3F` fill, white text, hover `#12305E`).
     - Secondary: Check in · Checked-out items · Checked-out books (white with a `#E2E6EC` border, hover `#8793A6`).
     - ADMIN only: Import students · Import books.
2. **Term + scan row**
   - **Term select:** pill, 40px tall, white, 1px `#8793A6` border. Reads "Term **FALL26**". Options are the term codes.
   - **Past term:** show a "Past term · read-only" pill (`#E0F6FA` / `#005F73`).
   - **Scan input:** 56px tall, radius 16, 17px text, search glyph, autofocused. Placeholder "Scan a tag, or type a PID or name, then press Enter". Focus ring `0 0 0 2px #fff, 0 0 0 4px #1F4F99`.
   - **Feedback bar on Enter** (see Feedback tones):
     - 7 digits: "Found · PID …".
     - 6 digits: "Check PID · Did you mean 0…?".
     - Any other digit string: "Not found".
     - `A-123` pattern: "Tags not ready" (info; links to Item history).
     - Text: name matches.
     - Esc clears the bar.
3. **Tiles:** `grid auto-fit minmax(150px,1fr)`, gap 16. Each tile is a card (see Card) and a link.
   - Tile layout: label (13/500, `#4A5A73`), value (32/600, tracking -0.02em, tabular numbers), sub-line (13px, `#5D6B82`).
   - Tiles: People (athletes · staff) · Books out · Tech out · **Past due** (value and sub-line in `#B42318`, with a "!" icon) · Holds (tech only · pending/on hold) · **Deadline** ("65 days"; "Dec 18 · N people hold items"; 2px gold bar at the top).
4. **Two-up row:** `auto-fit minmax(min(100%,420px),1fr)`.
   - **Needs attention**
     - Each row is a link: 48px min height, 32px squircle icon, text, count pill (`#F0F2F5`), chevron. Hover background `#EAF0F8`.
     - Rows with a count of 0 are hidden.
     - Empty state: "Nothing needs you right now."
     - Possible rows:
       - Import rows to review (ADMIN)
       - Past due with no reminder sent (red)
       - Reminders waiting for preview
       - Hold list ready: tech still out after the return deadline
       - Holds waiting for an admin (ADMIN)
       - Titles short
       - Assignments not picked up
       - Backup is old (ADMIN, red)
       - No book list imported for {term} yet
   - **Return progress by team**
     - Legend: Returned `#1F4F99`, Still out `#B8861B`, Past due `#B42318`.
     - Grid columns: name link | 12px stacked bar (track `#F0F2F5`) | "X of Y returned".
     - Each bar is `role="img"` with an aria-label giving all three counts.
     - Footer link: "All 16 teams ›".
5. **Two-up row**
   - **Books this term** (link: "Student books ›")
     - 4 stat chips: Needed / Assigned / Issued / Waived.
     - Yellow shortage banner (`#FFF4CC` / `#5C4300`): "N titles short · M needs have no copy · Shortage report ›".
     - Empty state: "No book list imported for {term} yet." with an Import books button.
   - **Inventory health** (link: "Inventory ›")
     - Tech table columns: Tech | Available | Out | In repair | Surplus | Retired. Rows: Laptops, Chargers, Other tech.
     - Below it: "Book copies · N" with 4 chips: Available / Assigned / Out / Retired.
6. **Admin row** (ADMIN only): `auto-fit minmax(min(100%,320px),1fr)`.
   - **Recent activity:** time | action + user. Links to Audit log.
   - **Imports:** last student and book imports, with created / updated / unchanged / to review pills. Links to History.
   - **System health:**
     - Rows: last backup, copies kept, disk free, DB size, uptime.
     - If the backup is stale, the whole card turns red (`#FDECEA` background, `#F4C7C2` border, `#B42318` text) and reads "Backup is old".

## Screen 2 — Check out (`Check Out.dc.html`)
Two columns that wrap: left `flex:1 1 560px`, right aside `flex:0 1 360px; min-width:300px`. The title row has an "FALL26 · current term" pill, plus a "Start over" button once a person is selected.

**Flow**
1. **Step 1 — "Find the person"**
   - Numbered badge (24px navy circle) and a scan input: "Scan a PID or type a name, then Enter".
   - One match selects the person. Several matches show a picker list (48px rows: name, PID · team).
2. **Step 2 — "Scan copies and tech"**
   - Each valid tag is added to the **Cart**.
   - Cart rows show: Book/Tech pill · title · tag · ISBN+edition or type · badge.
   - Badges:
     - "✓ Fulfils need" (green) when it's the person's assigned copy.
     - "No need on file" (info) otherwise; the backend creates a manual need.
     - Tech rows: "Condition: X".
   - Tech rows expand to show "Condition out" (Good / Fair / Damaged) and "Comments for the agreement".
   - Each row has a Remove button.
3. **Submit:** full-width 48px primary button, "Check out N items".
   - It is disabled with a hint until there is a person, at least 1 item, and a reason if the due date was changed.
4. **Done card:**
   - "✓ Checked out" pill and "N items to {name}".
   - "Due {date}." plus a signing instruction that depends on what was checked out.
   - Buttons: **Print SAAC Book Receipt** (if there are books) · **Print tech agreement** (if there is tech) · Next person.

**Scan validation** (feedback tone · message)
- 6-digit PID → warn "Check PID".
- PID that isn't 7 digits → err "Not a PID".
- Unknown PID → err "Not found" + Add a person.
- New PID while the cart has items → warn "Cart not empty".
- Tag before any person is selected → warn "Person first".
- Unknown tag → err "Unknown tag" + Add it.
- Tag already in the cart → warn "Already in cart".
- Item not in service (In repair, etc.) → err with the status and note; can't be checked out until an admin puts it back in service.
- Already out → err "Already out · checked out to X, due …" + Item history.
- Assigned to someone else → err "Assigned to someone else".
- Success → ok "Added".
- Every result plays a beep: 880 Hz for 80 ms on success, 220 Hz for 250 ms on any problem. The `sound` setting turns it off.
- Refocus the input after every action.

**Right column**
- **Person card:**
  - 44px initials avatar, name (20/600), "PID · team".
  - Scholarship pill: On scholarship (green) · Not on scholarship · warning only (yellow) · Staff · scholarship rules don't apply (info).
  - "Has out now" count and a "Person page ›" link.
- **Assigned to pull:** that person's assigned copies, each with a checkbox state: To pull / In cart / Checked out. Links to Pull list.
- **Due card:**
  - Shows the term deadline ("FALL26 return deadline").
  - ADMIN only: a "Change" link opens a date input and a required "Reason" field.
  - STAFF sees "only an admin can change it".

## Screen 3 — Check in (`Check In.dc.html`)
- Same two-column layout.
- Helper text: "Scan any copy or tech item. Its loan is found for you, no need to look up the person."
- Scan placeholder: "Scan a copy or tech tag, or a PID to see what they hold".

**Scan results**
- Open loan, on time → ok "Checked in".
- Open loan, past due → warn "Checked in · past due, N days late".
- Tag already closed this session → warn "Already done".
- Copy on the shelf → info "Not checked out" + Item history.
- Unknown tag → err.
- 7-digit PID → info listing what they hold.

**Checked in this session** (newest first)
- Row: time · title · "tag · person · due date" · badge · Undo.
- Badges: ✓ Returned (green) · ! N days past due (red) · Not for return · {reason} (neutral).
- Returned rows expand to show "Condition in" and "Notes". The notes placeholder differs for tech and books.

**Right column — "Still out"**
- Header: the person's details.
- Each remaining loan shows its title, tag, due date and a "! Past due" pill, with three actions:
  - **Check in**
  - **Not for return** (opens the modal)
  - **Renew** (tech only; sets the due date to the term deadline)
- When nothing is left: green "✓ Everything is back. Nothing else out this term."
- Footer: "Print updated receipt" and "Person page ›".

**Not-for-return modal**
- Scrim `rgba(8,30,63,.32)`. Dialog max-width 460, radius 28, padding 28, shadow `0 8px 40px rgba(8,30,63,.18)`.
- Shows the item: "title · tag · person".
- Radio group of 48px rows: Kept / Lost / Bought out. Selected row: border `#1F4F99`, background `#EAF0F8`.
- Optional Note field.
- Buttons: Cancel, and "Close loan", which stays disabled ("Pick a reason") until a reason is picked.
- Clicking the scrim closes the modal.

## State (suggested TS types)
```ts
type Role = 'ADMIN' | 'STAFF';
type Tone = 'ok' | 'warn' | 'err' | 'info';
interface Feedback { tone: Tone; word: string; text: string; action?: string }
interface CartLine { tag: string; cond: 'Good'|'Fair'|'Damaged'; note: string }
interface CheckOutState { pid: string|null; cart: CartLine[]; matches: string[]; override: boolean; dueDate: string; dueReason: string; feedback: Feedback|null; done: null|{ name: string; count: string; due: string; hasBooks: boolean; hasTech: boolean } }
interface SessionRow { tag: string; kind: 'return'|'nfr'; time: string; cond?: string; note?: string; lateDays?: number; reason?: 'Kept'|'Lost'|'Bought out' }
interface CheckInState { pid: string|null; session: SessionRow[]; dialog: string|null; reason: string|null; dlgNote: string; feedback: Feedback|null }
```
Suggested endpoints (rename to fit your API):
- `GET /dashboard?term=`
- `GET /people/search?q=`
- `GET /tags/:tag`
- `POST /loans/checkout {pid, items[], dueDate?, dueReason?}`
- `POST /loans/:id/checkin {cond, note}`
- `POST /loans/:id/close {reason, note}`
- `POST /loans/:id/renew`
- `DELETE` (undo) for the last check-in

## Design tokens
- **Ink:** `#081E3F` (primary text, primary button, sidebar). Hover `#12305E`.
- **Secondary text:** `#4A5A73`. **Muted text:** `#5D6B82`. **Sidebar muted:** `#B9C4D6`.
- **Surfaces:** page `#F5F6F8` · card `#FFFFFF` · chip/track `#F0F2F5` · hover tint `#EAF0F8`.
- **Borders:** default `#E2E6EC` · input/strong `#8793A6`.
- **Link/focus:** `#1F4F99`. Links underline on hover and turn `#12305E`.
- **Accent:** FIU gold `#D1A644`. Bar-chart "still out" uses `#B8861B`.
- **Feedback tones (bg / fg):** ok `#E7F5EC`/`#176B3F` · warn `#FFF4CC`/`#5C4300` · err `#FDECEA`/`#B42318` · info `#E0F6FA`/`#005F73`. Every tone also has an icon in a 22px circle with a 1.75px border (✓ ! × i), so meaning never relies on color alone.
- **Type:** Inter 400/500/600, falling back to system-ui. Base 15/1.5.
  - Scale: 12 · 13 · 15 · 17 (card H2, scan input) · 20 · 24 (H1) · 32 (tile value).
  - Use `font-variant-numeric: tabular-nums` on all numbers, PIDs and tags.
- **Radius:** 6 (checkbox) · 8 (small icon) · 12 (buttons, inputs, rows) · 14 (brand panel) · 16 (scan input) · 20 (cards) · 28 (dialog) · 999 (pills). Cards use `corner-shape: squircle` where the browser supports it.
- **Card:** white, 1px `#E2E6EC` border, radius 20, padding 20, shadow `0 1px 2px rgba(8,30,63,.04), 0 4px 16px rgba(8,30,63,.05)`.
- **Heights:**
  - controls 40
  - list rows / primary submit 48
  - scan input 56
  - pills 24–28
- **Spacing:** 4 · 6 · 8 · 10 · 12 · 14 · 16 · 20 · 24 · 28. The page gap is 16.
- **Motion:** 150 ms ease-out on background, border and shadow only. Turn it off under `prefers-reduced-motion`.
- **Focus:** `:focus-visible` outline 2px `#1F4F99`, offset 2px.

## Assets
- `designs/assets/fiu-panther.png`: FIU Panthers mark (user-supplied).
- `designs/assets/saac-wordmark.png`: "Student-Athlete Academic Center" wordmark (user-supplied).
- There are no other images or icon libraries. The glyphs are plain CSS shapes and text characters; swap in your icon set if you like.

## Files
- `designs/Admin Dashboard.dc.html`: Home
- `designs/Check Out.dc.html`: Check out
- `designs/Check In.dc.html`: Check in
- `designs/support.js`: prototype runtime only (not to be ported)

Mock data (people, tags, loans, terms) sits at the top of each file's logic class and shows every edge case.
