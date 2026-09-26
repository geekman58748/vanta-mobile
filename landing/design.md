---
version: alpha
name: 71UI
description: "71UI is a zero-to-one interface system for building and restyling apps and websites so they look clean, precise and unmistakably designed. The core look: white and near-white surfaces, #333333 ink with #6B6B6B secondary text, one blue accent (#0070E0) used sparingly, Inter for product UI (16/20px Medium titles, 13/16px Medium labels, 14px Regular body), 32px controls with 10px corners, 40px data rows, #EBEBEB hairlines and barely-there layered shadows. Marketing pages keep the same discipline but earn exactly one loud idea per page — a display face with tight tracking, a signature shape, or a cinematic hero — picked from ten category playbooks: SaaS, AI and agents, crypto and DeFi, fintech, portfolio, dashboards, mobile, deep tech, enterprise editorial and developer tools."
colors:
  canvas: "#FFFFFF"
  surface: "#FAFAFA"
  surface-2: "#F4F4F5"
  hairline: "#EBEBEB"
  hairline-strong: "#D4D4D8"
  ink-strong: "#111111"
  ink: "#333333"
  ink-subtle: "#6B6B6B"
  primary: "#0070E0"
  primary-hover: "#005FC2"
  on-primary: "#FFFFFF"
  link: "#0070E0"
  inverse: "#111111"
  inverse-hover: "#2B2B2B"
  on-inverse: "#FFFFFF"
  control-border: "#8A8A8A"
  success: "#15B042"
  success-fill: "#CAFACE"
  on-success: "#0E7A2F"
  warning-fill: "#FFF1D6"
  on-warning: "#8A4B00"
  danger: "#D92D20"
  danger-fill: "#FFE8E6"
  on-danger: "#B42318"
  info-fill: "#E6F0FF"
  on-info: "#0058B0"
typography:
  display-xl:
    fontFamily: Inter
    fontSize: 72px
    fontWeight: 500
    lineHeight: 72px
    letterSpacing: -0.04em
  display-lg:
    fontFamily: Inter
    fontSize: 56px
    fontWeight: 500
    lineHeight: 58px
    letterSpacing: -0.035em
  display-md:
    fontFamily: Inter
    fontSize: 44px
    fontWeight: 500
    lineHeight: 46px
    letterSpacing: -0.03em
  headline:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 500
    lineHeight: 36px
    letterSpacing: -0.025em
  title-lg:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: 500
    lineHeight: 30px
    letterSpacing: -0.02em
  title:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 500
    lineHeight: 26px
    letterSpacing: -0.015em
  title-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.01em
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: -0.01em
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
    letterSpacing: 0em
  label:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0em
  caption:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0em
  button:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0em
  button-lg:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: -0.01em
  numeric:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: 500
    lineHeight: 36px
    letterSpacing: -0.025em
    fontFeature: '"tnum" 1'
  mono:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0em
  eyebrow:
    fontFamily: Geist Mono
    fontSize: 11px
    fontWeight: 500
    lineHeight: 14px
    letterSpacing: 0.08em
rounded:
  xs: 4px
  sm: 6px
  md: 8px
  control: 10px
  lg: 12px
  xl: 16px
  2xl: 24px
  3xl: 32px
  full: 9999px
spacing:
  3xs: 2px
  2xs: 4px
  xs: 8px
  sm: 12px
  md: 16px
  lg: 20px
  xl: 24px
  2xl: 32px
  3xl: 40px
  4xl: 48px
  5xl: 64px
  6xl: 96px
  7xl: 128px
  gutter: 24px
  measure: 680px
  container: 1280px
  container-wide: 1400px
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
  heading-display:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.display-lg}"
  text-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.body-sm}"
  sidebar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    width: 240px
  nav-item:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 8px
  nav-item-active:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 8px
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 32px
    padding: 0 12px
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 32px
    padding: 0 12px
  button-secondary-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-inverse:
    backgroundColor: "{colors.inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 32px
    padding: 0 12px
  button-inverse-hover:
    backgroundColor: "{colors.inverse-hover}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button}"
    rounded: "{rounded.control}"
    height: 32px
    padding: 0 12px
  button-cta:
    backgroundColor: "{colors.inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.full}"
    height: 44px
    padding: 0 20px
  text-link:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.link}"
    typography: "{typography.body-sm}"
  input:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.md}"
    height: 32px
    padding: 0 12px
  input-lg:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    height: 40px
    padding: 0 12px
  badge-success:
    backgroundColor: "{colors.success-fill}"
    textColor: "{colors.on-success}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    height: 20px
    padding: 0 8px
  badge-warning:
    backgroundColor: "{colors.warning-fill}"
    textColor: "{colors.on-warning}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    height: 20px
    padding: 0 8px
  badge-danger:
    backgroundColor: "{colors.danger-fill}"
    textColor: "{colors.on-danger}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    height: 20px
    padding: 0 8px
  badge-info:
    backgroundColor: "{colors.info-fill}"
    textColor: "{colors.on-info}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    height: 20px
    padding: 0 8px
  badge-neutral:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.sm}"
    height: 20px
    padding: 0 8px
  status-dot-success:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.full}"
    size: 6px
  switch-on:
    backgroundColor: "{colors.primary}"
    rounded: "{rounded.full}"
    width: 24px
    height: 14px
  switch-off:
    backgroundColor: "{colors.control-border}"
    rounded: "{rounded.full}"
    width: 24px
    height: 14px
  switch-thumb:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.full}"
    size: 10px
  row-data:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 40px
    padding: 0 12px
  row-store:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    height: 44px
    padding: 0 12px
  divider:
    backgroundColor: "{colors.hairline}"
    height: 1px
  divider-strong:
    backgroundColor: "{colors.hairline-strong}"
    height: 1px
  card:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 20px
  tile:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.title}"
    rounded: "{rounded.2xl}"
    padding: 24px
  modal:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.xl}"
    padding: 24px
    width: 480px
  tooltip:
    backgroundColor: "{colors.inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    padding: 4px 8px
  toast:
    backgroundColor: "{colors.inverse}"
    textColor: "{colors.on-inverse}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.lg}"
    padding: 12px 16px
  kbd:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.xs}"
    height: 20px
    padding: 0 4px
  stat-value:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.numeric}"
  eyebrow-label:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink-subtle}"
    typography: "{typography.eyebrow}"
  code-inline:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.ink-strong}"
    typography: "{typography.mono}"
    rounded: "{rounded.xs}"
    padding: 1px 4px
---

# 71UI — design.md

> **One file that turns any coding agent into a careful interface designer.** Drop it in a project root, tell your agent "follow design.md", and every screen it builds or restyles will use the same precise type, spacing, color, motion and accessibility rules — plus a category playbook that makes it stand out instead of looking generated.

This file follows the [DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/overview/): machine-readable tokens in the YAML front matter above, human-readable rules below. Validate or export the tokens with `npx @google/design.md lint design.md` and `npx @google/design.md export --format css-tailwind design.md > theme.css`.

**Where it comes from:** 13 reference screenshots, an apps UI cheatsheet, four live sites measured with D-j-View captures plus computed-style extraction (Qronos, SaasCN, Integrated Bio, V7 Labs), navbar.gallery, Spectrum UI, and 15 published agent skills on interface craft, accessibility, motion and review. Every rule was reconciled into one opinionated default. See **Sources & Resolutions** at the end.

---

## Agent Protocol

Read this section first. It tells you which sections to load for the task at hand, so you never need to hold the whole file in context.

### 1. Pick the mode

| Mode | Trigger phrases | What you do |
|---|---|---|
| **BUILD** | "build", "design", "create", "make a landing page / app / screen" | Run the Zero-to-One Loop (step 3). |
| **RESTYLE** | "make this cleaner", "redesign", "polish", "modernize", "make it stand out" on existing code | Run **Restyle Protocol**. Never change business logic, data flow, handlers or routes. |
| **REVIEW** | "review", "audit", "critique", "what's wrong with this UI" | Run **Review Rubric**. Output the findings table. Edit nothing unless asked. |

### 2. Route by product

| If the product is… | Playbook | Reference DNA to study | Default theme |
|---|---|---|---|
| B2B SaaS marketing site, startup landing page | **A. SaaS** | Stacker screens 01–04, SaasCN | Light |
| AI, agents, automation, LLM infra | **B. AI & agents** | Qronos, Qorix (09), V7 Labs | Dark |
| Crypto, DeFi, wallet, protocol, onchain app | **C. Crypto & DeFi** | Awake Origin (05), IndexRave (10) | Light editorial or clean dApp |
| Bank, payments, money transfer, credit | **D. Fintech** | Banking bento (13), credit app (08) | Light |
| Personal portfolio, designer/developer/studio site | **E. Portfolio & studio** | Widget grid (06), Integrated Bio type, V7 serif | Warm light |
| Dashboard, admin, SaaS app interior, internal tool | **F. Dashboards & web apps** | Ace Studio (07 + cheatsheet), Inbox (12), IndexRave (10) | Light |
| iOS/Android app, mobile-first product | **G. Mobile apps** | Credit app (08), widgets (06) | Light |
| Biotech, health, climate, science, hardware, deep tech | **H. Deep tech & science** | Integrated Bio | Warm light + cinematic media |
| Enterprise software, finance, legal, consulting | **I. Enterprise editorial** | V7 Labs | Dark hero, light body |
| Developer tools, APIs, docs, open source | **J. Developer tools** | SaasCN, Qronos | Light blueprint or dark |

If a product spans two rows (for example an AI tool for banks), take the layout from the product's **job** (B) and the palette discipline from its **audience** (D).

### 3. The Zero-to-One Loop (BUILD mode)

1. **Brief.** Write one line each: *Subject* (what it is), *Audience* (who), *Job* (the one thing a visitor must do), *Proof* (why believe it), *Loud idea* (the single memorable move). If the user gave no subject, propose one and continue.
2. **Route.** Pick the playbook and variant from the table above. State light or dark and why.
3. **Token plan — before any code.** Output a table of 12 lines or fewer: 4–6 named colors with hex values and roles, display face and text face, type scale, radius personality, density, elevation method, motion profile, loud idea.
4. **Architecture.** List the sections in order with one sentence of purpose each. Sketch the hero as an ASCII wireframe.
5. **Tokens first.** Write CSS variables (or a Tailwind v4 `@theme` block) from the token plan. Components never contain raw hex values.
6. **Components.** Build from the **Components** specs: sizes, radii and states are already decided there.
7. **Compose.** Real copy in the user's vocabulary and realistic data. No lorem ipsum, no "John Doe", no 99.99% placeholder metrics unless the user supplied them.
8. **Motion.** One authored moment per page plus interaction feedback. Follow **Motion & Interaction**.
9. **States.** Hover, focus-visible, active, disabled for every control; loading, empty, error for every data view.
10. **Responsive.** Verify at 320, 390, 768, 1024 and 1440px widths. Follow **Responsive Behavior**.
11. **Self-review.** Score with the **Review Rubric**, run the **Pre-Ship Checklist**, fix what fails, then list what you changed and why.
12. **Distinctiveness test.** Ask: *would another agent produce this same page from the same prompt?* If yes, push the loud idea further or remove a generic section. Then remove one decorative element before shipping.

### 4. Output contract

- Print the **token plan** before writing code, and the **checklist result** after.
- Use the project's existing stack. If there's none, use semantic HTML plus CSS variables, or React + Tailwind v4 + shadcn/ui primitives.
- When you deviate from a rule in this file, say which rule and why in one line.

### 5. Example prompts (copy one)

- **Build:** "Follow design.md. Build the landing page for Ledgerline, a DeFi yield vault for treasuries. Use playbook C1 and start with the token plan."
- **Build an app screen:** "Follow design.md, playbook F. Build the integrations settings page for our CRM: sidebar, detail header, a sync table and permission rows."
- **Restyle:** "Follow design.md in RESTYLE mode. Make `src/app/(dashboard)` clean and distinctive without changing any logic. Show a before/after table."
- **Review:** "Follow design.md in REVIEW mode. Audit the pricing page at 390px and 1440px and give me the findings table and a verdict."
- **Category switch:** "Follow design.md. Same product, but restyle the marketing site from playbook A to playbook I (enterprise editorial)."

---

## Overview

**71UI in one sentence:** *quiet precision everywhere, one loud idea per page.*

Clean does not mean empty. The interfaces 71UI studies — Stacker's product-led cards, Qronos's framed dark canvas, Integrated Bio's editorial science site, V7's serif-and-sans enterprise pages, the Ace Studio settings screen — share five traits: a neutral canvas that lets content lead; type that carries hierarchy without bold weights; spacing from a strict 4px scale; hairline structure instead of heavy boxes; and one signature move that makes the page recognizable.

### The 12 laws

1. **One focal point per viewport, one primary action per view.** If two things shout, neither is heard.
2. **Neutrals do 90% of the work.** The accent appears on the primary action, focus rings, key data and the brand mark only.
3. **Type carries hierarchy, not weight.** Display text is large and tight at weight 400–500, never 800. Labels are small, 500, and precise.
4. **Space comes from the 4px scale, in groups.** The gap between groups is at least twice the gap inside a group: 8px inside, 16px+ between; 24px inside a section, 96px+ between sections.
5. **Hairlines before boxes.** Structure comes from 1px low-contrast lines, tonal surface steps or a ring-shadow. Never a heavy border *and* a heavy shadow.
6. **Radii are concentric and consistent.** Inner radius = outer radius − padding. One radius personality per product.
7. **Show the real thing.** Real product UI rendered in HTML beats stock illustration. Realistic numbers beat placeholders.
8. **States are part of the design.** Every control has hover, focus-visible, active and disabled states. Every data view has loading, empty and error states.
9. **Motion explains; it never decorates.** Under 300ms for UI, ease-out curves, and less animation the more often something happens.
10. **Accessible by default.** AA contrast on the surface the text actually sits on; 24px minimum hit areas (44px on touch); complete keyboard paths; reduced motion respected.
11. **One loud idea.** Each page earns exactly one signature move — a display face, a shape, a hero technique, a color block. Everything else stays quiet.
12. **Numbers are UI.** Tabular numerals, aligned decimals, de-emphasized units, and a trend that says what it means.

### Personality spectrum

Every product sits somewhere on these three axes. Decide before designing.

| Axis | ← | → |
|---|---|---|
| Density | Spacious marketing (16–18px body, 96–128px sections) | Dense tool (13–14px body, 32px controls, 40px rows) |
| Temperature | Cool precision (pure neutrals, blue accent) | Warm craft (tinted neutrals like #F7F7F5, earthy accent) |
| Voice | Quiet (hairlines, no gradients) | Cinematic (full-bleed media, particles, depth) |

---

## Colors

### Core palette (light)

The token values in the front matter are the **Core** theme: a neutral, precise product palette built from the apps cheatsheet and adjusted for contrast.

| Token | Hex | Role | Contrast on canvas |
|---|---|---|---|
| `canvas` | #FFFFFF | Page and app background | — |
| `surface` | #FAFAFA | Sidebars, secondary panels, kbd | — |
| `surface-2` | #F4F4F5 | Hover and selected rows, gray tiles, input wells | — |
| `hairline` | #EBEBEB | 1px borders and dividers | — |
| `hairline-strong` | #D4D4D8 | Strong dividers on non-interactive surfaces | — |
| `ink-strong` | #111111 | Headings, display, emphasized values | 18.9:1 |
| `ink` | #333333 | Default text | 12.6:1 |
| `ink-subtle` | #6B6B6B | Secondary text, meta, placeholders | 5.33:1 (5.11:1 on `surface`, 4.85:1 on `surface-2`) |
| `primary` | #0070E0 | Brand accent: primary buttons, focus rings, switch-on, key data | 4.78:1 with white |
| `primary-hover` | #005FC2 | Hover and pressed state of primary; links on `surface-2` tiles | 6.15:1 with white; 5.59:1 as text on `surface-2` |
| `link` | #0070E0 | Inline links (same hue as `primary`, its own role) | 4.78:1 |
| `inverse` / `on-inverse` | #111111 / #FFFFFF | Dark buttons (Upgrade, CTAs), tooltips, toasts | 18.9:1 |
| `control-border` | #8A8A8A | Borders of inputs, checkboxes and radios; switch track when off. A field's border is its only boundary, so it must reach 3:1 | 3.45:1 (3.14:1 on `surface-2`) |
| `success`, `success-fill`, `on-success` | #15B042, #CAFACE, #0E7A2F | Status dot; badge fill; badge text | 4.70:1 badge |
| `warning-fill`, `on-warning` | #FFF1D6, #8A4B00 | Warning badge | 6.09:1 |
| `danger`, `danger-fill`, `on-danger` | #D92D20, #FFE8E6, #B42318 | Destructive button; error badge | 4.83:1 / 5.62:1 |
| `info-fill`, `on-info` | #E6F0FF, #0058B0 | Info badge | 6.04:1 |

In this file `primary` always means the **brand accent**, never body text. Body text is `ink`.

**Contrast adjustments to the cheatsheet** (the original values are kept verbatim in **Reference Library → Apps UI cheatsheet**):

- Badge text `#15B042` on `#CAFACE` measures **2.47:1** and fails AA. 71UI ships `#0E7A2F` on `#CAFACE` (**4.70:1**) and keeps `#15B042` for the status dot.
- Subtle text `#777777` on white measures **4.48:1**, 0.02 short of AA. 71UI uses `#6B6B6B`: **5.33:1** on white and still **4.85:1** on the `surface-2` gray where counts, labels and prices often sit.
- White text on the switch blue `#0077E6` measures **4.39:1**. 71UI's `primary` is `#0070E0` (**4.78:1**), so one blue can carry both the switch and white button labels.

### Core palette (dark)

Dark mode is designed, not inverted: surfaces get *lighter* as they rise, text is slightly warm, and accents stay the same hue.

```css
:root { color-scheme: light; }
:root[data-theme="dark"] {
  color-scheme: dark;
  --color-canvas: #0A0A0B;
  --color-surface: #111113;
  --color-surface-2: #1A1A1D;
  --color-hairline: rgb(255 255 255 / 0.08);
  --color-hairline-strong: rgb(255 255 255 / 0.14);
  --color-control-border: rgb(255 255 255 / 0.40);  /* 3.77:1 on canvas, 3.31:1 on surface-2 */
  --color-ink-strong: #F4F4F2;  /* 17.97:1 on canvas */
  --color-ink: #D6D6D3;         /* 13.59:1 */
  --color-ink-subtle: #8F8F8A;  /* 6.09:1 on canvas, 5.34:1 on surface-2 */
  --color-primary: #0070E0;     /* fills only: white label 4.78:1 */
  --color-primary-hover: #005FC2;
  --color-link: #4193F5;        /* link text: 6.33:1 on canvas, 5.55:1 on surface-2 */
  --color-inverse: #F4F4F2;     /* light pill CTA on dark */
  --color-inverse-hover: #DADAD6; /* 14.12:1 with on-inverse */
  --color-on-inverse: #0A0A0B;
  --color-success-fill: #0F2A19; --color-on-success: #5FD68A;  /* 8.40:1 */
  --color-warning-fill: #2E2210; --color-on-warning: #F5B94A;  /* 8.81:1 */
  --color-danger-fill: #3A1512;  --color-on-danger: #F97066;   /* 5.82:1 on its fill, 7.10:1 on canvas */
  --color-info-fill: #0E2440;    --color-on-info: #6AAEFF;     /* 6.77:1 */
}
```

### Color rules

1. **Semantic tokens only.** Components use `--color-ink-subtle`, never `--gray-500` or `#6B6B6B`. Name tokens by role, never by appearance or first use: `--color-accent-solid`, not `--color-blue-button`.
2. **Every palette step has a job.** Page background, hover, border, solid fill, text. Delete steps nothing uses.
3. **Measure contrast on the real surface.** Body and secondary text ≥ 4.5:1; large text (≥ 24px, or ≥ 18.66px bold) and UI graphics ≥ 3:1; focus indicators ≥ 3:1.
4. **Links on gray tiles** use `primary-hover` (#005FC2, 5.59:1 on `surface-2`); `link` #0070E0 drops to 4.35:1 there.
5. **Status is never color alone.** Pair status color with a label, icon or shape: a "Connected" badge, not a green dot alone.
6. **One accent.** Hues within 15° of each other count as the same color. A second accent needs a job the first can't do, such as a data-series color.
7. **Tint, don't gray, on colored surfaces.** Secondary text on a blue card is a lighter tint of the card's own hue or white at 70–80%, never neutral gray.
8. **Gradients are material, not decoration.** Allowed: soft light falloff (radial, ≤ 25% alpha), photographic or 3D media, data encodings. Interpolate `in oklab` for even brightness. Banned: purple-to-blue "AI" washes behind text, gradient headlines (one exception: a vertical white→gray fade on a dark hero line, as Qronos does), rainbow borders.
9. **Warm neutrals signal craft; cool neutrals signal precision.** Pick one temperature and keep it across canvas, surfaces and text: #F7F7F5 with #222F30 ink is warm; #FAFAFA with #111111 is neutral.
10. **Pure black and pure white are allowed.** Use #000 canvases only with a 1px frame system (Qronos) or full-bleed media. Tinted near-blacks (#0A0A0B, #1C1C1C) are the default dark canvas.

**The measured lesson:** all four extracted reference sites fail AA somewhere in their secondary text, even though they look polished. Qronos's #757168 on black is 4.30:1 (use #8A857B, 5.69:1). SaasCN's #737373 on #F5F5F5 is 4.35:1 (use #6B6B6B, 4.89:1). V7's muted labels come to 2.88:1 (use #6E6D6B, 4.79:1). Integrated Bio's dimmed headline tail #C9CBBE is 1.53:1; as large text it needs 3:1. Beautiful and accessible are compatible — just check the second-tier text.

---

## Typography

### Core scale

| Token | Size / line-height | Weight | Tracking | Use |
|---|---|---|---|---|
| `display-xl` | 72 / 72 | 500 | −0.04em | Marketing hero (clamp to 44px on mobile) |
| `display-lg` | 56 / 58 | 500 | −0.035em | Hero on dense pages, big section openers |
| `display-md` | 44 / 46 | 500 | −0.03em | Section titles |
| `headline` | 32 / 36 | 500 | −0.025em | Page titles in apps, card-group titles |
| `title-lg` | 24 / 30 | 500 | −0.02em | Feature-card titles |
| `title` | 20 / 26 | 500 | −0.015em | App page titles |
| `title-sm` | 16 / 20 | 500 | −0.01em | Card, dialog and section titles in apps (cheatsheet: "16/20px Medium titles") |
| `body-lg` | 18 / 28 | 400 | −0.01em | Marketing lead paragraphs |
| `body` | 16 / 24 | 400 | 0 | Marketing body, forms on mobile |
| `body-sm` | 14 / 20 | 400 | 0 | App body text and sidebar nav (cheatsheet: "14px Regular body") |
| `label` | 13 / 16 | 500 | 0 | Field labels, table headers (cheatsheet: "13/16px Medium labels") |
| `label-sm` / `caption` | 12 / 16 | 500 / 400 | 0 | Badges, meta, timestamps |
| `button` / `button-lg` | 13 / 15 | 500 | 0 / −0.01em | 32px app buttons / 40–48px marketing CTAs |
| `numeric` | 32 / 36 | 500 | −0.025em, `tnum` | Stat values, balances, prices |
| `mono` / `eyebrow` | 12 / 11 | 500 | 0 / +0.08em | IDs, addresses, code / uppercase index labels |

The cheatsheet's "16/20px" and "13/16px" use the typographer's *size/line-height* notation: 16px type on a 20px line, 13px type on a 16px line.

Fluid display: `font-size: clamp(2.75rem, 1.6rem + 3.8vw, 4.5rem)` gives 44px at 390px wide and 72px at 1440px.

Font tokens name the primary family only (the DESIGN.md exporter quotes a whole comma list as one name). Declare full stacks in CSS: `--font-sans: "Inter", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;` and `--font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;`.

### Type rules

1. **Tracking tightens as size grows.** Use this ladder: 72px −0.04em · 56px −0.035em · 44px −0.03em · 32px −0.025em · 24px −0.02em · 20px −0.015em · 16px titles −0.01em (16px body stays 0) · 14px and below 0. Uppercase labels get +0.06 to +0.12em. Never tighter than −0.05em.
2. **Line-height falls as size grows.** Display 0.95–1.05; headings 1.1–1.3; body 1.4–1.6. Use ≥ 1.4 for anything that wraps to three or more lines.
3. **Weights.** Display 400–500 (the references use 300–500; none use bold). Two stated exceptions: a light serif display may use 300 (playbook I), and a hero *number* may use 600 (playbooks D and G). UI labels 500; body 400. Nothing below 400 under 18px; under 300 only at 28px and up. Emphasis is one weight step or one color step, never both.
4. **Two families plus mono, at most.** A display face may differ from the text face only if it's clearly different (serif display + sans text, for example). Every family you add costs a font request.
5. **Measure.** Body copy is 60–75 characters per line (`max-width: 68ch` or `var(--spacing-measure)`).
6. **Wrapping.** `text-wrap: balance` on headings, `text-wrap: pretty` on short descriptions, neither in long-form text. `overflow-wrap: anywhere` on URLs, hashes and wallet addresses. `white-space: nowrap` on labels and badges only; buttons may wrap to two lines rather than clip at 320px or 200% zoom.
7. **Numbers.** `font-variant-numeric: tabular-nums` on every changing value, table column, price, balance, timer and chart axis. Right-align numeric columns. Render units and currency codes one step subtler than the figure: **$6,852** / $10,000.
8. **Case.** Store copy in natural case; apply `text-transform: uppercase` in CSS. Sentence case for buttons, labels and headings.
9. **Smart punctuation.** Curly quotes ’ “ ”, en dash for ranges (Mar 20–26), em dash for asides, a single ellipsis character (…), × for multipliers (3×).
10. **Rendering.** Ship `.woff2` only, with `font-display: swap` and a metric-matched fallback (`size-adjust`) to avoid layout shift. Set `-webkit-font-smoothing: antialiased` once on `:root`. Use `font-optical-sizing: auto` for variable fonts that have an `opsz` axis (Inter does).
11. **Two-tone headlines are a quiet system device, not a loud idea.** First clause in `ink-strong`, second clause in `ink-subtle` or a tinted gray at ≥ 3:1 (Qronos, Integrated Bio, V7). Use them on every section title or on none. They replace bolding one word or coloring a keyword.
12. **Inline emphasis by brightness.** In a dark hero paragraph, set key phrases at 100% white and the rest at 50–65% (V7; 50% white on #1C1C1C is 5.17:1). It's quieter and more legible than bold.

### Pairing library

Inter is the correct default for **product UI**: legible at 13px, tabular figures, huge language coverage. It is not a personality. Marketing pages pick a display face from the playbook.

| Mood | Display | Text | Mono | Seen in |
|---|---|---|---|---|
| Neutral precision | Inter (opsz) 500 | Inter | Geist Mono | Ace Studio, Stacker |
| Engineered | Geist 400–500 | Geist | Geist Mono | SaasCN |
| Cinematic tech | Inter Tight / General Sans 400 | system-ui or Inter | SF Mono / JetBrains Mono | Qronos (renders a Helvetica-like fallback) |
| Warm scientific | Aspekta 400 (check license) / Manrope 400 | same | Roboto Mono (uppercase labels) | Integrated Bio |
| Editorial trust | Martina Plantijn Light 300 (commercial) → free: Newsreader 300, Instrument Serif 400, Source Serif 4 Display 300 | a grotesk (STK Bureau → free: Geist, Switzer, Inter) | DM Mono | V7 Labs, Awake Origin |
| Friendly fintech | Manrope / Plus Jakarta Sans 500 (600 for hero numbers) | same | — | Credit app (08), banking (13) |
| Expressive portfolio | Instrument Serif italic + Inter, or Clash Display / Cabinet Grotesk (Fontshare) | Inter | JetBrains Mono | — |

Avoid unless the brief asks: Space Grotesk for crypto (overused), Poppins, Montserrat for headings, Impact or Arial Black display type, and monospace used as a "tech" costume for body text.

---

## Layout

### Spacing scale

All spacing comes from a 4px base: `2 · 4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 96 · 128`. Don't use arbitrary values like 13px or 27px. Two exceptions: a 6px micro-gap inside controls (icon ↔ label, dot ↔ badge text), and optical nudges of 1–2px, each with a comment.

| Relationship | Gap |
|---|---|
| Icon ↔ label inside a control | 6–8px |
| Label ↔ its input, title ↔ its description | 4–8px |
| Items inside a group (list rows, form fields) | 8–12px |
| Between groups inside a card or panel | 16–24px |
| Card padding (app / marketing) | 16–20px / 24–32px |
| Section header block → section content | 48–64px |
| Between marketing sections (desktop / mobile) | 96–128px / 64–80px |
| App page padding (desktop / mobile) | 24–32px (40px on wide settings pages) / 16px |

**Grouping law:** the gap between groups is at least 2× the gap inside them.

### Grid and containers

| Viewport | Side margin | Columns | Gutter |
|---|---|---|---|
| < 640px | 16px | 4 | 16px |
| 640–1023px | 24px | 8 | 20px |
| 1024–1279px | 32px | 12 | 24px |
| ≥ 1280px | 40–56px | 12 | 24–32px |

- **Content container:** 1280px max. **Wide frame:** 1344–1400px (Qronos draws its 1400px frame as visible 1px rails). **Reading measure:** 680px.
- Use logical properties (`padding-inline`, `margin-block-start`). Never fix the width or height of a text container.
- **Split section header** (Qronos, V7, Integrated Bio): the title spans 7 of 12 columns on the left and the lede spans 5 on the right, aligned to the title's first line. It reads faster than a centered stack and gives sections an editorial rhythm.

### Hero architectures

Pick one. Each is taken from a reference that uses it well. Hero IDs are prefixed **HA** so they're never confused with `<h1>`–`<h6>` heading levels.

| # | Architecture | Recipe | Reference |
|---|---|---|---|
| HA1 | **Centered statement** | Announcement chip → H1 (≤ 2 lines, ≤ 12 words) → lede (≤ 2 lines, 18–20px, 560–640px wide) → 1–2 CTAs → logo wall at the bottom of the fold. One background medium: a particle canvas, a cinematic photo, a soft gradient blob or a hatched grid. | Qronos, Qorix, V7, SaasCN |
| HA2 | **Offset editorial** | Huge H1 (80–96px, weight 400, −0.04em) starting at grid column 3, left-aligned. Below it: a tab strip of 3 capabilities, then a collage row of real UI cards (a colored data card, two gray action tiles, a photo). | Stacker (01) |
| HA3 | **Split statement** | H1 on the left (serif 64–80px); lede and CTAs in a right column aligned to the H1's first line; a full-width media panel beneath with 2–4 stats overlaid in hairline cells. | Awake Origin (05) |
| HA4 | **Cinematic frame** | Video or WebGL fills a rounded frame inset 12px from the viewport (20px radius). H1 top-left (100–112px, white), lede bottom-left, CTA bottom-right; the nav floats over the media in chips. | Integrated Bio |
| HA5 | **Product canvas** | Short H1 + lede, then a large product panel (≥ 1200px wide) built in HTML with realistic data, cropped by the fold or the next section. | Qronos section 2 |
| HA6 | **Bento opener** | Pill badge → centered headline → 3 tiles, each a live product moment (a converter, a photo, a receipt). | Banking (13), widgets (06) |

### Bento rules

- 2–5 tiles, with at most one hero tile spanning two columns.
- Each tile holds **one idea**: a title (`title-lg`), one sentence, and one visual moment that is real UI, not an icon.
- **Vary exactly one property** across tiles so the grid doesn't look cloned: one color-block tile, one dark tile or one photo tile. Stacker uses gray/orange/blue; Integrated Bio uses lime/charcoal/stone; the banking page uses gray/blue-photo/gray.
- Gaps: 16–24px for friendly products; 1px hairlines or 4px gutters for technical and enterprise products (SaasCN's dashed cells, V7's 4px frame).
- Keep radii inside tiles concentric (see **Shapes**).

### Density modes

| | App (dense) | Marketing (spacious) |
|---|---|---|
| Body text | 14px (`body-sm`) | 16–18px (`body` / `body-lg`) |
| Controls | 32px, 10px radius | 40–48px, pill or 8–12px |
| Rows | 40px data, 44px list/store, 32px compact | — |
| Card padding | 16–20px | 24–32px |
| Section gap | 24–32px | 96–128px |
| Icons | 16px, 1.5px stroke | 20–24px |

---

## Elevation & Depth

Depth comes from exactly **one method per surface**, chosen in this order of preference:

1. **Tonal steps.** canvas → surface → surface-2. In dark mode, higher surfaces are lighter.
2. **Hairline.** 1px `hairline` border.
3. **Ring-shadow.** A 1px zero-blur ring plus soft layers. The ring *is* the border, so don't add another.
4. **Layered shadow.** For floating things only: popovers, menus, modals, drag previews.
5. **Glass.** Only for chrome that floats over content: a sticky nav, its dropdowns, a floating toolbar, a player bar.

### Shadow presets

```css
:root {
  /* Ring-shadow: cards and controls that need a crisp edge. Replaces a border. */
  --shadow-ring: 0 0 0 1px rgb(0 0 0 / .06), 0 1px 2px -1px rgb(0 0 0 / .06), 0 2px 4px 0 rgb(0 0 0 / .04);
  /* sm: pills, compact cards, icon tiles. It contains a 1px ring, so don't add a border. */
  --shadow-sm: 0 2px 3px -1px rgb(0 0 0 / .10), 0 1px 0 0 rgb(25 28 33 / .02), 0 0 0 1px rgb(25 28 33 / .08);
  /* md: default elevated surface (popovers, raised cards). Each layer doubles offset and blur. */
  --shadow-md: 0 0 0 1px rgb(0 0 0 / .06), 0 1px 1px -.5px rgb(0 0 0 / .06), 0 3px 3px -1.5px rgb(0 0 0 / .06),
               0 6px 6px -3px rgb(0 0 0 / .06), 0 12px 12px -6px rgb(0 0 0 / .06), 0 24px 24px -12px rgb(0 0 0 / .06);
  /* lg: hero media, modals, feature callouts. Never on dense lists or small controls. */
  --shadow-lg: 0 2.8px 2.2px rgb(0 0 0 / .034), 0 6.7px 5.3px rgb(0 0 0 / .048), 0 12.5px 10px rgb(0 0 0 / .06),
               0 22.3px 17.9px rgb(0 0 0 / .072), 0 41.8px 33.4px rgb(0 0 0 / .086), 0 100px 80px rgb(0 0 0 / .12);
}
:root[data-theme="dark"] {
  --shadow-ring: 0 0 0 1px rgb(255 255 255 / .08);
  /* Qronos bevel: a lit top edge and a shadowed bottom edge on dark panels */
  --shadow-bevel: inset 0 1px 0 rgb(255 255 255 / .08), inset 0 -1px 0 rgb(0 0 0 / .7);
}
```

- **One strength per state.** A card doesn't jump from `sm` to `lg` on hover. If elevation changes with interaction, move one step.
- **Neutral shadows only.** No colored glows. Two exceptions: a ≤ 5px status glow on a live-indicator dot, and one brand-colored edge glow when it is the page's chosen loud idea (playbook I).
- **Clipped shapes** (`clip-path`, notched corners) clip `box-shadow`. Put `filter: drop-shadow()` on a wrapper instead.
- **Image outline:** every image and video gets `outline: 1px solid rgb(0 0 0 / .08); outline-offset: -1px`, or white at 8% in dark mode, so it doesn't bleed into the surface.

### Glass recipe

```css
.glass {
  background: rgb(255 255 255 / .6);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  backdrop-filter: blur(20px) saturate(180%);
  border-block-end: 1px solid rgb(0 0 0 / .06);
}
:root[data-theme="dark"] .glass {
  background: rgb(10 10 11 / .6);
  border-block-end-color: rgb(255 255 255 / .08);
}
@media (prefers-reduced-transparency: reduce) {
  .glass { background: var(--color-canvas); -webkit-backdrop-filter: none; backdrop-filter: none; }
}
```

Bigger surfaces get more blur. Never stack glass on glass. Text on glass gets a heavier weight (+100) and higher contrast. A modal gets a scrim (`rgb(0 0 0 / .4)` plus `blur(4px)` on the page behind, as in reference 11); a non-blocking panel gets translucency and no scrim.

### Layering scale

`base 0 · raised 10 · sticky 20 · overlay 40 · modal 50 · dropdown/popover 60 · toast 70 · tooltip 80`. Menus rank above modals because portaled menus (shadcn/Radix) open from inside dialogs. Native `<dialog>` and the Popover API use the top layer and need no z-index. Components never set ad-hoc z-index values.

---

## Shapes

### Radius scale

| Token | px | Use |
|---|---|---|
| `xs` | 4 | Kbd, inline code, checkbox, tiny tags |
| `sm` | 6 | Badges (cheatsheet), tooltips |
| `md` | 8 | Inputs, sidebar items, menus, small cards |
| `control` | 10 | Buttons (cheatsheet) |
| `lg` | 12 | App cards, panels, popovers |
| `xl` | 16 | Modals, app-icon tiles, media |
| `2xl` | 24 | Marketing tiles, bento cells, large modals |
| `3xl` | 32 | Hero panels, section containers (banking bento 32px; Integrated Bio's newsroom panel uses 40px) |
| `full` | 9999 | Pills: CTAs, chips, avatars, switches |

**Concentric rule:** inner radius = outer radius − padding. A 24px tile with 8px padding holds a 16px inner card. Past 24px of padding, the radii are independent.

### Radius personalities

Choose one per product and apply it everywhere.

| Personality | Controls | Cards | Pills? | References |
|---|---|---|---|---|
| **Soft precise** (default) | 8–10px | 12–16px (marketing tiles 24px) | CTAs, chips, switches, avatars; badges stay 6px | Ace Studio, IndexRave |
| **Friendly** | 12px or pill | 24–32px | Yes | Stacker, banking bento, credit app |
| **Architectural** | Pill CTAs, 0–5px everything else | 0–14px | CTAs only | Qronos, SaasCN |
| **Editorial square** | 0–2px | 0–6px | No | Awake Origin (square black buttons) |
| **Organic science** | 8–12px, with slanted/notched edges | 16–20px (newsroom panel 40px) | No | Integrated Bio |

Pills are for small controls, CTAs, chips and avatars — never for cards or inputs wider than 320px.

### Signature shapes

Reach for one of these when a page needs its loud idea. Each is measured from a reference.

- **Slanted split CTA** (Integrated Bio): a 48px dark label block (`border-radius: 12px 0 0 12px`, right edge cut at about 12°) paired with a separate lime arrow tile that has a matching slant, leaving a 4px diagonal gap. Build it with `clip-path: polygon()` on both parts.
- **Notched card corner** (Integrated Bio news cards): the bottom-right corner is cut out as a rounded notch that cradles a 48px arrow tile. Use an SVG mask or `mask-image` with a radial cutout.
- **Frame rails and crosshairs** (Qronos, SaasCN): 1px vertical rails at the container edges, horizontal rules at section boundaries, and a small "+" or sparkle glyph where the lines meet.
- **Hatched band** (Qronos, SaasCN): a 32–40px separator between sections filled with `repeating-linear-gradient(135deg, transparent 0 6px, rgb(255 255 255 / .06) 6px 7px)`. On light themes, use `rgb(0 0 0 / .06)`. Frame rails may reach 12% alpha; hatch fills stay ≤ 6%.
- **Tilted drag card** (Stacker 02): the selected card rotates −2°, gets a 2px accent border, and carries a named cursor tag ("You"). It shows multiplayer at a glance.
- **Overlapping deck** (Stacker 04): 3–4 horizontal cards overlap by about 24px, each with its own color (gray, orange, blue) and a huge date numeral.
- **Squircle app icons** (Ace Studio sidebar): 20px gradient squircles next to nav labels give a monochrome sidebar a color rhythm.

### Icons

- One family per product (Lucide, Phosphor or SF Symbols). Use 16px icons in 32px controls and 20px in 40–48px controls.
- Stroke weight follows text weight: 1.5px next to 400 text, 2px next to 500–600, 2.5px next to 700.
- The icon side of a button gets 2px less padding than the text side, so the button looks balanced.
- An icon-only button needs an `aria-label` and a hit area of at least 24px: 32px is typical in dense toolbars, 40px on desktop where density allows, 44px on touch.

---

## Components

Sizes, radii and states are decided here. Build with these values; don't re-derive them.

### Buttons

| Size | Height | Padding (inline) | Font | Radius | Use |
|---|---|---|---|---|---|
| xs | 24px | 8px | 12px / 500 | 6px | Inline table actions |
| sm | 28px | 12px | 13px / 500 | 8px | Toolbars |
| **md (default)** | **32px** | **12px** | **13px / 500** | **10px** | App UI (cheatsheet) |
| lg | 40px | 16px | 14px / 500 | 10px or pill | Forms, marketing secondary |
| xl | 44–48px | 20–24px | 15px / 500 | pill or 12px | Marketing CTAs, mobile primary |

**Variants:** `primary` (accent fill), `secondary` (canvas + 1px `hairline-strong` border), `ghost` (no fill, hover `surface-2`), `inverse` (#111 fill: the "Upgrade" button), `danger`, `link`.

**States:**
- Hover: one step darker (`primary-hover`), or `surface-2` for ghost and secondary buttons, placed behind `@media (hover: hover)`.
- Active: `scale: 0.97` with `transition: scale 160ms ease-out`.
- Focus-visible: `outline: 2px solid var(--color-primary); outline-offset: 2px`.
- Disabled: 50% opacity, with a visible reason nearby. A tooltip on a `disabled` button never opens for keyboard or touch users.
- Loading: a spinner replaces the leading icon, the label stays, the button's width is locked, and `aria-busy="true"` is set.

**Marketing CTA patterns from the references:**
- **Light pill on dark:** white fill, #000 label: 40px tall with 20px padding (Qronos "Request a demo"), or 34px tall (V7 "Get in Touch").
- **Ghost pill on dark:** transparent fill, 1px border at 45–50% white, 40px tall (Qronos "Get started »").
- **Sheen border:** a small radial light travels along the pill's border every 3s (Qronos's `star-btn`, animated with `offset-path` / `offset-distance`). It's an ambient loop, so it counts against the page's one-loop budget and stops under reduced motion.
- **Slanted split CTA:** the Integrated Bio pattern in **Shapes**, with a 48px label block and a mono uppercase 14px label.
- **Square black:** a 44px tall rectangle, 0–2px radius, 14px label (Awake Origin). Use it only with an editorial serif.
- **Avatar CTA pill:** a 59px tall pill *button* (not a card) holding 2 overlapping avatars, a title, a subtitle ("See it on your data · 30 minutes") and a circular arrow (V7).

### Inputs and forms

- Heights: **32px** in dense apps, **40px** in forms, **44–48px** on mobile. Use 16px text on mobile inputs to prevent iOS zoom.
- Border 1px `control-border` (#8A8A8A, 3.45:1). The border is the field's only boundary, so it must reach 3:1. Radius 8px. Hover darkens the border one step. Focus: `outline: 2px solid var(--color-primary); outline-offset: 2px`, or an inset `box-shadow: 0 0 0 2px var(--color-primary)` (4.78:1). Never a pale 25%-alpha glow ring (1.43:1).
- The label sits above the field (13/16px, 500, 8px gap). Helper text below is 12px `ink-subtle`. Error text replaces the helper in `on-danger` with an icon.
- Every input has a real `<label>`, a correct `type` and `inputmode`, and an `autocomplete` value. Never block paste.
- Keep submit enabled until the request starts; validate on submit; set `aria-invalid` and `aria-describedby`; move focus to the first invalid field.
- **Input groups:** prefix and suffix live inside the border (currency selector, unit, kbd hint). For amounts, use the banking pattern: a 16px-radius gray well holding a small label ("From"), a large tabular value, and a pill selector with a flag.
- **Search / quick actions:** a 36px field with a leading icon, placeholder "Quick actions" or "Search", and a trailing `⌘K` kbd (Ace Studio, SaasCN).

### Selection controls

- **Checkbox and radio:** 16px box, 4px radius (checkbox) or full (radio), 1px `control-border` border (an unchecked box has no other cue); checked fills `primary` with a white glyph. The hit area covers the label.
- **Switch (cheatsheet):** 24 × 14px track, 10px thumb, 2px inset. On = `primary`; off = `control-border` (3.45:1). The thumb moves 10px with `transition: translate 150ms ease-out`. Wrap it in a label so the hit area is at least 24px (44px on touch). Label it with the state it turns on: "Send read receipts".
- **Segmented control / tabs:** 32px tall. Either an underline style (2px `ink-strong` indicator that slides under the active tab) or a pill style (the active tab is a `surface-2` pill with an icon and `ink-strong` text; inactive tabs are `ink-subtle` text with icons — Stacker 01). Use the pill style for marketing and the underline style for dense apps.

### Badges, chips and tags

- **Status badge (cheatsheet):** 20px tall, 6px radius, 8px padding, 12px/500, with a tinted fill and dark text of the same hue (`success-fill` + `on-success`). An optional 6px status dot sits 4px before the label.
- **Filter chip:** 28px pill, 12px padding, 1px hairline border, 13px text; selected = `inverse` fill.
- **Tag (V7):** 25–27px tall, 6px radius, a 1px border at 8% white and a 5% white fill on dark, 13px text at 71% white.
- **Eyebrow chip (Integrated Bio):** 30px tall, 4–6px radius, a light fill, a 6px lime square, then a mono uppercase 12–14px label. Use it only where it encodes information: a section index, a category or a date.
- **Announcement chip (SaasCN):** 32px, 1px border, 6px radius, 14px/500 text plus a ↗ icon, centered above the H1.

### Rows, lists and tables

- **Row heights (cheatsheet):** data rows 40px, list/store rows 44px, compact rows 32px. Cell padding is 12px inline.
- Header cells are 12–13px/500 `ink-subtle`, sentence case, never bold black. Numeric columns are right-aligned and tabular.
- Dividers are 1px `hairline`. Zebra stripes are banned; use hover `surface` instead.
- **Key-value tables (Ace Studio "Data sync"):** a 2-column bordered table with a leading 16px icon, the label in `ink-subtle`, and the value underlined as a link when it drills down.
- **List rows (Ace Studio "Stores", Inbox status list):** a leading 20px icon or favicon, the name in `ink-strong`, a secondary link or value, and a trailing count in tabular `ink-subtle`.
- Row actions appear on hover *and* on focus-within, and stay visible under `@media (hover: none)`. Nothing is hover-only.
- Truncate with an ellipsis and keep the full value reachable (tooltip or expand).

### Sidebar (app navigation)

Measured from Ace Studio (07), Inbox (12) and IndexRave (10):

- Width 240px, background `surface`, 1px `hairline` on the inline end. It collapses to a 56px icon rail.
- Top to bottom:
  1. Workspace switcher (40px; 20px logo, name, chevron).
  2. Quick-actions field with ⌘K (36px).
  3. Primary nav items (32px tall, 8px radius, 16px icon, 8px gap, `body-sm`).
  4. Section labels ("Tools", "Pinned", "Chat": 12px/500 `ink-subtle`, 24px above, 8px below, optional + button on the right).
  5. Bottom slot: an onboarding progress card ("Getting started · 1 of 5" with a progress ring), then the plan/trial row with an `inverse` "Upgrade" button.
- Active item: `surface-2` fill, `ink-strong` text, and an icon in the same color (not the accent). IndexRave's accent-colored active item is acceptable only when the accent is the brand's main color.
- Counts are right-aligned, tabular, `ink-subtle` (Inbox). Chat and history items truncate at one line.

### Top navigation (marketing)

- Height 56–64px inside the page (Qronos: 48px bar inside a framed top area; V7: 60px plus a 36px announcement bar; Integrated Bio: 54px floating chips 30px from the top).
- Links 14px/400–500 in `ink-subtle` (5.33:1) or at ≥ 70% of `ink-strong`; hover goes to full ink over 150ms. Gap 24–48px (Qronos uses 48px).
- Right side: a text "Log in" link, then one CTA (32–40px). At most two buttons.
- Sticky behavior: transparent over the hero, then a solid or glass background after 8–16px of scroll, via an IntersectionObserver sentinel. Re-theme the nav when it crosses into a dark or light section (V7).
- Mobile: a 44px hamburger that opens a full-height sheet with 20–24px links and the CTA pinned at the bottom.
- Never hide the nav on scroll-down. None of the 15 measured reference navbars use hide-on-scroll (Stripe and On simply scroll away with the page).
- Dropdowns attach to the bar or float 8–12px below it, with an 8–16px radius and a `--shadow-md` or glass surface. Mega menus dim the page 40–70%.
- See **Reference Library → Navbar archetypes** for ten measured archetypes (N1–N10) and the default for each playbook.

### Cards

| Card | Radius | Padding | Anatomy |
|---|---|---|---|
| App card | 12px | 20px | Title (`title-sm`), optional description, content, footer actions on the right |
| Feature tile | 24–32px | 24–32px | Eyebrow (optional) → `title-lg` → one sentence → one live UI moment; `surface-2` fill (Stacker 02–03, banking 13) |
| Stat card (IndexRave, Qronos) | 12px | 16–20px | 24px icon tile + 13px label → `numeric` value (24–32px) → footnote strip in `surface` below a hairline ("No funds created yet") |
| Pricing card (Qronos) | 12–14px | 24px | Plan name 14px → price `numeric` 30–40px with "/ month" in `ink-subtle` → one-line description → full-width button → checklist (16px check, 14px `ink-subtle`, 4.85:1 even on `surface-2`); the featured plan gets a lit border or `surface-2` |
| Testimonial (V7, Qronos) | 12–14px | 32px | Quote in the display face at 22–24px/1.4 → 32px avatar + name (`title-sm`) + role (`ink-subtle`) → optional metric strip split into 2 cells |
| Widget (reference 06) | 20px | 20–24px | A 12px gray caption *outside* the card ("Music"), one idea per card, real content, `--shadow-md` or ring |

### Overlays

- **Modal:** widths 480px (sm), 640px (md), 780px (lg, with a media header like reference 11). Radius 16–24px; padding 24px; scrim `rgb(0 0 0 / .4)` with the page blurred 4px. It always has a title and a description. Actions sit on the right on desktop and span full width on mobile. The primary action repeats the consequence ("Install Chrome", "Delete project").
- **Sheet / drawer:** 400–480px from the inline end, or a bottom sheet on mobile with a 24px top radius and a 36 × 4px grabber.
- **Popover / menu:** 8–12px radius, `--shadow-md`, 4px inner padding, 32px items; opens from the trigger with `transform-origin` set to the trigger.
- **Tooltip:** 12–13px, 4px × 8px padding, 6px radius, `inverse` fill. It appears after 400ms; neighboring tooltips then appear instantly.
- **Toast:** bottom-right on desktop, bottom-center on mobile; 12px × 16px padding; `inverse` or `canvas` + `--shadow-md`. Timed toasts last ≥ 5s and pause on hover, on focus, and while the tab is hidden. Error and action toasts persist until dismissed.
- **Command palette:** 640px wide, 48px input, 40px rows, grouped results, kbd hints on the right, opened by ⌘K.

### Empty, loading and error states

- **Empty (Inbox 12, IndexRave 10):** a centered block holding a 48–96px illustration or icon tile, a title at 16–20px/500 that orients the reader ("You haven't created a fund yet"), one sentence on what to do, and **one** primary action ("Create your first fund"). Celebratory empty states (Inbox Zero) may add a short quote and an illustrated card.
- **Loading:** skeletons for content loads, matching the final layout's geometry and pulsing at most once per 1.5s. A spinner for action waits of roughly 400ms–10s, shown only after a ~300ms delay. A progress bar or step status beyond 10s.
- **Error:** say what happened and how to fix it ("Unable to sync Shopify. Check the store URL and try again."), with a retry button. No "Oops!", no apologizing.

### Data display

- **KPI row:** 3–4 stat cards or unboxed stats separated by vertical hairlines (Awake, IndexRave, Qronos).
- **Numbers:** value in `numeric`; label above in 12–13px `ink-subtle`; delta as a signed number with an arrow **and** color ("+18 pts this month").
- **Charts:** dashed hairline gridlines, at most 2 series colors plus a neutral, direct labels instead of legends where possible, tabular axis ticks. Real brand icons in legend headers help (Qronos's model columns).
- **Progress:** 4–6px bars with full radius; a gradient fill only to encode progress through a range (Qronos schedule bars); onboarding rings at 16px.

### Avatars, presence and identity

- Sizes 20 / 24 / 32 / 40px. Initials fallback on a hue derived from the name (Stacker's L/A circles).
- Stacks overlap by −8px with a 2px ring in the surface color.
- Presence: a named cursor tag in the accent color (Stacker "You"); an "online" dot of 8px with a 2px surface ring.

### Logo walls and footers

- **Logo wall:** monochrome logos at 50–70% opacity, 24–32px tall, optically balanced rather than equal widths. A marquee is optional: 30–40s linear, with a visible pause button (WCAG 2.2.2), paused on hover, focus and when offscreen, and static under reduced motion. It spends the page's one-loop budget. Caption above in `ink-subtle` ("Trusted by 50+ teams" or V7's italic serif word inside a sans sentence).
- **Footer:** a brand column (logo, one-sentence description, social text links), then 3–5 link columns (title 14px/500 `ink-strong`, links 14px/400 `ink-subtle` with 12–16px gaps), then a bottom bar with the copyright on the left and a status dot or legal links on the right ("● All systems operational" — Qronos). Optional closing statement or giant wordmark (Integrated Bio's full-width "IntegratedBio" at ~220px).

---

## Do's and Don'ts

### Do

- Write the token plan before code, and build tokens before components.
- Use one accent, one display face, one radius personality and one elevation method per product.
- Set display type large and tight (−0.03 to −0.04em) at weight 400–500. Let size, not weight, create hierarchy.
- Use two-tone headlines (strong first clause, subtle second clause) and inline brightness emphasis as quiet, consistent system devices.
- Show the product: build product UI in HTML with realistic data inside marketing sections.
- Give every card one idea and every page one loud idea.
- Measure contrast on the actual surface, especially second-tier text.
- Use tabular numerals for anything that changes or lines up.
- Put structure in hairlines, tonal steps and whitespace before borders and shadows.
- Design empty, loading and error states as first-class screens.
- Keep hover effects behind `@media (hover: hover)` and motion behind `prefers-reduced-motion: no-preference`.
- Use real brand, service and file icons where they carry meaning (integrations, models, file types).
- End marketing pages with a closing statement and one clear CTA, then a structured footer.

### Don't

- **The AI-default kit:** identical rounded cards in a 3-column grid, each with an icon + heading + paragraph, one radius everywhere, `rgba(0,0,0,.1)` shadows and purple-blue gradient washes.
- **Eyebrow on every heading.** A small uppercase kicker above a heading is allowed only when it encodes real information (index, category, date, status) and appears at most once per viewport (about one per section).
- Gradient text on headlines (the vertical white→gray fade on a dark hero is the only exception); glassmorphism as decoration; colored glows (except one brand edge glow chosen as the loud idea); neon-on-black "cyber" palettes.
- Bold (700–900) display type, one italic or colored word inside a headline, and fonts used as costumes (monospace body text to look "technical").
- A fade-and-slide-up on every section, hover lift on every card, parallax for its own sake, or `transition: all`.
- Big-number hero templates ("10x faster / 99.9% uptime / 24/7 support") unless the numbers are real and sourced.
- Numbered 01/02/03 markers on content that isn't a sequence.
- Emoji as icons, stock photos of people pointing at laptops, and 3D blobs with no meaning.
- Zebra tables, bold black table headers, and centered numeric columns.
- A 1px border *and* a heavy shadow on the same card (the "ghost card"); pill-shaped cards or wide inputs.
- Hover-only actions, icon-only buttons without labels, disabled buttons without a reason, and blocked paste.
- More than two CTAs in a hero, more than one filled button per view (persistent app chrome such as a sidebar "Upgrade" button is exempt), and vague labels ("Submit", "Click here", "Learn more" without a destination).
- Choosing light or dark by category cliché ("crypto = black and neon"). Choose by content, brand and context.

---

## Motion & Interaction

Motion has four jobs: **feedback** (it heard you), **orientation** (where this came from and went), **focus** (look here) and **continuity** (this is the same thing, changed). If an animation does none of these, delete it.

### Motion tokens

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);        /* default for UI enter/exit */
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);    /* larger entrances, reveals, underlines */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);    /* things moving across the screen */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);     /* sheets and drawers */
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);     /* color and state changes */
  --dur-press: 160ms;  --dur-fast: 150ms;  --dur-base: 200ms;
  --dur-slow: 300ms;   --dur-enter: 400ms; --dur-hero: 700ms;
}
```

The spring overshoot curve `cubic-bezier(0.34, 1.56, 0.64, 1)` (used by Qronos) is for playful consumer moments only. Never use it on menus, dialogs or data.

### Durations by element

| Element | Duration | Easing | Notes |
|---|---|---|---|
| Press feedback | 100–160ms | `--ease-out` | `scale: 0.97` (acceptable 0.96–0.98, never below 0.95). Fire on pointer-down. |
| Hover color / background | 150ms | `--ease-standard` | Behind `@media (hover: hover)`. Don't animate hover in dense lists. |
| Tooltip | 125–200ms | `--ease-out` | From `scale: 0.97` + opacity. Neighboring tooltips open instantly. |
| Dropdown / popover | 150–250ms | `--ease-out` | From `scale: 0.96` + opacity; `transform-origin` at the trigger. |
| Modal | 200–300ms in, ~150–200ms out | `--ease-out` | Content from `scale: 0.97`; scrim fades separately. |
| Sheet / drawer | 300–500ms | `--ease-drawer` | Follows the pointer 1:1 while dragged. |
| Toast | 220ms in, 165ms out | `--ease-out` | Slides from the edge it lives on. |
| Section / hero entrance | 400–700ms | `--ease-out-expo` | 40–80ms stagger per chunk, ≤ 5 chunks, total ≤ 800ms. |
| Number ticker | ≤ 500ms | `--ease-out` | `tabular-nums`, so digits don't jitter. |
| Skeleton pulse | 1.5s cycle | linear | Opacity 0.6 ↔ 1. |
| Marquee | 30–40s loop | linear | A visible pause button; paused on hover, focus and offscreen; static under reduced motion. |

Exits run at about 75% of the enter duration. Dense tools feel crisp at 150ms; marketing reveals can take 400–700ms. Nothing interactive exceeds 300ms, except drag-driven sheets and drawers (300–500ms).

### Frequency rule

How often someone sees an animation decides whether it exists:

| Frequency | Examples | Motion |
|---|---|---|
| 100+ times a day | Keyboard shortcuts, command palette, typing | **None.** Never animate keyboard-initiated actions. |
| Tens of times a day | Hover, list navigation, tab switches | Minimal: ≤ 150ms or none |
| Occasional | Modals, drawers, toasts, page transitions | Standard durations above |
| Rare | Onboarding, first success, celebrations | Room for one moment of delight |

### Motion rules

1. **Move and resize only with `transform`, `opacity`, `filter` and `clip-path`.** `color`, `background-color`, `border-color`, `outline-color` and `background-size` may transition for state feedback (≤ 150ms). Never animate `width`, `height`, `top`, `left`, `margin` or `padding`; for layout changes, use FLIP or the View Transitions API.
2. **Never `transition: all`.** Name the exact properties: `transition: scale 160ms var(--ease-out), background-color 150ms var(--ease-standard)`.
3. **CSS transitions for interaction** (they're interruptible), **keyframes for one-shot sequences**, **springs for gestures** (Motion/Framer: `{ type: "spring", bounce: 0, duration: 0.4 }`; a bounce of 0.1–0.2 only after a flick).
4. **Animate from the current on-screen value.** Never lock input during a transition. A reversed gesture inherits the velocity it had.
5. **Never scale from 0.** Enter from 0.9–0.97 with opacity. Icon swaps are the one exception (rule 8).
6. **Ease-out for UI.** Never ease-in, which starts slowly and feels laggy.
7. **One authored moment per page:** a hero sequence *or* one signature reveal. No fade-and-slide-up on every section and no hover-lift on every card. Content is visible without JavaScript; never leave text at `opacity: 0` waiting for a script.
8. **Icon swap:** cross-fade with the entering icon going scale 0.25 → 1, opacity 0 → 1, blur 4px → 0 over 200–300ms (`cubic-bezier(0.2, 0, 0, 1)`), and the exiting icon reversed. Mask awkward cross-fades with `filter: blur(2px)` during the change, never more than 20px (Safari cost).
9. **`will-change`** only on `transform`, `opacity` or `filter`, and only while motion is imminent. If an element jitters 1–2px in iOS Safari while animating, add `will-change: transform` to it.
10. **Stagger** 40–80ms per item, at most 5 items, total ≤ 800ms; never block interaction while a stagger plays.
11. **Turn transitions off during theme switches** by adding a class that sets `transition: none !important` for one frame.
12. **At most one ambient loop per page** (a logo marquee, a hero canvas, a video or a border sheen). Pause it offscreen, on hover and focus, and under reduced motion. Anything that autoplays longer than 5s needs a visible pause control. The playbook architectures describe reference sites that run several loops; when you adopt one, keep a single loop and make the rest static.
13. **Smooth-scroll libraries** (Lenis, duration ≤ 1.2) are allowed on marketing sites only, never in apps, and are disabled under reduced motion. No scroll-jacking, and no scroll-snap that traps the reader.

### Reduced motion

Author motion as opt-in:

```css
@media (prefers-reduced-motion: no-preference) {
  .reveal { animation: reveal var(--dur-hero) var(--ease-out-expo) both; }
}
@media (prefers-reduced-motion: reduce) {
  /* Keep meaning, drop movement: cross-fade ≤ 200ms instead of travel, no loops, no parallax, no autoplay. */
  .reveal { animation: none; }
}
```

### Signature interactions from the references

- **Nav link fade** (Qronos): 70% → 100% ink. Qronos takes 300ms; 71UI builds use 150ms.
- **Chip nav hover** (Integrated Bio): a chip fills with the page background (the site takes 600ms `--ease-out-expo`; 71UI builds use 150ms); the CTA inverts over 100ms `cubic-bezier(0.76, 0, 0.24, 1)`.
- **Drawn underline** (Integrated Bio footer): `background: linear-gradient(currentColor, currentColor) no-repeat 0 100% / 0 1px`, which grows to `100% 1px` over 300ms `--ease-out-expo`.
- **Scroll-scrubbed text** (Integrated Bio): a statement paragraph brightens word by word to 100% as it crosses the viewport, starting at ≥ 55% ink for text ≥ 24px (3.07:1) or ≥ 66% below 24px (4.53:1) — the site starts at 30%, which fails, while a hairline progress bar fills across the top and an "01 / 03" counter ticks over. Use `animation-timeline: view()` where supported, with static text as the fallback.
- **Hero enter-fx** (Spectrum, Integrated Bio): translateY 12–14px + blur 4–6px + opacity 0 → rest over 600ms `--ease-out-expo`, staggered 40–80ms across headline, lede and CTAs (total ≤ 800ms).
- **Opacity hover** (V7): 100% → 60% opacity on pills and links, instantly. It's a valid minimalist choice for editorial sites.
- **Presence cursor** (Stacker): a named cursor tag drifts with a slow ease-in-out loop (4–6s) to show collaboration. It's ambient, so it counts as the page's one loop.

### Gestures (touch and drag)

- Give feedback on pointer-down and commit on pointer-up. Allow about 10px of slop before locking a drag direction.
- Keep the grab offset; never snap the element's center to the finger. Use `setPointerCapture`, and track velocity from the last 3–5 samples.
- Dismiss a sheet when it travels past 30% of its height *or* its velocity exceeds 0.11px/ms. Otherwise spring back.
- Past an edge, apply rubber-banding: `offset × dim × 0.55 / (dim + 0.55 × |offset|)`.
- Every drag interaction has a single-pointer alternative, such as move up/down buttons (WCAG 2.5.7).

---

## Accessibility Floor

These are non-negotiable in every mode. Any failure here is a **blocking** finding in reviews.

1. **Semantics.** Native elements first: `<button>` for actions, `<a href>` for navigation, `<dialog>` for modals, `<label>` for fields. Landmarks (`header`, `nav`, `main`, `footer`), one `h1`, and heading levels in order. `<html lang>` is set.
2. **Keyboard.** Everything reachable and operable by keyboard in visual order. Use only `tabindex="0"` or `-1`. Escape closes overlays. Modals trap focus and restore it to the trigger on close.
3. **Visible focus.** Style `:focus-visible` with a 2px outline in `primary` (≥ 3:1 against the surface) and a 2px offset. Never `outline: none` without a replacement. Add `scroll-margin-top` (the sticky header's height + 16px) so focused and anchored elements aren't hidden under sticky bars.
4. **Skip link.** It's the first focusable element and targets `<main id="main" tabindex="-1">`.
5. **Names.** Icon-only buttons get `aria-label`. Never put `aria-hidden="true"` on a focusable element. Write alt text by purpose (`alt="Search"`); decorative images get `alt=""`.
6. **Contrast.** Text ≥ 4.5:1; large text (≥ 24px, or ≥ 18.66px bold) ≥ 3:1; UI boundaries, icons and focus rings ≥ 3:1. Measure against the surface the element actually renders on, including images and gradients (add a scrim if needed).
7. **Targets.** At least 24 × 24px everywhere (WCAG 2.5.8), 44 × 44px on touch and 40 × 40px on desktop where possible. Extended hit areas never overlap. Decorative overlays (glows, gradients, noise) get `pointer-events: none`.
8. **Forms.**
   - A real label for every field; correct `type`, `inputmode` and `autocomplete`.
   - Never block paste. Support passkeys and password managers (accessible authentication).
   - Errors use `aria-invalid` + `aria-describedby`; focus moves to the first error; an error summary appears on long forms.
   - Don't make people re-enter information already given ("Same as billing").
9. **Status.** `role="status"` for routine updates and `role="alert"` only for urgent errors. Status is never conveyed by color alone.
10. **Motion and media.** Respect `prefers-reduced-motion`. Nothing flashes more than 3 times per second. Autoplay longer than 5s needs pause, stop or hide controls. Captions on video with speech.
11. **Reflow and zoom.** Nothing clips or overlaps at 320px width or 200% text zoom. Hover and focus popovers are dismissible (Escape), hoverable and persistent (WCAG 1.4.13).
12. **Preferences.** Support `prefers-reduced-transparency` (solid surfaces), `prefers-contrast: more` (near-solid backgrounds and defined borders) and `forced-colors: active` (don't rely on backgrounds for meaning).
13. **Consistent help.** Help, contact and support links sit in the same place on every page.
14. **Disabled controls.** A tooltip on a `disabled` control never opens for keyboard or touch users. Put the reason in visible text, or use `aria-disabled="true"` so the control stays focusable.

**Verify:** a keyboard-only walkthrough, a screen-reader smoke test (VoiceOver or NVDA), axe or Lighthouse accessibility, 200% zoom, and a real phone. A Lighthouse score of 100 is not WCAG conformance.

---

## UI Writing

Copy is interface. Write it in the user's words, not the database's ("notifications", not "webhook config").

### Writing rules

1. **Buttons start with a verb** and name the outcome: "Save changes", "Create fund", "Book a demo". Never "Submit", "OK!" or a bare "Yes".
2. **Confirmations repeat the consequence:** a "Delete project" button next to "Cancel".
3. **One word per flow.** "Continue" or "Next", never both. An action keeps its name to the end: "Publish" → toast "Published".
4. **Links describe the destination:** "Read the security overview", not "Click here" or a bare "Learn more".
5. **Sentence case everywhere**, applied the same way to buttons, headings and labels.
6. **Toggles name what turning them ON does:** "Send read receipts", never "Disable read receipts".
7. **Address the reader as "you".** Never "the user".
8. **Headlines are specific claims.** Prefer "Launch your first automation in minutes" to "Build faster. Ship smarter. Scale forever." (the imperative tricolon is banned). Keep hero headlines to 12 words or fewer.

### State copy formulas

| State | Formula | Example |
|---|---|---|
| Empty | What + why + next action | "You haven't created a fund yet. Build an index, choose assets and deploy it onchain." → **Create your first fund** |
| Loading | Verb + object | "Syncing 15 products…" |
| Error | What happened + how to fix | "Unable to connect Shopify. Check the store URL, then try again." → **Try again** |
| Success | Result + where it lives now | "Transfer sent · Receipt saved to Documents" |
| Destructive confirm | Consequence + scope | "Delete Ace Studio? This removes 3 stores and 12 collections for everyone." |

### Banned

- Hype words: "elevate", "seamless", "unlock the power of", "leverage", "robust", "revolutionize", "supercharge", "next-gen", "cutting-edge", "game-changing".
- Apologies and exclamation marks in errors ("Oops! Something went wrong!").
- Fake precision: "99.99% uptime" or "10x faster" without a source.
- More than two em dashes per paragraph, and Title Case Headings.

### Formatting

A non-breaking space between a number and its unit (`12&nbsp;GB`). En dashes for ranges (6:30–8 PM). Unambiguous dates (Sep 23, 2026; ISO in data tables). Label metadata explicitly ("Updated Sep 23, 2026"). Truncate the middle of wallet addresses and IDs (`0x71C7…976F`) and keep the full value copyable.

---

## Responsive Behavior

### Breakpoints

Use content-driven breakpoints, with these defaults: **640 · 768 · 1024 · 1280 · 1536px**, mobile-first `min-width`. Use container queries for components that live in different widths (cards, sidebars, tables). Verify at **320, 390, 768, 1024 and 1440px** widths, plus one real phone.

### Collapse strategy

| Element | Desktop | Tablet | Mobile |
|---|---|---|---|
| Marketing nav | Links + CTA | Links condense or hamburger | 44px hamburger → full-height sheet, CTA pinned at the bottom |
| App sidebar | 240px | 56px icon rail | Drawer, or a bottom tab bar with 3–5 destinations |
| Split section header | Title 7/12 · lede 5/12 | Stacked | Stacked, lede ≤ 3 lines |
| Bento grid | 2–4 columns | 2 columns | 1 column, hero tile first |
| Data table | Full table | Hide low-priority columns | Cards with labeled rows, or horizontal scroll with a sticky first column |
| Modal | Centered | Centered | Bottom sheet below 640px |
| Pricing | 3–4 columns | 2 columns | 1 column, or a plan picker (segmented control) |
| Hero display | 72px | 56px | 40–44px via `clamp()` |

### Mobile rules

- Single column with 16px margins. Primary actions in the thumb zone; destructive actions out of easy reach.
- Hit areas 44px and inputs 16px (prevents iOS zoom). Use steppers, segmented controls and bottom sheets instead of dropdowns.
- Use `100svh` or `100dvh` for full-height heroes, never `100vh`. Respect `env(safe-area-inset-*)` with `viewport-fit=cover`.
- Never hide core functionality on mobile. Restructure it instead: the information architecture stays the same across sizes.
- Images: `srcset` + `sizes`, a fixed `aspect-ratio` to avoid layout shift, and `<picture>` when the crop itself must change.

### Performance is design

- Preload the hero image or poster, and give every image dimensions.
- Subset fonts to woff2, use at most 2 families, and add `size-adjust` fallbacks.
- Lazy-load below-the-fold media. Pause canvas/WebGL offscreen and under reduced motion. Give every video a `poster`.
- Budget: LCP < 2.5s, CLS < 0.1, INP < 200ms on a mid-range phone.

---

## Category Playbooks

Each playbook overrides the Core tokens only where the category needs it. Everything not mentioned — spacing, accessibility, motion rules, component anatomy — stays Core. Every color pair listed here has been contrast-checked; the ratios are shown where they matter.

**How to apply a playbook:** paste its token block after the Core tokens, pick one variant, and follow the page architecture top to bottom. The architectures mirror the reference sites, which stack several signature moves and ambient loops. Steps marked **◆** are signature moves: keep **exactly one** as the page's loud idea and use the quiet fallback in parentheses for the rest. Keep at most one ambient loop (see **Motion & Interaction**, rule 12). Every block sets `--color-primary`, so the Core blue never leaks in as a second accent. Gradients live in `--gradient-*` variables and are applied with `background-image`.

---

### A. SaaS website

**Use for:** B2B SaaS landing pages, product marketing, startup launch sites, no-code and collaboration tools.
**Mood:** confident, friendly, product-led. **Concept:** *show the product working, in small real pieces.*

**Variant A1 — Product-led friendly** (Stacker 01–04): white canvas, soft gray tiles, color-block cards, and a UI collage instead of illustrations.
**Variant A2 — Blueprint grid** (SaasCN): an architectural frame of dashed rails and hatched bands, monochrome with a single color bloom.

```css
/* A1 Product-led */
:root {
  --color-canvas: #FFFFFF;  --color-surface: #F5F5F5;  --color-surface-2: #EFEFEF;
  --color-ink-strong: #0A0A0A; --color-ink: #262626; --color-ink-subtle: #6B6B6B;    /* 4.89:1 on #F5F5F5 */
  --color-primary: #2F63E8;        /* white label 5.16:1 */
  --color-block-coral: #EC7A50;    /* ink-strong text only: 7.04:1 (#262626: 5.38:1; white fails at 2.81:1) */
  --color-block-violet: #5B5BF0;   /* white label 5.00:1 */
  --color-band-dark: #1F1F1F;      /* dark feature band; #A3A3A3 text on it is 6.53:1 */
}
/* A2 Blueprint: canvas #F5F5F5, ink #0A0A0A, subtle #6B6B6B, primary #171717 with a white label (17.93:1), dashed rails rgb(0 0 0 / .1) */
```

**Type:** A1 uses Inter or Geist display at 400, 80–96px, −0.04em (Stacker's hero runs about 88px at weight 400). A2 uses Geist 400 with H1 72/72 at −0.05em, H2 48/48 at −0.05em, H3 20/28 at −0.025em, and body 16/24 in #737373 → use #6B6B6B for AA.

**Page architecture:**
1. **Nav:** logo, 4–5 links, "Log in", one dark CTA (A1). A2 uses left links, a right-aligned ⌘K search pill and a GitHub icon.
2. **Hero HA2 (A1) or HA1 (A2).** ◆ A1 adds a 3-item tab strip ("Manage your orders · Upgrade collaboration · Integrated with Airtable") above a collage row: a blue data card ($2,490.00 in white, 40px), two gray action tiles ("Edit order", "Pay invoice") with bottom-left labels, and a photo tile. (Quiet fallback: a single product screenshot card.)
3. **Logo wall:** 5–6 logos with a one-line claim ("50+ companies already use…").
4. **Value statement:** one paragraph at 18–20px in `ink`, max 640px wide, left-aligned under the grid.
5. **Feature tiles**, each a product moment (Stacker 02–03):
   - A gray `surface` tile (radius 24–32px, padding 40px) with an 11–13px uppercase caption, a 32px title and a live UI inside (kanban with phase chips; comments with @mentions and emoji reaction pills), then a 2-item checklist.
   - At least one tile sits on a color block (coral) to break the rhythm.
   - ◆ Phase chips + the tilted "You" cursor card (quiet fallback: an untilted card, no cursor).
6. **Dark band:** a full-width #1F1F1F block with a 44px title and a product card peeking in (profile card, "Edit profile" violet pill).
7. **Events or content deck:** ◆ overlapping cards (Stacker 04) with 44px date numerals (quiet fallback: a 3-column row without overlap).
8. **Testimonials:** 2–3 cards; real names, roles and photos.
9. **Pricing:** 3 tiers; highlight the middle plan with `surface-2` or a 1px ink border, never a gradient.
10. **FAQ:** a split header (A2 puts the title left and the accordion right, with 53px rows and dashed dividers).
11. **Closing CTA:** a split layout with a 48px title left, and the lede plus 2 buttons right.
12. **Footer:** 5 columns (Pages, Posts, Tags, Socials, Legal) with a theme toggle in the bottom bar (A2).

**Signature moves (◆, pick one):** the UI collage hero; phase chips + tilted "You" cursor card; the overlapping color deck; the blueprint frame with "+" crosshairs and hatched section bands (A2).

**Motion:** tab-strip crossfade of the collage (≤ 300ms); the presence cursor is the page's one ambient loop.

**Avoid:** 3 identical icon cards; mockups inside fake laptop frames; stock team photos; "Trusted by 10,000+" without logos; more than one gradient.

---

### B. AI & agent products

**Use for:** AI agents, automation, LLM infrastructure, copilots, orchestration and schedulers.
**Mood:** calm, powerful, engineered. **Concept:** *a dark instrument panel that shows the machine thinking.*

**Variant B1 — Framed dark canvas** (Qronos): pure black inside 1px frame rails, product UI built in HTML, and a WebGL particle hero.
**Variant B2 — Cinematic photograph** (Qorix 09): a full-bleed dusk landscape behind a centered headline, with square-cut white CTAs.

```css
:root[data-theme="dark"] {
  --color-canvas: #000101;  --color-surface: #09090C;  --color-surface-2: #131315;
  --gradient-panel: linear-gradient(145deg, rgb(19 19 21 / .98), rgb(7 7 8 / .98));
  --color-hairline: rgb(255 255 255 / .06);  --color-frame: rgb(255 255 255 / .12);
  --color-ink-strong: #FFFFFF; --color-ink: #ECEBE7;
  --color-ink-subtle: #8A857B;   /* 5.42:1 on #09090C. Qronos ships #757168, which is 4.30:1 and fails */
  --color-primary: #ECEBE7;  --color-primary-hover: #FFFFFF;  --color-on-primary: #000101;  /* light pill CTA: 17.52:1 */
  --color-link: #FFFFFF;     /* links are underlined white; Core #0070E0 is 4.37:1 on this black */
  --color-inverse: #FFFFFF;  --color-on-inverse: #000000;
  --data-1: #22D3EE; --data-2: #6366F1; --data-3: #F5B301;   /* product-UI data only, never chrome */
}
```

**Type:**
- Display: Inter Tight or General Sans at 400. H1 66/63 at −0.025em (Qronos runs 66.24/60.94, a 0.92 ratio, tighter than 71UI's 0.95 floor); H2 48/48 at −0.025em.
- The second line of the H1 is a vertical gradient: `linear-gradient(#FFFFFF, #D4D4D8 50%, #71717B)` clipped to text. It's the only allowed gradient text.
- UI text is system-ui or Inter at 14–16px. Product-mock labels are mono 9–10px uppercase at +0.08 to +0.12em. Leads are 20/32.5 in `ink-subtle`.

**Page architecture (Qronos):**
1. **Frame:** ◆ a 1400px container with 1px rails 40px from the viewport edges, horizontal rules at section boundaries, and small sparkle glyphs at the intersections. (Quiet fallback: no rails; hairline section dividers.)
2. **Nav:** fixed, transparent, 48px tall, 12px from the top. 112×28 logo; 5 centered links at 14px and 70% white (100% on hover); a 32px outlined "Get started »" pill on the right. ◆ An animated sheen border (quiet fallback: a static 1px border at 50% white).
3. **Hero HA1:**
   - ◆ A particle vortex canvas behind a centered 2-line headline and a 2-line lede at 18px. This is the page's one ambient loop (quiet fallback: a still poster frame).
   - Two 40px pill CTAs: a ghost outline and a solid white one.
   - A static monochrome logo row at the fold (the loop budget is spent on the hero).
4. **Split header + product canvas:** a two-tone H2 ("Stateful execution." white / "Qronos keeps agents in motion." warm gray), the lede right, then a 1248px app panel (sidebar + Gantt timeline, mono micro-labels, dashed segments).
5. **Three-feature row:** icon + 16px/500 title + 16/26 `ink-subtle` description. Just a row — no cards.
6. **Hatched band** (40px) between every major section.
7. **2×2 bento of product moments:** pipeline graph, schedule bars (cyan→blue and violet→white gradients encode progress), a guardrail select with an open popover, and an agent inbox with model-brand icons and status badges. Titles are 30/36/500.
8. **Insights dashboard mock:** KPI cards, stacked bars, a table with model columns.
9. **Pricing:** 4 plans in 294px cards with a 145° dark gradient and a lit 1px top edge (`--shadow-bevel`). A yearly toggle with a "Save 20%" chip; checklists with double-check icons.
10. **Testimonials:** 2 large cards with a company logo, a serif-free quote at 18/28, an avatar row, and a 2-cell metric strip ("80% of recurring intelligence automated").
11. **Closing CTA:** stacked model icons (Gemini, OpenAI, Claude, +), a 2-line headline and the same 2 CTAs over a still frame of the hero's particles (not a second canvas).
12. **Footer:** brand + social text links, 4 link columns, and a "Hiring" pill. The bottom bar holds © on the left and "● All systems operational" on the right.

**AI product UI patterns** (from ui-ux-fixer and Spectrum's AI blocks). A missing pattern is a finding:
- **Citations.** Show sources after streaming ends, never during.
- **Suggested follow-ups** after each answer.
- **Rich answers.** Tables, charts and cards instead of walls of text.
- **Tool calls** collapsed to one expandable line ("Searched 12 sources ▸").
- **Separate panes.** Process on one side, results on the other.
- **Explicit states.** Thinking → Streaming → Done. Stream word-chunked, not per character. The send button becomes stop without resizing.
- **Approvals.** Approve and Dismiss are never visual equals, and actions leave an audit trail.
- **Agent management.** Start, steer and stop controls; background agents notify on exceptions only.
- **Usage meters.** Amber past 75%, red past 90% — red means "error", not "billing".

**Signature moves (◆, pick one):** frame rails and crosshairs; the particle hero canvas; the sheen-border CTA. The two-tone headlines and the HTML product canvas are the quiet system underneath.

**Avoid:** purple-blue glow blobs, "✨ AI-powered" badges, robot or brain illustrations, typing-cursor headlines, and fake chat screenshots with lorem ipsum.

---

### C. Crypto, DeFi & Web3

**Use for:** DeFi protocols, wallets, exchanges, onchain index or fund apps, payments on crypto rails, L1/L2 sites.
**Mood:** trustworthy, precise, premium. **Concept:** *financial seriousness first; the chain is an implementation detail.*

**Variant C1 — Warm editorial protocol** (Awake Origin 05): a serif display face, square black buttons, a bordered "table" nav, and a warm gradient media panel with a 3D glass emblem and stats.
**Variant C2 — Clean dApp** (IndexRave 10): a white app, one violet accent, stat cards with footnote strips, and 3D empty-state illustrations.

```css
/* C1 Warm editorial */
:root {
  --color-canvas: #FFFFFF;  --color-ink-strong: #0B0B0B;  --color-ink-subtle: #5E5E5E;  /* 6.48:1 */
  --color-primary: #0B0B0B;  --color-primary-hover: #2B2B2B;  --color-on-primary: #FFFFFF;  /* square black CTA: 19.68:1 */
  --gradient-frame: linear-gradient(135deg in oklab, #E8552D, #F2B38B 45%, #DCCB8A 70%, #B8574B);  /* decorative only: no text on it */
  --gradient-panel: linear-gradient(135deg in oklab, #9E3F1D, #C4532C 55%, #E8552D);  /* white text: 6.60:1 at #9E3F1D, 4.54:1 at #C4532C */
}
/* C2 Clean dApp */
:root {
  --color-primary: #5B3FE0;     /* white label 6.50:1 */
  --icon-tile-1: #5B3FE0; --icon-tile-2: #DB2777; --icon-tile-3: #D97706; --icon-tile-4: #0284C7;  /* glyph tiles ≥ 3:1 */
  --color-up: #047857;  --color-down: #BE123C;   /* text-safe: 5.48:1 / 6.29:1 on white */
}
```

Bright "mint" CTAs (#10B981 and similar) take **dark** `ink-strong` #0B0B0B text (7.76:1). White text on them fails at 2.54:1.

**Type:**
- C1: serif display at 400 (Newsreader, Instrument Serif or Source Serif 4 Display — Awake uses a Tiempos-like face), H1 72–80px at 1.05 and −0.02em. Serif numerals for stats at 48–56px. Inter or Geist for UI. Nav labels 16px.
- C2: Inter 14px body, 13px labels, stats 24px/500 tabular.
- Addresses, hashes and amounts in Geist Mono or tabular Inter.

**Page architecture (C1):**
1. ◆ A viewport frame: the page sits on a 12px-inset white sheet (32px radius) over `--gradient-frame` (quiet fallback: a plain white page).
2. **Bordered nav:** a logo cell separated by 1px vertical dividers; links with ▾ dropdown carets; a square *outlined* "Get started" on the right, inside a 1px hairline box (the hero keeps the one filled button).
3. **Hero HA3:** H1 left ("The Privacy First DeFi Ecosystem"); lede and 2 square buttons right (black filled + 1px outline).
4. **Media panel:** ◆ a full-width `--gradient-panel` with a 3D glass emblem centered (quiet fallback: a flat #9E3F1D panel with the emblem). 4 stats (Active Users 150K+, Uptime 99.9%, Total Volume $2.4B, Avg Settlement 0.01s) in hairline-bordered cells placed over the #9E3F1D–#C4532C half: a label at 16px in 100% white (≥ 4.5:1) above a 56px serif figure (≥ 3:1). Use real, sourced numbers.
5. **Split feature section:** serif H2 left, lede right; then protocol modules as a 2×2 hairline grid.
6. **Security:** audit badges linking to the actual reports; a bug bounty with its amount; open-source links.
7. **Docs and community:** developer entry points, ecosystem logos.
8. **Footer:** legal and risk disclosures in plain language.

**Page architecture (C2 app):** the sidebar has a "Navigation" section label, then Overview, Create fund, My funds, Analytics, Earnings, Settings. The top bar holds a breadcrumb, a notification bell and the account menu. Below: a welcome header, 4 stat cards (a 24px colored icon tile + 13px label → `$0.00` → footnote strip "No funds created yet"), and a centered empty state with a 3D illustration and one 48px primary CTA ("Create your first fund").

**Crypto components:**
- **Wallet button:** 36–40px pill showing an avatar or ENS name, the middle-truncated address (`0x71C7…976F`) and a network badge. The dropdown offers copy, explorer, switch network and disconnect.
- **Token row:** a 24px token icon, symbol at 14/500, name at 12px subtle, price right-aligned and tabular, and the 24h change as sign + arrow + color. Zero shows as "—".
- **Transaction toast:** Pending (spinner) → Confirmed (✓ + "View on explorer ↗") → Failed (reason + retry). Never auto-dismiss failures.
- **Amount input:** a 16px-radius well with a large tabular value, a token selector pill, "Balance: 1,204.55 · Max", and fee, slippage and route rows below in 13px.
- **Risk and trust cues:** audit links, "Non-custodial", a network status dot and "Updated 12s ago" timestamps. Never fake live data.
- **Charts:** up and down candles differ in **outline as well as color**. Compare assets by indexing both to 100, never with a second axis. Portfolio charts show cost basis.

**Signature moves (◆, pick one):** the warm gradient frame around a white sheet; the glass emblem panel with hairline stat cells; dashed decorative columns behind empty states (C2). Square black buttons with a serif display face are C1's quiet system.

**Avoid:** neon-on-black "cyber" palettes, glowing coins, rocket and moon imagery, Space Grotesk plus a purple gradient, APYs without a time window, and unlabeled chains.

---

### D. Fintech & banking

**Use for:** banks, neobanks, payments, remittance, credit, savings, invoicing, cards.
**Mood:** calm, trustworthy, human. **Concept:** *every screen answers "is my money safe and where is it?"*

```css
:root {
  --color-canvas: #FFFFFF;  --color-surface: #F5F6F8;  --color-surface-2: #EEEEEF;
  --color-ink-strong: #111418;  --color-ink-subtle: #5F6B7A;   /* 5.02:1 on #F5F6F8 */
  --color-primary: #1F5FAF;     /* trust blue, white label 6.34:1 */
  --color-positive: #15803D;    /* white label 5.02:1; #157A4C for text on #EEEEEF (4.62:1) */
  --gradient-photo-scrim: linear-gradient(180deg, rgb(20 60 110 / .55), rgb(20 60 110 / 0) 60%);  /* white text on sky photos */
}
```

**Type:** Manrope or Plus Jakarta Sans 500 for display (600 only for hero numbers), Inter for UI. Balances in `numeric` at 32–48px with the currency code one step subtler. The mobile hero score is 48px/600.

**Web architecture (banking bento, 13):**
- A centered pill badge ("✳ Why choose us", 36px, 1px border) above a 56px headline ("Everything for smarter banking") and a one-line lede.
- Three 32px-radius tiles on `surface`:
  1. **Converter:** an inner white card (24px radius) with "From" and "To" wells (16px radius), flag pill selectors, a fee row and a full-width gray pill button.
  2. **Photo tile:** a blue photo tile with a white 28px headline over the scrim.
  3. **Receipt:** a green check medallion, "Transfer success", a summary table (Date / Amount, right-aligned tabular) and a "Download receipt" pill.
- Then: security, how-it-works (a real sequence may use 1–3 numbering), testimonials, the app download band and the footer.

**Mobile architecture (credit app, 08):**
- A blue gradient header: keep `#1F5FAF` or darker behind every white label (the 14px greeting and the 80% delta line need it), and start the fade to the canvas below the last white text.
- A 48px/600 white score ("742"), the delta "+18 pts this month" at 16px/80% white (4.69:1 on #1F5FAF), and a translucent white pill toggle (a 20% white fill, no blur).
- "Your financial health": horizontal cards (#EEEEEF, 20px radius, 16px padding), each with an icon top-left and the label, value and status word at the bottom. Status words are colored and labeled ("Excellent" #157A4C, "Good" #1F5FAF).
- A 3-column stat row ("This month +18 points"), a rank row with a medal, and a floating pill tab bar (64px tall, 16px + the safe-area inset from the bottom, with the active tab as a white inner pill).

**Fintech rules:**
- Amounts are tabular and right-aligned. Negative amounts are ink with a "−" sign, not red; incoming amounts are `positive` with "+". Red is reserved for failures and overdrafts.
- Mask sensitive data by default (`•••• 4821`) with an explicit reveal.
- Confirmation dialogs restate amount, recipient and arrival time. Offer an undo window for transfers where the rails allow it.
- Status timelines (Initiated → Processing → Arrived) with timestamps.
- Receipts are real documents: a downloadable PDF and a reference ID with a copy button.
- Security cues sit beside the action, not in the footer: a lock icon plus a plain-language sentence.

**Signature moves:** the product-moment bento; the live receipt tile; the gradient header fading into the canvas; the floating pill tab bar.

**Avoid:** navy-and-gold "private bank" clichés, dollar-sign illustrations, pie charts of spending with more than 6 slices, and red for every outgoing payment.

---

### E. Personal portfolio & studio

**Use for:** designer, developer, photographer or writer portfolios; small studios and agencies.
**Mood:** personal, crafted, confident. **Concept:** *the work is the hero; the frame is quiet but has one unforgettable detail.*

**Variants:**
- **E1 Editorial index:** a big name, a project index table and case-study pages.
- **E2 Bento about-me** (widgets, 06): living cards — now playing, local time, location map, current focus, writing, moodboard.
- **E3 Studio:** a giant wordmark footer, a marquee statement and a split CTA (Integrated Bio's language).

```css
:root {
  --color-canvas: #F6F5F1;  --color-surface: #FFFFFF;
  --color-ink-strong: #151515;  --color-ink-subtle: #6A6862;   /* 5.11:1 */
  --color-primary: #C23A00;  --color-primary-hover: #A33100;  --color-on-primary: #FFFFFF;  /* white label 5.39:1; as text on paper 4.94:1 */
  --color-accent-decor: #FF4F00; /* International Orange: large fills and graphics only; ink-strong labels on it (5.54:1) */
}
```

**Type:** Instrument Serif at 400 for the name + Inter for text; or Clash Display / Cabinet Grotesk at 500 + Inter. Name at 96–160px, −0.04em (serifs: −0.02em). Captions in JetBrains Mono at 12px. Keep the name in one style; don't italicize or color a single word.

**Architecture (E1):**
- **Hero:** name + one-line positioning ("Product designer making complex tools feel obvious"), location and local time (tabular, live), status ("Available from Oct 2026" with a green dot).
- **Selected work:** 3–6 large project cards at 16:10 with a 12–16px radius and captions below (Client · Year · Role).
- **Index:** a table of everything, with 44px rows and columns for Year, Project, Client and Discipline. On pointer:fine devices, hovering a row shows an image preview that follows the cursor.
- **About:** a portrait plus 3 short paragraphs, then experience as a definition list. Contact is a big mailto link with a copy-email button.
- **Case study template:** a hero image, a facts row (Role, Team, Timeline, Tools), then problem → process → outcome with real metrics. Full-bleed images alternate with a 680px text column. Close with a next-project link.

**Architecture (E2 bento):** 3 columns at desktop, each card with a 12px caption *outside* ("Music", "Focus timer", "Location"):
- Now playing: album art, track and artist, a progress bar with times.
- Local time or weather: a sky-blue gradient card.
- Location: a map card with a bottom fade.
- Latest writing: a list of 3 items with thumbnails.
- Quick note: a serif sentence.
- Moodboard: a 2×2 image grid.

**Signature moves:** the live local-time and status line; the cursor-following preview on the index; the widget bento; the giant wordmark footer.

**Avoid:** skill bars with percentages, "Hi, I'm X 👋" over a gradient blob, 3D avatar busts, typing-effect headlines, custom cursors that hide the real cursor, and preloaders longer than 1.5s.

---

### F. Dashboards & web apps

**Use for:** SaaS app interiors, admin panels, settings, analytics, CRM, inboxes, internal tools. **This is the Core palette's home.**
**Mood:** fast, legible, calm. **Concept:** *density with air — every pixel informs, nothing shouts.*

**Tokens:** use Core as-is (the cheatsheet values). In dark mode, use the Core dark block.

**Shell:**
- **Browser frame proportions** (Ace Studio 07): a 240px `surface` sidebar and a `canvas` content area with a 24–32px page gutter and content max 960–1200px (settings) or full width (tables, boards).
- **Top bar** 48–56px: breadcrumb (16px icon, "Apps / Shopify"), page actions, search ⌘K, notifications and the account menu.
- **Three-pane mail/inbox** (Inbox 12): 56px icon rail + 300px list pane + detail pane. The list pane holds sections (Status, View, Teammates) with + buttons and right-aligned counts.

**Page patterns:**
- **Index page:** a title (20/500) + description (14px subtle) + primary action on the right, then filter chips, then a 40px-row table, then pagination (showing "1–20 of 312").
- **Detail page (Ace Studio):**
  1. A 72px app-icon tile (16px radius, `--shadow-sm`, whose ring is the border).
  2. The title at 24/500 + a "Connected" badge (20px, 6px radius).
  3. A 16px subtitle in `ink-subtle`.
  4. A 180px textured banner holding a prompt chip.
  5. Sections: "Data sync" (bordered key-value table, 2 × 40px rows), "Stores" (44px list rows with favicon, name and underlined link), and a nested "Tool permissions" panel on `surface` (16px radius) with a verified icon beside each permission.
- **Settings:** grouped panels (12px radius, 1px hairline) with 44px rows — label + description on the left, control on the right (switch 24×14, select or button). Save per section or autosave with a toast. Destructive actions sit in a separate "Danger zone" panel at the bottom.
- **Dashboard:**
  - A KPI row of 4 cards. Every KPI has a unit, a trend with its window ("vs last 30 days") and a baseline. For latency, cost and churn, green means *down*.
  - Then 2 charts in a 2:1 split and a recent-activity table.
  - A freshness footer ("Updated 2 min ago"). Never fake "real-time".
- **Onboarding:** a sidebar progress card ("Getting started · 1 of 5" with a ring), a checklist page with 5 steps, and each empty state linking to its step.

**Density knobs:** compact rows are 32px and 13px text; default is 40px and 14px; relaxed is 48px and 14px. Offer the switch only in data-heavy apps.

**Cognitive limits:** 4–7 primary nav items; at most 6 visible filter chips; at most 3 dialog buttons; one sticky element per scroll area; dashboards at most 4 tiles per row (2 on mobile) and no more than 4×3 before it becomes a wall.

**Signature moves (pick one):** squircle app icons in the sidebar; verified-permission rows; the celebratory empty state (Inbox Zero with an illustrated card and a quote); a ⌘K palette with recent actions.

**Avoid:** bold black table headers, zebra stripes, charts with more than 2 accent series, modal-on-modal, toasts for every save, and settings pages as one endless form.

---

### G. Mobile apps (iOS / Android / mobile web)

**Use for:** native apps, React Native/Expo, and mobile-first web apps.
**Mood:** direct, tactile, thumb-friendly. **Concept:** *one screen, one job, reachable with one thumb.*

**Platform type:**
- **iOS (SF Pro):** Large Title 34/41 Bold, Title 1 28/34, Title 2 22/28, Headline 17/22 Semibold, Body 17/22, Callout 16/21, Subhead 15/20, Footnote 13/18, Caption 12/16. Support Dynamic Type.
- **Android:** Material 3 type roles in `sp`; test at 1.3× font scale.
- On native, platform conventions win over 71UI's "no bold display" rule. On mobile web, use Core with 16px body.

**Layout:**
- 16px margins, an 8pt grid, `env(safe-area-inset-*)` respected.
- Cards: 16–24px radius, 16px padding, lists at 44pt (iOS) or 48dp (Android).
- **Navigation:** a bottom tab bar with 3–5 destinations, never actions. The floating-pill variant (credit app) is 64px tall, 16px from the bottom and fully rounded, and the active tab is an inner pill with icon + label.
- Primary actions sit in the bottom third. The tab bar floats 16px + the safe-area inset above the bottom edge. Destructive actions need confirmation and sit away from the thumb's resting zone.
- Sheets replace dropdowns and pickers, with a 24px top radius, a 36×4px grabber and detents.
- **Gradient header pattern** (credit app): 280–360px, fading to the canvas, holding the greeting, a key number and a quick toggle. Everything below sits on neutral surfaces.

**Touch and feedback:**
- Targets 44×44pt (iOS) or 48×48dp (Android), at least 8dp apart.
- Pressed states on touch-down.
- Haptics only for success, error, commit and snap moments.
- Swipe actions on rows need a visible alternative, such as a long-press menu or an edit mode.

**Signature moves:** the floating pill tab bar; the gradient header fading into content; widget-style cards with captions outside (06); a big tabular hero number with a delta sentence.

**Avoid:** hamburger menus hiding primary navigation, dropdowns on mobile, body text under 15px, hover-dependent UI, and custom back gestures that break the edge swipe.

---

### H. Deep tech, biotech & science

**Use for:** biotech, health, climate, energy, robotics, materials, research labs, scientific tooling.
**Mood:** serious, organic, visionary. **Concept:** *laboratory precision wrapped in living media.*

```css
/* Integrated Bio palette (its own token names), contrast-fixed */
:root {
  --color-canvas: #F7F7F5;          /* off-white */
  --color-surface: #EEEEEE;         /* light-gray panel (newsroom) */
  --color-stone: #E7E8E1;           /* medium stone card */
  --color-ink-strong: #222F30;      /* dark-charcoal: 12.90:1 on canvas */
  --color-ink: #50595A;             /* body at "80% ink": 6.71:1 */
  --color-ink-dim: #8A8D7E;         /* de-emphasized headline tail, ≥ 24px only: 3.16:1 (site uses #C9CBBE, 1.53:1) */
  --color-primary: #222F30;  --color-primary-hover: #3A4849;  --color-on-primary: #FFFFFF;  /* charcoal CTA: 13.84:1 */
  --color-accent-decor: #CEF79E;    /* soft-mint lime arrow tiles and pillar: ink on it 11.48:1 */
  --color-deep: #445E5F;            /* deep-sea-green card: white 6.97:1 */
}
```

**Type:** one sans at weight **400 only** (Aspekta — check the license — or Manrope/Inter at 400), tracking −0.02em at every size (−0.03em at the hero), plus Roboto Mono uppercase at 13–15px for every label, date and button.

| Role | Size / line-height | Tracking |
|---|---|---|
| Hero | 112/112 | −0.03em |
| Marquee | 160 | — |
| Section title | 90/90 | — |
| Statement | 76/84 | −0.02em |
| Scroll story | 58/64 | −0.02em |
| H3 | 42/46 | −0.02em |
| Card title | 28/31 | −0.02em |
| Lede | 24/29 | −0.02em |
| Body | 19/25 | −0.02em |

**Page architecture (Integrated Bio):**
1. **Cinematic frame hero (HA4):** a video inset 12px with a 20px radius. The video is the page's one ambient loop. The logo sits in a translucent chip at the top-left. The nav is a segmented chip group (12px radius) at the top-right ("Company", "Newsroom" at 14px mono uppercase with 8px × 17px padding, plus a dark "Work with us" 46px tab). The H1 sits top-left, the lede bottom-left, and the split CTA bottom-right.
2. **Pinned scroll story:** ◆ an eyebrow chip ("■ What we do"), an "01 / 03" counter pill, a hairline progress bar across the viewport, and 3 statements that brighten word by word from ≥ 55% ink (quiet fallback: three static statements).
3. **Platform statement:** an eyebrow chip, a 76px two-tone statement ("…into an engine of discovery." in `ink-dim`), a 19px body paragraph and the split CTA.
4. **Three full-bleed pillars:** ◆ lime / charcoal / stone blocks (480×420 each) with thin line-art geometry, a mono "01." marker (pipeline order), a 28px title and a 19px description.
5. **Oversized line:** "Engineering the future of aging medicine —" at 160px, moving with scroll position rather than autoplaying (the loop budget is spent on the hero video).
6. **Company:** an eyebrow chip, a photo (16px radius) left, a 42px statement right with a 2-column body; italic journal names (*Nature*, *Cell*) as the only italics.
7. **Newsroom panel:** a `surface` block with 40px corners. A 90px title with a "View all articles" split CTA, a featured article card (white, 32px radius, image left), then 3 cards (white, deep-sea teal, charcoal) with ◆ notched corners holding lime arrow tiles (quiet fallback: square corners with the arrow inside).
8. **Footer on media:** a 42px white statement, navigation columns divided by vertical hairlines with mono headers, a back-to-top square (48px, 16px radius, 1px white/20% border), a full-width wordmark at about 220px, and © in mono uppercase.

**Motion:** GSAP + Lenis with `--ease-out-expo` and `cubic-bezier(0.76, 0, 0.24, 1)`; 300–600ms durations on the reference, 150–300ms in 71UI builds; scroll-scrubbed text; the WebGL/video hero pauses offscreen and under reduced motion.

**Signature moves (◆, pick one):** the slanted split CTA; notched cards with lime arrow tiles; the pinned statement story with its counter; the full-bleed tri-color pillars; the giant wordmark footer. Eyebrow chips stay at one per section.

**Avoid:** DNA helix clip-art, blue-white hospital palettes, stock "scientist with pipette" photos when you have real lab photography, and bold weights.

---

### I. Enterprise editorial

**Use for:** enterprise software, finance and insurance tools, legal, consulting, B2B platforms selling to executives.
**Mood:** authoritative, literate, restrained. **Concept:** *a serif voice of judgment over a grotesk engine of precision.*

```css
:root {
  --color-dark: #1C1C1C;  --color-dark-2: #2B2B2B;  --color-light: #F7F6F5;  --color-card: #FFFFFF;
  --color-ink: #292929;  --color-ink-strong: #171717;
  --color-ink-subtle: #6E6D6B;        /* 4.79:1 on #F7F6F5. V7's rgba(4,3,1,.41) measures 2.88:1 */
  --color-on-dark-subtle: #8C8C8C;    /* 5.07:1 on #1C1C1C */
  --color-primary: #171717;  --color-primary-hover: #2B2B2B;  --color-on-primary: #FFFFFF;  /* black pill on light: 17.93:1 */
  --color-accent-decor: #FF6300;      /* decorative only: quote marks, sparks, edge glow */
  --color-highlight-text: #C2410C;    /* results and deltas as text: 4.80:1 on #F7F6F5 */
}
```

**Type:**
- Display is a light serif at 300 (the stated exception to the 400–500 display rule): Martina Plantijn in the reference; free alternatives are Newsreader 300 and Source Serif 4 Display 300. Sizes: H1 54/54, H2 48/48, H4 40/40, all −0.03em. Quotes at 24/34, card titles at 30/42, stat figures at 30/30.
- The UI grotesk (STK Bureau in the reference; free: Geist, Switzer, Inter) runs body 18/25, lede 20/28 (V7 sets 20/22, which is too tight for a 4-line paragraph), UI 14/19.6 and meta 12/16.8.
- Wide grotesks take −0.02 to −0.04em. Inter stays at 0 below 16px.

**Page architecture (V7):**
1. **Announcement bar:** 36px, #171717, 12px text + "Watch video →" in 60% white.
2. **Nav:** 60px, re-themed per section. Logo + 4 links at 13px; "Login" text; "Watch video" as a text link with a play icon (V7 uses a gray pill; one filled button per view); a white "Get in touch" pill.
3. **Dark hero H1:** a serif headline centered over an animated line-field canvas with orange sparks. The lede uses inline brightness emphasis (key phrases 100%, the rest 50–65%). The canvas is the page's one ambient loop. One white "Book a demo" pill.
4. **Logo row:** a caption with one italic serif word ("Shaping the *future* of investment intelligence").
5. **Industry cards:** ◆ a 3-column frame with a radial orange glow on the borders (quiet fallback: a 1px hairline frame). Each card has a serif title, a 3-line description, 4 tag chips and an "Explore … ↗" underlined link.
6. **Testimonials** in the serif face: a static carousel with previous/next buttons (the reference autoplays a marquee; the loop budget is spent on the hero).
7. **Light section (#F7F6F5):** a serif H2 left-aligned, then a bento of white cards in a 4px-gutter frame. Each card has a small pill badge ("#4 globally on SpreadsheetBench"), a 24px sans title and a live mini-UI (download menu, integration logo cloud, knowledge graph).
8. **Proof:** video testimonials; quote cards with a small metric label + figure above and orange quote marks; a results table (Before / With V7 / Result, results in `accent-text`).
9. **Stats row:** serif figures (200+, 3×, 137%) with 16px captions.
10. **Security:** a serif H2, compliance badges (ISO 42001, SOC 2, HIPAA, CCPA, GDPR) and a static row of guarantees with shield icons.
11. **Closing CTA:** ◆ stacked serif lines in a brightness ramp (40% → 70% → 100%; 40% white on #1C1C1C is 3.54:1 at 48px) and an avatar CTA pill ("See it on your data · 30 minutes").
12. **Footer:** dark #2B2B2B, a serif statement, a white "Work with us" pill, 3 link columns and a row of LLM icon tiles (44px, #4A4A4A).

**Signature moves (◆, pick one):** the brightness-ramp stacked headline; the glow-edged industry frame. The serif + grotesk pairing, the 4px-gutter bento and the results table are I's quiet system.

**Avoid:** serif body text in the UI, more than one accent color, and gray-on-gray muted text below 4.5:1 — which the reference itself ships.

---

### J. Developer tools & docs

**Use for:** APIs, SDKs, CLIs, infrastructure, open-source projects, documentation sites.
**Mood:** exact, fast, honest. **Concept:** *the code is the screenshot.*

**Variants:** J1 Blueprint light (SaasCN: Geist, dashed frame, hatched bands, ⌘K search pill; `--color-primary: #171717` with white labels) or J2 terminal dark (`--color-primary: #E6E6E6` with #0B0D10 labels) (Qronos's frame, mono accents, `#0B0D10` canvas with `#E6E6E6` text at 15.59:1 and `#7D8590` subtle at 5.22:1).

**Type:** Geist + Geist Mono (or Inter + JetBrains Mono). Code at 13–14px/1.6. Syntax themes use at most 5 token colors, and comments stay ≥ 4.5:1.

**Marketing page:** a hero with a real install command in a copyable code block (`npm i your-sdk`, with a copy button and a "Copied" state). A 3-step quickstart (a real sequence, so numbering is allowed). A code-and-result split showing an API call beside its response. Performance numbers with methodology links. Integrations, pricing by usage, and a changelog preview.

**Docs layout:**
- Three columns: 240px nav, a 680–760px content column and a 200px "On this page" TOC. Sticky header with ⌘K search. A version switcher.
- **Code blocks:** 12px radius, 1px hairline, a filename tab, language tabs, a copy button and line highlights.
- **Callouts:** a 1px full border + a 4–8% tint + an icon + a label ("Note", "Warning"). Never a thick left stripe.
- **API reference:** a parameters table in mono (name, type, required badge, description) and request/response tabs.
- **Page utilities:** "Copy page as Markdown" or "Open in LLM" buttons, prev/next links, and "Edit on GitHub".

**Signature moves:** the blueprint frame with crosshairs; a live terminal snippet; the API call beside its response; the hatched band dividers.

**Avoid:** fake terminal typing animations, code screenshots as images, rainbow syntax themes, and badges walls (more than 6 shields).

---

## Reference Library

Everything below was measured, not guessed. The live pages were loaded in headless Chrome at 1440 × 900 and 390 × 844, and computed styles were read from the rendered DOM. Source CSS came from D-j-View captures. The raw evidence (computed-style JSON, CSS token scans, 1440px and 390px screenshot slices, and the D-j-View captures) is stored in `references/sites/<site>/` when this file ships with its repository.

### Extracted site: Qronos (AI agent scheduler)

`https://qronos-ai-agent-scheduler-template-v1.21st.app/` · Next.js + Tailwind v4 + shadcn tokens · 3 canvases (WebGL vortex hero, falling-particle CTA) · category **B**

| Aspect | Measured values |
|---|---|
| Palette | Background #000101 · foreground #ECEBE7 · card #020204 · muted text #757168 (4.30:1, fails) · border #101215 · input #07090C · panel outline rgb(55 51 59) · destructive #E40014 |
| White-alpha text ladder | .90 · .85 · .75 · .72 · .70 (nav) · .65 · .50 · .45 · .40 · .35 · .30 · .27 · .24 · .20 · .18 |
| Fonts | `system-ui` body; display requests "Google Sans", which doesn't load publicly, so a Helvetica/Arial fallback renders; SF Mono for micro-labels |
| Type | H1 66.24/60.94 w400 −1.656px (−0.025em) · H2 48/45.6 w400 −1.2px · H3 30/36 w500 −0.75px · lede 20/32.5 · body 16/26 · UI 14/20 · small 12/16 · mono labels 8–10px uppercase at +0.72–1.08px · prices 30/36 w800 |
| Layout | 1400px frame, 56px inline padding · 12-column grid, 32px gap · sections 128px top, 80–128px bottom · pricing 4 × 294px, 24px gap · testimonials 2 × 600px, 48px gap · footer 6 columns, 32px gap |
| Radii | Pills (CTAs) · 14px (bento cards) · 8px (app panels) · 5px (selects) · 4px · 2px (bars) · base `--radius: .25rem` |
| Lines and depth | Hairlines at 6% white; bars 9%; frame bands 12%; panels use the bevel `inset 0 1px 0 rgb(255 255 255/.08), inset 0 -1px 0 rgb(0 0 0/.7)`; glass button `inset 0 1px 0 rgb(255 255 255/.18), 0 8px 20px rgb(0 0 0/.18)` + `blur(12px)` on 6% white |
| Gradients | Panel: `radial-gradient(circle at 50% 0, rgb(94 73 86/.24), transparent 68%)` over #09090C · card: `linear-gradient(145deg, #131315, #070708)` · hatch: `repeating-linear-gradient(135deg, transparent 0 6px, rgb(255 255 255/.06) 6px 7px)` · H1 line 2 text fill: `linear-gradient(#FFFFFF, #D4D4D8 50%, #71717B)` |
| Nav | Fixed, 12px from the top, 48px tall, transparent · logo 112×28 · 5 links at 14px/70% white with 48px gaps · CTA 134×32, 12px/500 uppercase, 1px 50% border, 24px radius, animated sheen |
| Motion | Hover color 150–300ms `(.4,0,.2,1)` · transform springs `(.34,1.56,.64,1)` 400–600ms · `star-btn` sheen 3–5s linear · enter 500ms · live pulse 2s · meter scan 5.6s |
| Signature | Frame rails + sparkle crosshairs · two-tone H2s · product UI built in HTML (Gantt, pipeline, guardrails, inbox, insights) · hatched bands · sheen CTA |

### Extracted site: SaasCN (SaaS landing template)

`https://saas-landing.techwithanirudh.com/` · Next.js + Tailwind v4 + Fumadocs UI · category **A2 / J1**

| Aspect | Measured values |
|---|---|
| Palette | Background #F5F5F5 · text #0A0A0A · muted #737373 (4.35:1 on #F5F5F5, fails) · dark CTA #171717 with #FAFAFA text · header at 80% background + `backdrop-blur-lg` · secondary buttons at 70% background |
| Fonts | Geist (100–900 variable) + Geist Mono for kbd |
| Type | H1 72/72 w400 −3.6px (−0.05em) · H2 48/48 w400 −2.4px · H3 20/28 w400 −0.5px · hero lede 20/32.5 −0.5px · section lede 18/29.25 −0.45px · body 16/24 · nav and buttons 14/20 (buttons w500) |
| Layout | 1280px frame drawn as dashed vertical rails · dashed section rules with "+" marks at the intersections · 32px hatched bands (`45deg`, rgb(204 204 204/.5)) · 650px hatched hero; its bloom is a noise-textured purple→azure PNG (`gradient-noise-purple-azure-light.png`, 1004×900 at 80% opacity, pushed 50%/50% past the bottom-right corner) |
| Nav | Sticky, 57px, translucent + blur · links at 14px #737373 · search pill 240×36 with ⌘K kbd · GitHub icon |
| Components | Announcement chip 255×32 (1px border, 6px radius, ↗) · CTAs 40px: outline "Get in touch" + mail icon; dark "Sign up" + ↗ · bento with dashed cell borders (28px icon top-left, title and description bottom-left) · FAQ accordion rows 53px · split closing CTA · 5-column footer · theme toggle |
| Motion | `(.16,1,.3,1)` × 10 · 150–500ms · accordion and dialog keyframes |
| Signature | The blueprint frame: dashed rails, crosshairs and hatched bands on a monochrome page with weight-400 headlines |

### Extracted site: Integrated Bio (biotech)

`https://integratedbio.com/` · WordPress + GSAP + Lenis + Three.js/Unicorn Studio + hero video · category **H**

| Aspect | Measured values |
|---|---|
| Palette (site token names) | off-white #F7F7F5 · dark-charcoal #222F30 · soft-mint #CEF79E · fresh-lime #A7E26E · sage-mist #C9CBBE · light-gray #EEEEEE · medium-gray #E4E3E3 · deep-sea-green #445E5F · stone card #E7E8E1 · body text at 80% charcoal |
| Fonts | Aspekta 400 (a 600 cut is declared but unused) · Roboto Mono 400 for uppercase labels and buttons |
| Type | Marquee 160px · H1 112/112 −3.36px · section 90/90 −1.8px · statement 76/83.6 −1.52px · scroll story 58/63.8 −1.16px · H3 42/46–50 −0.84px · 36/46.8 · card titles 28/30.8 · lede 24/28.8 · 22/28.6 · body 19/24.7 −0.38px · mono 13–15px uppercase. **Every text style is weight 400.** |
| Nav | Fixed, 30px from the top, 54px tall, 48px inline padding · logo chip · segmented group at 80% white, 12px radius (366×54) · links 39px tall with 8px × 17px padding, 14px mono uppercase · "Work with us" 141×46, #222F30, 8px radius |
| Motion | Nav chip hover fills #F7F7F5 over 600ms `(.16,1,.3,1)` · CTA inverts over 100ms `(.76,0,.24,1)` · underline grows via `background-size` over 300ms `(.16,1,.3,1)` · letter-split statements · Lenis smooth scroll · durations .3/.6/.5/.4s |
| Breakpoints | 600 · 769 · 1025 · 1281 · 1384 |
| Signature | Cinematic frame hero · slanted split CTA · notched news cards with lime arrow tiles · pinned 01/03 scroll story with a progress hairline · tri-color pillars · 160px marquee · newsroom panel with 40px corners · giant wordmark footer |

### Extracted site: V7 Labs (enterprise AI)

`https://www.v7labs.com/` · Framer (breakpoints 810 / 1200) · category **I** (and **B**)

| Aspect | Measured values |
|---|---|
| Palette | Dark #1C1C1C · announcement #171717 · light #F7F6F5 · cards #FFFFFF · ink #292929 · strong #171717 · muted rgb(4 3 1/.41), about 2.88:1 (fails) · orange #EC580A (results text) and #FF6300 (quote marks) · white alphas .71 / .65 / .60 / .50 / .30 |
| Fonts | Martina Plantijn Light 300 (display serif) · STK Bureau Sans Book 400 / 430 (UI) · Inter (mini-UI) |
| Type | H1 54/54 w300 −1.62px · H2 48/48 −1.44px · H4 40/40 −1.2px · card titles 30/42 · quotes 24/33.6 (serif) · sans body 18/25.2 −0.72px · 16/22.4 −0.64px · UI 14/19.6 −0.56px · meta 12/16.8 −0.48px · nav 13/18.2 |
| Nav | Fixed; a 36px announcement bar + a 60px nav · logo 30×16 · "Login" text; "Watch video" pill 99×34 at 11% white; "Get in touch" 100×34 white pill · hover drops opacity to 60%, instantly |
| Layout | 1336px container (52px margins at 1440) · white-card bento with 4px gutters on #F7F6F5 · tag chips 27px (6px radius, 1px border at 8% white, 5% white fill); small badges 25px (99px radius, 3% black fill) · cards 6–12px radius |
| Depth | `0 1px 3px rgb(0 0 0/.04)`; a 6-layer shadow at 1–3% alpha on floating chips; orange radial border glow `radial-gradient(50% 70%, #FF6300, #000)` |
| Signature | Serif + grotesk pairing · inline brightness emphasis · brightness-ramp closing headline · results table · theme-switching nav |

### Screenshot patterns (the 13 references)

| # | File | Pattern to reuse | Key specs | Playbook |
|---|---|---|---|---|
| 01 | `01-stacker-hero.png` | **Offset editorial hero + UI collage** | About 88px weight-400 headline at column 3; tab strip with the active item as a gray pill + icon; a collage of a blue data card (faceted triangle, $2,490.00 in 40px white), gray action tiles and a photo; a dark band with a 44px white title and a profile card | A |
| 02 | `02-stacker-task-card.png` | **Kanban feature tile** | #F5F5F5 tile, about 32px radius; an uppercase caption; a 32px title; two #EFEFEF columns (32px radius); white cards (16px radius); tinted phase chips (orange, green, blue, violet); the selected card tilted −2° with a 2px orange border and a "You" cursor tag; a gray check list | A, F |
| 03 | `03-stacker-collab-card.png` | **Comments tile on a color block** | Coral backdrop #EC7A50; a white 32px-radius tile; comment cards (20px radius) with initials avatars, @mentions in blue, emoji reaction pills with counts and an add-reaction icon | A |
| 04 | `04-stacker-event-cards.png` | **Overlapping color deck** | 3 cards (gray / coral / blue), 24px radius, about 24px overlap; a 44px date numeral, uppercase month, title and time range | A, E |
| 05 | `05-awake-origin-defi-hero.png` | **Warm editorial DeFi** | A white sheet inset in a warm gradient frame; bordered cell nav; serif H1; square black buttons; a gradient panel with a 3D glass emblem and 4 hairline stat cells | C1 |
| 06 | `06-widget-grid.png` | **Widget bento** | Captions outside the cards; music, focus timer (dark dial), flight progress, map, weather gradient, news list with thumbnails, inbox with unread dot, serif quick note, moodboard grid; 20px radii, soft shadows | E2, G |
| 07 | `07-ace-studio-app-cheatsheet.png` | **App detail and settings screen** (with the cheatsheet) | Browser frame; 240px sidebar with workspace switcher, ⌘K field, active gray item, squircle tool icons, pinned and chat sections, progress card and Upgrade row; detail page with a 72px icon tile, Connected badge, banner, data-sync table, store rows and a permissions panel | F |
| 08 | `08-credit-score-mobile.png` | **Mobile finance home** | Blue gradient header fading to the canvas; score 742; glass toggle; health cards with colored status words; stat row; medal rank; floating pill tab bar | D, G |
| 09 | `09-qorix-dark-hero.png` | **Cinematic photo hero (dark)** | Red sun, clouds and mountains; a centered tight headline; square-cut white CTA; centered nav + "Log in" + white CTA; a feature split pairing a dithered image with floating task cards (icon tile, title, subtitle, spinner) beside a chip + H3 + text | B2 |
| 10 | `10-indexrave-empty-dashboard.png` | **dApp dashboard empty state** | "Navigation" label; violet active item; 4 stat cards with colored icon tiles and footnote strips; 3D folder illustration; a violet CTA (48px, 8px radius); dashed decorative columns | C2, F |
| 11 | `11-install-app-modal.png` | **Rich modal** | Blurred scrim; a 780px modal with 24px radius; a noisy gradient header with app icons and connector dots; a serif title; an inner bordered info card with tag chips; a full-width dark 48px pill CTA | F, B |
| 12 | `12-inbox-zero.png` | **Three-pane app + celebratory empty state** | 56px icon rail; list pane with Status/View/Teammates sections, colored status icons and right-aligned counts; an empty-state card (24px radius, border) with a painted landscape and a skeleton inbox; title plus quote | F |
| 13 | `13-banking-bento.png` | **Product-moment bento** | Pill badge; centered 56px headline; 3 tiles (32px radius): a converter UI, a photo tile, a receipt UI with a green check and a download pill | D |

### Apps UI cheatsheet (verbatim)

> **Apps design UI Cheatsheet (bookmark this)**
> - Type: Inter, 16/20px Medium titles, 13/16px Medium labels, 14px Regular body
> - Buttons: 32px height, 10px radius
> - Rows: 40px data, 44px stores
> - Badge: 20px height, 6px radius, #CAFACE fill, #15B042 text
> - Switch: 24x14px, 10px thumb, #0077E6 track
> - Text: #333333 default, #777777 subtle
>
> Strong states make settings easier to scan.

**How 71UI maps it:** the "a/b px" values are size/line-height pairs. Titles → `title-sm` 16px on a 20px line, Medium. Labels → `label` 13px on a 16px line, Medium. Body → `body-sm` 14px Regular (on a 20px line); `button-*` at 32px with `rounded.control` 10px; `row-data` 40px, `row-store` 44px; `badge-success` 20px, 6px radius, `#CAFACE` fill with text darkened to `#0E7A2F` for AA (the original `#15B042` stays as the status dot); switch 24×14 with a 10px thumb using `primary` `#0070E0` (visually identical to `#0077E6`, and it can carry white labels); text `#333333`, with the subtle color nudged to `#6B6B6B` so it passes AA on white *and* on the gray surfaces it often sits on. "Strong states" means active rows use a `surface-2` fill plus `ink-strong`, badges carry text and not just color, and switches show state by position and color.

### Navbar archetypes

Measured on 15 live sites picked from navbar.gallery (491 catalogued navbars), at 1440px wide and 390px mobile. navbar.gallery's own statistics show what each category reaches for:
- SaaS and AI use **mega menus** and **dropdowns** most.
- Finance and crypto favor **dropdowns**.
- Agencies and studios favor **full-screen** and **static** navs.
- Portfolios favor **static**, **full-screen** and **side-bar** navs.

| # | Archetype | Measured spec | Seen on | Fits |
|---|---|---|---|---|
| N1 | **Hairline bar + mega menu** | 64px sticky; solid, or 50–80% white with 20–25px blur; 1px hairline at 5–8% ink (Vercel adds it only after scroll) · links 14/400–500 in secondary gray, 24px text gap, 32–44px targets · buttons 32–40px, radius 4–6 · mega panel attached to the bar (`border-radius: 0 0 12px 12px`), 3–4 columns of icon + title + description plus a featured column, page dimmed 40–70% | Vercel, Ramp, Stripe | SaaS, dev tools, B2B fintech, AI platforms |
| N2 | **Dark right-cluster** | 72px + 1px border, #0B0B0B at 80% + 20px blur · links 13/400 #8A8F98 inside 32px hover pills (8% white) · a 1×16px divider before "Log in" · a light pill CTA (#E5E5E6, 32px) · glass dropdown with 14px radius and 32px blur | Linear | AI products, dev tools, dark SaaS |
| N3 | **Floating pill / hanging tab** | Content-width black tab, about 53px tall, `border-radius: 0 0 18px 18px`, padding 10px · 14/500 at −0.02em, 20px gaps inside a group, 40px between groups · CTA radius 8px (18 − 10, concentric) · mobile: a pill that expands into a sheet | Supaste | Consumer and macOS apps, AI launches (≤ 6 links) |
| N4 | **Inset floating bar** | Inset 16px, 60px tall, radius 12px, #FCFCFC at 90% + 16px blur, `0 1px 4px rgb(16 24 40/.1)` · link pills with 6×12px padding, 12px radius, hover fill 10% ink · 44px pill CTA. Variants: *split islands* (Together AI: two white cards with mono uppercase CTAs); *editorial* (Vinay: square corners, 20px links, a "Copy email" CTA) | Wealthsimple, Together AI, Vinay | Consumer fintech, AI infrastructure, portfolios |
| N5 | **Glass capsule over media** | Transparent bar with 40px side padding · links and CTA inside a capsule of `rgb(66 66 66/.63)` + 4px blur, padding 10px · mono uppercase links · a glass dropdown matching the capsule's width. **Make the capsule radius = CTA radius + padding** (Eco ships a 6px capsule around an 8px CTA — don't copy that) | Eco, Integrated Bio (segmented capsule) | Crypto/DeFi, deep tech, anything with a video hero |
| N6 | **Grid-cell segmented** | 48px + 1px, full-bleed; every item is a 48px cell divided by 1px lines · 16/500 labels · a square logo cell · a solid ink CTA cell with an arrow · dropdowns attached to the bar | Mistral | AI labs, dev tools, technical and brutalist brands |
| N7 | **Framed side lines + announcement** | Page-length 1px frame lines on a 1112px container · an accent announcement pill inside the frame · the bar shrinks from 100 to 72px on scroll · 32px links (8px radius) with a sliding hover pill · a GitHub-stars chip | Firecrawl, Qronos, SaasCN | Open source, APIs, dev tools |
| N8 | **App top bar** | 72px, 12px padding, transparent until scrolled, then solid with a hairline · 18px tab links at 63% of #131313 (5.38:1) · 40px icon buttons · a brand CTA with 12px radius · mobile menus become bottom sheets (16px top radius) | Uniswap | Dashboards, web apps, DeFi apps, logged-in fintech |
| N9 | **Commerce overlay bar** | 60–90px over hero media · a 54–64px logo · large links (20/700) · 36–48px round icon buttons · a "Cart [n]" pill · a big-type side sheet or a brand-color product panel · on mobile, a bottom tab bar or burger-left / logo-center / cart-right | On, Graza | E-commerce, D2C |
| N10 | **Three-zone minimal + full-screen menu** | 54px, transparent · a "Menu" pill on the left, the logo centered, local time and a contact button on the right · a full-screen overlay with large serif links and case-study chips | Metalab | Agencies, studios, portfolios |

**Rules that held across most of the 15:**
- Nav heights cluster at 48–56, 60–64, 72–76 and 90–100px.
- Link text is 13–14px on SaaS and dev sites, and 18–20px on app tabs, portfolios and commerce.
- The gap between groups is at least twice the gap inside a group.
- Background blur ranges from 4 to 32px; hairlines sit at 5–8% ink.
- Dropdowns either attach to the bar or float 8–12px below it, with an 8–16px radius.
- **None used hide-on-scroll** (Stripe and On simply scroll away with the page). Keep navigation reachable.

**Default nav per playbook:**

| Playbook | Nav |
|---|---|
| A. SaaS | N1 |
| B. AI | Framed transparent 48px bar (Qronos, N7 family) or N2 |
| C1. Crypto editorial | N6 (bordered cells, as on Awake Origin) or N5 over video |
| C2. Crypto dApp | N8 |
| D. Fintech | N4 |
| E. Portfolio & studio | N10 or N4-editorial |
| F. Dashboards | Compact 48–56px app top bar (the N8 pattern) plus the app sidebar |
| G. Mobile | Bottom tab bar |
| H. Deep tech | N5 (segmented) |
| I. Enterprise editorial | N1 with an announcement bar, re-themed per section |
| J. Developer tools | N7 or N1 |

The screenshots are in `references/inspiration/navbars/` (desktop strip, open dropdown, mobile and mobile menu for each site).

### Spectrum UI patterns

Spectrum UI (`ui.spectrumhq.in`, github.com/arihantcodes/spectrum-ui) is a shadcn/Tailwind v4 + Motion library with 315 registry items. Its newer blocks set the quality bar; its written doctrine is aspirational (the code breaks it in places, including rainbow gradient text on its own hero).

- **Easing and springs:**
  - Easings: `EASE_OUT [0.16,1,0.3,1]`, `EASE_IN_OUT [0.77,0,0.175,1]`, `EASE_DRAWER [0.32,0.72,0,1]`.
  - Springs (stiffness/damping/mass):

    | Spring | Values |
    |---|---|
    | PRESS | 500/30/0.6 |
    | SWAP | 460/30/0.55 |
    | PANEL | 420/40/0.5 |
    | LAYOUT | 360/32/0.6 |

  - Press is always `scale: 0.96`. No `whileHover` scale on touch.
- **Hairline alphas:** `black/[0.07]` default, `0.045` soft, `0.028` faint; dark `white/[0.10]`, `0.06`, `0.04`. Ink fills `black/[0.09]`.
- **House card:**
  - A ring instead of a border: `0 0 0 1px rgb(10 10 10/.05), 0 1px 3px rgb(0 0 0/.1), 0 1px 2px -1px rgb(0 0 0/.1)`.
  - Radius 24–26px, padding 20–24px. Inner wells are 18px radius on `neutral-100/50`.
  - Bezel shell: 26px radius, 6px padding → 20px inner (concentric).
- **KPI card:**
  - Frame: 16px radius, 1px border at 8% black, `white/60`, 20px padding.
  - Content: 13px label; a 27px/500 rolling value; a 12.5px delta sentence; a scrubbable sparkline with a `role="img"` sentence.
  - `goodWhen: 'down'` for churn and latency.
- **Empty state:**
  - Panel: 16px radius, shadow `0 1px 2px rgb(0 0 0/.04), 0 18px 40px -28px rgb(0 0 0/.35)`.
  - A 56px medallion that enters from scale 0.84 + blur 6px.
  - Text: a 12px mono eyebrow at +0.12em; a 17px title at −0.014em; 13.5px/1.62 body, max 46ch.
- **Table densities:**

  | Density | Header | Cell padding | Text |
  |---|---|---|---|
  | Compact | 36px | 6px | 13px |
  | Default | 44px | 10px | 14px |
  | Relaxed | 48px | 16px | 14px |

  Opaque row fills; hover `neutral-900/[0.025]`; row actions hidden only under `(hover: hover)`.
- **Charts:** 280px frame, dot-grid plot area, no axis lines, 11px mono ticks, dashed 3 3 grid at 14% opacity, a blurred white tooltip, and hovering dims the other series to 28% over 160ms.
- **Order book:** 22px rows, 11px mono tabular, a 520ms update flash.
- **Site navbar:**
  - Sticky, 56px tall, `bg-background/60` + `backdrop-blur-sm`, 1400px frame.
  - Links in 13px mono uppercase, wide tracking, 24–32px gaps.
  - A 32px ⌘K pill.
  - A 32px `neutral-900` pill CTA that reads "Sign up" on phones and "Create account" from `sm` up.
- **Live site measurements:**
  - Header 56px, sticky, white at 60% + 8px blur; 44px page margins.
  - Docs layout: 256px sidebar · 32px gap · 822px content card (radius 15px, padding 32×40px) · 32px gap · 210px TOC.
  - Controls: buttons 40px with 6px radius at 14/500; hero CTAs are 44px pills; inputs 40px with 6px radius and a 1px #E5E5E5 border; tabs 32px with 10px radius; the command palette is 512px wide with 14px radius.
  - Fonts: Geist UI + Geist Mono uppercase nav + Spectral serif display.
  - Transitions: 150ms `(.4,0,.2,1)`.
- **Its weaknesses, so don't copy them:**
  - `text-transform: capitalize` on the hero subline.
  - `#646464` kept in dark mode, which drops to about 3.3:1.
  - Command-palette rows at 8px radius inside a 14px panel with 8px padding; they should be 6px.
  - Too many distinct radius values.
- **"Hard parts" rules worth keeping:**
  - Tabular numerals on every ticking value.
  - Signed deltas repeat the sign as well as the color; zero shows "—".
  - Pies cap at 6 segments; heatmaps use 5 buckets.
  - Streaming is word-chunked, and citations appear after streaming finishes.
  - Send becomes Stop without resizing.
  - An empty table keeps its headers ("the columns are the documentation").
  - Success states occupy the form's footprint.
  - Clocks render after mount to avoid hydration mismatches.

---

## Restyle Protocol

Use this when making an **existing** app or website cleaner and more distinctive. The prime directive: **the product must work exactly as before.** You are changing its surface, not its behavior.

### 1. Recon (read before touching anything)

- Identify the framework, styling system (Tailwind, CSS modules, styled-components, plain CSS), component library, existing tokens or theme file, routes, and the test, lint and typecheck commands.
- Read any `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING`, design-system docs or Storybook.
- Capture "before" screenshots at 390px and 1440px widths of the main screens, including one empty state and one error state if you can reach them.

### 2. Classify

| Sacred — never change | Surface — yours to improve |
|---|---|
| State, effects, data fetching, API calls, handlers, routing, form logic, validation rules, analytics events, feature flags, test IDs, working ARIA wiring | Class names, CSS, tokens, layout wrappers, spacing, typography, color, radius, elevation, icons, motion, empty/loading/error visuals, UI copy (keeping its meaning) |

If a visual fix *requires* a logic change (a missing loading state, for example), propose it separately. Don't slip it in.

### 3. Audit

Run the **Review Rubric** and list findings, ranked by leverage: **token-level fixes first** (they fix every instance at once), then components, then individual screens.

### 4. Tokenize

- Map the current values to 71UI roles: collect every color, font size, radius and shadow in use, then cluster them.
- Create the token layer (CSS variables or a Tailwind v4 `@theme` block). Alias the old variables to the new ones so you can migrate gradually.
- Pick the playbook and one radius personality.

### 5. Replace, in this order

1. Tokens
2. Type scale and fonts
3. Spacing and layout grid
4. Color roles and contrast
5. Core components: buttons, inputs, badges, tables and rows, cards, navigation
6. States
7. Motion
8. Copy
9. **One** signature move from the playbook

**Fix ladder** — use the earliest step that works:
1. Delete
2. Use the platform (native element or CSS feature)
3. Reuse an existing token
4. Correct the value
5. Add something new

Proposing step 5 when step 1 would work is itself a finding.

### 6. Verify

- Build, typecheck, lint and tests pass.
- `git diff` shows no changes to Sacred code.
- "After" screenshots at 390px and 1440px sit beside the "before" ones.
- Keyboard walkthrough; contrast measured; reduced motion checked.

### 7. Report

A before/after table (Before | After | Why), plus residual risks and anything marked "Not verified".

Work in reviewable steps: tokens → one component family → one screen. Never land a 2,000-line restyle in a single change.

---

## Review Rubric

### Scoring

Score each dimension 0–3: 0 broken, 1 weak, 2 solid, 3 exemplary.

| Dimension | What earns a 3 |
|---|---|
| Hierarchy | One focal point per viewport; an obvious primary action; the eye path matches the task |
| Typography | A named scale; the tracking and leading ladders applied; measure 60–75ch; tabular numbers; ≤ 2 families + mono |
| Layout & spacing | 4px scale; grouping law respected; consistent grid and containers; generous section rhythm |
| Color & contrast | Semantic tokens; one accent; every text pair passes on its real surface; status never color-only |
| Components & states | Specs followed; hover, focus, active and disabled everywhere; loading, empty and error designed |
| Motion | Purposeful, fast, interruptible, frequency-appropriate; reduced motion respected |
| Accessibility | Floor fully met; keyboard complete; names and labels correct |
| Responsive | Works at 320–1440px; restructured, not squeezed; touch-sized on mobile |
| Copy | Verb-first actions; specific claims; state formulas; consistent vocabulary |
| Distinctiveness | One loud idea executed well; nothing from the Don'ts list; passes the genericness test |

Total out of 30: **27+** ship-ready · **22–26** iterate once · **< 22** rework the foundations (tokens, type, spacing) before polishing. **Any 🔴 finding forces the verdict to Blocked, whatever the score.**

### Severity

- 🔴 **Blocking:** broken task, fails the Accessibility Floor, or unusable on the target device.
- 🟠 **Important:** a clear quality problem most users would feel.
- 🟡 **Polish:** craft details.

**Always blocking** (no matter the style guide):
- A control with no accessible name.
- A focusable element with no visible focus.
- Anything reachable by mouse but not by keyboard.
- Motion or autoplay that ignores reduced motion.
- Content clipped at 320px wide or at 200% zoom.
- Text contrast failure.
- Meaning carried by color alone.
- A destructive action with no confirmation or undo.
- Truncation with no way to see the full value.
- An error with no way to recover.
- A semantic color used against its meaning (danger red on a safe action).
- A state change shown only through motion.

### Finding format

| Severity | Area | Location | Evidence (measured) | Fix (exact value) | Why |
|---|---|---|---|---|---|
| 🔴 | Color | `Pricing.tsx:42` | `#737373` on `#F5F5F5` = 4.35:1 | Use `--color-ink-subtle: #6B6B6B` (4.89:1) | Secondary text fails AA |

### Report shape

1. **Strengths:** 2–4 specific things to keep.
2. **Findings:** every blocker, plus at most 15 others, ranked. One root cause is one row listing every location.
3. **If you fix one thing:** the single highest-leverage change.
4. **Verdict:** Ship / Iterate / Blocked.
5. **Not verified:** everything you couldn't check.

### Evidence rules

- Measure; don't eyeball. Cite hex values, ratios, px and ms.
- Visual claims need a render (a screenshot or a browser), not source code alone.
- Don't report taste as a defect. A density, radius or voice you merely dislike isn't a finding if it's consistent and the brief chose it.

### Slop scan

Flag any of these on sight:
- Gradient headline text
- Side-stripe callouts wider than 1px
- The identical three-card feature grid
- The big-number hero template
- An icon tile above every heading
- The imperative tricolon headline
- AI or sycophant footers
- An eyebrow above every section
- Purple-blue glow washes
- Emoji icons
- Lorem ipsum or placeholder people
- Fake metrics
- `transition: all`

Then ask the **genericness test**: *could someone guess this page's layout and palette from its category alone?* If yes, the loud idea is missing.

---

## Pre-Ship Checklist

Run this against the diff before calling UI work done. Report each item as ✅, ❌ (with the fix) or "Not verified".

**Tokens & color**
- [ ] A token plan exists and was followed; colors come from semantic tokens, not primitives or raw hex.
- [ ] Contrast checked against the surface each element actually sits on: text ≥ 4.5:1, large text ≥ 3:1, UI and focus ≥ 3:1.
- [ ] One accent; status changes never use color alone.
- [ ] Dark mode is designed, not inverted, and uses one theme mechanism.

**Typography**
- [ ] Display is 400–500 weight (stated exceptions: 300 light serif in playbook I, 600 hero numbers in D/G) with the tracking ladder; body runs 60–75ch; headings balanced, descriptions pretty.
- [ ] Changing numbers, prices and tables use `tabular-nums`.
- [ ] Fonts are woff2, at most 2 families + mono, with swap and metric-matched fallbacks.

**Layout & shape**
- [ ] Spacing comes from the 4px scale; group spacing is ≥ 2× intra-group spacing.
- [ ] Nested radii are concentric; one radius personality throughout.
- [ ] One elevation method per surface; no 1px border under a heavy shadow.

**Components & states**
- [ ] Every interactive element has a visible `:focus-visible` style.
- [ ] Hover styles are behind `@media (hover: hover)`; active, disabled, loading, empty and error states exist.
- [ ] Icon-only buttons have `aria-label`; inputs have a real `<label>`, `type`, `inputmode` and `autocomplete`.
- [ ] Hit areas ≥ 24px, ≥ 44px on touch targets.
- [ ] Button labels start with a verb; confirmations repeat the consequence; one filled button per view.
- [ ] Decorative overlays have `pointer-events: none`.

**Motion**
- [ ] No `transition: all` anywhere in the diff.
- [ ] Movement uses only transform, opacity, filter and clip-path; color and background changes are ≤ 150ms; UI transitions ≤ 300ms with ease-out (drag-driven sheets excepted).
- [ ] Motion is wrapped in `@media (prefers-reduced-motion: no-preference)`; at most one ambient loop, and it's pausable.

**Responsive & performance**
- [ ] Verified at 320 / 390 / 768 / 1024 / 1440px; no horizontal scroll; `100svh` heroes; 16px inputs on mobile.
- [ ] Images have dimensions and `srcset`; the hero media is preloaded; offscreen canvases pause.

**Distinctiveness**
- [ ] Exactly one loud idea is present and executed with care.
- [ ] Nothing from **Do's and Don'ts → Don't** remains.
- [ ] The genericness test answer is "no", and one decorative element was removed before shipping.

---

## Iteration Guide

1. **Tokens first, prose second.** Change values in the front matter, then update the prose that explains them.
2. **Lint after every edit:** `npx @google/design.md lint design.md`. The target is 0 errors and 0 warnings.
3. **Export tokens into code:**
   - Tailwind v4: `npx @google/design.md export --format css-tailwind design.md > theme.css`
   - Tailwind v3: `--format json-tailwind`
   - W3C design tokens: `--format dtcg`
   - Coverage: colors, font families, sizes, weights, line-heights (because they're written in px), letter-spacing, radii and spacing. Font features (`tnum`) and component styles aren't exported, so add them by hand. Font tokens hold the primary family only; declare the full fallback stack in CSS (see **Typography**).
4. **Adding a category playbook:** copy the template (Use for · Mood · Concept · Variants · Tokens with contrast ratios · Type · Architecture · Components · Signature moves · Avoid). Run every new color pair through a contrast check before committing.
5. **Adding a reference site:**
   - Capture it with D-j-View (`npm run benchmark -- <URL> --out output/<name>`), verify with `npm run verify -- output/<name>/package/site --screenshots`, and extract computed styles.
   - Add an "Extracted site" table here. Record its contrast failures along with the fixes.
6. **Keep every `##` heading unique.** The DESIGN.md format rejects duplicate sections. Playbooks and references use `###`.
7. **Respect the brief.** When a user's brand guide conflicts with this file, the brand guide wins, except for the **Accessibility Floor**.

---

## Sources & Resolutions

### Sources

| Source | What it contributed | License |
|---|---|---|
| Apps design UI cheatsheet + 13 reference screenshots (supplied with this skill) | Core product-UI dimensions, patterns catalog | — |
| Qronos, SaasCN, Integrated Bio, V7 Labs — captured with [D-j-View](https://github.com/Nuel-osas/D-j-View), measured in headless Chrome | Exact tokens, layouts, motion, contrast audit | Reference only; site content keeps its owners' rights |
| [navbar.gallery](https://www.navbar.gallery/), [ui.spectrumhq.in](https://ui.spectrumhq.in/) | Navbar archetypes, component specs | Reference only |
| [anthropics/frontend-design](https://www.ui-skills.com/skills/anthropics/frontend-design) | Distinctiveness, AI-default looks, token-plan-first workflow | Apache-2.0 |
| [addyosmani/accessibility](https://ui-skills.com/skills/addyosmani/accessibility) | WCAG 2.2 floor, audit workflow | MIT |
| [superfuture/design-review](https://ui-skills.com/skills/superfuture/design-review) | 10-area rubric, severity tiers, exact-value fixes (its telemetry and paid-upsell steps were deliberately **not** adopted) | MIT (per metadata) |
| [jakubkrehel/better-interface](https://ui-skills.com/skills/jakubkrehel/better-interface) | Evidence-based review, escalation triggers, fix ladder, domain numbers | MIT |
| [wshobson/interaction-design](https://ui-skills.com/skills/wshobson/interaction-design) | Motion purposes, durations, easing and spring presets | MIT |
| emilkowalski/emil-design-eng · apple-design (via t.co links) | Frequency rule, easing tokens, springs, gestures, materials | MIT |
| mengto/beautiful-shadows (via t.co) | sm/md/lg shadow presets | MIT |
| shadcn-ui/shadcn skill (via t.co) | Token pairs, composition rules | MIT |
| pbakaus/impeccable adapt + craft-floor (via t.co) | Responsive and platform adaptation, craft floor | Apache-2.0 |
| [nerdstalker/ui-ux-fixer](https://github.com/nerdstalker/ui-ux-fixer) | Form UX, mobile and AI-product patterns (Luke Wroblewski's principles) | MIT |
| [display-dev/visualize](https://github.com/display-dev/visualize) | Absolute bans, slop tests, cognitive-load limits, state copy | MIT (parts CC BY 4.0) |
| [arihantcodes/spectrum-ui](https://github.com/arihantcodes/spectrum-ui) | Easing and spring tokens, hairline alphas, block specs, hard-parts rules | Apache-2.0 |
| [interfaces.dev cheat sheet](https://interfaces.dev/cheat-sheet) | Implementation rules and the base of the Pre-Ship Checklist | — |
| [DESIGN.md format](https://stitch.withgoogle.com/docs/design-md/overview/) (`@google/design.md`) | File structure, linting, token export | Apache-2.0 |

### Resolutions (where the sources disagreed)

| Topic | Positions | 71UI decision |
|---|---|---|
| Press scale | 0.95–0.98 · 0.97 · 0.96 · 0.98 | **0.97** default (0.96–0.98), never below 0.95 |
| Exit easing | Ease-in exits vs ease-out both ways | **Ease-out** both ways, exits at ~75% duration; never ease-in |
| Springs | Zero bounce vs bouncy presets | **No overshoot** in UI; bounce 0.1–0.2 only after flicks or in playful consumer moments |
| Decorative motion | Scroll reveals everywhere vs one orchestrated moment | **One authored moment** per page |
| Reduced motion | Global kill switch vs swap motion for cross-fades | **Opt-in** authoring, plus ≤ 200ms cross-fades under reduce |
| Ambient loops | Banned vs used by the references | **At most one**, pausable, paused offscreen, off under reduced motion |
| Toasts | Auto-dismiss at 3s vs ≥ 5s with errors persisting | **≥ 5s**; errors and actions persist |
| Eyebrow labels | Hard ban vs used in references | Allowed only when they **encode information**, ≤ 1 per viewport |
| Stripes and grids | Banned as decoration vs structural in Qronos and SaasCN | Allowed only as a **frame system**: 1px rails ≤ 12% alpha, hatch fills ≤ 6% (Architectural personality) |
| Gradient text | Banned vs Qronos's hero fade | Banned, **except** a vertical white→gray fade on one dark hero line |
| Glass | Functional (Apple) vs decorative (banned) | Only for **chrome over moving content**, with a reduced-transparency fallback |
| Card radius | 12–16px vs 24–32px | Set by **radius personality**: Soft precise 12–16, Friendly 24–32 |
| Border + shadow | "Ghost card" ban vs ring-shadows | A **ring-shadow is fine** (the ring *is* the border); never a 1px border plus a heavy blur |
| Display tracking | −0.02em · −0.04em floor · −0.05em · −0.093em | **Size ladder**, −0.04em at 72px, floor −0.05em |
| Display weight | 700 (a generic default) vs 300–500 (all four references) | **400–500**, with two stated exceptions: 300 for light serif displays (I), 600 for hero numbers (D, G) |
| Inter | "Overused" vs the cheatsheet's choice | **Inter for product UI**; a characterful display face on marketing pages |
| Targets | 24 / 40 / 44 / 48 | **24 floor**, 40 desktop, 44 touch (iOS), 48dp (Android) |
| Large text | "18px / 14px bold" (a px/pt mix-up) vs WCAG | **24px / 18.66px bold** |
| Line length | < 80 · 45–75 · 60–75 · 65 | **60–75ch** (680px) |
| Contrast model | WCAG 2 vs APCA | **WCAG 2 AA** for pass/fail; APCA Lc ≥ 75 for body as a design aim |
| Numbered markers | Only for sequences vs Integrated Bio's pillar numbers | Only for **real sequences or orders** |
| Monospace | "Costume" vs Integrated Bio's label system | Allowed for **labels and data** in a deliberate system; never for body text |
| Card hover | Lift and shadow vs "AI tell" | **No lift** by default; change the border or tone instead |
| Placeholder as label | Never vs micro-forms | Only for **1–2 field forms** (search, newsletter), with an `aria-label` |

---

## Known Gaps

- **Lighter coverage:** e-commerce and checkout, games, email templates, print, RTL and CJK typesetting, and dense scientific data-viz. Apply Core plus the nearest playbook, and document your deviations.
- **Front-matter tokens describe the Core theme only.** The DESIGN.md format holds one token set per file, so playbook palettes live in the prose CSS blocks. Paste the relevant block when you adopt a playbook.
- **Licensed fonts:** some reference fonts need a license (Martina Plantijn, STK Bureau, Google Sans; check Aspekta's terms). Free alternatives are listed in the pairing library.
- **Measurements date from September 23, 2026 captures.** Live sites change; re-measure before claiming a pixel-exact match.
- **Captured sites are study material.** Their content, images and code remain their owners'. Use the patterns and measurements; don't republish their assets.
- **The DESIGN.md format is at version `alpha`.** Re-run the linter when the spec updates.
