# Design System — ReadTheMemo

The visual language for ReadTheMemo. Slate/midnight neutrals, a cyan-teal
primary, and a coral/peach accent reserved strictly for AI-generated content
badges — "crisp and clean" in light mode, "premium and immersive" in dark,
per the brief this was built from.

---

## 1. Brand foundation

### Source of truth

Real artwork, supplied by the user: `public/brand/readthememo-mark.png` (the
mascot mark alone) and `public/brand/qnx-and-readthememo-lockup.png` (the
combined Questronix + ReadTheMemo lockup with tagline, for contexts that need
both brands together — not wired up anywhere yet).
`src/components/brand/logo.tsx` renders the mark via `next/image` next to a
"ReadTheMemo" text wordmark, with the same prop shape (`variant`,
`height`/`size`, `className`, `priority`) mcsu-app's own image-based lockup
used. `variant="white"` (the auth brand panel) wraps the mark in a
translucent light chip, since the artwork is dark-navy-heavy and would
otherwise disappear against the panel's midnight background.

The favicon uses Next's `icon`/`apple-icon` file convention —
`src/app/icon.png` and `src/app/apple-icon.png`, both the mascot mark —
rather than a hand-built `.ico`.

### Colours

Derived from the brief (Slate Tint background, Midnight Blue dark mode, Cyan/
Mint accent, Coral/Peach AI badge), converted to OKLCH and checked against
WCAG AA — not eyeballed:

| Token | Light | Dark |
| ----- | ----- | ---- |
| Background | `#F8FAFC` | `#0B0F19` |
| Card / surface | `#FFFFFF` | `#1E293B` |
| Primary text | `#0F172A` | `#F1F5F9` |
| Primary / accent (cyan-teal) | `oklch(0.49 0.12 220)` ≈ `#006E8F` | `oklch(0.55 0.12 220)` ≈ `#0080A2` |
| AI-badge accent (coral) | `oklch(0.54 0.18 32)` ≈ `#C1351E` | `oklch(0.76 0.17 40)` ≈ `#FF8657` |

Everything is authored in OKLCH so tints stay perceptually even.

### The coral rule

> Coral is reserved for **AI-generated content badges** — a small tinted chip
> marking output the system produced, not a person. It is never a general
> button fill, link colour, or large UI surface.

The badge pattern is text-on-its-own-tint, not solid-fill-with-white-text:
coral text sits on a light tint of itself (~10% in light mode, ~16% over
`--card` in dark mode), which is what clears AA — coral text on a plain white
or `--card` background does not reliably hit 4.5:1 at every hue this system
might pick, so don't use it as ordinary body text either.

Verified contrast ratios:

| Pair | Ratio | Verdict |
| ---- | ----- | ------- |
| White on primary (light, `#006E8F`) | 6.03 | AA |
| White on primary (dark, `#0080A2`) | 4.67 | AA |
| Coral text on its own 10%-tint chip (light) | 4.75 | AA |
| Coral text on its own 16%-tint chip over `--card` (dark) | 4.89 | AA |

---

## 2. Tokens

All tokens live in `src/app/globals.css`. Two layers:

1. **Brand constants** (`--brand-cyan`, `--brand-coral`, `--brand-midnight`) —
   identical in both themes. The auth split-panel is brand-constant by design,
   same reasoning as mcsu-app's `.brand-panel`.
2. **Semantic tokens** (`--primary`, `--muted-foreground`, `--sidebar`, …) —
   redefined under `.dark`.

**Always use semantic tokens in components.** Write `bg-primary`, not
`bg-[#006E8F]`.

### Light / dark divergence

`--primary` is the one token that changes hue-lightness between themes, same
hue, lifted for dark mode — the light-mode cyan is too dark to read well
against a midnight background:

- Light: `oklch(0.49 0.12 220)` — 6.03:1 against white.
- Dark: `oklch(0.55 0.12 220)` — lifted, still clears 4.5:1 against white
  button text.

### Radius and type

- `--radius: 0.625rem` (10px), same scale mcsu-app uses.
- **Inter** for UI text, **JetBrains Mono** for identifiers.
- Numerics in tables use `tabular-nums` so columns align.

---

## 3. Layout

### Auth — split panel

`src/app/(auth)/layout.tsx`. Brand panel left, form right, `1fr : 1.05fr`.

- The brand panel is **decorative** and disappears entirely below `lg`. A
  compact logo bar replaces it.
- Form column caps at `26rem`.
- The panel background is the `.brand-panel` component class: midnight base
  with a cyan glow from the lower left and a faint coral glow from the upper
  right — the "glowing gradient blending Base and Accent" treatment the brief
  asked for, reused here for the (always-dark) brand panel.

### App — sidebar shell

`src/app/(app)/layout.tsx`. Fixed 16rem rail, sticky 4rem topbar, content
capped at `max-w-7xl`.

- Below `lg` the rail becomes a `Sheet` drawer.
- The active nav item is marked **two ways**: a primary-colour left bar and
  `aria-current="page"`. Coral is not used here — it's reserved for AI
  badges, see above.
- Sidebar contents come from `src/lib/navigation.ts` filtered through RBAC.

---

## 4. Component conventions

### Status vs. role

- **Status** badges are coloured: amber `pending`, green `active`, red
  `suspended`. Each also carries an icon and a text label.
- **Role** badges are neutral outline + icon. A role is a fact, not an alert.

### Empty, loading, error

- **Loading** — skeletons that match the real row geometry.
- **Empty** — `<EmptyState>` with an icon, a specific title, and a sentence
  that says what would make rows appear.
- **Error** — an inline panel with the reason and a Retry button.

### Destructive actions

Anything irreversible goes through `AlertDialog` with the subject's name in
the body and a verb-specific confirm button ("Remove user", not "OK").

---

## 5. Accessibility baseline

- Body text meets **4.5:1**; large text and UI graphics meet **3:1**.
- `:focus-visible` draws a 2px ring at 2px offset. Pointer focus does not.
- Every icon-only button has an `aria-label`; decorative icons get `aria-hidden`.
- `prefers-reduced-motion` collapses all animation to ~0ms globally.
- Interactive targets are ≥ 36px tall.

---

## 6. Writing

- **Sentence case** everywhere. Not Title Case.
- Say what happened and what to do, not "Update successful."
- Errors name the constraint, never blame.
- Use they/them for users whose pronouns you don't know.

---

## 7. Adding a screen

1. Add the permission to `PERMISSIONS` in `src/lib/rbac.ts` and grant it to
   the right roles.
2. Add the nav entry in `src/lib/navigation.ts` with the same permission.
3. Create the page under `src/app/(app)/…` and guard it with
   `await requirePermission("your:permission")`.
4. Compose from `PageHeader` + content. Handle loading, empty and error.
5. Server-render the first read; use TanStack Query for interaction after that.
