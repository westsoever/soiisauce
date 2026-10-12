# soii. design

The visual contract for soii. It covers the shell (sidebar, tab strip, content sheet) and every view and reader surface. `app/client/base.css` and `app/client/theme.css` own the token values, and `app/client/ui/*` owns component APIs. This file owns the decisions in between.

## Direction

soii is a reading room for your own notes. It should feel quiet, exact and compact, with a small amount of character. The content (covers, briefs, people, numbers) is the interesting part. The chrome stays out of its way.

- Dense, with room to breathe: compact rows, calm panels, clear hover and focus states.
- Character comes from copy, icons and small moments, never from decoration.
- No gradients (never purple ones), no decorative blobs, no oversized hero type, no dramatic shadows, no one-off visual systems.
- Tight, utilitarian shapes. Use the component radii, with softer corners on panels and dialogs, and full rounding only for pills and circular controls. Don't mix radius families on one surface.

## Colour

Use semantic tokens by role, never raw colour utilities or hand-written `dark:` colours:

| Token | Role |
|---|---|
| `background` / `foreground` | the content sheet and primary text |
| `card` | an intentionally framed object (a gallery card, a stat tile) |
| `popover` | floating UI: menus, the search palette, tooltips |
| `primary` | the single most important action in a region, progress fills, the Today dot |
| `muted` / `muted-foreground` | quiet structure and secondary text |
| `accent` | hover, active and selected states |
| `success` / `destructive` | good outcomes / errors and destructive actions |
| `border`, `input`, `ring` | separators, filled controls, focus |
| `chart-1` … `chart-5` | data series, in order |
| `obsidian` | the "Open in Obsidian" button only: Obsidian's own purple, by owner request (D57) |

Don't add or rename tokens. If nothing fits, use the closest role and note the gap in your handoff.

## Type

- `text-sm` is the UI default. Use `text-xs` only for genuinely compact metadata, and larger sizes only for real headings: the reader title, stat values.
- Two weights only: regular, and `font-medium` for emphasis.
- `font-sans` everywhere, including paths, ids and numbers. `font-mono` is for code blocks only. Use `tabular-nums` where numbers must line up.
- Reader prose uses the typography plugin (`prose prose-sm`), mapped onto the semantic tokens so it follows light and dark themes.

## Layout

- Build hierarchy from spacing, weight and tonal surfaces before reaching for frames. Allow one framed surface per section, and no cards inside cards.
- Contained blocks get a soft shadow (`shadow-xs`), not an outline. On hover, a block may step one level up the shadow scale. Borders are only for separators, in the `border` token.
- Workspace tabs are folder tabs: they sit on the header's bottom edge, the active one has rounded top corners only and flares into the content sheet (`.soii-folder-tab` in `base.css`), with no shadow. Inactive tabs are plain text that gets a faint sheet tint on hover.
- Scrollbars are overlay-style app-wide: no track, and a thin thumb that shows only while its area scrolls and hides about a second after (`app/client/lib/scrollbars.ts` plus the rule in `base.css`). Don't restyle scrollbars per component.
- Repeated rows keep fixed slots for leading icons, counts and trailing actions, so the lanes never shift.
- Every surface must work from 390px to wide desktop: no clipped controls, no sideways page scroll (wide tables scroll inside their own container), no large dead areas.
- Loading states use skeletons shaped like the result. Spinners are only for small inline actions.

## Components and accessibility

- Reuse `app/client/ui/*` and their variants before writing styled native markup. If a primitive is missing, stop and report it instead of hand-rolling badges, tabs, selects and the like at the call site.
- `Button` for actions, with one primary per region.
- Filter chips are `Button size="sm"`, `variant="secondary"` when on and `ghost` when off, with `aria-pressed`. Counts sit inside in muted `tabular-nums`. A chip row scrolls sideways below `md` and wraps above it.
- Dialogs always have a title (visually hidden is fine). Icon-only controls need an `aria-label`, plus a tooltip when the meaning isn't obvious.
- Cover every reachable state: hover, focus, disabled, loading, empty, error. Never signal state with colour alone. Errors say what happened and what to do next.

## Icons

Use `@tabler/icons-react` only, imported from the package root, and always set `stroke` explicitly. Allowed size/stroke pairs:

| Size | Stroke | For |
|---|---|---|
| 12 | 1.75 | dense metadata, tiny status glyphs |
| 16 | 1.75 | rows, tabs, sidebar, compact controls |
| 20 | 1.5 | standalone actions |
| 24 | 1.5 | empty states and large affordances |

Inside `Button`, the button's size class sizes the icon. Set only the matching `stroke`.

## Styling mechanics

- Tailwind utilities only: no CSS modules, no `@apply` shorthands. Inline `style` is allowed only for values computed at runtime (a progress width, a CSS variable carrying a data colour).
- Arbitrary values are for geometry only, never colours.
- Compose conditional classes with `cn('base', condition && 'extra')`, never template-literal ternaries.
- Avoid z-index. Rely on DOM order and portals.
- Avoid `group-has-*` / `peer-has-*`.

## Motion

Motion explains a change of state or place, nothing else. Use `tw-animate-css` utilities (`animate-in fade-in-0 zoom-in-95 duration-200`) and no custom keyframes. Keep it short and never loop for decoration.

## Copy

- The product name is `soii.` in user-facing copy, lowercase with the trailing period, and `soii` in prose and identifiers.
- Nouns, used exactly:
  - **workspace** is an entry in the sidebar (Library, People, …)
  - **tab** is one surface inside a workspace
  - **view** is how a tab renders (list, table, gallery, board, stats, feed, pulse)
  - **note** is one markdown file in the vault
  - **vault** is the connected repository
- Sentence case everywhere. Name actions precisely ("Continue with GitHub", "Open in vault").
- Empty states teach the convention that would fill them ("Add `type: book` to a note's frontmatter.").
- No hype, no "please", no "successfully".

## Before you finish UI work

Check that you reused primitives, used semantic colours, kept rows aligned at 390px and 1440px, covered every state, followed the icon pairs, and kept the markup as simple as the behaviour allows.
