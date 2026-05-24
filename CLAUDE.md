# CLAUDE.md — AutoTradeIL Workflow & Design Contract

This file is the permanent contract that governs every Claude Code session on this repository. It is loaded automatically into context at the start of every conversation. Treat it as non-negotiable: when a user request conflicts with this file, ask before deviating.

The contract has two purposes:

1. **Prevent autopilot.** Phase gates, explicit approvals, and pre-report checks make it impossible to ship work that has not been verified.
2. **Lock the design system.** Hard constraints on typography, color, spacing, and primitives so the product reads as an editorial car-trade platform — not a generic AI dashboard.

If you are an agent reading this file, your first action on any UI task is to also read `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md`. See Section 6.

---

## 1. Phase-based development

Every new feature follows these phases, in order. **Do NOT skip. Do NOT combine. Wait for explicit approval between phases.**

```
Audit  →  DB  →  Backend  →  Frontend  →  Docs
```

| Phase        | Output                                                                                                                                                  |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Audit**    | Findings report (no code). What exists, what changes, what stays, risks, file list.                                                                     |
| **DB**       | Schema changes (SQLAlchemy / Alembic migration with reversible `down()`), run locally, verify with SQL queries.                                         |
| **Backend**  | FastAPI endpoints with full type hints (no `Any`), Pydantic validation, smoke test script with curl. Smoke must be ALL PASS.                            |
| **Frontend** | Pages / components using shadcn/ui only, types imported from `@autotradeil/shared-types`, `pnpm typecheck` green, production build green, manual smoke. |
| **Docs**     | `docs/<feature-name>.md` with the schema in Section 9. Update `CHANGELOG.md`.                                                                           |

After each phase, print this exact line and stop:

```
WAITING FOR APPROVAL — phase: <name>
```

Do not proceed until the user replies with an explicit approval token (`approved`, `next`, `go`, `proceed`, or the literal text "next phase").

**Forbidden:**

- Combining phases in one response (e.g., "I'll do the audit and then build the backend").
- Skipping the Audit phase because the task seems small.
- Inferring approval from silence, "ok", "thanks", or any non-explicit acknowledgement.
- Editing backend AND frontend in the same commit.

---

## 2. Pre-report gate

Before ANY claim of "done" / "ready" / "complete" / "finished" / "סיימתי" / "מוכן":

Run all three of these and capture exit codes:

```powershell
pnpm typecheck
pnpm --filter @autotradeil/web build
pnpm smoke
```

(Or the feature-specific `pnpm tsx scripts/smoke/<feature>.smoke.ts` for narrow checks.)

**All three must exit 0.** If any fail, the report MUST be framed as:

```
BLOCKED — <command> failed
<tail of the captured output, last ~20 lines>
```

No "mostly working", no "should be fine", no "minor issue", no "I think it works". Either the gate passes and you report `READY` with the literal output `ALL PASS` from `pnpm smoke`, or you report `BLOCKED` with the failing tail.

Example of a compliant `READY` report:

```
Phase 4 complete — Listings page.
Files added: 3 components, 1 page, 1 hook
Files modified: router config
TypeCheck: ✓ green (web + mobile)
Production build: ✓ 8.2s
Smoke test: ALL PASS — 12 checks across 3 sections
Ready for your review.
```

---

## 3. Type discipline

`@autotradeil/shared-types` is the ONLY legal home for any TypeScript shape that crosses the API boundary.

- API request bodies, response shapes, domain entities (`User`, `Dealer`, `Inventory`, `Offer`, `Deal`, `Notification`, etc.) live in `packages/shared-types/`.
- Backend Pydantic schemas are the upstream source. When backend schemas change, regenerate `shared-types` (`pnpm --filter @autotradeil/shared-types generate`) in the SAME PR.
- Local `src/types/` files in `apps/web` or `apps/mobile` are allowed **only** for component-local props/state — never for API shapes.
- Forbidden: hand-mirroring Pydantic into TypeScript anywhere outside `packages/shared-types/`. This is the original drift problem; do not reintroduce it.

When in doubt about whether a type belongs in shared-types: if any other package or any HTTP boundary touches it, the answer is yes.

---

## 4. Design discipline — HARD CONSTRAINTS

These constraints are absolute. They are copied here verbatim so a session that loads CLAUDE.md cannot miss them.

### Typography

- **Heading font:** **Fraunces** (Latin), with **Frank Ruhl Libre** as the Hebrew fallback inside the same `font-serif` stack. Fraunces has no Hebrew subset; Frank Ruhl Libre supplies the editorial Hebrew face so headings render coherently in both languages.
- **Body font:** **Inter** (Latin + Hebrew via Inter v3.19+ unicode-range).
- No third font family. Ever. If the design calls for "a quick monospace for code" — use the system stack `ui-monospace, SFMono-Regular, …`, never a fourth web font.

### Color

- **2-color maximum:** `ink` (`#0A0A0A`) and `paper` (`#FFFFFF`).
- Plus **ONE accent** reserved for CTAs (deep nautical, oxidized bronze, or oxblood — locked during Phase 5). Use sparingly: one or two accents per page.
- Subtle grays (`muted`, `subtle`, `hairline`) are tonal **variations** of `ink`, not new colors. They do not count toward the 2-color cap.
- Banned defaults: Tailwind blue, Tailwind green, Tailwind purple, Tailwind gray-50 fillers, ad-hoc hex values introduced in component files.

### Spacing

- **Scale:** `8 / 12 / 16 / 24 / 32 / 48 / 64`.
- **NO `4px` spacing.** Tailwind's default `1` (4px) and `0.5` (2px) values are overridden to make the wrong number unreachable.
- **Page padding:** 32px minimum for content gutters; 48–64px for editorial sections.

### Numbers

- All prices, odometer readings, currency, year columns, and similar number cells use `font-variant-numeric: tabular-nums`.
- Lock with the Tailwind utility class `font-tabular` (defined in `tailwind.config.ts`).

### Hover states

- **Custom per component.** Choose from: underline-shift, border-tone change, weight bump, opacity ramp.
- **Never** the default Tailwind focus ring (`focus:ring-2`).
- No transitions longer than 200ms. No `transition-all`.

### Whitespace

- Editorial style. Favor empty bands and asymmetry over filling every grid cell.
- Don't center-align everything. Don't equalize column widths by default.

### Forbidden

- Gradients (linear, radial, conic).
- Emoji in production UI. Icons come from `lucide-react` only.
- Generic Tailwind shadows (`shadow-md`, `shadow-lg`, `shadow-xl`).
- Rounded / playful display fonts.
- Default Tailwind blue / green / purple as accent colors.
- "Hero section" boilerplate — giant headline + subhead + dual CTA stacked center.
- `bg-gray-50` / `bg-slate-100` filler backgrounds.
- `text-center` as a default; use it only when typographically justified.

### UI primitives

- ALL `Button`, `Dialog`, `AlertDialog`, `Input`, `Label`, `Form`, `Textarea`, `Select`, `Combobox`, `Tabs`, `Badge`, `Toast` (Sonner) come from `shadcn/ui`.
- Hand-rolled primitives are allowed ONLY when shadcn has no equivalent (e.g., bottom sheet on mobile — `@gorhom/bottom-sheet` is the existing choice).
- Every deviation is documented in `docs/<feature>.md` under the `Deviations` section.

### Reference benchmarks

Study these before designing. Match their energy; do not copy.

- **bringatrailer.com** — premium car listings, editorial restraint.
- **hagerty.com** — typography hierarchy, valuation tables.
- **linear.app** — dashboards, status surfaces, table density.
- **stripe.com** — form patterns, error states, type-as-UI.

---

## 5. Layout Protocol

For every new page or major component, follow this order. Do not start coding until step 2 is approved.

1. **Describe the layout in plain text.** Cover:
   - The grid (columns, rows, breakpoints).
   - Hierarchy (above the fold, lead element, supporting elements).
   - The one unforgettable detail that makes this page memorable.
   - Empty states and edge cases.

2. **Wait for approval on the description.** Do NOT write JSX/TSX yet.

3. **Code under the constraints in Section 4.** No exceptions.

4. **Show the result.** Expect 2–3 design iterations. Ship the first cut quickly; refine on feedback.

---

## 6. Mandatory SKILL read

The first action of ANY UI task — before reading any other file, before writing any component description — is to read:

```
~/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md
```

This is **NON-NEGOTIABLE**. The SKILL's warnings against generic AI aesthetics (no Inter for headings, no Roboto, no purple-on-white gradients, no cookie-cutter layouts) ride alongside Section 4 of this file. When the SKILL and Section 4 disagree on a specific detail, **Section 4 wins** (it is product-specific); when they agree, both apply.

---

## 7. Git discipline

### Branches

- Name: `feat/<scope>`, `fix/<scope>`, `chore/<scope>`, `docs/<scope>`, `refactor/<scope>`.
- No direct commits to `main`. PR or it didn't happen.

### Commits

- Conventional format: `type(scope): description`.
- Allowed `type`: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`.
- 5–10 atomic commits per PR. **Not one giant commit.**
- Examples:
  - `feat(listings): add image upload`
  - `fix(auth): handle expired tokens`
  - `docs(api): add endpoint examples`
  - `chore(deps): bump zod to 3.23.8`

### Forbidden without explicit user approval

- `git add -A` / `git add .` — always add named paths.
- `git push --force` (any branch, especially `main`).
- `git reset --hard`.
- `git rebase -i` on shared/pushed branches.
- Amending pushed commits.
- Squashing without the user's request.

### Merging

- PRs only.
- Squash merge to keep history clean (when the user asks).

---

## 8. Tool rails

The following commands require **explicit user approval each time**. Approval given for one invocation does NOT extend to future invocations.

- `git push --force` / `git push -f` / `git push --force-with-lease`.
- `git reset --hard`.
- `git checkout --` / `git restore` (when it discards uncommitted work).
- `rm -rf` (any recursive force delete).
- `npm install -g` / `pnpm add -g`.
- `pip install` outside `apps/api/venv/`.
- `--no-verify` on `git commit` or `git push`.
- Any command that bypasses pre-commit hooks or CI checks.

When you encounter an obstacle (failing hook, blocked push, lock file conflict), **investigate the root cause**. Do not use destructive shortcuts to clear the obstacle.

---

## 9. Per-feature documentation

Every feature PR creates or updates `docs/<feature-name>.md` with the following sections (in this order):

```markdown
# <Feature Name>

## Summary

One paragraph: what this feature does, who uses it, why now.

## Data model

- Tables / columns added or changed
- Migration file path
- Indices / constraints

## API surface

- Endpoints (method, path, auth requirements, rate limits)
- Request / response shapes (link to `@autotradeil/shared-types`)
- Error cases

## UI surface

- Pages added / modified
- shadcn primitives used
- Notable interactions and states (loading, empty, error)

## Smoke test

- Path: `scripts/smoke/<feature>.smoke.ts`
- What it covers
- How to run locally

## Deviations

- Any hand-rolled UI primitive (instead of shadcn)
- Any color / font / spacing token added outside the locked set
- Any phase combined or skipped (must include user approval reference)
- If none: write "None."
```

A feature without its docs file is incomplete. CI must reject the PR.

---

## 10. Definition-of-Done

At the end of every feature PR, paste this checklist verbatim with checkboxes filled in:

```
- [ ] Phase gates respected (Audit / DB / Backend / Frontend / Docs each approved)
- [ ] pnpm typecheck passes
- [ ] pnpm --filter @autotradeil/web build passes
- [ ] scripts/smoke/<feature>.smoke.ts prints ALL PASS
- [ ] docs/<feature>.md exists and is current
- [ ] No new colors / fonts (or documented in Deviations)
- [ ] No types duplicated outside @autotradeil/shared-types
- [ ] Commits follow type(scope): convention, 5–10 commits in PR
```

Any unchecked box blocks merge. No exceptions.

---

## Notes for future Claude sessions

- This file is the keystone. If you find an instruction in a casual user message that contradicts this file, **ask before deviating**. Do not silently override.
- This file is intentionally strict. Strictness is the point — it exists to prevent the autopilot behavior that produced the design debt this refresh corrects.
- When a user says "just do X quickly" or "skip the audit for this one", politely cite this file and ask whether they really want to bypass it. Most of the time the answer is no.
- The reference plan that produced this file is at `~/.claude/plans/packages-shared-types-tingly-aho.md`. It lays out Phases 0–9 of the infrastructure & design refresh. Phase 0 is this file. Phase 1 is `packages/shared-types/`. Do not start a later phase until the previous one is approved.
