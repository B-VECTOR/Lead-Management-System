# Lead Management System (LMS) — Technical Requirements Document

**Version:** 17.0
**Status:** Draft for build
**Related document:** `LMS_PRD_updated.md` (business-facing PRD)
**Source of truth for the workflow:** `lms_updated_wf.csv` (the "BD Extension Mining Workflow" sheet)

---

## Changelog v17.0 — rebuild against the updated workflow sheet

This is a structural rework, not an increment. The major changes:

- **28-task workflow** (was 17). A single **BD → Extension → Mining** flow. **Mining and Extension are in scope.**
- **Stage is now a first-class, tracked entity** (`lead_stage`). Every task belongs to a stage (BD / 2HR / SnT / Implementation / Extension / Mining / Closure). **A lead can have two stages open at once** — Mining and Extension run in **parallel**.
- **New lead fields:** `flow_of_tasks` (which stages run) and `type_of_project` (label only). `lead_type` is now **BD / Extension / Mining**.
- ~~**`country` is removed** from the lead and from Project ID generation.~~ **Superseded 2026-07-28:** `country` is **back on the lead** and is the Project ID's leading segment (§13). **`domain` is now multi-select** (M2M into `areas`) — *note: built single-select per decision D2.*
- **Project ID redesigned:** generated at **lead creation** as a stable base, with the **current stage as a derived display suffix** (`-BD`, `-2HR`, `-SnT`, `-IM`, `-E1/-E2…`, `-M`). ~~Base `{AreaCode}{YY}{Seq}`, no country/industry code.~~ **Composition finalized by the user 2026-07-28:** `{CountryCode}-{IndustryCode}{AreaCode}{TypeCode}{YY}{Seq}` — e.g. `IN-PHNPDCFF26001` — i.e. Country Code, Industry, Area, Type of Project, Year, auto-generated number, stage of intervention (§13).
- **Finance (Abhay) is a live role** with three payment-approval gate tasks (7, 15, 28). A "No" at a gate **re-opens the preceding task** — a closed task can be re-opened, and task history retains every close→re-open→close cycle.
- **Resource allocation redesigned as append-only history** — one row per resource per slot, with allocate/release dates and reassignment linkage, to power the resource dashboard (who worked which slot, for how long, including reassignments). Auditor allocation is **split into its own tasks** (18, 25); Task 18 is a **hanging (non-blocking) task**.
- **Conditional 2HR allocation:** Task 3 opens only if Task 2's "manpower support required?" = Yes; otherwise the Default BD Person carries the study.
- **Lead status simplified** to `In Progress / Hold / Dropped / Completed`. **`Hybernation` and `Short Closed` are removed.** Short-close remains as an action that routes to closure and ends as `Completed`.
- **Completion is Finance-gated:** the lead becomes `Completed` only when **both** Task 27 and Task 28 close.
- **Automatic drop** from Task 8 ("Go-ahead = No") — Tasks 6 & 7 remain open on such a drop.
- **Added 2026-08-05 (post-v17.0):** the **Lead Trail** — a lead-level, append-only comment thread (`lead_comment`, §4.10a). Everyone who can see a lead may add to it and read it, so context survives the handovers between BD, resourcing, delivery and the Lead Admin. Shown beneath Scope on Lead Detail, with an input below Scope on the lead form. Per the user.
- **Changed 2026-08-05 (post-v17.0):** the **over/under-allocation indicators of §4.7 are now actually built** — over-allocation (red) had never been implemented on any screen and under-allocation only partially. See the note in §4.7.
- **Changed 2026-08-05 (post-v17.0):** the **Resources queue (`/resources`) is a flat work-in-place table**, not a list of expandable rows — a column per role (Execution Red / Brown / White(s) / Auditors) whose cells are the people-pickers, so who is on a step and changing who is on it happen without opening anything. Per the user: the people working this screen are 40+/50+ and asked for Project Closure's table shape. **Presentation only** — no endpoint, payload, permission or workflow change; the lead-side task stepper keeps the form layout. See §7 step 2 and §9.1.
- **Changed 2026-08-05 (post-v17.0):** **task reassignment belongs to the lead's custodians, not to whoever currently holds the task** — the LM who created the lead, its current owner, or a Lead Admin, for the lead's whole life. Being handed a task no longer carries the right to hand it on (it did, because `can_reassign_task` aliased `can_edit_task`). **Task-level hold** stays with the assignee — the Execution Red explicitly included — and *additionally* extends to those custodians, so the creator/owner can pause work they delegated. Per the user. See §6 "Task reassignment".
- **Added 2026-08-04 (post-v17.0):** a **pre-flow step, Task 0 "Select Flow of Tasks"** — the one task outside the 1–28 table. A Mining lead spawned by a Task-21 go-ahead is created with **no `flow_of_tasks`** (it no longer inherits the parent's) and opens Task 0 instead; answering it writes the flow onto the lead and *then* opens that flow's real entry task. Rationale, per the user: the mining project begins months after the go-ahead, so nobody can name its path at conversion time. See §4.3.4, §5 (Task 0). Also adds a **`choice`** extra-field type (§4.6) — a workflow-supplied option list, validated server-side.

### Retained from prior versions
Global validation rules (§3), audit columns on every table (§4.0), Django-Groups role storage, reference tables with `active/inactive` status, hold/unhold with optional remarks and the Hold Items menu, the Leads Tracker column and header filters, follow-ups open to anyone who can view a lead, and the configurable date-offset trigger job. These are unchanged except where the new stage/task model touches them.

### Deferred / out of scope (confirmed)
- **Email notifications** (e.g. "trigger mail to accounts" on Tasks 5/10 close) — captured as workflow notes; **no email integration in this phase**.
- **Sutradhar** ("add project on Sutradhar" on Tasks 17/18) — external system; **no integration now**, possible future.

---

## 1. Tech Stack

| Layer | Technology |
|---|---|
| Backend | Django + Django REST Framework (DRF) |
| Auth | DRF SimpleJWT (access + refresh tokens) |
| Frontend | React JS |
| Styling | Tailwind CSS + shadcn/ui |
| Data fetching | React Query + Axios |
| Database | PostgreSQL |
| Admin | Django Default Admin Panel (User & Role management, Workflow configuration, Task-trigger configuration) |
| Layout | Mobile-responsive throughout |

---

## 2. Roles

1. User Management
2. Lead Admin
3. Lead Manager
4. Marketing
5. **Resource Manager** — the allocation role. "Shailesh" in the source sheet = this role.
6. **Finance** — the accounts/approval role. "Accounts (Abhay)" in the source sheet = this role. **Active in this phase** (owns Tasks 7, 15, 28).
7. Employee (default — applies to all users in addition to their specific role)

Roles are stored as **Django auth Groups** (one group per role); there is no role column on the user table. A user can hold multiple roles; permission checks are any-match and data scopes are the union of the user's roles.

---

## 3. Global Field Validation Rules

- **Numeric fields:** `0` is valid; negatives are **not allowed**. Enforce at serializer and DB level (`MinValueValidator(0)`).
- **Date fields:** past dates are **not allowed** — must be today or later (compare against `timezone.now().date()`), server-side. Exception: `users.date_of_joining` (historical, past dates allowed).
- **Mobile/phone fields:** exactly 10 digits, numeric only. `CharField(max_length=10)` with `^\d{10}$` validator at serializer and model level.

---

## 4. Data Model (Core Entities)

The schema below follows the structure you specified. The load-bearing principle: **join on numeric primary keys, never on the Project ID string** — the Project ID's stage suffix is a derived display value and is not stable.

> **Physical table names (decision 2026-07-27):** the five core tables use the clean raw names in these headings — `lead`, `lead_stage`, `task_details`, `project_details`, `resource_table` (set via each model's `Meta.db_table`). The remaining supporting tables keep Django's default `leads_*` prefix (e.g. `leads_checklist`, `leads_followup`, `leads_workflow`).

### 4.0 Audit columns (every table)

| Field | Type | Notes |
|---|---|---|
| created_by | FK → users, nullable | set on insert (nullable for system/trigger-job inserts) |
| created_on | timestamp | set automatically on insert |
| updated_by | FK → users, nullable | filled on update |
| updated_on | timestamp, nullable | filled on every update; NULL until first update |

### 4.1 `users` (Django auth-extended)

| Field | Type | Notes |
|---|---|---|
| username | string | |
| password | hashed | |
| name | text | |
| employee_id | number | ≥ 0, **unique** (friendly duplicate message) |
| email | text | |
| mobile_no | string | exactly 10 digits (§3) |
| acting_belt_level | FK → `belts` | §4.2 |
| belt | FK → `belts` | §4.2, independent value, same table |
| domain | FK → `areas` | user's competency Domain — same `areas` table as the lead's Domain |
| date_of_joining | date | exempt from the no-past-dates rule |

Roles via Django Groups (§2); multi-role supported. CRUD owned by **User Management** via Django Admin.

### 4.2 Reference Tables — `industries`, `areas`, `belts`

> ~~**`countries` is removed** — Country is no longer captured on the lead and no longer feeds the Project ID.~~ **Superseded 2026-07-28:** `countries` is live again — Country is captured on the lead and its `code` leads the Project ID (§13). Same shape as Industry/Area below.

**Industry and Area** share the same shape (`code` feeds the Project ID base, §13):

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| name | text, unique | display value in the lead-form dropdown |
| code | text, unique | short code used when building the Project ID (§13) |
| status | dropdown (`active`/`inactive`) | default `active`; only active rows appear in dropdowns |

- `industries` — seeded with the 16 rows in §13.2.
- `areas` — seeded with the 11 rows in §13.3 (labeled "Domain" on the lead & user forms, "Area" in the sheet — one table). Backs the lead's **multi-select** Domain and the user's single Domain.

**Belt** (no code):

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| name | text, unique | |
| order | integer | dropdown sort (`ORDER BY order, name`) |
| status | dropdown (`active`/`inactive`) | default `active` |

Seed (order 1–9): Potential Black, Black, White, Brown, Red, Potential Brown, Potential White, Potential Red, NA. Backs both `users.acting_belt_level` and `users.belt`.

All reference tables are managed from the Django admin panel.

### 4.3 `lead`

One row per **project cycle**: the original lead, plus a **new row for each Mining-spawned cycle** (same project, linked via `parent_lead_id`). This is the top-level entity of the schema you specified.

| Field | Type | Required | Notes |
|---|---|---|---|
| id | auto (PK) | Auto | numeric key used by all FKs |
| base_code | text | Auto | stable project base, `{CountryCode}-{IndustryCode}{AreaCode}{TypeCode}{YY}{Seq}` e.g. `IN-PHNPDCFF26001` — generated at creation, never changes (§13), even if the lead's country/industry/domain/type is later edited. Shared across a project's parent + Mining child rows (so **not** DB-unique). |
| project_id | text | Auto | **stable** lead-level ID stored at creation = `base_code` (+ `-M` for a Mining lead), **no stage suffix** so it stays constant for the lead's life (`IN-PHNPDCFF26001`, `IN-PHNPDCFF26002-M`) — decision 2026-07-27. The stage-suffixed variants live per-row on `lead_stage`/`task_details`. |
| parent_lead_id | FK → `lead`, nullable | Auto | set on a Mining-spawned lead, pointing at the parent it originated from (Task 21) |
| company_name | text | Yes | |
| project_name | text | Yes | |
| country | FK → `countries` | Yes | §4.2. Re-added 2026-07-28 (reverses the v17.0 removal): its `code` is the Project ID's leading segment (§13). |
| industry | FK → `industries` | Yes | §4.2. Its `code` is a Project ID segment (§13). |
| domain | **M2M → `areas`** | Yes | **multi-select.** The **primary (first-selected)** area supplies the Project ID's Area code (§13). *(Assumption flagged: primary-domain rule for the code.)* *(Built single-select per decision D2, so the single domain supplies the code.)* |
| division | text | No | |
| scope | text | No | |
| assigned_to | FK → users, nullable | Yes for Lead-Manager-created; NULL for Marketing-created | "Default BD Person" throughout the workflow = this field. No "Not Assigned" value is stored; NULL means unassigned. |
| lead_type | dropdown (`BD`/`Extension`/`Mining`) | Yes | macro entry point (§4.3.4) |
| flow_of_tasks | dropdown (4 options) | Yes — **except a Task-21-spawned Mining lead** | which stages run (§4.3.4). Applies to BD/Mining; ignored for Extension. **Blank 2026-08-04:** a Mining lead spawned off Task 21 is created with this **empty** — the API still requires it on every manually-created BD/Mining lead, so "blank" reliably means "spawned, flow not yet decided" and routes the lead to the pre-flow selection task (Task 0). The lead edit form hides the field while that is pending, so an unrelated edit cannot write a flow behind the task's back. |
| type_of_project | dropdown (6 options) | Yes | reporting/filter label — does not affect the task path — **and** a Project ID segment via its code (§13.4). Options: Consulting Full Fledged, AMC, Upgrade, Vectorflow Lite, Audit only, Consulting Lite + No software. |
| status | dropdown | Auto | `In Progress` / `Hold` / `Dropped` / `Completed` (§4.3.2) |
| lead_start_dt | date/timestamp | Auto | when the lead/cycle was created (lifecycle start) |
| lead_end_dt | date/timestamp, nullable | Auto | set when the lead first reaches a terminal status (`Completed` or `Dropped`); NULL while active |
| drop_remark | text | No | optional reason captured on drop (manual or Task-8 auto-drop) |
| + audit columns (§4.0) | | | `created_by` is a **semantic** creator (Marketing vs Lead Manager) — required |

> **Derived for the lead's live display; snapshotted per row:** the lead's *current* displayed Project ID (`base_code [+ "-M"] + "-" + current_stage_code`) is computed on request from the lead's open stage(s). In addition (decision 2026-07-27) each `lead_stage` and `task_details` row stores a `project_id` **display snapshot** for its own stage, so the value is visible directly in those tables. Neither the derived string nor the stored snapshot is **ever used as a join key** — joins key on numeric PKs (§13).

#### 4.3.1 Marketing-sourced leads & workflow start
- Marketing adds a lead with `assigned_to` hidden; on save it is NULL and no Task 1 opens.
- Marketing can view/edit their created leads (all fields except `assigned_to`) at any time.
- Lead Admin assigns an owner to a Not-Assigned lead; that assignment **starts the workflow** (opens Task 1 — or Task 16 for the Direct Proposal flow, or Task 0 for a lead with no flow yet, §4.3.4).
- **Workflow-start trigger:** `assigned_to` transitioning `NULL → user` (signal/hook), not merely lead creation.

#### 4.3.2 Status Flow

| Status | How set | Notes |
|---|---|---|
| In Progress | System — on creation | Default. Active workflow. |
| Hold | User — manual | Pauses the workflow and all open tasks (§6). Popup captures an optional remark (`lead_hold.remark`). |
| Dropped | User — manual, **or** system (Task 8) | Manual: popup with optional `lead.drop_remark`; all open/hold tasks → `dropped`. **Auto (Task 8 "Go-ahead = No"):** status → `Dropped`, no further tasks open, but **Tasks 6 & 7 remain open** (§5, Task 8). |
| Completed | System — automatic | Set only when **both** Task 27 (Project Closure) **and** Task 28 (Accounts Approval) close. Cannot be set manually. |

> `Hybernation` and `Short Closed` statuses are **removed**. Short-close (§9.2) is an action that routes to Task 27 and ends as `Completed`.

#### 4.3.3 Leads list — Tracker & header filters
- **Tracker:** `closed/total` task instances + percent + progress bar; `skipped` excluded; extension/mining/repeat cycles add instances. Bar color by status (green In Progress/Completed, amber Hold, red Dropped); "Not started" before the workflow begins. Exposed as `task_progress {total, closed, percent}`.
- **Header filters:** free-text (Company/Project, Project ID) + dropdowns (Industry, Domain, Owner incl. "Not Assigned", **Current Stage**, Current Task, Status). AND semantics; "Clear filters" resets.

#### 4.3.4 Entry point (Type) & Flow of tasks

**Type** (macro entry):

| Type | Entry |
|---|---|
| BD | Task 1, shaped by Flow of tasks |
| Mining | Task 1 with `-M` marker (§13), shaped by Flow of tasks — **but** a Mining lead row created off a parent via Task 21 enters at **Task 0** (below) to choose that flow first |
| Extension | Enters at Task 22 (Extension Proposal); Flow of tasks not applied |

**Pre-flow selection (Task 0)** — added 2026-08-04. A BD/Mining lead whose `flow_of_tasks` is **blank** — only ever a Task-21-spawned Mining lead — enters at **Task 0 "Select Flow of Tasks"** instead of at a flow entry point. The condition is the blank flow, not the lead type or the presence of `parent_lead_id`, so a lead that already has an answer can never reach the gate. Task 0 is assigned to the lead's Default BD Person, sits in the `M` stage the child already opened (its *real* first stage isn't known until the answer — Direct Proposal starts at Task 16, in `SnT`), has **no trigger** and waits indefinitely: the premise is that the answer arrives whenever the mining project firms up, months later. Closing it writes the chosen flow to `lead.flow_of_tasks`, logs it, pre-marks that flow's skips, and opens its entry task(s) — the same code path a normal workflow start uses. Holds and follow-ups work on it like any other task.

**Flow of tasks** (BD/Mining):

| Flow | Intro (1–2) | 2HR (3–8) | SnT (9–15) | Proposal (16→) |
|---|---|---|---|---|
| 1 · DEFAULT | open | open | open (via Task 8 branch) | open |
| 2 · 2hr → Proposal | open | open | skipped | open (Task 8 SnT=No → Task 16) |
| 3 · Direct Proposal | **skipped** | skipped | skipped | opens at Task 16 |
| 4 · SnT → Proposal | open | skipped | open | open |

Skipped stages have their tasks set to `skipped` at creation so the tracker and path stay accurate. In-flow branch questions (Tasks 8, 12, 13) still operate for the paths that reach them. For a lead that came through Task 0, "at creation" means *when Task 0 closes* — nothing is pre-skipped before the flow is known.

### 4.4 `lead_stage`

The stage history — drives the dashboard and the Project ID suffix. **Multiple rows can be open (`In Progress`) at once** for a lead (Mining ∥ Extension).

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| lead_id | FK → `lead` | |
| project_id | text | **stored display snapshot** for this stage (`base_code` + this stage's suffix, e.g. `NPD26001-IM`), stamped when the row is created (decision 2026-07-27). Display only — **never a join key** (§13). |
| stage | dropdown | `BD`, `2HR`, `SnT`, `IM` (Implementation), `E1`/`E2`/`E3`… (Extension loops), `M` (Mining), `Closure` |
| stage_start_dt | date/timestamp | when the first task of this stage opens |
| stage_end_dt | date/timestamp, nullable | when the stage's tasks all close/skip |
| status | dropdown | `in_progress` / `closed` (`skipped` if the flow routes around the whole stage) |
| + audit columns | | |

The extension loop counter is encoded in the stage value: the **first** extension is `E1`, then `E2`, `E3`… — numbering starts at 1, not 0 (user decision 2026-07-29) — and matches the Project ID suffix (§13).

### 4.5 `task_details`

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| task_no | integer | **canonical workflow step 1–28** (drives skip/tracker/routing logic), plus **0** for the pre-flow selection task (§4.3.4, added 2026-08-04) — numbered 0 because it runs *before* the flow it selects, leaving the 1–28 numbering a 1:1 map of §5 |
| task_name | text | from workflow JSON |
| stage_id | FK → `lead_stage` | **always set** — every task belongs to a stage |
| project_id | text | **stored display snapshot** copied from the task's stage when it opens (decision 2026-07-27). Display only — **never a join key** (§13). |
| lead_id | FK → `lead` | denormalized for convenient querying |
| assigned_to | FK → users, nullable | resolved per the assignment rule (Default BD Person, Resource Manager, Execution Red, Accounts, etc.) |
| status | dropdown | `pending`, `open`, `hold`, `closed`, `skipped`, `dropped` |
| is_allocation_task | boolean | true for 3, 10, 17, 18, 24, 25 |
| is_hanging_task | boolean | true for **Task 18** (non-blocking — see §5) |
| is_finance_gate | boolean | true for **7, 15, 28** |
| reopened_count | integer, default 0 | incremented each time a Finance gate re-opens this task (§5.10) |
| task_start_dt | timestamp, nullable | latest open time (column renamed from `opened_at`, 2026-07-27) |
| task_end_dt | timestamp, nullable | latest close time; NULL again when re-opened (renamed from `closed_at`) |
| elapsed_time | duration | total active (non-hold) time — see §6 |

**Re-open support:** a `closed` task can transition back to `open` when a downstream Finance gate answers "No" (§5.10). Each such cycle increments `reopened_count`; the full history of opens/closes is retained in the activity log for audit.

### 4.6 `task_extra_fields` (per-task dynamic fields)

Task-specific fields (dates, numerics, fee blocks, stakeholder rows, invoice rows) are stored as structured JSON per task instance, keyed by field name, since the field set differs per task and repeatable row-groups (e.g. "Name | Role x3 + add more", "Invoice No / Value / Date x3 + add more") need a flexible schema. A per-task JSON schema in `workflows` drives form rendering. All numeric/date values obey §3.

**Field types:** `text`, `number`, `date`, `boolean` (Yes/No), **`choice`** (added 2026-08-04 — a fixed `options: [{value, label}]` list carried in the workflow JSON; the submitted value must be one of the option values, enforced server-side at close, and renders as a Select), and `rowgroup` (repeatable rows with a `columns` list + `min_rows`). Every field is mandatory unless it carries `required: false`; a `required_when: {field, equals}` field is shown *and* required only once its controller field holds that value.

### 4.7 `resource_allocation` (append-only allocation history)

This replaces the wide single-row allocation table. **One row per resource, per slot, per stage** — never overwritten. This is what powers the resource dashboard: who worked which slot, on which stage, from when to when, and how allocation changed (reassignments).

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| task_id | FK → `task_details` | the allocation task that created this row (3 / 10 / 17 / 18 / 24 / 25) |
| stage_id | FK → `lead_stage` | which stage the resource is working |
| lead_id | FK → `lead` | denormalized for reporting |
| slot | dropdown | `execution_red`, `execution_brown`, `white`, `auditor_1`–`auditor_4`, `project_member_1`–`project_member_10` (17 values). The **named extras** — `auditor_3`/`auditor_4` and every `project_member_*` — are **Resource-Manager-only** (see the visibility note below) and always optional (`man_power_required` 0). Every slot except `white` holds at most one `allocated` row at a time. |
| user_id | FK → users, **required on every new row** | the allocated person (nullable only for pre-2026-07-29 rows — see `is_tbd`) |
| names | text | denormalized display-name snapshot of the occupant (`user.name`, empty when the row names nobody) — for dashboards/reports without a join (decision 2026-07-27); the FK stays the source of truth |
| is_tbd | boolean, default false | **Legacy — retired 2026-07-29.** A White slot used to be fillable as "TBD" (to-be-decided, no user). TBD is not a user: an undecided slot is now simply an unfilled one (no row), so nothing sets this any more. Kept only so pre-existing rows stay identifiable; they are released and excluded from the resource screens (migration `0029`) |
| status | dropdown | `allocated` (currently occupying the slot) / `released` (freed) |
| allocated_on | date/timestamp | when this allocation started |
| released_on | date/timestamp, nullable | when freed — enables "days worked" in the dashboard |
| replaces_id | FK → `resource_allocation`, nullable | set when this row **replaces a reassigned one**; the replaced row is set to `released` |
| man_power_required | integer | captured from the triggering stage's manpower fields (Task 2 for 2HR, Task 9 for SnT, Task 16 for the project), for the over/under-allocation indicators |
| remark | text | |
| + audit columns | | |

**Reassignment = append, never overwrite.** To move a slot to a new person: set the current row `released` (`released_on = now()`), insert a new `allocated` row with `replaces_id` = the released row. History (who, which slot, how long, replaced by whom) survives.

**Allocation & release lifecycle:**

| Stage | Allocated at | Released when |
|---|---|---|
| 2HR | Task 3 | the 2HR stage closes (after Task 6/7 complete) |
| SnT | Task 10 | the SnT stage closes (after Task 14/15 complete) |
| Implementation | Tasks 17 (team) & 18 (auditors) | **Task 27 (Project Closure) opens** — resources default to showing as occupied on the project until then |
| Extension (each loop) | Tasks 24 (team) & 25 (auditors) | **Task 27 opens** (or superseded by the next extension loop, prefilled forward) |

**Indicators (Resource-allocation screen):** allocated count > `man_power_required` → **red over-allocation**; allocated count < required → **amber under-allocation**. Shown live in the allocation form and on submitted rows.

> **Built 2026-08-05 (R23-3).** The under-allocation half shipped partially and over-allocation not at all, so allocating three Whites against an approved manpower of two was invisible. Now: a **Manpower** column in the Resources queue carries the per-step verdict (badge + a per-slot tooltip), the White cell and the allocation form show `n of m` in red over / amber under, and the lead's Resources tab shows the same `n of m` per slot per stage (read-only, off each row's `man_power_required`). The **named extras are excluded from both sides of the comparison** — they carry `man_power_required` 0 *by design*, so counting them would report every optional name as an over-allocation. Nothing is blocked: over-allocation is an indicator, not a rule.

**Extension prefill:** when an Extension loop's team allocation opens (Task 24), its slots are prefilled from the previous cycle's allocations (Implementation for the first extension, the previous Extension loop afterwards) — the Resource Manager only adjusts what changed (each change is still an append: release old + allocate new).

**Slot visibility (R12).** Which slots an allocation task exposes is filtered per viewer, server-side (`resources.visible_slots`, enforced again in `allocate`/`reassign`/`release`):

| Viewer | Slots |
|---|---|
| Resource Manager | every slot the task manages, incl. `auditor_3`/`auditor_4` and `project_member_1`–`10` |
| The lead's Default BD Person (also allowed to staff, §7.5) | `execution_red`, `execution_brown`, `white` only |
| Anyone else who can view the lead (its Resources tab, read-only) | `execution_red`, `execution_brown`, `white` only — extra-slot rows are filtered out of `/api/leads/<id>/resource-allocations/` |

**Advance allocation + auto-close (R12).** A trigger-gated allocation task is staffable while still `pending`, from the Resources queue (`?status=open,pending`). A task whose workflow def carries **`auto_close_when_staffed`** (Task 18 only — it routes to nothing) **completes itself the moment it opens** if its mandatory slots (`execution_red`, `auditor_1`, `auditor_2`) are already filled: `resources.auto_close_if_staffed` closes it, writes an activity-log row, and the "allocation needed" notification is suppressed. Not staffed in advance → it opens and waits normally.

**Post-close changes (R12).** Submitting an allocation task does not freeze its slots. `permissions.can_work_allocation_task` keeps allocate/reassign/release open to the **Resource Manager** on a `closed` task (the allocation is still live until released — this is the mid-engagement person swap, and an `execution_red` swap still cascades onto that Red's open tasks); the Default BD Person's rights end at `open`/`pending`/`hold`, and a `skipped`/`dropped` task is closed to everyone.

### 4.8 `project_details` (per-cycle commercials)

The commercial record captured for the project, one row per implementation/extension/mining cycle (keyed to the cycle's stage). Detailed fee-cap / tranche / invoice-block capture lives in task field data (§4.6); this table holds the headline commercials for reporting and the Project Closure screen.

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| lead_id | FK → `lead` | |
| stage_id | FK → `lead_stage` | the cycle this commercial record belongs to (`IM`, `E1`/`E2`…, `M`) |
| project_id | text | the derived display Project ID for this cycle at the time (e.g. `NPD26001-IM`, `NPD26001-E1`) — stored for the closure screen/history |
| project | text | the cycle's **stage code** (`IM` / `E{n}` / `M`), a denormalized copy of `stage.stage` so reports read the cycle type without a join (decision 2026-07-27) |
| fixed_fee | numeric (≥ 0) | headline fixed fee for the cycle |
| variable_fee | numeric (≥ 0) | headline variable fee for the cycle |
| + audit columns | | |

The Project Closure screen (§9.2) lists **one row per `project_details` cycle**, so a project's implementation, each extension loop, and any mining cycle are all visible together.

### 4.9 Hold tables — `lead_hold` and `task_hold`

Unchanged from prior versions. One row per hold/unhold cycle; optional `remark` / `unhold_remark`. A lead-level hold/unhold copies its remark onto the `task_hold` rows it creates/releases. Used to compute active time: `elapsed_time = (closed_at − opened_at) − Σ(unhold_at − hold_at)`.

`lead_hold`: lead_id, hold_at, hold_by, remark, unhold_at, unhold_by, unhold_remark.
`task_hold`: task_id, hold_at, hold_by, remark, unhold_at, unhold_by, unhold_remark.

### 4.10 `followups`
lead_id, assigned_to (any Employee-role user, incl. self), created_by, followup_date (no past dates), remark, status (`open`/`done`). Surfaced on the **Other Tasks** screen for the assignee. Creatable by anyone who can view the lead.

### 4.10a `lead_comment` (the Lead Trail)

**Added 2026-08-05 (post-v17.0), per the user.** A lead-level, **append-only** comment thread — the running commentary on a lead, distinct from `activity_log` (auto-logged events nobody can write to) and from a follow-up's own comment thread (which is scoped to that follow-up).

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| lead_id | FK → `lead` | |
| project_id | text | display snapshot of the lead's Project ID when the comment was written (§13) — not a join key |
| author_id | FK → users, required | set from the request, **never** client-settable |
| comment | text, required | non-blank after trimming |
| created_at | timestamp | |

**Who may read and write:** exactly the people who can **see** the lead — visibility is the permission. That is its owner, its creator, the Lead Admin, and anyone the workflow has put on it (the Execution Red, whoever holds an open task, the Resource Manager on an allocation task, Finance on a payment gate). An out-of-scope lead 404s.

**Append-only.** `GET` (list) and `POST` (create) only — no update or delete route, and the Django admin renders it read-only. A trail that can be rewritten is not a trail.

**Surfaced:** on Lead Detail's Details tab, directly beneath **Scope** (newest first); and as a single "Lead trail" input on the lead create/edit form, below the Scope field — what is typed there is *appended* as a comment, never written over an existing one.

### 4.11 `workflows`
name; type (`BD` / `Mining` / `Extension`); workflow (JSON — full task graph: order, assignment rule, checklist items, extra-field schema, stage, open-conditions, branch routing); status (active/inactive). Editable from Django Admin. **No workflow logic hardcoded outside this table.** The branch/route conditions support multi-condition (AND) branches (e.g. Task 12's "re-presentation = No AND moved-to-next-stage = Yes").

### 4.12 `workflow_trigger_config` (date-offset triggers)
For tasks that open "X days/weeks/months before/after a date captured earlier" (Tasks 3, 10, 17, 18, 21, 22, 27). Fields: workflow FK, task_no, reference_task_no, reference_field_key, offset_days (signed — negative = before, positive = after), is_active. A scheduled job opens the task when `today` crosses the computed date. **Same-day opening required** (run the job early/frequently). Task 21 (Mining) supports the two-rule variant (X months after engagement start; Y months if duration < 6 months) via two config rows.

---

## 5. BD → Extension → Mining Workflow — Full Task Table (1–28)

Authoritative sequence, transcribed from `lms_updated_wf.csv`. Encode as the `workflows.workflow` JSON seed. **"Shailesh" = Resource Manager; "Accounts (Abhay)" = Finance.** Allocation-task assignees marked "Shailesh + Default BD" have **two assignees**; either can complete the allocation.

**Task 0** below is *not* from the workflow sheet — it is the pre-flow selection step added 2026-08-04 (§4.3.4), reached only by a Mining lead spawned off Task 21. The sheet's 1–28 numbering is untouched.

| # | Task | Assigned To | Stage | Checklist | Extra Fields / Branch | Notes |
|---|---|---|---|---|---|---|
| **0** | **Select Flow of Tasks** *(not a sheet row — added 2026-08-04)* | Default BD Person | `M` (the mining marker stage the child opened at creation) | 0.1 Flow of tasks for this mining project decided | **Flow of tasks for this mining project** — a `choice` field (§4.6) whose options are the four §4.3.4 flows, mandatory. | Opens **only** for a lead whose `flow_of_tasks` is blank — i.e. a Mining lead spawned by Task 21. **No trigger:** it opens with the lead and waits indefinitely (the mining project starts months later). No routing rules of its own — closing it writes the answer to `lead.flow_of_tasks`, pre-marks that flow's skips, and opens the flow's entry task(s) (Task 1, or Task 16 for Direct Proposal). An option that isn't a valid flow code is refused. |
| 1 | Introduction and First Meeting | Default BD Person | BD | 1.1 Vector's Intro Email · 1.2 Intro presentation to decision maker | Key stakeholder contact (Name·Role ×3 + add more); **Is 2HR study agreed?** If Yes → open Task 2 | First task; opens on `assigned_to` set (§4.3.1). Skipped when Flow = Direct Proposal. |
| 2 | 2HR Study Agreement | Default BD Person | BD | 2.1 Area of work / objective agreed | Expected start date of next stage; **Is manpower support required from the resource-allocation team?** If **Yes** → capture Manpower (PM + additional; Brown = number, White = number) and **open Task 3 against Shailesh**. If **No** → skip Task 3. | Conditional allocation branch. |
| 3 | 2Hr Study & Presentation Team Allocation | Shailesh and/or Default BD Person | 2HR | *allocation task* | Execution Red; Execution Brown; White; Project Member 1–10 *(RM-only, optional)* | Opens per trigger-config (X weeks before Task 2's expected start). **Only opens if Task 2 manpower = Yes.** Creates `resource_allocation` rows (2HR). |
| 4 | 2HR Study Initiation | Default BD Person | 2HR | 4.1 Email sent to client to initiate study | — | |
| 5 | 2Hr Study & Presentation | Execution Red (from Task 3) — **or Default BD Person if Task 3 skipped** | 2HR | 5.1 Study Plan · 5.2 NDA · 5.3 Study Interactions · 5.4 Data Received · 5.5 2Hr Presentation date confirmed · 5.6 2Hr Presentation done | Date of 2Hr presentation (linked to 5.5); Key stakeholders mapped (Name·Role ×3 + add more) | Resource occupancy: 2HR. *Note: mail to accounts on close — deferred.* |
| 6 | 2Hr Study Reimbursement | Execution Red (from Task 3) / Default BD | 2HR | 6.1 Reimbursement Expenses Invoiced · 6.2 Reimbursement Expenses Received | Delay reasons if any; Expected date of receipt | Opens after 5.6. |
| 7 | 2Hr Study Reimbursement — **Accounts Approval** | **Accounts (Finance/Abhay)** | 2HR | — | **Payment received against all invoices?** Yes → close. No → close + add remark + **re-open Task 6**. | Finance gate (§5.10). |
| 8 | Solution Blueprint Confirmation | Default BD Person | 2HR | — | **(a) Go-ahead received from client?** No → **status = Dropped**, no further tasks, **Tasks 6 & 7 stay open**. Yes → ask (b). **(b) Is Solution Blueprint required?** Yes → Task 9. No → close & **open Task 16** (Project Proposal Submission). | Opens after 5.6. Drop + SnT branch. |
| 9 | Solution Blueprint Proposal | Default BD Person | SnT | 9.1 Proposal Submitted · 9.2 Proposal terms agreed | Fee for engagement (allow zero); Manpower (Brown, White); Expected start date of next stage; Number of tranches of payment | Opens after 8(b) = Yes. |
| 10 | Solution Blueprint Team Allocation | Shailesh + Default BD Person | SnT | *allocation task* | Execution Red; Execution Brown; White; Project Member 1–10 *(RM-only, optional)* | Opens per trigger-config (X days before Task 9's expected start). Creates `resource_allocation` (SnT). *Mail to accounts on close — deferred.* |
| 11 | Solution Blueprint Study Initiation | Default BD Person | SnT | 11.1 Email sent to initiate Solution Blueprint study | — | |
| 12 | Solution Blueprint | Execution Red (from Task 10) | SnT | 12.1 Engagement Start · 12.2 Initial Invoice raised · 12.3 Data Receipt · 12.4 Presentation Dates locked · 12.5 SnT Workshop Done · 12.6 Completion Invoice | Presentation date (linked 12.4); Invoices Raised block (Invoice No / Value / Date ×3 + add more); **Re-presentation required?** Yes → Task 13, else ask; **Has project moved to the next stage?** Yes → open **Task 14 & Task 16**; No → open **Task 27**. | Resource occupancy: SnT. Multi-condition branch. |
| 13 | Solution Blueprint Repeat Presentation | Execution Red (same block as Task 12, default) | SnT | 13.1 Presentation Dates locked · 13.2 SnT Workshop Done | Presentation date (linked 12.1); **Is re-presentation required?** Yes → Task 13 (loops), else ask; **Has project moved to next stage?** Yes → Task 14 & Task 16; No → Task 27. | Loops on itself. |
| 14 | Solution Blueprint Payment | Execution Red (same block, default) | SnT | 14.1 Fixed fee invoices received · 14.2 Reimbursement Expenses Invoiced · 14.3 Reimbursement Expenses Received | Delay reasons if any; Expected date of receipt | |
| 15 | Solution Blueprint Payment — **Accounts Approval** | **Accounts (Finance/Abhay)** | SnT | — | **Payment received against all invoices?** Yes → close. No → close + remark + **re-open Task 14**. | Finance gate. |
| 16 | Project Proposal Submission | Default BD Person | SnT | 16.1 Proposal Submission · 16.2 Terms agreed | Planned Engagement Start Date; Period (months); Planned Engagement End Date (auto = start + period); Fixed Fee (blocks generated per period-month, capturing fee + manpower); Total Variable Fee Cap; Variable Milestone Fee Cap; Variable Performance Fee Cap; Manpower (Brown, White) | Entry point for Flow = Direct Proposal / 2hr→Proposal (via Task 8 No). |
| 17 | Project Team Allocation | Shailesh + Default BD Person | Implementation | *allocation task* | Execution Red; Execution Brown; White; Project Member 1–10 *(RM-only, optional)* | Opens per trigger-config (X days before Task 16's Planned Engagement Start Date). Creates `resource_allocation` (Implementation). *Add to Sutradhar — deferred.* |
| 18 | Project Auditor Allocation | Shailesh + Default BD Person | Implementation | *allocation task* | Auditor 1; Auditor 2; Auditor 3; Auditor 4 *(3–4 RM-only, optional)* | **Hanging task** — non-blocking; can be completed in parallel and does not hold up the sequence. Opens with Task 17's trigger. **`auto_close_when_staffed`:** if both auditors were already allocated in advance (while pending), it closes itself the moment it opens. *Add to Sutradhar — deferred.* |
| 19 | Project Initiation | Default BD Person | Implementation | 19.1 Email sent to initiate Project | — | |
| 20 | Implementation | Execution Red (from Task 17) | Implementation | 20.1 Handover & Engagement Start · 20.2 PO from Customer · 20.3 First Fixed fee invoice raised · 20.4 Agreement/Contract · 20.5 Variable Parameter Finalisation · 20.6 Variable Baseline Sign-off · 20.7 Addendum Agreement · 20.8 Expected variable fee over eligible period submitted | Actual Engagement Start Date; Duration (months) *(prefilled & editable from Task 16)*; Modified Planned Engagement End Date (auto = actual start + duration); Fixed Fee + Variable Fee Caps (Total/Milestone/Performance) *(prefilled & editable from Task 16)*; Actual Fixed fee invoice date; Variable Fee Start Date | Resource occupancy: project (shown until Task 27). **On open, give Shailesh short-close access** (§9.2) — held for the rest of the engagement. **On close:** create the `project_details` cycle row (stage `IM`) and enable the downstream Mining (Task 21) and Extension (Task 22) triggers. |
| 21 | Exploit Mining Opportunities | Default BD Person | BD (Mining origin) | 21.1 Visit to client location · 21.2 Discussion with key stakeholders · 21.3 Area for improvement identified · 21.4 Pitch Proposal to Client? | **Is client go-ahead received for a new project?** Yes → **spawn a new lead row (same `base_code`, `parent_lead_id` = this lead), open a `-M` Mining cycle, and start its own cycle** — ~~a fresh BD flow from Task 1~~ **corrected 2026-08-04:** the child is spawned with **no `flow_of_tasks`** and opens **Task 0** (§4.3.4), which asks for its flow; the flow is **not** inherited from the parent and **not** asked here. No → close task. | Opens X months after Task 20's engagement start (Y months if Task 20 duration < 6 months). Mining stage is `M` until 2HR starts. **Runs in parallel with any Extension.** The bug this fixed: a Direct-Proposal parent spawned a child that also pre-skipped Tasks 1–15. The flow is asked on the child, not here, because at go-ahead time the mining project is still months away. Both leads' activity logs record the spawn as awaiting selection; the API's spawn payload reports the entry task + `awaiting_flow_selection`. |
| 22 | Extension Proposal | Default BD Person / Execution Red | Extension | 22.1 Discussion with client stakeholders · 22.2 Identify area of extension · 22.3 Solution design & preparation · 22.4 Pitch Extension proposal | **Extension approved?** Yes → Task 23. No → Task 27. | Opens X months before the engagement end date from **Task 20 or Task 26** (extension-of-extension). Entry point for Type = Extension. |
| 23 | Extension Detail | Execution Red | Extension | 23.1 Addendum Agreement · 23.2 Expected variable fee over eligible period submitted | Extended Engagement Start Date; Period (months); Planned Ext. Engagement End Date (auto); Fixed Fee (blocks per period-month) — *if a resource is engaged beyond the planned end date, allow **zero** fee to keep them engaged*; Total/Milestone/Performance Variable Fee Cap; Manpower (Brown, White) | Opens if Task 22 = Yes. |
| 24 | Project Extension Team Allocation | Shailesh + Default BD Person | Extension | *allocation task* | Execution Red; Execution Brown; White; Project Member 1–10 *(RM-only, optional)* | Creates `resource_allocation` (Extension), prefilled from the previous cycle. |
| 25 | Project Extension Auditor Allocation | Shailesh + Default BD Person | Extension | *allocation task* | Auditor 1; Auditor 2; Auditor 3; Auditor 4 *(3–4 RM-only, optional)* | Auditor allocation for the extension. |
| 26 | Extension Implementation | Execution Red (from Task 24) | Extension | 26.1–26.8 (same set as Task 20) | Actual Ext. Engagement Start Date; Duration (months) *(prefilled & editable)*; Modified Planned Ext. Engagement End Date (auto); Fixed Fee + Variable Fee Caps *(prefilled & editable)*; Actual Fixed fee invoice date; Variable Fee Start Date | Opens per the extended engagement start date (Task 23). Resource occupancy: project (until Task 27). **On open, give Shailesh short-close access** (§9.2) — retained here alongside Task 20's grant so a standalone `lead_type = Extension` lead, which enters at Task 22 and never has a Task 20, still gets access. **On close:** create the next `project_details` cycle row (stage `E{n}`); the extension loop counter increments (`E1 → E2 → …`); then loops back to Task 22 for a possible further extension. |
| 27 | Project Closure | Execution Red | Closure | 27.1 All fixed fee received · 27.2 All variable fee received · 27.3 All reimbursements received | Final closed (checkbox = Yes, mandatory) | Opens when **any** of: engagement end date (Task 20) reached; Task 22 "Extension approved = No"; Shailesh short-closes; Task 12/13 "moved to next stage = No". **On open: release the currently allocated resources** (§4.7). Closing this **alone does not complete the lead** — Task 28 must also close. |
| 28 | Project Closure — **Accounts Approval** | **Accounts (Finance/Abhay)** | Closure | — | **Payment received against all invoices?** Yes → close. No → close + remark + **re-open Task 27**. | Finance gate. **When both Task 27 and Task 28 are closed → lead & cycle status = `Completed`.** |

**Cross-cutting rules**
- "Default BD Person" = `lead.assigned_to`.
- No task numbers are hardcoded in the engine — entry points, skips, stages, routing and trigger hints are all data in the workflow JSON. Task 0 follows the same rule: it is reached via a `FLOW_SELECTION` entry in the flow map, and its close-time effect is a marker on the task definition, not a special case keyed on the number 0.
- Allocation tasks (3, 10, 17, 18, 24, 25) have no checklist — status only until the Resource Manager (with the BD co-assignee) submits the allocation, which closes the task and opens the next, assigning it to the selected Execution Red. Task 18 is the one exception: staffed in advance, it closes itself on opening (`auto_close_when_staffed`, §4.7).
- Manpower captured upstream (Tasks 2, 9, 16, 23) is the reference count for the over/under-allocation indicators.
- All numeric fields ≥ 0; all date fields no-past-date (§3).
- Finance gates (7, 15, 28) can **re-open** their preceding task on a "No" answer (§5.10).

### 5.10 Finance approval gates & task re-open

Tasks 7, 15, 28 are **Finance gates** (`is_finance_gate = true`). Flow, using Task 6 → 7 as the example:

1. The preceding money task (6) closes → its Finance gate (7) opens for Accounts (Abhay).
2. Abhay answers *"Payment received against all invoices?"*
   - **Yes** → gate closes; workflow proceeds.
   - **No** → gate closes **with a mandatory remark**, and the system **re-opens the preceding task** (6): its `status` → `open`, `closed_at` cleared, `reopened_count += 1`, and an activity-log entry records the bounce and remark.
3. When the preceding task is closed again, the gate re-opens; repeat until "Yes".

This is the one sanctioned exception to "closed is final". The engine must allow `closed → open` on the specific preceding task of a gate, and the tracker must count a task that closes more than once without double-counting completion. **Task 28 gates completion:** the lead/cycle becomes `Completed` only when both Task 27 and Task 28 are `closed`.

---

## 6. Task, Checklist & Hold/Unhold Rules

### Checklist rules
- Two fields per item: `status` (`not_started`/`inprogress`/`complete`) and `remark`. Edit icon → popup; tickmark toggles `complete ↔ not_started` directly. Every save persists immediately and records timestamp + user. Un-checking allowed.

### Task closure rules
1. Close only when all checklist items are `complete` and all mandatory fields filled.
2. A task is visible **and editable** only to its assigned user.
3. If a task isn't assigned to a user but the parent lead is, that user gets **view-only** access.
4. Closed tasks are non-editable — **except** a Finance-gate re-open (§5.10), which returns a task to `open` for its assignee.
5. Allocation tasks (3, 10, 17, 18, 24, 25) show status only until the Resource Manager submits.
6. Every task has **Save as Draft** (persist, no close) and **Save & Complete** (validate + close + open next). Tasks are worked from the lead's task stepper; there is no separate My Tasks screen.
7. Validation errors reference the field's **display label**, never internal keys.
8. Task lists show only `open` / `hold` / `closed` / `skipped` tasks; `pending` rows are hidden.

### Task reassignment
Any **open** task can be reassigned; the new assignee gets edit access and the previous assignee reverts to view-only. For **allocation slots**, reassignment is an append in `resource_allocation` (release old + allocate new, §4.7) so resource history is preserved.

**Who may reassign — the lead's custodians only (R21, 2026-08-05, per the user: "the one who created has the power all the time, whether to hold or reassign … in case of Execution Red is assigned, he should also have the power to hold the task if assigned to him, but not reassign").** Reassignment is **not** a transferable right: receiving a task never confers the power to pass it on. `permissions.can_reassign_task` (previously an alias of `can_edit_task`, which is what let each new assignee hand the task on again) now admits exactly `permissions.is_lead_custodian`:

| Actor | Reassign a task | Hold / unhold a task |
|---|---|---|
| Lead Manager who **created** the lead | Yes — for the lead's whole life | Yes |
| The lead's current **owner** (`assigned_to`, any role — the Default BD Person may be a plain Employee) | Yes | Yes |
| **Lead Admin** | Yes | Yes |
| The task's **assignee** (incl. the **Execution Red**), when not one of the above | **No** | **Yes** — the worker pauses their own work |
| **Marketing** creator | No (sources leads only; matches `can_hold_lead`) | No |
| **Finance**, on gates 7/15/28 | No — a gate opens unassigned and is worked from the Accounts queue by role, so it is nobody's to reassign (*working* it is unaffected) | No |

Only an `open` task is reassignable — a held task is resumed first, and a `pending` task has no assignee worth moving. The custodian may reassign a task the workflow opened for the Execution Red; that is a deliberate, logged, per-task action and is separate from the **automatic** owner-change cascade, which still leaves the Red's own tasks alone (DD-R9-7, §4.7). Because this list doubles as the reassignment people-picker, `/api/assignable-users/` is readable by a user who currently owns a lead as well as by Lead Manager / Lead Admin.

### Hold / Unhold
Lead-level hold holds all open tasks; unholding restores them. Held tasks are non-editable. Every transition records timestamp + user (`lead_hold`, `task_hold`). Hold/Unhold/Drop each open a popup with an **optional remark**; remarks are stored per cycle, appended to the activity log, and shown as a banner. A **Hold Items** menu provides Hold Tasks and Hold Leads views. **Task-level hold** is shared between the task's assignee and the lead's custodians (see the table above) — the person doing the work knows it is blocked, and the person who created or owns the lead can pause work they delegated; **lead-level** hold stays with the managing Lead Manager / Lead Admin (`can_hold_lead`).

---

## 7. Resource Allocation Flow (Detail)

1. An allocation task (3 / 10 / 17 / 18 / 24 / 25) opens per trigger-config (§4.12). Task 3 opens **only if** Task 2 manpower = Yes.
2. The Resource Manager (Shailesh) works the allocation **inside the Resource module** — the queue at `/resources` lists every allocation task, one row per step, with a column per role whose cells are the people-pickers, so a row is read and staffed without opening anything. The lead's Default BD co-assignee staffs the same task from the lead's own task stepper. *(~~R12-1: the role has no Leads tab.~~ **Superseded 2026-07-29, R13-1, per the user:** the Resource Manager also gets the Leads list + lead detail — read-only apart from their allocation steps, and scoped by `views.lead_scope_q` to leads that have reached an allocation task — so both routes can staff a slot. The redundancy is intentional. ~~Both hosts render the same `AllocationPanel`.~~ **Superseded 2026-08-05, R22:** the two hosts now render different **shapes** of the same behaviour — the queue is a table of editable cells (`AllocationCells.jsx`), the stepper keeps the labelled-select form (`AllocationSlots.jsx` via `AllocationPanel`) — because the queue's users work in tables, not forms. The rules, and their server-side enforcement, are unchanged and shared.)*
3. The form shows the lead's details (incl. the upstream manpower figure) above the slots. Filling a slot inserts an `allocated` `resource_allocation` row per resource, always naming a user. The named extras (Project Member 1–10, Auditor 3–4) render only for the Resource Manager, collapsed and optional.
4. On submit, the allocation task closes and the next task opens, assigned to the chosen Execution Red. **Mandatory to submit:** `execution_red` on a team task, `auditor_1` + `auditor_2` on an auditor task; every other slot is optional.
5. **Reassignment** = release the old row + insert a new one linked by `replaces_id`. Available to the Resource Manager **after** the task closes too, for as long as the rows are still `allocated` (R12-5).
5a. **Advance allocation:** a task that is scheduled but not yet due (`pending`) can be staffed early. Task 18 additionally carries `auto_close_when_staffed`, so if both auditors are allocated before its date it closes itself on opening rather than queueing (R12-4).
6. **Release**: 2HR/SnT resources release when their stage closes; Implementation/Extension resources release when **Task 27 opens**.
7. Reporting screen: all rows with status (`allocated`/`released`), over-allocation (red) and under-allocation (amber) indicators, and — for the dashboard — days worked per resource per stage, derived from `allocated_on`/`released_on`, including reassignment chains.

---

## 8. Follow-Up Requests
Anyone who can view a lead may add a follow-up (lead Follow-up tab or the global Add Follow-up). Fields: Lead, assignee (any Employee-role user incl. self), follow-up date (no past dates), remark. Surfaced on the **Other Tasks** screen for the assignee.

---

## 9. Resource Manager & Finance Screens

### 9.1 Resource Allocation
List + edit as in §7, with the lead-detail/manpower context, status per row, and the over/under indicators. The queue lists the Resource Manager's allocation tasks — including ones **not yet due**, so auditors and teams can be staffed in advance — grouped per project. ~~each row expanding into the slot grid and Submit.~~ **Revised 2026-08-05 (R22, per the user — the people working this screen are 40+/50+ and asked for "table like structure like project closure … see the table, get the information quick and take action there itself"):** the queue is a **flat table**, one row per allocation step, with `Project ID | Stage | Allocation step | Status | Execution Red | Execution Brown | White(s) | Auditors | Action` — the same column-per-role shape as §9.2's Project Closure list, except each role cell **is** the people-picker and each change saves immediately (a `toast` confirms; no per-cell Save, and no confirm dialog on a change that is already append-only and reversible). Submit sits in the Action column and is blocked without an Execution Red. Missing *required* holders read as amber "Not assigned" rather than a dash. A slot the step doesn't staff shows a dash, so team steps and auditor steps read as one table. The R12 named extras (Project Member 1–10, Auditor 3–4) stay optional, Resource-Manager-only, and behind a per-row "Team & extras" toggle rather than 12 further columns. Where a previous stage had a holder for a slot, the empty cell offers that name as a one-press carry-over (the `allocation.prefill` the serializer has always sent). Companion screens: **Resource History** (days worked per resource, incl. reassignment chains) and **Project Closure** (§9.2). *(The "works entirely inside this module" framing of R12-1 was superseded by R13-1 — see §7 step 2.)*

Each **project group header** in this queue also carries the **short-close** control (§9.2), so the role need not leave the module to reach it. Availability comes from `lead_can_short_close` on the task payload — the same value as the lead endpoint's `can_short_close`, served per task because the queue is task-shaped (memoized per lead in the serializer, since a project lists several allocation steps).

### 9.2 Project Closure & Short-Close
**List view:** one row per `project_details` cycle (§4.8) — implementation, each extension loop, and any mining cycle shown together, each with its Project ID, stage, commercials, and status.

**Short-close:** when **Task 20 opens** (widened from Task-26-only on 2026-07-30, per the user), Shailesh is granted short-close access, and retains it through the extension loop until any Task 27 row exists. Task 26 carries the same grant, so a standalone `lead_type=Extension` lead — which never has a Task 20 — still gets access. Both are the workflow-JSON `grants_short_close` flag, and a `pending` (not-yet-triggered) instance does not count. Triggering it opens a dialog requiring a **compulsory remark**, then in one transaction: opens **Task 27**, sweeps every other `open`/`hold`/`pending` task under the lead to `skipped` (flagged as short-closed for a distinct "skipped because short-closed" note), releases currently allocated resources, and logs the remark. **There is no separate Short Closed status** — the cycle proceeds through Task 27 and Task 28 and ends `Completed`, with the short-close remark and swept-task notes retained for traceability.

**Endpoint & surfaces.** `POST /api/leads/<id>/short-close/` (body: `remark`, required) — **Resource-Manager-only**, enforced server-side; the action is lead-scoped, not per-`project_details`-cycle, because the cycle it interrupts has no row yet by definition (§4.8 inserts one only when Task 20/26 closes *normally*). Availability is published as `can_short_close` on the lead payload and `lead_can_short_close` on the task payload, and the client renders the control on exactly two surfaces: the **Lead Detail** header (beside Hold/Drop) and each **project group header in the Resource allocation queue** (§9.1, added 2026-07-30 per the user). After it fires, `short_close_info` (remark + who + when) stays readable **including once the lead is `Completed`** — with no distinct status, that stamp is the only way to tell a short closure from a natural one.

### 9.3 Finance (Abhay) screens
Finance sees and works its three gate tasks (7, 15, 28) from the lead task stepper / an Accounts queue: the *"Payment received against all invoices?"* control with Yes (close) / No (close + remark + re-open the preceding task). Finance actions are logged for audit.

---

## 10. Marketing Role
Add a lead (all fields; `assigned_to` hidden). On save `assigned_to` = NULL (shown "Not Assigned"), workflow not started. Can view/edit own created leads (except `assigned_to`) any time. Lead Admin assigns the owner, which starts the workflow.

## 11. Lead Admin
View access to all screens except User Management. Can assign owners to Not-Assigned leads, which starts the workflow.

---

## 12. Role-Based Permission Matrix

| Action | Lead Mgr | Lead Admin | User Mgmt | Employee | Res. Mgr | Marketing | Finance |
|---|---|---|---|---|---|---|---|
| Add lead (no owner) | No | No | No | No | No | Yes | No |
| Add / edit own leads (with owner) | Yes | No | No | No | No | No | No |
| Assign owner to unassigned leads | No | Yes | No | No | No | No | No |
| View own (created) leads | Yes | Yes | No | No | No | Yes | No |
| Edit own (created) leads (excl. owner) | Yes | Yes | No | No | No | Yes | No |
| View all leads | No | Yes | No | No | No | No | No |
| View own tasks | Yes | Yes | No | No | No | No | No |
| View all tasks | No | Yes | No | No | No | No | No |
| Edit own open tasks | Yes | Yes | No | No | No | No | No |
| Work allocation tasks (3,10,17,18,24,25) | co-assignee | No | No | No | Yes | No | No |
| Work Finance gates (7,15,28) | No | No | No | No | No | No | Yes |
| Short-close a lead (`POST /api/leads/<id>/short-close/`, §9.2) | No | No | No | No | Yes | No | No |
| Add follow-up on a viewable lead | Yes | Yes | No | Yes | Yes | Yes | Yes |
| View own follow-up tasks | Yes | Yes | No | Yes | Yes | No | No |
| View all follow-up history | No | Yes | No | No | No | No | No |
| View / add / edit resource allocation & history | No | No | No | No | Yes | No | No |
| View own leads-funnel dashboard | Yes | Yes | No | No | No | No | No |
| View all leads-funnel dashboard | No | Yes | No | No | No | No | No |
| Manage users | No | No | Yes | No | No | No | No |
| View own activity log | Yes | Yes | No | No | Yes | No | Yes |
| View all activity log | No | Yes | No | No | No | No | No |

---

## 13. Project ID Generation

**Composition finalized by the user 2026-07-28.** The Project ID is **stage-legible**: reading it tells you what the engagement is and where it stands. It is a stable base plus a derived stage suffix.

**Base:** `{CountryCode}-{IndustryCode}{AreaCode}{TypeCode}{YY}{Seq}`

```
IN  -  PH        NPD    CFF     26     001        -IM
│      │         │      │       │      │          └─ stage of intervention (derived suffix)
│      │         │      │       │      └─ auto-generated number, 3 digits
│      │         │      │       └─ 2-digit year
│      │         │      └─ type of project (§13.4)
│      │         └─ area code, from the lead's domain (§13.3)
│      └─ industry code (§13.2)
└─ country code (§13.5)
```

- Generated automatically at **lead creation**; the base **never changes** for that project — including when the lead's country, industry, domain or type of project is edited afterwards (decision 2026-07-28). The ID is already printed on every stage, task, allocation and activity row, so it is an identifier, not a live projection of the lead's current classification.
- The single `domain` supplies the Area code (decision D2 built `domain` single-select; the spec's multi-select rule was "primary/first-selected area").
- Stored as `lead.base_code` (the stable key). The **suffixed display string is derived** for the lead's live view; per decision 2026-07-27 a per-stage snapshot is also stored on `lead_stage.project_id` / `task_details.project_id`. Neither is ever used as a join key.

**Display:** `base_code [+ "-M"] + "-" + {current_stage_code}`

| Stage | Suffix | Example |
|---|---|---|
| BD | `-BD` | `IN-PHNPDCFF26001-BD` |
| 2HR | `-2HR` | `IN-PHNPDCFF26001-2HR` |
| SnT | `-SnT` | `IN-PHNPDCFF26001-SnT` |
| Implementation | `-IM` | `IN-PHNPDCFF26001-IM` |
| Extension loop n (first = 1) | `-E{n}` | `IN-PHNPDCFF26001-E1`, `…-E2` |
| Mining cycle | `-M` | `IN-PHNPDCFF26001-M` |
| Mining cycle that extends | `-M-E{n}` | `IN-PHNPDCFF26001-M-E1` |

- **Mining:** on Task 21 = Yes, a **new `lead` row** is created for the same `base_code` with `parent_lead_id` set and a `-M` marker; its Mining/`M` stage can run in parallel with the parent's Extension. A shared base does **not** consume a second sequence number.
- **Extension loops:** the `-E{n}` counter increments each loop; the first extension is `-E1` (numbering starts at 1 — user decision 2026-07-29).
- Because Mining and Extension can be open at once, the "current stage" for display is resolved from the lead's open `lead_stage` rows (the cycle being viewed); a single stored suffix cannot represent parallel stages, which is why the suffix is derived.

### 13.1 Generation triggers
- **Lead creation:** allocate `base_code`. The auto-generated number is **one counter per year, globally** (decision 2026-07-28) — not per Area, not per Country: `…26001`, `…26002`, `…26003` regardless of how the other segments differ. So the number alone identifies the project within its year.
- **Stage transitions:** the display suffix updates automatically as `lead_stage` rows open/close — no re-generation of the base.
- **Mining (Task 21 = Yes):** new `lead` row, same `base_code`, `parent_lead_id` set, Mining cycle.
- **Extension loop (Task 26 close):** extension counter increments; a new `project_details` cycle row (stage `E{n}`) is created.

### 13.2 Industry Codes — seed for `industries` (feeds the Project ID base)
Auto Comp (COMP), Auto OEM (OEM), Banking (BNK), Building & Construction Goods (BCG), CapEx (CEX), Consumer Goods (CG), EPC (EPC), ETO (ETO), FMCG (FMCG), FMEG (FMEG), Industrial Goods (IG), Information Technology (IT), Machinery & Equipment (ME), Organised Retail (RE), Pharma & Chemical (PH), Textile & Fashion (TX).

### 13.3 Area Codes — seed for `areas` (feeds the Project ID base)
B2B Sales (B2B), B2C Sales (B2C), Distribution (DIST), NPD (NPD), Operations (OPS), Projects (PROJ), Supply Chain (SC), VectorFLOW AMC (VFAMC), VectorFLOW Upgrade (VFUPG), VectorPRO AMC (VPAMC), VectorPRO Upgrade (VPUPG).

### 13.4 Type-of-Project Codes (feeds the Project ID base)
Unlike the other three segments these are **not** a reference table — `type_of_project` is a fixed 6-option dropdown (§4.3), so the codes live in code (`Lead.TYPE_OF_PROJECT_CODES`):

| Type of Project | Code |
|---|---|
| Consulting Full Fledged | `CFF` |
| AMC | `AMC` |
| Upgrade | `UPG` |
| Vectorflow Lite | `VFL` |
| Audit only | `AO` |
| Consulting Lite + No software | `CLNS` |

### 13.5 Country Codes — seed for `countries` (feeds the Project ID base)
India (IN), Indonesia (ID). Maintained in the Django admin like the other reference tables (§4.2).

---

## 14. Lead Attribute Dropdowns (seed reference)

- **Industry:** the 16 rows in §13.2.
- **Domain / Area (multi-select, M2M → `areas`):** the 11 rows in §13.3.
- **Type:** BD, Extension, Mining.
- **Flow of tasks:** 1 DEFAULT (2hr→SnT→Proposal), 2 (2hr→Proposal), 3 (Direct Proposal), 4 (SnT→Proposal).
- **Type of Project (label):** Consulting Full Fledged, AMC, Upgrade, Vectorflow Lite, Audit only, Consulting Lite + No software.
- **Lead status:** In Progress, Hold, Dropped, Completed.
- **Belt:** the 9 rows in §4.2.

---

## 15. Future Scope (Confirmed, Not Built Now)

- **Email / in-app notifications** — the workflow marks trigger points ("mail to accounts" on Tasks 5/10 close); the integration is deferred.
- **Sutradhar integration** ("add project on Sutradhar", Tasks 17/18) — external system; not integrated now.

---

## 16. Open Items (flagged for your confirmation)

1. **Final Project ID format** — you noted you'll finalize the exact composition; §13 captures the working model.
2. **Primary-Domain rule** — with multi-select Domain, which selected Area supplies the Project ID's Area code (working assumption: first-selected/primary).
3. **Type of Project** — currently a pure label; if any option (e.g. "Audit only") should run a reduced task path, that variation isn't defined yet.
4. **Does a spawned Mining lead inherit the parent's `type_of_project`?** It currently does, and only the *flow of tasks* was decoupled on 2026-08-04. `type_of_project` is a Project ID segment (§13.4) and the child deliberately shares the parent's `base_code`, so changing it would change the child's ID — flagged rather than changed.
5. **Mining leads spawned before 2026-08-04** carry a flow copied from their parent and have no Task 0 to correct it. There is no safe automatic repair (the right flow is a per-lead human judgement), so no data migration was written — the flow on those rows needs a manual review.
