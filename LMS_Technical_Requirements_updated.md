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
- **`country` is removed** from the lead and from Project ID generation. **`domain` is now multi-select** (M2M into `areas`).
- **Project ID redesigned:** stable base `{AreaCode}{YY}{Seq}` (e.g. `NPD26001`), generated at **lead creation**, with the **current stage as a derived display suffix** (`-BD`, `-2HR`, `-SnT`, `-IM`, `-E0/-E1…`, `-M`). No country/industry code.
- **Finance (Abhay) is a live role** with three payment-approval gate tasks (7, 15, 28). A "No" at a gate **re-opens the preceding task** — a closed task can be re-opened, and task history retains every close→re-open→close cycle.
- **Resource allocation redesigned as append-only history** — one row per resource per slot, with allocate/release dates and reassignment linkage, to power the resource dashboard (who worked which slot, for how long, including reassignments). Auditor allocation is **split into its own tasks** (18, 25); Task 18 is a **hanging (non-blocking) task**.
- **Conditional 2HR allocation:** Task 3 opens only if Task 2's "manpower support required?" = Yes; otherwise the Default BD Person carries the study.
- **Lead status simplified** to `In Progress / Hold / Dropped / Completed`. **`Hybernation` and `Short Closed` are removed.** Short-close remains as an action that routes to closure and ends as `Completed`.
- **Completion is Finance-gated:** the lead becomes `Completed` only when **both** Task 27 and Task 28 close.
- **Automatic drop** from Task 8 ("Go-ahead = No") — Tasks 6 & 7 remain open on such a drop.

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

> **`countries` is removed** — Country is no longer captured on the lead and no longer feeds the Project ID.

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
| base_code | text, unique | Auto | stable project base, `{AreaCode}{YY}{Seq}` e.g. `NPD26001` — generated at creation, never changes (§13). Shared across a project's parent + Mining child rows. |
| project_id | text | Auto | **stable** lead-level ID stored at creation = `base_code` (+ `-M` for a Mining lead), **no stage suffix** so it stays constant for the lead's life (`NPD26001`, `NPD26002-M`) — decision 2026-07-27. The stage-suffixed variants live per-row on `lead_stage`/`task_details`. |
| parent_lead_id | FK → `lead`, nullable | Auto | set on a Mining-spawned lead, pointing at the parent it originated from (Task 21) |
| company_name | text | Yes | |
| project_name | text | Yes | |
| industry | FK → `industries` | Yes | §4.2 |
| domain | **M2M → `areas`** | Yes | **multi-select.** The **primary (first-selected)** area supplies the Project ID's Area code (§13). *(Assumption flagged: primary-domain rule for the code.)* |
| division | text | No | |
| scope | text | No | |
| assigned_to | FK → users, nullable | Yes for Lead-Manager-created; NULL for Marketing-created | "Default BD Person" throughout the workflow = this field. No "Not Assigned" value is stored; NULL means unassigned. |
| lead_type | dropdown (`BD`/`Extension`/`Mining`) | Yes | macro entry point (§4.3.4) |
| flow_of_tasks | dropdown (4 options) | Yes | which stages run (§4.3.4). Applies to BD/Mining; ignored for Extension. |
| type_of_project | dropdown (6 options) | Yes | **label only** — reporting/filter; does not affect the task path. Options: Consulting Full Fledged, AMC, Upgrade, Vectorflow Lite, Audit only, Consulting Lite + No software. |
| status | dropdown | Auto | `In Progress` / `Hold` / `Dropped` / `Completed` (§4.3.2) |
| lead_start_dt | date/timestamp | Auto | when the lead/cycle was created (lifecycle start) |
| lead_end_dt | date/timestamp, nullable | Auto | set when the lead first reaches a terminal status (`Completed` or `Dropped`); NULL while active |
| drop_remark | text | No | optional reason captured on drop (manual or Task-8 auto-drop) |
| + audit columns (§4.0) | | | `created_by` is a **semantic** creator (Marketing vs Lead Manager) — required |

> **Derived for the lead's live display; snapshotted per row:** the lead's *current* displayed Project ID (`base_code [+ "-M"] + "-" + current_stage_code`) is computed on request from the lead's open stage(s). In addition (decision 2026-07-27) each `lead_stage` and `task_details` row stores a `project_id` **display snapshot** for its own stage, so the value is visible directly in those tables. Neither the derived string nor the stored snapshot is **ever used as a join key** — joins key on numeric PKs (§13).

#### 4.3.1 Marketing-sourced leads & workflow start
- Marketing adds a lead with `assigned_to` hidden; on save it is NULL and no Task 1 opens.
- Marketing can view/edit their created leads (all fields except `assigned_to`) at any time.
- Lead Admin assigns an owner to a Not-Assigned lead; that assignment **starts the workflow** (opens Task 1 — or Task 16 for the Direct Proposal flow).
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
| Mining | Task 1 with `-M` marker (§13); a Mining lead row is created off a parent via Task 21 |
| Extension | Enters at Task 22 (Extension Proposal); Flow of tasks not applied |

**Flow of tasks** (BD/Mining):

| Flow | Intro (1–2) | 2HR (3–8) | SnT (9–15) | Proposal (16→) |
|---|---|---|---|---|
| 1 · DEFAULT | open | open | open (via Task 8 branch) | open |
| 2 · 2hr → Proposal | open | open | skipped | open (Task 8 SnT=No → Task 16) |
| 3 · Direct Proposal | **skipped** | skipped | skipped | opens at Task 16 |
| 4 · SnT → Proposal | open | skipped | open | open |

Skipped stages have their tasks set to `skipped` at creation so the tracker and path stay accurate. In-flow branch questions (Tasks 8, 12, 13) still operate for the paths that reach them.

### 4.4 `lead_stage`

The stage history — drives the dashboard and the Project ID suffix. **Multiple rows can be open (`In Progress`) at once** for a lead (Mining ∥ Extension).

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| lead_id | FK → `lead` | |
| project_id | text | **stored display snapshot** for this stage (`base_code` + this stage's suffix, e.g. `NPD26001-IM`), stamped when the row is created (decision 2026-07-27). Display only — **never a join key** (§13). |
| stage | dropdown | `BD`, `2HR`, `SnT`, `IM` (Implementation), `E0`/`E1`/`E2`… (Extension loops), `M` (Mining), `Closure` |
| stage_start_dt | date/timestamp | when the first task of this stage opens |
| stage_end_dt | date/timestamp, nullable | when the stage's tasks all close/skip |
| status | dropdown | `in_progress` / `closed` (`skipped` if the flow routes around the whole stage) |
| + audit columns | | |

The extension loop counter is encoded in the stage value: the **first** extension is `E0`, then `E1`, `E2`… (matches the Project ID suffix, §13).

### 4.5 `task_details`

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| task_no | integer | **canonical workflow step 1–28** (drives skip/tracker/routing logic) |
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

### 4.7 `resource_allocation` (append-only allocation history)

This replaces the wide single-row allocation table. **One row per resource, per slot, per stage** — never overwritten. This is what powers the resource dashboard: who worked which slot, on which stage, from when to when, and how allocation changed (reassignments).

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| task_id | FK → `task_details` | the allocation task that created this row (3 / 10 / 17 / 18 / 24 / 25) |
| stage_id | FK → `lead_stage` | which stage the resource is working |
| lead_id | FK → `lead` | denormalized for reporting |
| slot | dropdown | `execution_red`, `execution_brown`, `white`, `auditor_1`, `auditor_2` |
| user_id | FK → users, nullable | the allocated person; **NULL when `is_tbd` = true** |
| names | text | denormalized display-name snapshot of the occupant (`user.name`, or `TBD`/empty) — for dashboards/reports without a join (decision 2026-07-27); the FK stays the source of truth |
| is_tbd | boolean, default false | **White** may be allocated as TBD (to-be-decided) |
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

**Extension prefill:** when an Extension loop's team allocation opens (Task 24), its slots are prefilled from the previous cycle's allocations (Implementation for the first extension, the previous Extension loop afterwards) — the Resource Manager only adjusts what changed (each change is still an append: release old + allocate new).

### 4.8 `project_details` (per-cycle commercials)

The commercial record captured for the project, one row per implementation/extension/mining cycle (keyed to the cycle's stage). Detailed fee-cap / tranche / invoice-block capture lives in task field data (§4.6); this table holds the headline commercials for reporting and the Project Closure screen.

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| lead_id | FK → `lead` | |
| stage_id | FK → `lead_stage` | the cycle this commercial record belongs to (`IM`, `E0`/`E1`…, `M`) |
| project_id | text | the derived display Project ID for this cycle at the time (e.g. `NPD26001-IM`, `NPD26001-E0`) — stored for the closure screen/history |
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

### 4.11 `workflows`
name; type (`BD` / `Mining` / `Extension`); workflow (JSON — full task graph: order, assignment rule, checklist items, extra-field schema, stage, open-conditions, branch routing); status (active/inactive). Editable from Django Admin. **No workflow logic hardcoded outside this table.** The branch/route conditions support multi-condition (AND) branches (e.g. Task 12's "re-presentation = No AND moved-to-next-stage = Yes").

### 4.12 `workflow_trigger_config` (date-offset triggers)
For tasks that open "X days/weeks/months before/after a date captured earlier" (Tasks 3, 10, 17, 18, 21, 22, 27). Fields: workflow FK, task_no, reference_task_no, reference_field_key, offset_days (signed — negative = before, positive = after), is_active. A scheduled job opens the task when `today` crosses the computed date. **Same-day opening required** (run the job early/frequently). Task 21 (Mining) supports the two-rule variant (X months after engagement start; Y months if duration < 6 months) via two config rows.

---

## 5. BD → Extension → Mining Workflow — Full Task Table (1–28)

Authoritative sequence, transcribed from `lms_updated_wf.csv`. Encode as the `workflows.workflow` JSON seed. **"Shailesh" = Resource Manager; "Accounts (Abhay)" = Finance.** Allocation-task assignees marked "Shailesh + Default BD" have **two assignees**; either can complete the allocation.

| # | Task | Assigned To | Stage | Checklist | Extra Fields / Branch | Notes |
|---|---|---|---|---|---|---|
| 1 | Introduction and First Meeting | Default BD Person | BD | 1.1 Vector's Intro Email · 1.2 Intro presentation to decision maker | Key stakeholder contact (Name·Role ×3 + add more); **Is 2HR study agreed?** If Yes → open Task 2 | First task; opens on `assigned_to` set (§4.3.1). Skipped when Flow = Direct Proposal. |
| 2 | 2HR Study Agreement | Default BD Person | BD | 2.1 Area of work / objective agreed | Expected start date of next stage; **Is manpower support required from the resource-allocation team?** If **Yes** → capture Manpower (PM + additional; Brown = number, White = number) and **open Task 3 against Shailesh**. If **No** → skip Task 3. | Conditional allocation branch. |
| 3 | 2Hr Study & Presentation Team Allocation | Shailesh and/or Default BD Person | 2HR | *allocation task* | Execution Red; Execution Brown; White (**TBD allowed**) | Opens per trigger-config (X weeks before Task 2's expected start). **Only opens if Task 2 manpower = Yes.** Creates `resource_allocation` rows (2HR). |
| 4 | 2HR Study Initiation | Default BD Person | 2HR | 4.1 Email sent to client to initiate study | — | |
| 5 | 2Hr Study & Presentation | Execution Red (from Task 3) — **or Default BD Person if Task 3 skipped** | 2HR | 5.1 Study Plan · 5.2 NDA · 5.3 Study Interactions · 5.4 Data Received · 5.5 2Hr Presentation date confirmed · 5.6 2Hr Presentation done | Date of 2Hr presentation (linked to 5.5); Key stakeholders mapped (Name·Role ×3 + add more) | Resource occupancy: 2HR. *Note: mail to accounts on close — deferred.* |
| 6 | 2Hr Study Reimbursement | Execution Red (from Task 3) / Default BD | 2HR | 6.1 Reimbursement Expenses Invoiced · 6.2 Reimbursement Expenses Received | Delay reasons if any; Expected date of receipt | Opens after 5.6. |
| 7 | 2Hr Study Reimbursement — **Accounts Approval** | **Accounts (Finance/Abhay)** | 2HR | — | **Payment received against all invoices?** Yes → close. No → close + add remark + **re-open Task 6**. | Finance gate (§5.10). |
| 8 | Solution Blueprint Confirmation | Default BD Person | 2HR | — | **(a) Go-ahead received from client?** No → **status = Dropped**, no further tasks, **Tasks 6 & 7 stay open**. Yes → ask (b). **(b) Is Solution Blueprint required?** Yes → Task 9. No → close & **open Task 16** (Project Proposal Submission). | Opens after 5.6. Drop + SnT branch. |
| 9 | Solution Blueprint Proposal | Default BD Person | SnT | 9.1 Proposal Submitted · 9.2 Proposal terms agreed | Fee for engagement (allow zero); Manpower (Brown, White); Expected start date of next stage; Number of tranches of payment | Opens after 8(b) = Yes. |
| 10 | Solution Blueprint Team Allocation | Shailesh + Default BD Person | SnT | *allocation task* | Execution Red; Execution Brown; White (**TBD allowed**) | Opens per trigger-config (X days before Task 9's expected start). Creates `resource_allocation` (SnT). *Mail to accounts on close — deferred.* |
| 11 | Solution Blueprint Study Initiation | Default BD Person | SnT | 11.1 Email sent to initiate Solution Blueprint study | — | |
| 12 | Solution Blueprint | Execution Red (from Task 10) | SnT | 12.1 Engagement Start · 12.2 Initial Invoice raised · 12.3 Data Receipt · 12.4 Presentation Dates locked · 12.5 SnT Workshop Done · 12.6 Completion Invoice | Presentation date (linked 12.4); Invoices Raised block (Invoice No / Value / Date ×3 + add more); **Re-presentation required?** Yes → Task 13, else ask; **Has project moved to the next stage?** Yes → open **Task 14 & Task 16**; No → open **Task 27**. | Resource occupancy: SnT. Multi-condition branch. |
| 13 | Solution Blueprint Repeat Presentation | Execution Red (same block as Task 12, default) | SnT | 13.1 Presentation Dates locked · 13.2 SnT Workshop Done | Presentation date (linked 12.1); **Is re-presentation required?** Yes → Task 13 (loops), else ask; **Has project moved to next stage?** Yes → Task 14 & Task 16; No → Task 27. | Loops on itself. |
| 14 | Solution Blueprint Payment | Execution Red (same block, default) | SnT | 14.1 Fixed fee invoices received · 14.2 Reimbursement Expenses Invoiced · 14.3 Reimbursement Expenses Received | Delay reasons if any; Expected date of receipt | |
| 15 | Solution Blueprint Payment — **Accounts Approval** | **Accounts (Finance/Abhay)** | SnT | — | **Payment received against all invoices?** Yes → close. No → close + remark + **re-open Task 14**. | Finance gate. |
| 16 | Project Proposal Submission | Default BD Person | SnT | 16.1 Proposal Submission · 16.2 Terms agreed | Planned Engagement Start Date; Period (months); Planned Engagement End Date (auto = start + period); Fixed Fee (blocks generated per period-month, capturing fee + manpower); Total Variable Fee Cap; Variable Milestone Fee Cap; Variable Performance Fee Cap; Manpower (Brown, White) | Entry point for Flow = Direct Proposal / 2hr→Proposal (via Task 8 No). |
| 17 | Project Team Allocation | Shailesh + Default BD Person | Implementation | *allocation task* | Execution Red; Execution Brown; White (**TBD allowed**) | Opens per trigger-config (X days before Task 16's Planned Engagement Start Date). Creates `resource_allocation` (Implementation). *Add to Sutradhar — deferred.* |
| 18 | Project Auditor Allocation | Shailesh + Default BD Person | Implementation | *allocation task* | Auditor 1; Auditor 2 | **Hanging task** — non-blocking; can be completed in parallel and does not hold up the sequence. Opens with Task 17's trigger. *Add to Sutradhar — deferred.* |
| 19 | Project Initiation | Default BD Person | Implementation | 19.1 Email sent to initiate Project | — | |
| 20 | Implementation | Execution Red (from Task 17) | Implementation | 20.1 Handover & Engagement Start · 20.2 PO from Customer · 20.3 First Fixed fee invoice raised · 20.4 Agreement/Contract · 20.5 Variable Parameter Finalisation · 20.6 Variable Baseline Sign-off · 20.7 Addendum Agreement · 20.8 Expected variable fee over eligible period submitted | Actual Engagement Start Date; Duration (months) *(prefilled & editable from Task 16)*; Modified Planned Engagement End Date (auto = actual start + duration); Fixed Fee + Variable Fee Caps (Total/Milestone/Performance) *(prefilled & editable from Task 16)*; Actual Fixed fee invoice date; Variable Fee Start Date | Resource occupancy: project (shown until Task 27). **On close:** create the `project_details` cycle row (stage `IM`) and enable the downstream Mining (Task 21) and Extension (Task 22) triggers. |
| 21 | Exploit Mining Opportunities | Default BD Person | BD (Mining origin) | 21.1 Visit to client location · 21.2 Discussion with key stakeholders · 21.3 Area for improvement identified · 21.4 Pitch Proposal to Client? | **Is client go-ahead received for a new project?** Yes → **spawn a new lead row (same `base_code`, `parent_lead_id` = this lead), open a `-M` Mining cycle, and start a fresh BD flow from Task 1**. No → close task. | Opens X months after Task 20's engagement start (Y months if Task 20 duration < 6 months). Mining stage is `M` until 2HR starts. **Runs in parallel with any Extension.** |
| 22 | Extension Proposal | Default BD Person / Execution Red | Extension | 22.1 Discussion with client stakeholders · 22.2 Identify area of extension · 22.3 Solution design & preparation · 22.4 Pitch Extension proposal | **Extension approved?** Yes → Task 23. No → Task 27. | Opens X months before the engagement end date from **Task 20 or Task 26** (extension-of-extension). Entry point for Type = Extension. |
| 23 | Extension Detail | Execution Red | Extension | 23.1 Addendum Agreement · 23.2 Expected variable fee over eligible period submitted | Extended Engagement Start Date; Period (months); Planned Ext. Engagement End Date (auto); Fixed Fee (blocks per period-month) — *if a resource is engaged beyond the planned end date, allow **zero** fee to keep them engaged*; Total/Milestone/Performance Variable Fee Cap; Manpower (Brown, White) | Opens if Task 22 = Yes. |
| 24 | Project Extension Team Allocation | Shailesh + Default BD Person | Extension | *allocation task* | Execution Red; Execution Brown; White (**TBD allowed**) | Creates `resource_allocation` (Extension), prefilled from the previous cycle. |
| 25 | Project Extension Auditor Allocation | Shailesh + Default BD Person | Extension | *allocation task* | Auditor 1; Auditor 2 | Auditor allocation for the extension. |
| 26 | Extension Implementation | Execution Red (from Task 24) | Extension | 26.1–26.8 (same set as Task 20) | Actual Ext. Engagement Start Date; Duration (months) *(prefilled & editable)*; Modified Planned Ext. Engagement End Date (auto); Fixed Fee + Variable Fee Caps *(prefilled & editable)*; Actual Fixed fee invoice date; Variable Fee Start Date | Opens per the extended engagement start date (Task 23). Resource occupancy: project (until Task 27). **On open, give Shailesh short-close access** (§9.2). **On close:** create the next `project_details` cycle row (stage `E{n}`); the extension loop counter increments (`E0 → E1 → …`); then loops back to Task 22 for a possible further extension. |
| 27 | Project Closure | Execution Red | Closure | 27.1 All fixed fee received · 27.2 All variable fee received · 27.3 All reimbursements received | Final closed (checkbox = Yes, mandatory) | Opens when **any** of: engagement end date (Task 20) reached; Task 22 "Extension approved = No"; Shailesh short-closes; Task 12/13 "moved to next stage = No". **On open: release the currently allocated resources** (§4.7). Closing this **alone does not complete the lead** — Task 28 must also close. |
| 28 | Project Closure — **Accounts Approval** | **Accounts (Finance/Abhay)** | Closure | — | **Payment received against all invoices?** Yes → close. No → close + remark + **re-open Task 27**. | Finance gate. **When both Task 27 and Task 28 are closed → lead & cycle status = `Completed`.** |

**Cross-cutting rules**
- "Default BD Person" = `lead.assigned_to`.
- Allocation tasks (3, 10, 17, 18, 24, 25) have no checklist — status only until the Resource Manager (with the BD co-assignee) submits the allocation, which closes the task and opens the next, assigning it to the selected Execution Red.
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
Any task can be reassigned; the new assignee gets edit access and the previous assignee reverts to view-only. For **allocation slots**, reassignment is an append in `resource_allocation` (release old + allocate new, §4.7) so resource history is preserved.

### Hold / Unhold
Lead-level hold holds all open tasks; unholding restores them. Held tasks are non-editable. Every transition records timestamp + user (`lead_hold`, `task_hold`). Hold/Unhold/Drop each open a popup with an **optional remark**; remarks are stored per cycle, appended to the activity log, and shown as a banner. A **Hold Items** menu provides Hold Tasks and Hold Leads views.

---

## 7. Resource Allocation Flow (Detail)

1. An allocation task (3 / 10 / 17 / 18 / 24 / 25) opens per trigger-config (§4.12). Task 3 opens **only if** Task 2 manpower = Yes.
2. The Resource Manager (Shailesh) — who can see the lead-flow screen and where allocation is needed — opens the allocation via a CTA/popup, alongside the Default BD co-assignee.
3. The form shows the lead's details (incl. the upstream manpower figure) above the slots. Filling a slot inserts an `allocated` `resource_allocation` row per resource (White may be `is_tbd`).
4. On submit, the allocation task closes and the next task opens, assigned to the chosen Execution Red.
5. **Reassignment** = release the old row + insert a new one linked by `replaces_id`.
6. **Release**: 2HR/SnT resources release when their stage closes; Implementation/Extension resources release when **Task 27 opens**.
7. Reporting screen: all rows with status (`allocated`/`released`), over-allocation (red) and under-allocation (amber) indicators, and — for the dashboard — days worked per resource per stage, derived from `allocated_on`/`released_on`, including reassignment chains.

---

## 8. Follow-Up Requests
Anyone who can view a lead may add a follow-up (lead Follow-up tab or the global Add Follow-up). Fields: Lead, assignee (any Employee-role user incl. self), follow-up date (no past dates), remark. Surfaced on the **Other Tasks** screen for the assignee.

---

## 9. Resource Manager & Finance Screens

### 9.1 Resource Allocation
List + edit as in §7, with the lead-detail/manpower context, status per row, and the over/under indicators. The Resource Manager reaches allocation from the lead-flow screen via a CTA that opens the allocation popup.

### 9.2 Project Closure & Short-Close
**List view:** one row per `project_details` cycle (§4.8) — implementation, each extension loop, and any mining cycle shown together, each with its Project ID, stage, commercials, and status.

**Short-close:** when Task 26 opens, Shailesh is granted short-close access on the current cycle. Triggering it opens a dialog requiring a **compulsory remark**, then in one transaction: opens **Task 27**, sweeps every other `open`/`hold`/`pending` task under the lead to `skipped` (flagged as short-closed for a distinct "skipped because short-closed" note), releases currently allocated resources, and logs the remark. **There is no separate Short Closed status** — the cycle proceeds through Task 27 and Task 28 and ends `Completed`, with the short-close remark and swept-task notes retained for traceability.

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

The Project ID is now **stage-legible**: reading it tells you where the project stands. It is a stable base plus a derived stage suffix.

**Base:** `{AreaCode}{YY}{Seq}` — the primary Domain/Area code (via the lead's primary `domain`), a 2-digit year, and a 3-digit incrementing sequence. Example: `NPD26001`. **No country or industry code.**

- Generated automatically at **lead creation**; the base never changes for that project.
- Because `domain` is multi-select, the **primary (first-selected)** area supplies the code. *(Assumption flagged for confirmation.)*
- Stored as `lead.base_code` (the stable key). The **suffixed display string is derived** for the lead's live view; per decision 2026-07-27 a per-stage snapshot is also stored on `lead_stage.project_id` / `task_details.project_id`. Neither is ever used as a join key.

**Display:** `base_code [+ "-M"] + "-" + {current_stage_code}`

| Stage | Suffix | Example |
|---|---|---|
| BD | `-BD` | `NPD26001-BD` |
| 2HR | `-2HR` | `NPD26001-2HR` |
| SnT | `-SnT` | `NPD26001-SnT` |
| Implementation | `-IM` | `NPD26001-IM` |
| Extension loop n (first = 0) | `-E{n}` | `NPD26001-E0`, `NPD26001-E1` |
| Mining cycle | `-M` | `NPD26001-M` |
| Mining cycle that extends | `-M-E{n}` | `NPD26001-M-E1` |

- **Mining:** on Task 21 = Yes, a **new `lead` row** is created for the same `base_code` with `parent_lead_id` set and a `-M` marker; its Mining/`M` stage can run in parallel with the parent's Extension.
- **Extension loops:** the `-E{n}` counter increments each loop; the first extension is `-E0`.
- Because Mining and Extension can be open at once, the "current stage" for display is resolved from the lead's open `lead_stage` rows (the cycle being viewed); a single stored suffix cannot represent parallel stages, which is why the suffix is derived.

> **Open item (flagged):** the exact final composition of the Project ID is subject to your confirmation (you said you'll finalize it). The working model is base = `Area+YY+Seq`, mutable stage suffix, `-M` for mining, `-E{n}` for extension loops, with the primary Domain supplying the Area code.

### 13.1 Generation triggers
- **Lead creation:** allocate `base_code` (`{AreaCode}{YY}{Seq}`); the Sequence increments per Area+Year.
- **Stage transitions:** the display suffix updates automatically as `lead_stage` rows open/close — no re-generation of the base.
- **Mining (Task 21 = Yes):** new `lead` row, same `base_code`, `parent_lead_id` set, Mining cycle.
- **Extension loop (Task 26 close):** extension counter increments; a new `project_details` cycle row (stage `E{n}`) is created.

### 13.2 Industry Codes — seed for `industries`
Auto Comp (COMP), Auto OEM (OEM), Banking (BNK), Building & Construction Goods (BCG), CapEx (CEX), Consumer Goods (CG), EPC (EPC), ETO (ETO), FMCG (FMCG), FMEG (FMEG), Industrial Goods (IG), Information Technology (IT), Machinery & Equipment (ME), Organised Retail (RE), Pharma & Chemical (PH), Textile & Fashion (TX).

> Industry is retained on the lead for reporting/filtering, but its code is **no longer used in the Project ID**.

### 13.3 Area Codes — seed for `areas` (feeds the Project ID base)
B2B Sales (B2B), B2C Sales (B2C), Distribution (DIST), NPD (NPD), Operations (OPS), Projects (PROJ), Supply Chain (SC), VectorFLOW AMC (VFAMC), VectorFLOW Upgrade (VFUPG), VectorPRO AMC (VPAMC), VectorPRO Upgrade (VPUPG).

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
