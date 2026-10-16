# Design

Contents: look and feel, brand colors, tokens, typography, shape, spacing and elevation, components, dashboard styling, accessibility, implementation rules, acceptance.

## 1. Look and feel

Modern, minimal, premium. Calm screens with generous white space, one strong color per area, content before chrome, and soft rounded shapes in the style of Apple's continuous corners. Sans-serif type throughout. The colors are FIU's, so the app looks like it belongs at FIU without copying anything official.

Use FIU's colors only. Do not use the FIU logo or wordmark unless the supervisor confirms it is allowed.

## 2. Brand colors

Source: FIU brand site, colors page, checked October 2026.

| Name | HEX | Use in the app |
| --- | --- | --- |
| FIU Blue | `#081E3F` | Text, primary buttons, sidebar |
| FIU Gold | `#D1A644` | Thin accents on white, marker on the dark sidebar, focus color on dark surfaces |
| Bright Gold | `#FFCC00` | Attention tint only |
| Cyan | `#00B7D5` | Chart series only |
| Magenta | `#CC0066` | Chart series only |

FIU's own rules: text on these colors must pass accessibility contrast, shades may be used on digital products to achieve that, and red, purple, green, and orange are not primary colors. The app follows this: blue and gold lead, and red and green appear only as status colors with an icon and a word.

## 3. Tokens

Define these once in `apps/web/src/styles/tokens.css`. Components use tokens and never hex codes. Names ending in `-bg` are backgrounds. `danger`, `success`, `warning`, and `info` are text colors on their `-bg`.

```css
:root {
  --color-brand-blue: #081E3F;
  --color-brand-gold: #D1A644;
  --color-brand-gold-bright: #FFCC00;
  --color-brand-cyan: #00B7D5;
  --color-brand-magenta: #CC0066;

  --color-bg: #F5F6F8;
  --color-surface: #FFFFFF;
  --color-surface-subtle: #F0F2F5;
  --color-border: #E2E6EC;
  --color-border-strong: #8793A6;

  --color-text: #081E3F;
  --color-text-secondary: #4A5A73;
  --color-text-muted: #5D6B82;

  --color-primary: #081E3F;
  --color-primary-hover: #12305E;
  --color-on-primary: #FFFFFF;
  --color-link: #1F4F99;
  --color-selected: #EAF0F8;
  --color-focus: #1F4F99;

  --color-accent: #D1A644;
  --color-accent-text: #8A6A1C;
  --color-accent-tint: #FBF3DF;

  --color-danger: #B42318;
  --color-danger-bg: #FDECEA;
  --color-success: #176B3F;
  --color-success-bg: #E7F5EC;
  --color-warning: #5C4300;
  --color-warning-bg: #FFF4CC;
  --color-info: #005F73;
  --color-info-bg: #E0F6FA;

  --color-sidebar: #081E3F;
  --color-sidebar-text: #FFFFFF;
  --color-sidebar-muted: #B9C4D6;

  --chart-returned: #1F4F99;
  --chart-out: #B8861B;
  --chart-pastdue: #B42318;

  --font-sans: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;

  --radius-control: 12px;
  --radius-card: 20px;
  --radius-sheet: 28px;
  --radius-pill: 999px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 24px;
  --space-6: 32px;
  --space-7: 48px;

  --shadow-card: 0 1px 2px rgba(8, 30, 63, 0.04), 0 4px 16px rgba(8, 30, 63, 0.05);
  --shadow-sheet: 0 8px 40px rgba(8, 30, 63, 0.18);
}
```

Color rules:

- FIU Gold is a decoration on white, such as a thin line or a small marker. Never set gold text on white (2.27 to 1). Use gold text only on FIU Blue (7.30 to 1), or use `--color-accent-text` on white.
- Status colors are functional, not decorative: red for past due and errors, green for done, bright-gold tint for needs attention, cyan tint for information. Always pair color with an icon or a word.
- At most one strong color in any card.
- Light theme only for now.

## 4. Typography

- Sans serif only. Font: Inter, bundled as a variable font file in `apps/web/public/fonts` and self-hosted. Its license allows bundling. No CDN, so the app works with no internet. The fallback stack takes over if the file fails, and on Windows that means Segoe UI.
- Base size 15 px with line height 1.5. Scale: 12, 13, 15, 17, 20, 24, 32.
- Weights 400, 500, and 600. Nothing heavier.
- Page title 24 px semibold. Card title 17 px semibold. Labels 13 px medium in secondary color. Big numbers 32 px semibold with letter spacing -0.02em.
- Use tabular figures (`font-variant-numeric: tabular-nums`) for PIDs, counts, dates, and every table number.
- Sentence case everywhere. No all-caps labels.
- Register the same font file in the PDF generator so receipts match the screen.

## 5. Shape

Apple-style continuous corners, built from standard CSS so no library is needed:

```css
.card {
  border-radius: var(--radius-card);
  corner-shape: squircle;
}
```

`corner-shape: squircle` works in Chrome and Edge 139 and later. As of mid-2026 Safari and Firefox do not support it and show ordinary rounded corners, which still looks right. The desk computers most likely use Edge on Windows, so the full effect applies there. The property does nothing unless `border-radius` is set. A script-based fallback exists if it is ever needed, but do not add one now.

Radius rules:

- Radius grows with the size of the surface: pills and badges are fully round, buttons and inputs 12 px, cards and tiles 20 px, dialogs and sheets 28 px.
- Small square tiles such as icon tiles use about 22% of their side.
- Nested shapes are concentric: inner radius equals outer radius minus the padding between them.
- No sharp corners anywhere, and never mix sharp and rounded shapes on one screen.

## 6. Spacing and elevation

- 4 px grid. Use the space tokens only.
- Page gutter 24 px. Card padding 20 to 24 px. Gap between cards 16 to 20 px.
- Content max width 1440 px. The layout must fit 1366 by 768 and look right at 1920 by 1080.
- Cards are white on the light gray page, with a 1 px `--color-border` hairline and `--shadow-card`. Dialogs use `--shadow-sheet`. No gradients, no heavy shadows, no glass effects.

## 7. Components

- **Sidebar:** FIU Blue, 232 px wide, white labels, outline icons. The active item has a 12% white overlay with a 12 px radius and a 3 px FIU Gold marker on its left edge. Muted items use `--color-sidebar-muted`.
- **Buttons:** 40 px high, 12 px radius, weight 500. Primary is FIU Blue with white text, secondary is white with a border, tertiary is plain link color. Red solid appears only on a confirm dialog for a destructive action. Scan and checkout screens use 48 px targets.
- **Inputs:** 40 px high, 12 px radius, white fill, 1 px `--color-border-strong`, focus ring 2 px `--color-focus` with a 2 px white gap. The scan field is 56 px high with 17 px text, always visible and focused. Scan feedback is a row tint plus an icon and a word, shown within 100 ms.
- **Stat tiles:** white card, 20 px radius. 13 px secondary label, 32 px number. The whole tile is a link with a hover border and a focus ring. A past due number turns red and carries the words "past due".
- **Tables:** no vertical lines, 48 px rows, hairline dividers, 13 px medium secondary header, sticky header, hover and selected rows use `--color-selected`. Numbers align right. Row actions sit at the end of the row.
- **Badges:** pill, `-bg` tint with matching text, 12 px medium, with an icon.
- **Charts:** horizontal bars 12 px high with fully round ends, value labels at the end of each bar, no gridlines, no 3D. Returned uses `--chart-returned`, still out uses `--chart-out`, past due uses `--chart-pastdue`. Cyan and magenta are for extra series only.
- **Dialogs and toasts:** 28 px radius, centered, one primary action.
- **Empty states:** one sentence and one button. No illustrations.
- **Icons:** one outline set, 20 px, 1.75 px stroke. Lucide is a free option.
- **Motion:** 150 to 200 ms ease-out. No bounce. Respect `prefers-reduced-motion`.

## 8. Dashboard styling

- Light gray page, FIU Blue sidebar, white cards with 20 px continuous corners.
- Top row: term selector as a pill on the left, the 56 px scan box in the middle, quick actions on the right.
- Six stat tiles in one row at 1366 px. Only the past due tile uses a status color.
- Needs attention rows: icon, one sentence, a count pill, and a chevron. Bright-gold tint for the icon background, never a full row fill.
- The system health card turns to `--color-danger-bg` with red text and the words "backup is old" when the backup is stale.
- Gold appears only as the sidebar marker and thin accents, so the page stays mostly blue, white, and gray.

## 9. Accessibility

Contrast ratios below were computed with the WCAG formula. Keep every pair at or above its target in tests.

| Pair | Ratio | Target |
| --- | --- | --- |
| Text on surface | 16.56 | 4.5 |
| Secondary text on surface / on page | 7.00 / 6.47 | 4.5 |
| Muted text on surface / on page | 5.40 / 4.99 | 4.5 |
| White on primary button / hover | 16.56 / 13.04 | 4.5 |
| Link on surface | 7.96 | 4.5 |
| FIU Gold on FIU Blue | 7.30 | 4.5 |
| Accent text on surface | 5.05 | 4.5 |
| Danger on its tint | 5.75 | 4.5 |
| Success on its tint | 5.81 | 4.5 |
| Warning on its tint | 8.44 | 4.5 |
| Info on its tint | 6.49 | 4.5 |
| Input border on surface | 3.11 | 3 |
| Focus ring on surface | 7.96 | 3 |
| Chart still out on white | 3.25 | 3 |

Also: every action works from the keyboard, focus is always visible, targets are at least 40 px, the page works at 200% zoom, and color is never the only signal.

## 10. Implementation rules

- Tokens first. Any component library or template is fine if it can be themed from these tokens. Candidates are Tailwind CSS with shadcn/ui, or any template the user prefers. Decide in phase 0, and do not let a library's defaults override the tokens.
- No runtime requests to outside servers for fonts, icons, or scripts. The only optional outside call is the Open Library lookup.
- Print stylesheet: black text on white, no tinted backgrounds, same font.
- Do not add a dark theme until the light theme is done.

## 11. Acceptance

- Searching component code for hex colors finds none. Only `tokens.css` has them.
- A test checks every contrast pair in section 9.
- Screens show no horizontal scroll at 1366 by 768, and look right at 1920 by 1080.
- In Edge, cards show continuous corners. In a browser without support they show plain rounded corners.
- The user reviews the first dashboard screen against section 8 before more screens are built.
