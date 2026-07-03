# Lead Management System — Product Specification

> **Status:** Draft v0.4 (phase 1 rework — Lead absorbs Project)
> **Product type:** Internal delivery/lead management tool for Vector Consulting Group. Phase 1 of a planned multi-phase internal platform (see §1.4).
> **Purpose:** Single source of truth describing every part of the system, structured so each section can be handed to Claude in VSCode as a build prompt.
> **Implementation note:** See §21 for what's actually been built so far and where it diverges from this spec.

---

## 0. How to read this document

- **[ASSUMPTION]** — I invented it; change freely.
- **[DECIDE]** — still open; answer before building.
- **[PLACEHOLDER]** — real content you must supply (Mining/Extension workflows).
- **[DEMO]** — illustrative sample data/content to be replaced.

**Reader context (confirmed):** The company sells consulting engagements to client companies. A **Lead** is the unit of work — a single engagement of one of **3 types** (BD, Mining, Extension), owned by a Manager and assigned to exactly one Representative who executes it. The app is used **internally** by senior staff. Tool: **React (frontend) + Django (backend)**, **mobile-responsive**, **in-app notifications** (email later).

---

## 1. Overview & objectives

### 1.1 Goal
An internal system where senior staff capture every lead with a client company, drive it through a **type-specific checklist workflow**, assign it to a representative, get in-app notifications, log all activity, and see delivery health on a dashboard.

> **[CHANGED v0.4]** Earlier drafts treated a Lead as a sales opportunity that could spin off multiple Projects, each with its own checklist. Phase 1 collapsed this to a strict 1:1 — a Lead now carries its execution track (assigned rep, dates, task/checklist) directly, with no separate Project entity. See §21.7.

### 1.2 Success criteria (phase 1)
- Every lead lives in one place with its full execution track built in.
- Each lead runs the correct **type-specific task/step + checklist workflow**.
- Managers assign leads to representatives; reps see only what's theirs.
- In-app notifications surface assignments, required actions, and due additional tasks.
- A dashboard shows lead counts by status and overdue items.

### 1.3 Non-goals (phase 1)
- Email/marketing automation (in-app notifications only for now; email later).
- Post-sale billing/invoicing or the actual product's functionality.
- Native mobile apps (responsive web instead).
- Sales-pipeline forecasting (ACV, probability, expected-close-date) — dropped this phase; see §21.7.
- Kanban board, dedicated Companies/Reports/Settings screens — deferred; see §12.2.

### 1.4 Planned future phases (architecture awareness)
This is being built as a general-purpose internal platform, not just a lead tracker. Phase 1 is Lead Management. Known future phases — not built yet, but the data model should stay flexible enough to hang them off a Lead/Company without a rework:
- **Resource allocation system**
- **Finance tracker system**
- **Feedback management system** for employees / allocated resources

---

## 2. Users, roles, belts & permissions

The company uses an internal **belt hierarchy** (low → high): **White → Brown → Red → Black**. Only the top belts (**Red, Black**) use this app. `belt` is stored as a **display attribute** on each user; functional access is governed by the three **roles** below.

| Role | Typical belt | Responsibility |
|---|---|---|
| **Admin** | Black | Top of hierarchy; owns the system and config |
| **Manager** | Red/Black | Owns leads; leads a team of reps |
| **Representative** (consultant) | Red | Executes assigned work — updates checklists, uploads files, completes tasks |

Reps belong to a manager (`manager_id`). Managers own leads. Reps are assigned leads directly by their manager.

### 2.1 Permissions matrix (confirmed)

| Action | Admin | Manager | Representative |
|---|:--:|:--:|:--:|
| See dashboard | ✅ global | ✅ own leads | ✅ own leads |
| Create lead / company | ✅ | ✅ | ❌ |
| View leads | **all** | **own only** | **only leads assigned to them** |
| Edit lead details | any | own | ❌ |
| Reassign lead owner (manager) | ✅ | ❌ | ❌ |
| Reassign lead's representative | ✅ | ✅ (own) | ❌ |
| Add / configure checklist items on own leads | ✅ | ✅ | ❌ |
| Update checklist items / upload required files | ✅ | ✅ | ✅ (assigned) |
| Create / update additional tasks | ✅ | ✅ | ✅ (own) |
| Delete / archive lead | ✅ | ❌ | ❌ |
| Configure lead types & checklist **templates** (global) | ✅ | ❌ | ❌ *(no admin UI yet — §21.9)* |
| Manage users | ✅ | ❌ | ❌ *(no admin UI yet — §21.9)* |

**Priority defaults to Low** when unset (any role that can create a lead).

---

## 3. Domain model & glossary

Core hierarchy:
```
Company (client account)
  └── Lead (the unit of work; carries LEAD TYPE + its own execution track)
        ├── Task / Step        ← instantiated from the lead type's template, directly on the lead
        │     └── Checklist item(s)   ← each can require a File + fire a Notification
        └── Additional Task(s) ← ad-hoc, formerly "follow-ups"
```

| Term | Meaning |
|---|---|
| **Company / Account** | The client organization. Has many leads over time, many contacts. No dedicated screens in phase 1 — see §4. |
| **Lead** | The unit of work with a company. Fixed **lead type**. Owned by a Manager, assigned to exactly one Representative who executes it. |
| **Lead type** | One of **3** kinds: **BD, Mining, Extension**. Determines the **task/steps + checklist template** a lead uses. |
| **Task / Step** | A named phase within a lead type's workflow (e.g. "Discovery"). Contains checklist items. |
| **Checklist item** | A single tickable action inside a task/step. May **require a file** and/or **fire a notification**. |
| **Custom field** | An extra, type-specific field beyond the default lead fields. |
| **Additional Task** *(formerly "Follow-up / Action item")* | An ad-hoc task a manager creates and assigns, separate from the template checklist. Lives in the lead's own "Additional Tasks" tab — see §9.3. |
| **Activity** | Timestamped log entry (call, note, status change, checklist update). |
| **Notification** | In-app alert to a user (assignment, action needed, due date). |

> **Type vs. Status:** *Lead type* = which of the 3 kinds it is (fixed, drives the workflow). *Status* = the lead's current execution state (changes over time — see §8). Independent axes.

> **[CHANGED v0.4]** The former **Project** entity (a lead could spin off multiple projects, each with its own checklist) no longer exists. A lead now *is* the unit of execution. See §21.7.

---

## 4. Entity — Company / Account
| Field | Type | Notes |
|---|---|---|
| id | auto | |
| name ✱ | text | |
| industry ✱ | enum | Retail, Healthcare, Finance, Logistics, Education, Manufacturing, Government, SaaS/Tech, Other |
| domain | text/enum | sub-area |
| website | url | |
| company size | enum | SMB / Mid / Enterprise |
| location | text | |
| contacts | list | see §5.4 |
| leads | list | historical + active |
| created_by / created_at | auto | |

> **[PHASE 1]** No dedicated Companies list/detail screens. Companies are picked from a dropdown or created inline via a "+ New" dialog on the Lead form. The entity is kept intact (not flattened into the Lead) specifically so future phases (§1.4) — resource allocation, finance tracking across a client relationship — can hang off it without a rework.

---

## 5. Entity — Lead (the unit of work)

> **[CHANGED v0.4]** This entity absorbs everything the old §6 "Project" entity used to hold (assigned rep, start/target dates, task/checklist). See §21.7.

### 5.1 Identity & classification
| Field | Type | Notes |
|---|---|---|
| Lead ID ✱ | auto (`LD-2026-0042`) | immutable |
| Company ✱ | company ref | |
| Lead type ✱ | enum (BD / Mining / Extension) | drives workflow — see §7 |
| Industry ✱ | enum | (mirrors/overrides company) |
| Domain | text/enum | |
| Product modules / editions in scope | multi-select | placeholder list — **[DECIDE]** confirm the real list |

A lead has no standalone name field. It's identified by **Company + Lead ID**; screens show the company name and Lead ID together (e.g. "TechNova Retail · LD-2026-0001").

### 5.2 Ownership, assignment & status
| Field | Type | Notes |
|---|---|---|
| Status ✱ | enum | In Progress / On Hold / Dropped / Completed — see §8, default **In Progress** |
| Owner (Manager) ✱ | user ref | defaults to creator if manager |
| Assigned to (Representative) ✱ | user ref | the rep who executes — required at creation |
| Priority | enum | Low (default) / Medium / High / Urgent |
| Source detail | text | e.g. "inbound", "referral by X" |
| Tags | multi-tag | |
| Start date | date | |
| Target date | date | |

### 5.3 Commercials
| Field | Type | Notes |
|---|---|---|
| Plan / edition | enum | e.g. Starter / Pro / Enterprise — **[DECIDE]** your tiers |
| Seats / licenses | number | |
| Billing cycle | enum | Monthly / Annual |
| Contract length | number (months) | |
| Currency | enum | |
| Renewal date | date | for expansion/renewal tracking |

> **[CHANGED v0.4]** Dropped **ACV, MRR, Probability%, Expected close date** — these were sales-forecast fields tied to the old pipeline-stage model (§8), which no longer exists. See §21.7.

### 5.4 Contacts (people at the company)
`id, company_id, name, title, email, phone, decision_role (Decision maker / Influencer / Technical / Procurement / User), is_primary, notes`

No dedicated UI in phase 1 (no Contacts tab on the lead, no Companies screens) — kept as backing data for future phases, per §4.

### 5.5 Lifecycle & free text
| Field | Type | Notes |
|---|---|---|
| Description / requirement summary | long text | |
| Internal notes | long text | not client-facing |
| Created by / at, Last activity at, Next follow-up | auto/date | |
| Attachments | list | documents at **lead** level — see §10 |

> **[CHANGED v0.4]** Dropped **Lost reason / Won notes** — tied to the old Closed Won/Lost pipeline stages, which no longer exist.

### 5.6 Task/steps + checklist
Instantiated **automatically and mandatorily** the moment the lead is created, from its lead type's template (§7.1) — there's no separate "create project" step anymore.

---

## 6. *(removed)*

The old "Entity — Project" section merged into §5 as of the phase 1 rework — see §21.7.

---

## 7. Lead types → task/steps → checklist items (+ custom fields)

This is the configurable core. **Admins** define the templates globally; **managers** may add/adjust checklist items on their own leads.

### 7.1 Structure
```
Lead Type (1 of 3: BD / Mining / Extension)
  ├── Custom fields         (extra fields beyond defaults, specific to this type)
  └── Task / Step (ordered, named)
        └── Checklist item (ordered)
              ├── requires_file?   (bool — rep must upload a document to complete)
              └── notify?          (bool — fires an in-app notification to the assignee)
```
The moment a **lead** of this type is created, the template above is **copied** onto it as an editable working instance (`lead_tasks` + `lead_checklist_items`). Editing the template later does **not** retroactively change existing leads.

### 7.2 The 3 lead types
| # | Lead type name | Status |
|---|---|---|
| 1 | **BD** | Fully specified — see §7.3 |
| 2 | **Mining** | **[PLACEHOLDER]** single-step placeholder seeded; real workflow pending |
| 3 | **Extension** | **[PLACEHOLDER]** single-step placeholder seeded; real workflow pending |

### 7.3 BD — task/steps
Custom fields: `POC start date (date)`, `Compliance review needed? (yes/no)`

- **Step 1 — Discovery**
  - [ ] Confirm decision maker & authority — *notify: on assign*
  - [ ] Capture required product modules — *requires file: requirement doc*
  - [ ] Log budget & timeline
- **Step 2 — Demo / Evaluation**
  - [ ] Schedule product demo — *notify: 1 day before*
  - [ ] Deliver demo & capture feedback — *requires file: demo notes*
  - [ ] Provision trial/POC access
- **Step 3 — Proposal**
  - [ ] Prepare pricing & proposal — *requires file: proposal PDF*
  - [ ] Internal approval — *notify: to manager*
  - [ ] Send proposal to client
- **Step 4 — Close**
  - [ ] Negotiate terms
  - [ ] Collect signed contract — *requires file: signed agreement*
  - [ ] Handoff to onboarding

### 7.4 Mining / Extension — **[PLACEHOLDER]**
> Supply the real task/steps and I'll wire them in exactly. Currently seeded with a single placeholder step ("Getting Started") and 2 placeholder checklist items each, just so a lead of these types is fully functional in the meantime.

| # | Lead type name | Task/steps (in order) | Notes |
|---|---|---|---|
| 2 | Mining | _[step, step, …]_ | Mining an existing account for expansion opportunities |
| 3 | Extension | _[step, step, …]_ | Extending / renewing an existing engagement |

---

## 8. Status

> **[CHANGED v0.4]** Replaces the old two-status-field model (sales-pipeline Lead status + separate execution Project status) with a **single status field** on the Lead. See §21.7.

### 8.1 Lead status
```
In Progress ⇄ On Hold
In Progress → Dropped
In Progress → Completed
```
4 options: **In Progress** (default at creation) / **On Hold** / **Dropped** / **Completed**. No forecasting stages, no lost-reason/won-notes prompts. Every status change is auto-logged. Derived signal: the lead's checklist completion % feeds a progress ring wherever it's shown.

Individual **task-steps** within the checklist (§7.1) still carry their own smaller-scoped status — `Not started → In progress → Completed` — shown on each step card in the Task tab (§13).

### 8.2 Planned: BD → Mining/Extension conversion reminder — **[DESIGN ONLY, not built]**
When a BD-type lead's status becomes **Completed**, a future phase should fire a reminder (e.g. N months later, or based on `target_date`) prompting the owner to convert the engagement into a **Mining** or **Extension** lead, with "remind me later" / dismiss actions. Not implemented yet — flagged here so the data already in place (`status`, `lead_type_id`, `target_date`) doesn't need rework when it lands. See §19 item 6.

---

## 9. Tasks, assignments & notifications

### 9.1 Assignment flow
1. Manager creates a **Lead**: picks the company, lead type, owner, and **assigns a Representative** — all in one form.
2. Creating the lead immediately instantiates its task/steps + checklist from the type template (mandatory, automatic — no separate creation step).
3. Manager may add extra checklist items or ad-hoc **Additional Tasks**, and can reassign the rep at any time.
4. Rep sees only their assigned leads, works the checklist in the **Task** tab, uploads any **required files**, marks items done (or N/A).
5. Completing items updates progress and logs activity.

### 9.2 In-app notifications (phase 1) — email later
A `notifications` record + bell icon with unread count. Triggers:
- Lead assigned to a rep.
- Checklist item flagged `notify` becomes actionable / due.
- Additional task due date reached / overdue.
- Lead assigned to a manager (owner reassignment).
- (Optional) status change on a lead you own/are assigned to.

Each notification has `type, message, link (to the item), read (bool), created_at`. **Architecture note:** keep a channel abstraction so an **email channel** can be added later without reworking triggers.

### 9.3 Additional tasks *(formerly "ad-hoc follow-ups / action items")*
`id, lead_id, title, due_date, assigned_to, done, reminder_at`. Distinct from the template task/steps; created by managers, surfaced to reps and on the dashboard. Lives in the lead's own **Additional Tasks** tab (§13) — no standalone screen/nav item in phase 1.

---

## 10. Documents / attachments

Uploads attach at **two levels**: **Lead** and **Checklist item** (when `requires_file`).
`attachments (id, entity_type[lead|checklist_item], entity_id, filename, url/file, uploaded_by, uploaded_at)`
**[DECIDE]** storage backend: local disk (Django `MEDIA_ROOT`) for dev vs. cloud (S3) for prod. Restrict file types & size; scan filenames.

---

## 11. Activity timeline
`activities (id, lead_id, type[Call|Email|Meeting|Note|StatusChange|ChecklistUpdate|Assignment], summary, body, created_by, created_at)`. Auto-entries for status/checklist/assignment changes; manual for calls/notes. Shown newest-first inside the lead's **Lead** tab.

---

## 12. Functional requirements

### 12.1 Must-have (phase 1)
1. Auth + role-based access (Admin/Manager/Rep) with belt attribute.
2. Company CRUD (inline from the lead form); Lead CRUD (archive = soft delete, Admin only).
3. Lead auto-instantiates its checklist from the type template at creation.
4. Lead-type + checklist **template** config (Admin) — data model only in phase 1, no admin UI yet (§21.9).
5. Assign leads to reps; rep-scoped visibility.
6. Checklist execution: tick items, mark N/A, upload required files.
7. In-app notifications (bell + unread count).
8. Additional tasks (ad-hoc, per-lead) with due dates.
9. List view (filter/search/sort).
10. Lead detail: top overview card (assigned rep, owner, progress, timeline) + 3 tabs — **Lead** (classification/commercials/description/files/activity), **Task** (checklist), **Additional Tasks**.
11. Dashboard: lead counts by status, overdue additional tasks, active leads in scope.

### 12.2 Deferred to a later phase
- Kanban board (visual status board).
- Dedicated Companies list/detail screens (entity still exists, §4).
- Reports (win rate, value by owner/type, rep workload) — depended on the ACV/forecasting fields removed in §5.3.
- Settings/Admin UI for lead types, checklist templates, and user management — configure by editing seed data directly for now (§21.9).
- CSV/Excel import & export.
- Duplicate detection.
- Audit log.
- BD → Mining/Extension conversion reminder (§8.2).
- Resource allocation, finance tracker, feedback management systems (§1.4) — new to this draft, no schema yet.

### 12.3 Later
- Email notification channel.
- Custom-field builder UI for admins.
- Web-to-lead intake form.
- Lead scoring.

---

## 13. Screens / UI map

| Screen | Purpose | Notes |
|---|---|---|
| Login | Auth | JWT |
| Dashboard | Health + "my leads" | role-scoped; counts by status, not pipeline value |
| Leads — List | Browse/manage | filters, search, sort, New lead |
| Lead — Detail | The lead's full record | top overview card (progress, assigned rep, owner, timeline) + 3 tabs: **Lead** / **Task** / **Additional Tasks** |
| Lead — Create/Edit | Grouped form (§5) | assigns rep + dates directly; no separate project step |
| Notifications | Bell dropdown + full page | mark read |

**Removed from phase 1 nav** (§12.2): Leads — Kanban, Companies, Additional Tasks/Follow-ups as their own screen, Reports, Settings.

**UX:** mobile-responsive; sidebar collapses to an icon-only rail (state persisted); rep view is a focused "my assigned leads" list; row shows company · Lead ID · type · status · priority · assigned rep · progress ring · next follow-up.

---

## 14. Data model (relational)

```
users(id, name, email, role[Admin|Manager|Representative], belt[white|brown|red|black],
      manager_id→users, password_hash, active, created_at)

companies(id, name, industry, domain, website, size, location, created_by→users, created_at)
contacts(id, company_id→companies, name, title, email, phone, decision_role, is_primary, notes)

leads(id, company_id→companies, lead_type_id→lead_types, industry, domain,
      product_modules[], status[In Progress|On Hold|Dropped|Completed] default 'In Progress',
      priority default 'Low', owner_id→users, assigned_to→users, source_detail, tags[],
      plan, seats, billing_cycle, contract_length, currency, renewal_date,
      description, internal_notes, start_date, target_date,
      created_by→users, created_at, last_activity_at, next_follow_up, archived bool)

-- Templates (Admin-configured; no admin UI yet — edit seed data directly, §21.9)
lead_types(id, name, description, active)                       -- BD | Mining | Extension
task_steps(id, lead_type_id→lead_types, name, order, description)
checklist_template_items(id, task_step_id→task_steps, label, order, requires_file bool, notify bool)
lead_type_custom_fields(id, lead_type_id→lead_types, field_name, field_type, required, options[])

-- Working instances (one set per lead, instantiated automatically at creation)
lead_tasks(id, lead_id→leads, source_task_step_id→task_steps, name, order, status)
lead_checklist_items(id, lead_task_id→lead_tasks, label, order, state[open|done|na],
                     requires_file bool, notify bool, done_by→users, done_at)
lead_custom_values(id, lead_id→leads, custom_field_id→lead_type_custom_fields, value)

-- Cross-cutting
attachments(id, entity_type[lead|checklist_item], entity_id, filename, file, uploaded_by→users, uploaded_at)
activities(id, lead_id→leads, type, summary, body, created_by→users, created_at)
additional_tasks(id, lead_id→leads, title, due_date, assigned_to→users, done bool, reminder_at)
notifications(id, user_id→users, type, message, link, read bool, created_at)
```

> **[CHANGED v0.4]** `projects`, `project_tasks`, `project_checklist_items`, and `project_custom_values` no longer exist. They merged into `leads`, `lead_tasks`, `lead_checklist_items`, and `lead_custom_values` respectively. `followups` renamed to `additional_tasks` (and dropped its `project_id` column, since there's no project to reference). See §21.7.

---

## 15. API surface (Django REST Framework sketch)

```
POST   /api/auth/login            (JWT: access + refresh)
POST   /api/auth/refresh

GET    /api/companies      POST /api/companies      GET/PATCH /api/companies/:id
GET    /api/contacts       POST /api/contacts

GET    /api/leads          ?status=&type=&owner=&q=&page=       (queryset scoped by role)
POST   /api/leads                                                (auto-instantiates task/checklist template)
GET/PATCH/DELETE /api/leads/:id
PATCH  /api/leads/:id/status         {status}
PATCH  /api/leads/:id/assign-owner   {owner_id}                  (Admin)
PATCH  /api/leads/:id/assign-rep     {assigned_to}                (Admin/Manager, own leads)

GET    /api/leads/:id/tasks
GET    /api/leads/:id/checklist
PATCH  /api/checklist-items/:id   {state, ...}                  (upload handled separately)

POST   /api/attachments           (multipart: entity_type[lead|checklist_item], entity_id, file)
GET    /api/leads/:id/activities        POST /api/leads/:id/activities
GET    /api/leads/:id/additional-tasks  POST /api/leads/:id/additional-tasks  PATCH /api/additional-tasks/:id
GET    /api/notifications   PATCH /api/notifications/:id/read

-- Admin config (data model only in phase 1 — not wired to a screen yet, §21.9)
GET/POST/PATCH /api/lead-types
GET/POST/PATCH /api/lead-types/:id/task-steps
GET/POST/PATCH /api/task-steps/:id/checklist-items

GET    /api/dashboard/summary
```
**Removed vs. earlier drafts:** `/api/leads/:id/projects`, `/api/projects/:id` and friends (no more Project entity); `/api/reports/pipeline`, `/api/import/leads`, `/api/export/leads` (deferred, §12.2).

**Role scoping** is enforced server-side in each queryset/permission class (reps → only their assigned leads; managers → own; admin → all).

---

## 16. Non-functional
- **Security:** hashed passwords, server-side role checks (DRF permissions), input validation, JWT with refresh, file-type/size limits.
- **Performance:** list views < 1s up to ~10k leads; paginate.
- **Auditability:** all mutations logged (activities + audit log).
- **Responsive:** mobile-first for the rep "my work" views.
- **Backups:** **[DECIDE]** cadence/retention.

---

## 17. Tech stack (confirmed direction)

- **Frontend:** **React (JS)** + Vite, React Router, **Tailwind CSS + shadcn/ui**, **React Query + Axios** for API, mobile-responsive layout.
- **Branding:** Vector Consulting Group wordmark/arrow mark (SVG), `frontend/src/components/layout/Logo.jsx`. Sidebar collapses to an icon-only rail; state persisted client-side.
- **Backend:** **Django + Django REST Framework**. *(Not started yet — see §21.1.)*
- **Auth:** DRF **SimpleJWT** (access + refresh tokens). **[DECIDE]** confirm JWT vs. session auth.
- **Database:** **PostgreSQL** (prod), **SQLite** (local dev) — **[DECIDE]** confirm Postgres.
- **File storage:** Django media (local) in dev → S3-compatible in prod. **[DECIDE]**.
- **Notifications:** in-app now; keep a channel abstraction so **email** (Django email backend) drops in later.

**Build sequencing (changed from §20):** built **frontend-first** against a mocked API layer instead of backend-first — see §21.1 for why and how the mock layer is structured so it's a drop-in swap once Django exists.

### Why this maps cleanly to AI prompting
§14 → "generate the Django models + migrations." §15 → "build these DRF viewsets/serializers/permissions." §13 → build each React screen. §7 → the template-instantiation logic. Tackle in the build order below.

---

## 18. Demo data — **[DEMO]**, replace with real leads

| Lead ID | Company | Type | Status | Assigned to | Plan | Seats | Owner (Mgr) |
|---|---|---|---|---|---|---|---|
| LD-2026-0001 | TechNova Retail | BD | In Progress | Rohan | Pro | 120 | Priya (Red) |
| LD-2026-0002 | MediCare Systems | BD | In Progress | Vikram | Enterprise | 400 | Arjun (Black) |
| LD-2026-0003 | FinEdge Capital | Mining | In Progress | Sana | Pro | 60 | Priya (Red) |
| LD-2026-0004 | LogiTrack Freight | Extension | In Progress | Rohan | Enterprise | 250 | Arjun (Black) |
| LD-2026-0005 | Bright Learning Co | BD | In Progress | Sana | Starter | 30 | Priya (Red) |
| LD-2026-0006 | TechNova Retail | BD | Completed | Sana | Pro | 80 | Priya (Red) |
| LD-2026-0007 | FinEdge Capital | BD | Dropped | Vikram | Pro | 40 | Arjun (Black) |
| LD-2026-0008 | MediCare Systems | Mining | On Hold | Vikram | Enterprise | 150 | Arjun (Black) |

(ACV/value columns dropped along with the field itself — §5.3. Types are now the real 3, not placeholders.)

---

## 19. Open questions before/while building
1. **[PLACEHOLDER]** Real task/steps for **Mining** and **Extension** (§7.4) — the one big content gap now. BD is fully specified (§7.3).
2. **[DECIDE]** Product **modules/editions** list and **plan tiers** — still placeholder values.
3. **[DECIDE]** Confirm **PostgreSQL** + **JWT** auth + **file storage** backend. *(Moot until the Django backend is started — §21.1.)*
4. Can a Manager reassign a lead to another manager, or is that Admin-only? — **implemented as Admin-only.**
5. **[DECIDE]** Backup cadence/retention.
6. **[DESIGN ONLY]** BD → Mining/Extension conversion reminder (§8.2) — timing rule (e.g. "N months after `target_date`") and reminder CTA copy not yet decided.
7. **[FUTURE]** Resource allocation, finance tracker, feedback management systems (§1.4) — no schema yet, flagged here so it isn't forgotten.

---

## 20. Build order (roadmap) — **as originally planned**
1. Django project + models (§14) + migrations + admin; JWT auth (§17).
2. Users/roles/belts + DRF permission classes (role scoping).
3. Company + Lead CRUD API + React list/detail/create screens.
4. Lead-type / task-step / checklist-item **template** config (Admin) — §7.
5. Checklist execution UI + required-file uploads (§10).
6. Assignment flow + **in-app notifications** (§9).
7. Additional tasks + dashboard (§12/§13).
8. Reports, import/export, polish, permission hardening (later phase, §12.2).

> **Actual order taken diverged from this** — see §21.1. The React frontend was built first against a mocked API layer instead of a live Django backend, so the backend (steps 1–2 and the real persistence behind the rest) is still outstanding.

---

## 21. Implementation status & changelog

This section tracks what has actually been built, so the rest of the spec can stay the intended target design without getting stale.

### 21.1 Frontend-first build, mocked backend
The React frontend (`frontend/`) was built first against a **mocked API layer** so the UI/UX could be validated before committing to backend implementation details:
- `frontend/src/mocks/` — an in-memory "database" seeded from `seed.js`, persisted to `localStorage` (versioned key, currently `lms-mock-db-v3`; bump the version whenever the seed shape changes) with simulated network latency.
- `frontend/src/api/*.js` — one module per resource (leads, companies, checklist, followups, notifications, activities, attachments, lead-types, auth) exposing the same function shapes the real DRF endpoints (§15) will need. Swapping mock calls for real `axios` calls later should not require touching hooks or components.
- `frontend/src/hooks/*.js` — React Query hooks wrapping the api layer (caching, invalidation, mutations).
- Role scoping (§2.1) is reimplemented client-side in `frontend/src/api/scope.js`; this moves into DRF permission classes/querysets once the backend exists (§15).

**Not started:** the actual Django + DRF backend (§14, §15, §17's backend bullets), so §19 item 3 (Postgres/JWT/file storage) remains open — there's nothing to configure yet.

### 21.2 Removed "Opportunity name" *(superseded by §21.7 — kept for history)*
Leads no longer carry a standalone name field; identified by Company + Lead ID instead.

### 21.3 Inline project creation on the New Lead form *(superseded by §21.7 — kept for history)*
An earlier iteration added an optional "Project" section to the New Lead form. Phase 1 went further and removed the concept of a separate Project entirely — see §21.7.

### 21.4 Seeded with one lead type, not three *(superseded by §21.8 — kept for history)*
Originally seeded with a single demo type ("New Business"). Replaced with the 3 real types — see §21.8.

### 21.5 Screens built *(superseded by §21.9 — kept for history)*
The original screen set (Kanban, Companies, standalone Follow-ups, Reports, Settings) was trimmed for phase 1 — see §21.9.

### 21.6 Dev-only affordance not in the spec
A "role switcher" dropdown in the top bar lets you jump between the seeded Admin/Manager/Representative accounts without a password, to exercise role scoping before real auth exists. This is explicitly dev-only and should be removed once real login (§17 auth) is wired up.

### 21.7 Phase 1 rework: Lead absorbs Project (§3, §5, §6, §8, §14)
Per updated requirements, phase 1 collapsed Lead and Project into a single entity — a lead now always carries exactly one execution track (assigned rep, dates, task/checklist) instead of spinning off a separate, optionally-multiple Project record. Consequences:
- Old §6 (Project entity) removed; its fields merged into §5.
- The old two-track status model (sales pipeline New→Contacted→…→Closed Won/Lost, plus a separate execution-only Project status) replaced by one 4-value field on the Lead: **In Progress / On Hold / Dropped / Completed**.
- **ACV, MRR, Probability%, Expected close date, Lost reason, Won notes** all dropped — they depended on the removed pipeline/forecasting model.
- Data model tables renamed/merged: `projects` → merged into `leads`; `project_tasks` → `lead_tasks`; `project_checklist_items` → `lead_checklist_items`; `project_custom_values` → `lead_custom_values`; `followups` → `additional_tasks` (its `project_id` column dropped).
- Lead detail screen restructured: a top overview card (progress, assigned rep, owner, timeline) replaces the old header stat-cards, and the tab list collapsed from 5 (Overview / Projects / Activity / Contacts / Files) to 3 (**Lead**, **Task**, **Additional Tasks**) — Contacts tab dropped, Activity + Files folded into the Lead tab, and the former Project-detail checklist workspace became the Task tab.
- Follow-ups renamed **Additional Tasks** and moved from a standalone screen into the lead's own tab — scoped per-lead now, no cross-lead follow-up list.

### 21.8 Real lead types: BD, Mining, Extension (§7)
Replaced the single seeded demo lead type with the 3 real ones. **BD** reuses the old "New Business" worked example's 4-step workflow (closest conceptual match). **Mining** and **Extension** are seeded with placeholder single-step templates — supply their real workflows and they drop into `frontend/src/mocks/seed.js` with no code changes.

### 21.9 Navigation reduced to phase 1 scope (§12.2, §13)
Sidebar trimmed to **Dashboard / Leads / Notifications**. The Kanban, Companies, Follow-ups, Reports, and Settings *pages* were deleted outright (not just hidden) since they actively conflicted with the merged lead model; the underlying Companies and Additional-Tasks functionality still exist, just accessed from within a lead rather than as their own nav destinations. `@dnd-kit/*` and `recharts` were removed from `package.json` since nothing uses them anymore.

### 21.10 Designed-for-later: BD → Mining/Extension conversion reminder (§8.2)
Not built. The data needed (`status`, `lead_type_id`, `target_date`) is already in place so this can be added later as a notification-generation job without further schema changes.

### 21.11 Branding and sidebar UX (§17)
Replaced the placeholder logo with the real Vector Consulting Group wordmark/arrow mark (`Logo.jsx`); the sidebar can now collapse to an icon-only rail with hover tooltips (state persisted in `localStorage`).

---
*End of draft v0.4. Supply the real Mining/Extension workflows (§7.4) and answer the remaining §19 items to close out phase 1 of the spec; see §21 for current build status.*
