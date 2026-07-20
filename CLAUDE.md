# CLAUDE.md

Operating instructions for Claude Code in this repository. Keep this file short and stable — it should rarely change. For anything that changes often, use the files it points to instead.

## Project

Internal **Lead Management System (LMS)** for a B2B SaaS product company. Tracks BD leads from first contact through implementation, extensions, and closure, with role-based workflows and task automation.

- **Full product requirements:** `LMS_PRD_updated.md` — read before building any feature.
- **Data model, workflow tables, field specs:** `LMS_Technical_Requirements_updated.md` — read before touching models, endpoints, or the workflow engine.
- **Current build plan & progress:** `PLAN.md` — the phase breakdown and checklist. Update this file's checkboxes as work completes; do not treat it as documentation, treat it as a tracker.
- **UI design system (colors, components, patterns):** `design.md` — read before building or restyling any screen or component; all status color goes through `frontend/src/components/shared/StatusBadge.jsx`.

Always check `PLAN.md` for current phase/status before starting work, and confirm which phase you've been asked to execute if it isn't stated.

## Tech stack

| Layer | Choice |
|---|---|
| Backend | Django + Django REST Framework |
| Auth | DRF SimpleJWT (access + refresh tokens) |
| Frontend | React JS |
| UI | Tailwind CSS + shadcn/ui |
| Data fetching | React Query + Axios |
| Database | PostgreSQL |
| Admin/role mgmt | Django default admin panel |
| Layout | Mobile-responsive throughout |

## Roles (functional, not just DB flags)

`User Management`, `Lead Admin`, `Lead Manager`, `Marketing`, `Resource Manager`, `Finance`, `Employee` (baseline — applies to every user in addition to their specific role). Permission scoping must be enforced server-side (DRF permission classes / querysets), never trusted from the frontend alone. See PRD §6 for the full role permission matrix.

## Core domain hierarchy

```
Company → Lead → Project → Task (from BD workflow) → Checklist item
```
Checklists and tasks are instantiated per-project from workflow/task templates — see Technical Requirements for the exact task-sequencing and trigger rules. Tasks auto-open for the right role at the right point in the workflow; don't hardcode sequencing logic without checking the workflow table first.

## Working rules

- **No guessing.** If the PRD or Technical Requirements doc is ambiguous, missing a detail, or self-contradictory, stop and ask rather than assuming — log it under an "Open Questions" note or ask directly.
- **Plan before code.** For any new phase or non-trivial feature, produce/update a plan in `PLAN.md` before writing implementation code, unless explicitly told to skip straight to execution.
- **One phase at a time.** Do not proceed to the next phase in `PLAN.md` without explicit go-ahead, even if the current phase completes early.
- **Global field rule:** dates default to "no past dates allowed" except where the PRD explicitly exempts a field (e.g. Date of Joining).
- **Mobile-responsive** is a requirement on every screen, not an afterthought.

## Commands
_(fill in once the project is scaffolded)_
- Backend dev server: `TODO`
- Frontend dev server: `TODO`
- Run backend tests: `TODO`
- Run migrations: `TODO`

## Conventions
_(fill in as they're established — keep this section factual, not aspirational)_
- Branch naming: `TODO`
- Commit message format: `TODO`
- Folder structure: `TODO`

## Settled decisions

Foundational decisions resolved 2026-07-10 are recorded in `PLAN.md` §0 (Decisions) — read them before questioning the architecture. In brief: the two `*_updated.md` docs govern (`specs.md` is deprecated, archived at `archive/specs_v0.6.md`); multi-role via Django Groups (no `role` field); `username` is the login identifier; two lead types only (BD + Mining, Extension is a BD workflow cycle); reference tables live in their own `reference` app.
