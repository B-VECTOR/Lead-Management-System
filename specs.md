# Lead Management System — Product Specification

> **Status:** Draft v0.2 (reworked)
> **Product type:** Internal web app for a **B2B SaaS product company** selling to large client companies.
> **Purpose:** Single source of truth describing every part of the system, structured so each section can be handed to Claude in VSCode as a build prompt.

---

## 0. How to read this document

- **[ASSUMPTION]** — I invented it; change freely.
- **[DECIDE]** — still open; answer before building.
- **[PLACEHOLDER]** — real content you must supply (the 3 lead types).
- **[DEMO]** — illustrative sample data/content to be replaced.

**Reader context (confirmed):** The company sells a **web SaaS product** to other (often large) companies. A **Lead** is a *sales opportunity with a client company*. One lead can spin off **multiple Projects** (e.g. a pilot, then a full rollout). The app is used **internally** by senior staff. Tool: **React (frontend) + Django (backend)**, **mobile-responsive**, **in-app notifications** (email later).

---

## 1. Overview & objectives

### 1.1 Goal
An internal system where senior staff capture every sales opportunity (Lead) with a client company, break it into Projects, drive each Project through a **type-specific checklist workflow**, assign work to representatives, get in-app notifications, log all activity, and see pipeline health on a dashboard.

### 1.2 Success criteria (v1)
- Every lead + its projects live in one place with structured records.
- Each project runs the correct **type-specific task/step + checklist workflow**.
- Managers assign projects/tasks to representatives; reps see only what's theirs.
- In-app notifications surface assignments, required actions, and due follow-ups.
- A dashboard shows pipeline value, counts by stage, and overdue items.

### 1.3 Non-goals (v1)
- Email/marketing automation (in-app notifications only for now; email later).
- Post-sale billing/invoicing or the actual product's functionality.
- Native mobile apps (responsive web instead).

---

## 2. Users, roles, belts & permissions

The company uses an internal **belt hierarchy** (low → high): **White → Brown → Red → Black**. Only the top belts (**Red, Black**) use this app. `belt` is stored as a **display attribute** on each user; functional access is governed by the three **roles** below.

| Role | Typical belt | Responsibility |
|---|---|---|
| **Admin** | Black | Top of hierarchy; owns the system and config |
| **Manager** | Red/Black | Owns leads; responsible for the projects; leads a team of reps |
| **Representative** (consultant) | Red | Executes assigned work — updates checklists, uploads files, completes tasks |

Reps belong to a manager (`manager_id`). Managers own leads. Reps receive **projects/tasks** assigned by their manager.

### 2.1 Permissions matrix (confirmed)

| Action | Admin | Manager | Representative |
|---|:--:|:--:|:--:|
| See dashboard | ✅ global | ✅ own leads | ✅ own tasks |
| Create lead / company | ✅ | ✅ | ❌ |
| View leads | **all** | **own only** | **only leads with tasks assigned to them** |
| Edit lead details | any | own | ❌ |
| Reassign lead owner (manager) | ✅ | ❌ | ❌ |
| Create project under a lead | ✅ | ✅ (own) | ❌ |
| Create / assign tasks to reps | ✅ | ✅ (own) | ❌ |
| Add / configure checklist items on own leads | ✅ | ✅ | ❌ |
| Update checklist items / upload required files | ✅ | ✅ | ✅ (assigned) |
| Delete / archive lead | ✅ | ❌ | ❌ |
| Configure lead types & checklist **templates** (global) | ✅ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ |
| View reports | all | own leads only | own only |

**Priority defaults to Low** when unset (any role that can create a lead).

---

## 3. Domain model & glossary

Core hierarchy:
```
Company (client account)
  └── Lead (a sales opportunity; carries the LEAD TYPE)
        └── Project(s)               ← one lead → many projects
              └── Task / Step        ← instantiated from the lead type's template
                    └── Checklist item(s)   ← each can require a File + fire a Notification
```

| Term | Meaning |
|---|---|
| **Company / Account** | The client organization. Has many leads over time, many contacts. |
| **Lead** | A sales opportunity with a company. Fixed **lead type**. Owned by a Manager. |
| **Project** | A concrete piece of work under a lead (pilot, rollout, module). Assigned to a Rep. **This is where checklists run.** |
| **Lead type** | One of **3** kinds (client-defined). Determines the **task/steps + checklist template** a project uses. |
| **Task / Step** | A named phase within a lead type's workflow (e.g. "Discovery"). Contains checklist items. |
| **Checklist item** | A single tickable action inside a task/step. May **require a file** and/or **fire a notification**. |
| **Custom field** | An extra, type-specific field beyond the default lead/project fields. |
| **Follow-up / Action item** | An ad-hoc task a manager creates and assigns to a rep, separate from the template. |
| **Activity** | Timestamped log entry (call, note, status change, checklist update). |
| **Notification** | In-app alert to a user (assignment, action needed, due date). |

> **Type vs. Status:** *Lead type* = which of the 3 kinds it is (fixed, drives the workflow). *Status* = where the lead/project sits in the pipeline (changes over time). Independent axes.

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

---

## 5. Entity — Lead (sales opportunity)

### 5.1 Identity & classification
| Field | Type | Notes |
|---|---|---|
| Lead ID ✱ | auto (`LD-2026-0042`) | immutable |
| Company ✱ | company ref | |
| Opportunity name ✱ | text | short name for the deal |
| Lead type ✱ | enum (1 of 3) | drives project workflows — see §7 |
| Industry ✱ | enum | (mirrors/overrides company) |
| Domain | text/enum | |
| Product modules / editions in scope | multi-select | *reinterpreted "division scope"* — which parts of the SaaS product; **[DECIDE]** confirm the module list |

### 5.2 Ownership & status
| Field | Type | Notes |
|---|---|---|
| Status ✱ | enum | see §8 pipeline |
| Owner (Manager) ✱ | user ref | defaults to creator if manager |
| Priority | enum | Low (default) / Medium / High / Urgent |
| Source detail | text | e.g. "inbound", "referral by X" |
| Tags | multi-tag | |

### 5.3 Commercials (SaaS-oriented — reworked from services)
| Field | Type | Notes |
|---|---|---|
| Plan / edition | enum | e.g. Starter / Pro / Enterprise **[DECIDE]** your tiers |
| Seats / licenses | number | |
| Billing cycle | enum | Monthly / Annual |
| ACV (annual contract value) | currency | |
| MRR | currency (derived) | |
| Contract length | number (months) | |
| Currency | enum | |
| Expected close date | date | forecasting |
| Renewal date | date | for expansion/renewal tracking |
| Probability % | number / derived from stage | |

### 5.4 Contacts (people at the company)
`id, company_id, name, title, email, phone, decision_role (Decision maker / Influencer / Technical / Procurement / User), is_primary, notes`

### 5.5 Lifecycle & free text
| Field | Type | Notes |
|---|---|---|
| Description / requirement summary | long text | |
| Internal notes | long text | not client-facing |
| Lost reason | enum | if Closed Lost: Budget / Timing / Competitor / No response / Not a fit / Other |
| Won notes | text | if Closed Won |
| Created by / at, Last activity at, Next follow-up | auto/date | |
| Attachments | list | documents at **lead** level — see §10 |

---

## 6. Entity — Project (where checklists run)

One lead → many projects. When a project is created, it **instantiates a working copy** of the task/steps + checklist items from the **lead's type template** (§7). Reps work these.

| Field | Type | Notes |
|---|---|---|
| id | auto | |
| Lead ✱ | lead ref | inherits the lead type |
| Project name ✱ | text | e.g. "Pilot rollout — HR dept" |
| Description | long text | |
| Status | enum | see §8.2 project status |
| Assigned to ✱ | user ref (Representative) | the rep who executes |
| Start date / Target date | date | |
| Custom field values | per §7 type custom fields | |
| Task/steps + checklists | instantiated from template | see §7 & §9 |
| Attachments | list | documents at **project** level — see §10 |
| Created by / at | auto | |

---

## 7. Lead types → task/steps → checklist items (+ custom fields)

This is the configurable core. **Admins** define the templates globally; **managers** may add/adjust checklist items on their own leads' projects.

### 7.1 Structure
```
Lead Type (1 of 3)
  ├── Custom fields         (extra fields beyond defaults, specific to this type)
  └── Task / Step (ordered, named)
        └── Checklist item (ordered)
              ├── requires_file?   (bool — rep must upload a document to complete)
              └── notify?          (bool — fires an in-app notification to the assignee)
```
When a **project** is created under a lead of this type, the template above is **copied** into that project as an editable working instance (`project_tasks` + `project_checklist_items`). Editing the template later does **not** retroactively change existing projects.

### 7.2 The 3 lead types — **[PLACEHOLDER]**
> Supply the real names + task/steps and I'll wire them in exactly. Fill this table:

| # | Lead type name | Task/steps (in order) | Notes |
|---|---|---|---|
| 1 | _[your type 1]_ | _[step, step, …]_ | |
| 2 | _[your type 2]_ | _[step, step, …]_ | |
| 3 | _[your type 3]_ | _[step, step, …]_ | |

### 7.3 Worked example — **[DEMO]** to show the shape
> Replace entirely; this only demonstrates how a type expands into steps → checklist items → files/notifications.

**Demo Lead Type A — "New Business"**
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

---

## 8. Pipeline / status

### 8.1 Lead status (sales pipeline)
**[ASSUMPTION]** SaaS-product-oriented; adjust names/order.
```
New → Contacted → Qualified → Demo/Evaluation → Proposal → Negotiation → Closed Won
                                                                        ↘ Closed Lost
                                          (any active) ↘ On Hold
```
Rules: Closed Lost requires a *Lost reason*; Closed Won prompts *Won notes*; every status change is auto-logged; backward moves allowed but logged.

### 8.2 Project status (execution)
`Not started → In progress → Blocked → Completed → Cancelled`. Derived signal: a project's checklist completion % feeds a progress ring on cards.

---

## 9. Tasks, assignments & notifications

### 9.1 Assignment flow
1. Manager creates a **Lead**, sets type, adds **Project(s)**.
2. Creating a project instantiates its task/steps + checklist from the type template.
3. Manager **assigns the project (and/or specific tasks)** to a **Representative**, and may add extra checklist items or ad-hoc **follow-ups**.
4. Rep sees only their assigned leads/projects/tasks, works the checklist, uploads any **required files**, marks items done (or N/A).
5. Completing items / tasks updates progress and logs activity.

### 9.2 In-app notifications (v1) — email later
A `notifications` record + bell icon with unread count. Triggers:
- Project/task assigned to a rep.
- Checklist item flagged `notify` becomes actionable / due.
- Follow-up due date reached / overdue.
- Lead assigned to a manager.
- (Optional) status change on a lead you own/are assigned to.

Each notification has `type, message, link (to the item), read (bool), created_at`. **Architecture note:** keep a channel abstraction so an **email channel** can be added later without reworking triggers.

### 9.3 Ad-hoc follow-ups / action items
`id, lead_id?, project_id?, title, due_date, assigned_to, done, reminder_at`. Distinct from template task/steps; created by managers, surfaced to reps + on dashboard.

---

## 10. Documents / attachments

Uploads attach at **three levels**: **Lead**, **Project**, and **Checklist item** (when `requires_file`). 
`attachments (id, entity_type[lead|project|checklist_item], entity_id, filename, url/file, uploaded_by, uploaded_at)`
**[DECIDE]** storage backend: local disk (Django `MEDIA_ROOT`) for dev vs. cloud (S3) for prod. Restrict file types & size; scan filenames.

---

## 11. Activity timeline
`activities (id, lead_id, project_id?, type[Call|Email|Meeting|Note|StatusChange|ChecklistUpdate|Assignment], summary, body, created_by, created_at)`. Auto-entries for status/checklist/assignment changes; manual for calls/notes. Shown newest-first on lead & project detail pages.

---

## 12. Functional requirements

### 12.1 Must-have (v1)
1. Auth + role-based access (Admin/Manager/Rep) with belt attribute.
2. Company CRUD; Lead CRUD (archive = soft delete, Admin only).
3. Project CRUD under a lead; auto-instantiate checklist from type template.
4. Lead-type + checklist **template** config (Admin); per-lead checklist edits (Manager).
5. Assign projects/tasks to reps; rep-scoped visibility.
6. Checklist execution: tick items, mark N/A, upload required files.
7. In-app notifications (bell + unread count).
8. Ad-hoc follow-ups with due dates.
9. List view (filter/search/sort) + Kanban board (drag between lead statuses).
10. Lead detail (Overview · Projects · Activity · Contacts · Files) + Project detail (Checklist · Files · Activity).
11. Dashboard: pipeline value by stage, counts by stage/type, overdue follow-ups, my tasks.
12. Documents at lead/project/checklist-item level.

### 12.2 Should-have
- CSV/Excel import & export (to migrate real leads).
- Duplicate detection (company + similar opportunity).
- Audit log (who changed what).
- Reports: win rate, value by stage/owner/type, time-in-stage, rep workload.

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
| Dashboard | Health + "my tasks" | role-scoped |
| Leads — List | Browse/manage | filters, search, New lead |
| Leads — Kanban | Visual sales pipeline | drag between statuses |
| Lead — Detail | One opportunity | tabs incl. **Projects** list |
| Lead — Create/Edit | Grouped form (§5) | type selector |
| Project — Detail | Checklist workspace | steps → items, file upload, progress ring |
| Companies | Account view | per-company lead history |
| Notifications | Bell dropdown + full page | mark read |
| Reports | Analytics | role-scoped |
| Settings (Admin) | Users, lead types, checklist templates, dropdowns | |

**UX:** mobile-responsive; rep view is a focused "my assigned work" list; card shows company · opportunity · value · status · owner · next follow-up; progress ring for checklist %.

---

## 14. Data model (relational)

```
users(id, name, email, role[Admin|Manager|Representative], belt[white|brown|red|black],
      manager_id→users, password_hash, active, created_at)

companies(id, name, industry, domain, website, size, location, created_by→users, created_at)
contacts(id, company_id→companies, name, title, email, phone, decision_role, is_primary, notes)

leads(id, company_id→companies, opportunity_name, lead_type_id→lead_types, industry, domain,
      product_modules[], status, priority default 'Low', owner_id→users, source_detail, tags[],
      plan, seats, billing_cycle, acv, mrr, contract_length, currency, expected_close_date,
      renewal_date, probability, description, internal_notes, lost_reason, won_notes,
      created_by→users, created_at, last_activity_at, next_follow_up, archived bool)

projects(id, lead_id→leads, name, description, status, assigned_to→users,
         start_date, target_date, created_by→users, created_at)

-- Templates (Admin-configured)
lead_types(id, name, description, active)
task_steps(id, lead_type_id→lead_types, name, order, description)
checklist_template_items(id, task_step_id→task_steps, label, order, requires_file bool, notify bool)
lead_type_custom_fields(id, lead_type_id→lead_types, field_name, field_type, required, options[])

-- Working instances (per project)
project_tasks(id, project_id→projects, source_task_step_id→task_steps, name, order, status, assigned_to→users)
project_checklist_items(id, project_task_id→project_tasks, label, order, state[open|done|na],
                        requires_file bool, notify bool, done_by→users, done_at)
project_custom_values(id, project_id→projects, custom_field_id→lead_type_custom_fields, value)

-- Cross-cutting
attachments(id, entity_type[lead|project|checklist_item], entity_id, filename, file, uploaded_by→users, uploaded_at)
activities(id, lead_id→leads, project_id→projects nullable, type, summary, body, created_by→users, created_at)
followups(id, lead_id nullable, project_id nullable, title, due_date, assigned_to→users, done bool, reminder_at)
notifications(id, user_id→users, type, message, link, read bool, created_at)
```

---

## 15. API surface (Django REST Framework sketch)

```
POST   /api/auth/login            (JWT: access + refresh)
POST   /api/auth/refresh

GET    /api/companies      POST /api/companies      GET/PATCH /api/companies/:id
GET    /api/contacts       POST /api/contacts

GET    /api/leads          ?status=&type=&owner=&q=&page=       (queryset scoped by role)
POST   /api/leads
GET/PATCH/DELETE /api/leads/:id
PATCH  /api/leads/:id/status      {status, lost_reason?}
PATCH  /api/leads/:id/assign      {owner_id}                    (Admin)

GET    /api/leads/:id/projects    POST /api/leads/:id/projects  (instantiates template)
GET/PATCH /api/projects/:id
PATCH  /api/projects/:id/assign   {assigned_to}
GET    /api/projects/:id/tasks
GET    /api/projects/:id/checklist
PATCH  /api/checklist-items/:id   {state, ...}                  (upload handled separately)

POST   /api/attachments           (multipart: entity_type, entity_id, file)
GET    /api/leads/:id/activities   POST /api/leads/:id/activities
GET    /api/followups   POST /api/followups   PATCH /api/followups/:id
GET    /api/notifications   PATCH /api/notifications/:id/read

-- Admin config
GET/POST/PATCH /api/lead-types
GET/POST/PATCH /api/lead-types/:id/task-steps
GET/POST/PATCH /api/task-steps/:id/checklist-items

GET    /api/dashboard/summary
GET    /api/reports/pipeline
POST   /api/import/leads   GET /api/export/leads
```
**Role scoping** is enforced server-side in each queryset/permission class (reps → only their assigned leads/projects; managers → own; admin → all).

---

## 16. Non-functional
- **Security:** hashed passwords, server-side role checks (DRF permissions), input validation, JWT with refresh, file-type/size limits.
- **Performance:** list views < 1s up to ~10k leads; paginate.
- **Auditability:** all mutations logged (activities + audit log).
- **Responsive:** mobile-first for the rep "my work" views.
- **Backups:** **[DECIDE]** cadence/retention.

---

## 17. Tech stack (confirmed direction)

- **Frontend:** **React (JS)** + Vite, React Router, a component lib (MUI or shadcn-style), Axios/React Query for API, mobile-responsive layout.
- **Backend:** **Django + Django REST Framework**.
- **Auth:** DRF **SimpleJWT** (access + refresh tokens). **[DECIDE]** confirm JWT vs. session auth.
- **Database:** **PostgreSQL** (prod), **SQLite** (local dev) — **[DECIDE]** confirm Postgres.
- **File storage:** Django media (local) in dev → S3-compatible in prod. **[DECIDE]**.
- **Notifications:** in-app now; keep a channel abstraction so **email** (Django email backend) drops in later.

### Why this maps cleanly to AI prompting
§14 → "generate the Django models + migrations." §15 → "build these DRF viewsets/serializers/permissions." §13 → build each React screen. §7 → the template-instantiation logic. Tackle in the build order below.

---

## 18. Demo data — **[DEMO]**, replace with real leads

| Lead ID | Company | Opportunity | Industry | Type | Status | Plan | Seats | ACV | Owner (Mgr) |
|---|---|---|---|---|---|---|--:|--:|---|
| LD-2026-0001 | TechNova Retail | Store Analytics rollout | Retail | _Type 1_ | Qualified | Pro | 120 | $84k | Priya (Red) |
| LD-2026-0002 | MediCare Systems | Compliance suite | Healthcare | _Type 2_ | Proposal | Enterprise | 400 | $220k | Arjun (Black) |
| LD-2026-0003 | FinEdge Capital | Payments dashboard | Finance | _Type 1_ | Demo/Eval | Pro | 60 | $60k | Priya (Red) |
| LD-2026-0004 | LogiTrack Freight | Ops portal expansion | Logistics | _Type 3_ | Negotiation | Enterprise | 250 | $150k | Arjun (Black) |

(Types shown generically until you provide the real 3.)

---

## 19. Open questions before/while building
1. **[PLACEHOLDER]** The **3 real lead types** + their task/steps (§7.2) — the one big content gap.
2. **[DECIDE]** Product **modules/editions** list (for "in scope") and **plan tiers**.
3. **[DECIDE]** Confirm **PostgreSQL** + **JWT** auth + **file storage** backend.
4. **[DECIDE]** Can a Manager reassign a lead to another manager, or is that Admin-only? (assumed Admin-only)
5. **[DECIDE]** Backup cadence/retention.

---

## 20. Build order (roadmap)
1. Django project + models (§14) + migrations + admin; JWT auth (§17).
2. Users/roles/belts + DRF permission classes (role scoping).
3. Company + Lead CRUD API + React list/detail/create screens.
4. Lead-type / task-step / checklist-item **template** config (Admin) — §7.
5. Project CRUD + **template instantiation** into project_tasks/checklist_items.
6. Checklist execution UI + required-file uploads (§10).
7. Assignment flow + **in-app notifications** (§9).
8. Kanban + lead status workflow (§8).
9. Ad-hoc follow-ups + dashboard (§12/§13).
10. Import/export, reports, polish, permission hardening.

---
*End of draft v0.2. Supply the 3 real lead types (§7.2) and answer §19, and this becomes the build bible.*
