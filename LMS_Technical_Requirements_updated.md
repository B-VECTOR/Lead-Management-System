# Lead Management System (LMS) — Technical Requirements Document

**Version:** 16.0
**Status:** Draft for build
**Related document:** `LMS_PRD.docx` (business-facing PRD)

**Changelog v16.0:**
- **Hold / Unhold / Drop remark capture (§4.3, §4.9, §6):** putting a lead on hold, unholding it, dropping it, and holding/unholding a task now each open a **popup that asks the acting user for a remark**. The remark is **optional** — the action proceeds with or without one.
  - New columns: `lead_hold.remark`, `lead_hold.unhold_remark`, `task_hold.remark`, `task_hold.unhold_remark`, and `leads.drop_remark`.
  - A **lead-level** hold/unhold copies its remark onto the `task_hold` rows it creates/releases (the ones flagged as held via the lead), so task history stays self-explanatory.
  - Remarks are appended to the activity-log description (e.g. `Lead put on hold — client budget freeze`).
  - Display: the active hold remark is shown as an amber banner on the Lead Detail and Task Detail pages while the item is on hold; the drop remark is shown as a red banner on dropped leads. The lead hold-history API also returns both remarks per hold cycle.
  - API: the existing `POST /leads/{id}/hold|unhold|drop/` and `POST /tasks/{id}/hold|unhold/` actions accept an optional `{"remark": "..."}` body.
- **Lead Tracker column (§4.3.3):** the Leads list gains a **"Tracker"** column showing per-lead workflow progress driven by task closure — `closed/total` task instances, a percentage, and a progress bar colored by lead status (green = In Progress/Complete, amber = On Hold, red = Dropped). `skipped` tasks are excluded from the total; extension/repeat cycles add instances. Exposed by the API as `task_progress {total, closed, percent}` on each lead.
- **Filterable Leads-table headers (§4.3.3):** every column of the Leads list is filterable from a filter row under the headers — free-text search for Company/Project and Project ID; dropdowns (populated from the loaded data) for Industry, Domain, Owner (incl. "Not Assigned"), Current Task (sorted numerically by task number), and Status. Filters combine with AND semantics; a "Clear filters" action resets them. This replaces the previous single status-filter dropdown above the table.

**Changelog v15.0:**
- **Task 7 & 8 — "Has project moved to the next stage?" field added (§5):** both Solution Blueprint (Task 7) and Solution Blueprint Repeat Presentation (Task 8) now capture a new **Yes/No field** `moved_to_next_stage` ("Has project moved to the next stage?") that is shown and required only when re-presentation is **not** required (i.e. when `re_presentation_required` / `re_presentation_required_again` = "No").
- **Task 7 & 8 — branching logic extended to three paths (§5):**
  - **Re-presentation required = Yes** → opens Task 8 (unchanged).
  - **Re-presentation required = No AND moved to next stage = Yes** → opens **Task 9 (Solution Blueprint Payment) AND Task 10 (Project Proposal Submission) simultaneously**. Previously only Task 9 was opened in this scenario.
  - **Re-presentation required = No AND moved to next stage = No** → opens **Task 17 (Project Closure) directly**, short-circuiting the remaining workflow. Previously this path did not exist; a "No" answer always proceeded to Task 9.
- **Workflow engine — multi-condition branch support (§4.11):** the workflow JSON's `on_close.branches` array now supports a `conditions` key (an array of `{field, equals}` objects, all of which must be satisfied — AND semantics) in addition to the existing single `field`/`equals` keys. Both formats are evaluated correctly by the task engine.

**Changelog v14.0:**
- **`users.employee_id` is unique** — enforced at both the form/serializer and DB level, with a user-friendly duplicate message.
- **Users can hold multiple roles** — the user form's role control is now a multi-select; each selected role is a Django Group membership. Permission checks are any-match across a user's roles; where scopes differ (e.g. Lead Admin sees all leads, Lead Manager sees own), the user gets the union of their roles' scopes.
- **New task status `skipped` (§4.4):** when a branch condition routes around tasks so they can never open (Solution Blueprint = No skips Tasks 6–9; Re-presentation = No skips Task 8; Extension approved = No skips Tasks 14–16), their status flips from `pending` to `skipped` so the path taken is explicit. On lead completion, any still-pending tasks also become `skipped`.
- **Pending tasks are not listed** — task lists (My Tasks, the lead's workflow view) only show tasks that have actually opened (`open` / `hold` / `closed`) plus `skipped` ones; `pending` rows are hidden.
- **Resource allocation — extension handover (§4.7):** when Task 16 (Extension Implementation) closes, the **superseded previous cycle's allocation row auto-closes** (the Implementation row on the first extension, the previous Extension row on later ones) instead of staying open until final closure. The **new Extension allocation row is prefilled with the previous cycle's allocated resources** when it is created at Task 15, so the Resource Manager only adjusts what changed.
- **Under-allocation indicator (§4.7):** alongside the red "exceeded" flag, an **amber indicator** shows when the Resource Manager allocates **fewer** resources than the required man-power.
- **User-friendly validation errors:** task-field errors reference the field's display label (e.g. `"Expected start date of next stage" is required.`) — never internal field keys.
- **UX:** Save as Draft and Save & Complete both return the user to the My Tasks page; checklist tickmarks toggle instantly on click (optimistic update, larger touch target).

**Changelog v13.0:**
- **Audit columns on every table (§4.0):** `created_by`, `created_on`, `updated_by`, `updated_on` — `updated_by`/`updated_on` are nullable and filled on every update; timestamps are stored automatically. Existing `created_at`/`updated_at` fields are renamed to `created_on`/`updated_on`.
- **Reference tables (§4.2):** `countries`, `industries`, `areas`, and `belts` each gain a `status` column (`active`/`inactive`, default `active`); dropdowns offer only active rows.
- **`belts` gains an `order` column** used to sort the Acting Belt Level / Belt dropdowns.
- **`users.role` removed (§4.1):** role management now uses Django's default auth **Groups** table — one group per role; the effective role is derived from group membership in code.
- **`leads.assigned_to` (§4.3):** confirmed as a plain **nullable FK** — no "Not Assigned" placeholder value is ever stored; unassigned leads have `NULL` and the "Not Assigned" label is presentation-only (handled in backend/frontend code).
- **Data-model tables:** rows previously grouped with "/" (e.g. `created_at / updated_at`, `opened_at / closed_at`, `lead_id / task_id`) are now listed as separate rows; `lead_hold` and `task_hold` are documented as two separate tables (§4.9).
- **Resource allocation (§4.7):** the "TBD allowed" note on `white` is removed; `project_member6`–`project_member10` added (10 project-member slots total), on the table and the allocation form.
- **Checklists (§6):** a checklist item can be checked/unchecked directly by clicking its tickmark (in addition to the edit-popup flow).
- **Menu naming (§6):** the hold review menu is named **"Hold Items"** (with Hold Leads and Hold Tasks views).

**Changelog v12.0:**
- Confirmed: the lead's **Domain/Area field is single-select** (a plain FK into `areas`), matching how it's used for Project ID generation. This resolves the last open question — no many-to-many join table is needed. No open items remain.

**Changelog v11.0:**
- Corrected **Task 17 (Project Closure)'s opening condition** per the updated workflow sheet: it now opens when **any** of — engagement end date (from Task 12) reached, Task 13's "Extension approved" = No, or the Resource Manager short-closes the project — is true. Previously modeled as an AND between the first two conditions; the source sheet now explicitly uses "or."

**Changelog v10.0:**
- **New `project_details` table (§4.8)** — the authoritative history of every Project ID a lead has ever had, one row per implementation/extension cycle. Fixes the earlier design gap where `leads.project_id` and `resource_allocation` only ever held the *current* value, silently losing history on every Task 16 (Extension Implementation) closure.
- `project_details` has its own `status` (`In Progress` / `Extended` / `Complete`) that mirrors the lead: it flips to `Complete` when the lead's final closure (Task 17) happens.
- **`resource_allocation` auto-close rules added (§4.7):** `status` now transitions to `Closed` automatically (no manual action) as soon as resources are freed up — `2HR` closes when Task 4 closes; `SNT` closes when Task 9 closes; `Implementation` and every `Extension` cycle's allocation close together only when the lead's overall status becomes `Complete`.
- **Resource Allocation & Project Closure screens (§9)** now list one row per `project_details` entry — so a lead's first-time project and every subsequent extension are all visible together, each with its own Project ID and status.
- Updated the BD workflow task table (Task 4, 9, 12, 16, 17) to reflect these new behaviors.

**Changelog v9.0:**
- The **user form's `domain` field** (competency domain) now sources its dropdown from the **same `areas` reference table** used by the lead's `domain`/Area field — a single shared lookup table, not a separate one as previously modeled. This resolves the earlier open item about the two "Domain" concepts being distinct.

**Changelog v8.0:**
- **Acting Belt Level and Belt** on the user form are now dropdowns sourced from a new **`belts` reference table** (id, name — no code needed, since Belt isn't used in Project ID generation). Seed values: `Potential Black`, `Black`, `White`, `Brown`, `Red`, `Potential Brown`, `Potential White`, `Potential Red`, `NA`.
- Both `users.acting_belt_level` and `users.belt` are independent foreign keys into the same `belts` table.
- §4.2 (Reference Tables) renamed/expanded to cover all four reference tables: `countries`, `industries`, `areas`, `belts`.

**Changelog v7.0:**
- **Country, Industry, and Area (Domain) are now formal reference tables** (`countries`, `industries`, `areas`), each with `id`, `name`, `code` — replacing the earlier plain dropdown/hardcoded-lookup approach. See new §4.2.
- The lead form's Country, Industry, and Domain/Area fields are now foreign keys into these tables; their dropdown options are populated by querying the tables, not from a hardcoded list.
- Project ID generation (§13) now explicitly reads the `code` from the linked reference row via each FK, rather than from a hardcoded lookup dict.
- Renumbered the rest of §4 (data model subsections) to accommodate the new §4.2; all cross-references in this document have been updated accordingly.
- Flagged one new open item: the original source requirement described the lead's Domain field as a "multi-select checklist," which doesn't fit a single FK to `areas`. This build assumes a single Domain/Area value per lead (matching how it's used for Project ID generation) — see Open Questions.

**Changelog v6.0:**
- Synced with the PRD: the `leads` field table now includes a **Required** column, and a new **Status Flow** table (§4.3.2) documents how each lead status is set (system vs. manual, auto-only transitions). These mirror the Lead Fields / Status Flow tables added to the PRD.
- No functional changes — this is a documentation-consistency update.

**Changelog v5.0:**
- Confirmed: the non-extension portion of `project_id` (country/industry/area/year/sequence) is **locked in at Task 12** and reused as-is on every Task 16 regeneration — it does **not** get recomputed even if the lead's industry/area/country fields are edited afterward. Only the extension suffix changes on regeneration. This was the last open question; none remain outstanding.

**Changelog v4.0:**
- Project ID is now generated/regenerated on **either** Task 12 (Implementation) **or** Task 16 (Extension Implementation) closing, not just Task 12.
- Added a new `leads.extension` field (2-digit, zero-padded, default `00`) that increments by one every time Task 16 closes; this value feeds directly into the Project ID's extension suffix.
- Added a new `leads.country` dropdown field (`India` / `Indonesia` for now); the Project ID's country-code component is taken directly from this field rather than inferred.
- Clarified that the non-extension portion of the Project ID should be computed once (at Task 12) and reused on every regeneration, with a note to confirm this with the business.

**Changelog v3.0:**
- `date_of_joining` confirmed exempt from the "no past dates" rule — past dates are allowed (it's inherently historical).
- Notification requirements (email / in-app) for task opening, reassignment, and follow-up due dates: **confirmed as required, but future scope** — not built in this phase.
- Task-trigger scheduled job latency confirmed: a task must open the **same day** its trigger date is reached — no next-day delay.
- **Marketing** scope expanded: in addition to adding leads, Marketing can **view and edit the leads they created** (excluding the owner/`assigned_to` field, which remains Lead Admin's to set).
- All prior open questions are now resolved; see §16 (empty — retained for future items only).

**Changelog v2.0:**
- Corrected role attribution: all "Finance/Shailesh" resource-allocation and project-closure behavior belongs to the **Resource Manager** role. **Finance** is a distinct role, out of scope for this phase.
- Added **Marketing** role behavior: can add leads only, cannot assign an owner; Lead Admin assigns the owner afterward, which is what starts the workflow.
- Added global field validation rules (numeric, date).
- Added full Project ID industry/area code lookup (from source sheet).
- Added configurable task-trigger-offset design for "opens X days before ..." rules.
- Marked activity log field-level detail as future scope (not an open question).

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
| Admin | Django Default Admin Panel (used for User Management, Role Management, Workflow configuration, and Task Trigger configuration) |
| Layout | Mobile-responsive throughout |

---

## 2. Roles

1. User Management
2. Lead Admin
3. Lead Manager
4. Marketing
5. Resource Manager
6. Finance
7. Employee (default — applies to all users in addition to their specific role)

> **Role storage (v13):** roles are stored as **Django auth Groups** (one group per role above) — there is no role column on the user table. See §4.1.

> **Role clarification (v2):**
> - Everywhere the earlier draft said **"Finance"** performs resource allocation, receives allocation records, or owns the Project Closure screen ("Shailesh"), that functionality belongs to the **Resource Manager** role. This has been corrected throughout this document.
> - The **Finance** role itself has no defined screens or permissions in this phase — its scope is **future work** and is not part of this build.

---

## 3. Global Field Validation Rules

Apply these rules to every numeric and date field across the system (lead form, task extra fields, resource allocation, project closure) unless a more specific rule is called out elsewhere:

- **Numeric fields:** zero (`0`) is a valid value; negative values are **not allowed**. Enforce with a `MinValueValidator(0)`-equivalent at both the serializer and DB constraint level.
- **Date fields:** past dates are **not allowed** — every date field must be today or a future date. Enforce at the serializer level (compare against `timezone.now().date()`); do not rely on frontend validation alone.

---

## 4. Data Model (Core Entities)

This is the minimum table set implied by the requirements. Exact field types/constraints should be finalized during schema design, but the entities and relationships below are load-bearing for the workflow engine.

### 4.0 Audit columns (every table)
Every table in this data model carries the following audit columns (not repeated in each table below):

| Field | Type | Notes |
|---|---|---|
| created_by | FK → users, nullable | set on insert (nullable for system-generated rows, e.g. trigger-job task opens) |
| created_on | timestamp | set automatically on insert |
| updated_by | FK → users, **nullable** | filled on update |
| updated_on | timestamp, **nullable** | filled automatically on every update; NULL until first update |

Where a table needs a *semantic* creator (e.g. `leads.created_by` records whether the lead came from Marketing or a Lead Manager), that column is required rather than nullable and is called out in the table.

### 4.1 `users` (Django auth-extended)
| Field | Type | Notes |
|---|---|---|
| username | string | |
| password | hashed | |
| name | text | |
| employee_id | number | ≥ 0, **unique** — duplicate IDs are rejected with a friendly message |
| email | text | |
| mobile_no | number | ≥ 0 |
| acting_belt_level | FK → `belts` | see §4.2 |
| belt | FK → `belts` | see §4.2. Same reference table as `acting_belt_level`, independent value. |
| domain | FK → `areas` | user's competency Domain — sources its dropdown from the **same `areas` reference table** used by the lead's `domain`/Area field (§4.2). One shared table, two independent fields on two different forms. |
| date_of_joining | date | **exempt from the global "no past dates" rule** — past dates are allowed, since joining dates are inherently historical |

**Role management (v13, updated v14):** there is **no `role` column** on the user table. Roles are stored using Django's **default auth Groups table** — one group per role in §2, named with the role's display name (e.g. "Lead Admin"). **A user can hold multiple roles at once (v14)** — the user form's role control is a multi-select writing one group membership per selected role. Permission checks are any-match across the user's roles, and data scopes are the union of each role's scope.

CRUD fully owned by **User Management** role. Managed via Django Admin (role & user management panel — groups appear under the standard Permissions section).

### 4.2 Reference Tables — `countries`, `industries`, `areas`, `belts`
Country, Industry, Area (Domain), and Belt are each maintained as their **own reference table**, rather than hardcoded choice lists, so the business can add, rename, or recode entries without a code deployment.

**Country, Industry, and Area** share the same shape (the `code` feeds Project ID generation, §13):

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| name | text, unique | display value shown in the lead form's dropdown |
| code | text, unique | short code used when building the Project ID (§13) |
| status | dropdown (`active` / `inactive`) | **default `active`.** Only `active` rows are offered in dropdowns; inactivating a row retires it without breaking existing FKs. |

- `countries` — seeded with the two rows in §13.2.
- `industries` — seeded with the 16 rows in §13.3.
- `areas` — seeded with the 11 rows in §13.4 (labeled "Domain" on both the lead form and the user form, "Area" in the source workflow sheet — same table, same seed data). Backs the lead's `domain`/Area field **and** the user's `domain` field — one shared table, two independent FK fields on two different forms.
- The lead form's Country, Industry, and Domain/Area dropdowns — and the user form's Domain dropdown — are populated by querying these tables directly — never from a hardcoded list.
- When a Project ID is generated (§13), the `code` is read from the linked reference row via the lead's FK — it is not re-typed, duplicated, or hardcoded anywhere else.

**Belt** is simpler — no `code`, since it isn't used in Project ID generation, only on the user form:

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| name | text, unique | display value shown in the Acting Belt Level / Belt dropdowns |
| order | integer | sort order for the dropdowns (`ORDER BY order, name`) |
| status | dropdown (`active` / `inactive`) | **default `active`.** Only `active` rows are offered in dropdowns. |

- `belts` — seeded with (in `order` 1–9): `Potential Black`, `Black`, `White`, `Brown`, `Red`, `Potential Brown`, `Potential White`, `Potential Red`, `NA`.
- Backs **both** `users.acting_belt_level` and `users.belt` — one shared table, two independent FK fields on the user.

All four tables (`countries`, `industries`, `areas`, `belts`) are managed from the **Django admin panel**.

### 4.3 `leads`
| Field | Type | Required | Notes |
|---|---|---|---|
| country | FK → `countries` | Yes | See §4.2. Drives the Country Code component of Project ID generation (§13). |
| company_name | text | Yes | |
| project_name | text | Yes | |
| industry | FK → `industries` | Yes | See §4.2. |
| domain | FK → `areas` | Yes | **Single-select, confirmed.** See §4.2. Called "Domain" on the lead form and "Area" in the source workflow/Project ID sheet — same concept, same table. |
| division | text | No | |
| scope | text | No | |
| assigned_to | FK → users, **nullable** | Yes for Lead Manager-created leads; left `NULL` for Marketing-created leads | "Default BD Person" referenced throughout workflow = this field. **Plain nullable FK — no "Not Assigned" value is ever stored**; `NULL` means unassigned and the "Not Assigned" label is rendered by the frontend/backend code (see §4.3.1). Required for leads created by **Lead Manager**. |
| lead_type | dropdown (`BD` / `Mining`) | Yes | Mining = future scope |
| status | system-managed | Auto | See Status Flow table (§4.3.2) |
| lead_id | auto | Auto | |
| project_id | text, nullable | Auto | populated after Task 12 (Implementation) closes, and **regenerated** after each Task 16 (Extension Implementation) closure — see §13. Always mirrors the `is_current = true` row in `project_details` (§4.8); the full history of every Project ID this lead has had lives there, not here. |
| project_id_base | text, nullable | Auto | the locked non-extension portion (country+industry+area+year+sequence), set once at Task 12 and never recomputed — see §13.1 |
| extension | text (2-digit, zero-padded) | Auto | **Default `00`.** Increments by one (`00` → `01` → `02` ...) every time Task 16 (Extension Implementation) closes. Used directly as the extension-marker component when building/rebuilding `project_id` (§13). |
| drop_remark | text | No | **(v16)** Optional reason captured via popup when the lead is dropped; shown on the Lead Detail page while the lead is `Dropped`. |
| created_by | FK → users | Auto | records whether the lead originated from Marketing or Lead Manager (required — semantic creator, see §4.0) |
| created_on | timestamp | Auto | |
| updated_by | FK → users, nullable | Auto | |
| updated_on | timestamp, nullable | Auto | |

#### 4.3.1 Marketing-sourced leads & workflow start condition
- **Marketing** can add a lead but has **no control over `assigned_to`** — the field is hidden/disabled on their form. On save, `assigned_to` is left `NULL` (displayed as "Not Assigned" by the UI) and the lead sits in a pre-workflow state (no Task 1 yet).
- **Marketing can view and edit the leads they created** (all fields except `assigned_to`) at any point — this is not limited to the initial add. They do not gain the ability to assign an owner themselves.
- **Lead Admin** can edit any `Not Assigned` lead and assign it to a user. The act of assigning an owner is what **starts the BD workflow** (opens Task 1) for that lead.
- **Lead Manager**-created leads continue to work as before: the Lead Manager selects the owner (themself or another BD person) at creation time, and the workflow starts immediately on save.
- Net effect: **Task 1 opens on `assigned_to` becoming non-null**, not strictly on lead creation. The workflow-start trigger should be implemented as a signal/hook on the `assigned_to` field transitioning from `NULL` → a user, rather than solely on lead creation.

#### 4.3.2 Status Flow
| Status | How set | Notes |
|---|---|---|
| In Progress | System — on creation | Default. Active workflow. |
| On Hold | User — manual | Pauses the workflow and all its open tasks (§6, Hold/Unhold). **(v16)** Set via a popup that captures an optional hold remark (`lead_hold.remark`). |
| Dropped | User — manual | Cancels the lead. **(v16)** Set via a popup that captures an optional drop remark (`leads.drop_remark`); all open/hold tasks move to `dropped`. |
| Hybernation | System — automatic | Set when Task 12 (Implementation) closes. Cannot be set manually. |
| Complete | System — automatic | Set when the final task (Task 17, Project Closure) closes. Cannot be set manually. |

#### 4.3.3 Leads list — Tracker column & header filters (v16)
- **Tracker column:** each lead row shows a workflow-progress tracker computed from task closure — `closed/total` task instances, a percentage, and a progress bar. `skipped` tasks (routed around by branching) are excluded from the total; extension/repeat cycles add instances, so the tracker reflects real remaining work. Bar color follows lead status: green (In Progress; darker on Complete), amber (On Hold), red (Dropped). Leads whose workflow hasn't started show "Not started". The API exposes this as `task_progress {total, closed, percent}` on the lead serializer.
- **Header filters:** a filter row sits directly under the table headers. Company/Project and Project ID filter by free-text search; Industry, Domain, Owner (including "Not Assigned"), Current Task (options sorted numerically by task number), and Status filter via dropdowns whose options are built from the loaded data. All filters combine (AND); a "Clear filters" button in the page header resets them; an empty result keeps the filter row visible with a "No leads match the filters" message.

### 4.4 `tasks`
| Field | Type | Notes |
|---|---|---|
| lead_id | FK → leads | |
| task_no | integer | sequence position in workflow (1–17 for BD) |
| task_name | text | pulled from workflow JSON |
| assigned_to | FK → users | |
| status | dropdown | `pending`, `open`, `hold`, `closed`, `skipped` — `skipped` is set automatically when a branch condition routes around the task so it can never open (5 = No → 6–9; 7 = No → 8; 13 = No → 14–16; lead completion → any remaining `pending`). Task lists show only tasks that have opened (plus `skipped`); `pending` rows are hidden. |
| is_allocation_task | boolean | true for tasks 2, 6, 11, 15 |
| opened_at | timestamp | |
| closed_at | timestamp | |
| elapsed_time | duration | total active (non-hold) time — see §6 |

### 4.5 `checklists`
| Field | Type | Notes |
|---|---|---|
| task_id | FK → tasks | |
| item_key | text | e.g. `1.1`, `3.4` — matches workflow JSON |
| item_label | text | |
| status | dropdown | `not_started`, `inprogress`, `complete` |
| remark | text | |
| last_edited_at | timestamp | captured on every save |
| last_edited_by | FK → users | |

Checklist save is **independent of task closure** — each edit (status + remark) persists immediately via its own save action, and each save records the edit timestamp. Checked items can be unchecked (no lock-in).

### 4.6 `task_extra_fields` (per-task dynamic fields)
Task-specific fields (dates, numeric fields, fee blocks, stakeholder contact rows, invoice rows, etc. — see §8) should be stored as structured JSON per task instance, keyed by field name, since the field set differs per task/workflow step and repeatable row-groups (e.g. "Name | Role x3 rows + Add more") need a flexible schema. A per-task-type JSON schema (defined in the `workflows` table) drives form rendering; submitted values are stored in a JSONField on `tasks` (or a child `task_field_values` table if reporting requires columnar queries). All numeric/date values in this JSON are subject to the global validation rules in §3.

### 4.7 `resource_allocation`
| Field | Type | Notes |
|---|---|---|
| lead_id | FK → leads | |
| type | dropdown | `2HR`, `SNT` (Solution Blueprint), `Implementation`, `Extension` — driven by which allocation task triggered the row (2→2HR, 6→SNT, 11→Implementation, 15→Extension) |
| execution_red | FK → users, nullable | |
| execution_brown | FK → users, nullable | |
| white | FK → users, nullable | |
| auditor1 | FK → users, nullable | |
| auditor2 | FK → users, nullable | |
| auditor3 | FK → users, nullable | |
| auditor4 | FK → users, nullable | |
| project_member1 | FK → users, nullable | |
| project_member2 | FK → users, nullable | |
| project_member3 | FK → users, nullable | |
| project_member4 | FK → users, nullable | |
| project_member5 | FK → users, nullable | |
| project_member6 | FK → users, nullable | |
| project_member7 | FK → users, nullable | |
| project_member8 | FK → users, nullable | |
| project_member9 | FK → users, nullable | |
| project_member10 | FK → users, nullable | |
| remark | text | |
| status | dropdown | `Pending` (row created, not yet filled by Resource Manager) → `Open` (form submitted, resources actively allocated) → `Closed` (resources freed — see auto-close rules below) |
| man_power_required | integer | ≥ 0, captured from the triggering task's manpower fields, used for the over-allocation check |
| created_on | timestamp | row is created the moment the allocation task opens (audit column, §4.0) |
| closed_at | timestamp, nullable | set automatically when status transitions to `Closed` |

**Owned and edited by: Resource Manager** (see role clarification in §2). The `project_id` for a given allocation cycle is no longer stored directly on this table — it lives on the linked `project_details` row (§4.8), which references this table via `resource_allocation_id`.

**Business rule (over-allocation flag):** when the count of resources the Resource Manager allocates exceeds `man_power_required` captured upstream, flag the row with a red "exceeded" indicator on the reporting screen next to the Edit button.

**Business rule (under-allocation flag, v14):** when the Resource Manager allocates **fewer** resources than `man_power_required`, show an **amber "below required man-power" indicator** — on the reporting screen (for submitted rows) and live inside the allocation form while editing.

**Business rule (extension prefill, v14):** when an `Extension` allocation row is created (Task 15 opens), its resource fields are **prefilled with the previous cycle's allocated resources** (the `Implementation` row for the first extension, the previous `Extension` row afterwards) — the Resource Manager only adjusts what changed.

**Business rule (auto-close — resources freed up, updated v14):** `status` is set to `Closed` automatically — no manual action — as follows:

| Allocation type | Created at | Auto-closes when |
|---|---|---|
| `2HR` | Task 2 | **Task 4** (2Hr Study Reimbursement) closes |
| `SNT` (Solution Blueprint) | Task 6 | **Task 9** (Solution Blueprint Payment) closes |
| `Implementation` | Task 11 | The **first Task 16 (Extension Implementation) closes** (superseded by the extension) — or **lead status becomes `Complete`** if the lead never extends |
| `Extension` (each cycle) | Task 15 | The **next cycle's Task 16 closes** (superseded) — or, for the final cycle, **lead status becomes `Complete`** (Task 17 closes) |

Each cycle hands over to the next: when Task 16 closes, the superseded previous cycle's allocation closes and the new Extension allocation carries the engagement forward. Only the current cycle's allocation is ever `Open`; it closes when the lead finally completes.

### 4.8 `project_details` (Project ID history — one row per implementation/extension cycle)
Every time a Project ID is generated or regenerated (Task 12, and each Task 16 closure), the *previous* Project ID must not be lost — the business needs to see every Project ID a lead has ever had, and how many times it went into extension. `leads.project_id` and `resource_allocation` only ever hold the *current* value, so a dedicated history table is required.

| Field | Type | Notes |
|---|---|---|
| id | auto (PK) | |
| lead_id | FK → leads | |
| resource_allocation_id | FK → resource_allocation, nullable | the specific allocation row for this cycle — Task 11's row for the first cycle, or the relevant Task 15 row for an extension cycle |
| extension_no | text (2-digit) | `00`, `01`, `02`... — matches `leads.extension` at the time this row was created |
| project_id | text | the full generated ID for this cycle, e.g. `IN-PHNPD26001-I00` |
| project_id_base | text | copy of the locked base portion (country+industry+area+year+sequence) — same across all rows for a given lead, per §13.1 |
| status | dropdown | `In Progress` (this cycle is the active one) → `Extended` (superseded — the lead moved into a further extension cycle) or `Complete` (the lead's final closure happened while this was the current cycle) |
| is_current | boolean | true only on the single most-recent row for a given lead |
| generated_at | timestamp | when Task 12 or Task 16 closed to produce this row |
| generated_by | FK → users | audit trail |

**Row lifecycle:**
1. **Task 12 (Implementation) closes:** insert one row — `extension_no = "00"`, `status = "In Progress"`, `is_current = true`, `resource_allocation_id` = the Task 11 allocation row.
2. **Task 16 (Extension Implementation) closes:** flip the previous current row to `status = "Extended"`, `is_current = false`; insert a new row — `extension_no` incremented, `status = "In Progress"`, `is_current = true`, `resource_allocation_id` = that cycle's Task 15 allocation row.
3. **Task 17 (Project Closure) closes, lead status → `Complete`:** set the current row's (`is_current = true`) `status` to `"Complete"`. Earlier rows keep whatever status they already had (`Extended`); they are not rewritten.

**Screen impact — Resource Allocation & Project Closure:** both screens should list **one line per `project_details` row**, not one line per lead — so a lead that went through two extensions shows three rows (its original implementation plus two extensions), each with its own Project ID, extension number, status, and generation date, all clearly grouped under the same lead/company. The Project Closure short-close action always operates on the `is_current = true` row.

### 4.9 Hold tables — `lead_hold` and `task_hold`
Two separate tables, one row per hold/unhold cycle.

#### 4.9.1 `lead_hold`
| Field | Type | Notes |
|---|---|---|
| lead_id | FK → leads | |
| hold_at | timestamp | |
| hold_by | FK → users | |
| remark | text | **(v16)** optional reason captured via popup when the lead is put on hold |
| unhold_at | timestamp, nullable | |
| unhold_by | FK → users, nullable | |
| unhold_remark | text | **(v16)** optional reason captured via popup when the lead is unheld |

#### 4.9.2 `task_hold`
| Field | Type | Notes |
|---|---|---|
| task_id | FK → tasks | |
| hold_at | timestamp | |
| hold_by | FK → users | |
| remark | text | **(v16)** optional reason captured via popup when the task is put on hold; carries the lead-level remark when the hold came from a lead-level hold |
| unhold_at | timestamp, nullable | |
| unhold_by | FK → users, nullable | |
| unhold_remark | text | **(v16)** optional reason captured via popup when the task is unheld; carries the lead-level remark when released by a lead-level unhold |

Used to compute elapsed/active time: `elapsed_time = (closed_at - opened_at) - Σ(unhold_at - hold_at)`.

### 4.10 `followups`
| Field | Type | Notes |
|---|---|---|
| lead_id | FK → leads | |
| assigned_to | FK → users (Employee role or Lead Manager self) | |
| created_by | FK → users (Lead Manager) | |
| followup_date | date | must not be a past date (§3) |
| remark | text | |
| status | dropdown | e.g. `open`, `done` |

Surfaced on an **"Other Tasks"** screen for whichever user the follow-up is assigned to.

### 4.11 `workflows`
| Field | Type | Notes |
|---|---|---|
| name | text | |
| type | dropdown | `BD`, `Mining` (Mining = future) |
| workflow | JSON | full task graph: task order, assignment rule, checklist items, extra-field schema, open-conditions, next-task routing |
| status | dropdown | active/inactive |

Editable from Django Admin. The task engine reads the active workflow JSON for a lead's `lead_type` to know what task opens next and who it's assigned to — **no workflow logic should be hardcoded outside this table** so future workflow changes (and the future Mining flow) don't require code changes to the state machine itself.

### 4.12 `workflow_trigger_config` (new — date-offset triggers)
Several tasks open on a rule like *"opens X days before the expected start date captured in an earlier task."* Rather than hardcoding the offset, it must be configurable from Django Admin:

| Field | Type | Notes |
|---|---|---|
| workflow | FK → workflows | which workflow (BD / Mining) this applies to |
| task_no | integer | the allocation/trigger task this config controls (e.g. 2, 6, 11, 13, 15) |
| reference_task_no | integer | the task whose date field is used as the reference point (e.g. Task 1 for Task 2's trigger) |
| reference_field_key | text | which field on the reference task holds the date (e.g. `expected_start_date`) |
| offset_days | integer | number of days before the reference date the task should open. Positive integer; ≥ 0 |
| is_active | boolean | allows disabling a trigger rule without deleting it |

A scheduled job (Celery beat / cron) evaluates open leads against active `workflow_trigger_config` rows and opens the corresponding task when `today >= reference_date - offset_days`. **The job must run frequently enough (e.g. daily, early in the day) that a task opens on the same calendar day its trigger condition is met — same-day opening is required, next-day is not acceptable.** This keeps the "X days before" values fully admin-editable without a code deployment.

---

## 5. BD Workflow — Full Task Table (Task 1–17)

This is the authoritative task sequence for `lead_type = BD`, transcribed from the workflow sheet. It should be encoded as the seed data for the `workflows.workflow` JSON. **"Shailesh" in the source sheet = the Resource Manager role.**

| # | Task Name | Assigned To | Checklist | Extra Fields | Notes |
|---|---|---|---|---|---|
| 1 | Introduction and First Meeting | Default BD Person | 1.1 Vector's Intro Email · 1.2 Intro presentation to decision maker · 1.3 Area of work/objective agreed · 1.4 Email sent to initiate study · 1.5 First meeting completed | Expected start date of next stage; Manpower required (Brown — number, White — number); Key stakeholder contact form (Name, Role — 3 rows default + "add more") | First task; opens when the lead gets an assigned owner (see §4.3.1) |
| 2 | 2Hr Study & Presentation Team Allocation | Resource Manager by default | *None — allocation task* | Status only (pending until closed) | Opens per `workflow_trigger_config` offset before the expected start date from Task 1. On open, inserts a `resource_allocation` row (type = `2HR`) with fields: execution_red, execution_brown, white, auditor1, auditor2 |
| 3 | 2Hr Study & Presentation | User assigned by Resource Manager in Task 2 | 3.1 Study plan done · 3.2 NDA formality completed · 3.3 Study interactions done · 3.4 Data received · 3.5 2Hr presentation date confirmed · 3.6 2Hr presentation done | Date of 2Hr presentation (date); Key stakeholders mapped form (Name, Role — 3 rows + add more) | |
| 4 | 2Hr Study Reimbursement | User assigned by Resource Manager in Task 2 | 4.1 Reimbursement expenses invoiced · 4.2 Reimbursement expenses received | Delay reasons if any (text); Expected date of receipt (date) | Opens after 3.6. **On close: the `2HR`-type `resource_allocation` row (from Task 2) auto-closes — resources freed up.** |
| 5 | Solution Blueprint Proposal | Default BD Person | 5.1 Proposal submitted · 5.2 Proposal terms agreed | Is Solution Blueprint required? (Yes/No). **If Yes:** Fee for engagement (allow zero, no negative); Manpower (Brown — number, White — number); Expected start date of next stage; Number of tranches of payment (number) | Opens after 3.6. **If No → skip to Task 10** (Project Proposal Submission) |
| 6 | Solution Blueprint Team Allocation | Resource Manager by default | *None — allocation task* | Status only | Opens per `workflow_trigger_config` offset before the expected start date from Task 5. Creates `resource_allocation` row (type = `SNT`): execution_red, execution_brown, white, auditor1, auditor2 |
| 7 | Solution Blueprint | User assigned by Resource Manager (Solution Blueprint block) | 7.1 Engagement start · 7.2 Initial invoice raised · 7.3 Data receipt · 7.4 Presentation dates locked · 7.5 SnT workshop done · 7.6 Completion invoice | Presentation date (date); Invoices raised block (Invoice Number, Value, Date — 3 rows + add more); Re-presentation required? (Yes/No); **Has project moved to the next stage? (Yes/No — shown & required only when Re-presentation required = No)** | Three paths on close: **(1)** Re-presentation required = Yes → opens Task 8. **(2)** Re-presentation required = No AND moved to next stage = Yes → opens Task 9 (Solution Blueprint Payment) AND Task 10 (Project Proposal Submission) simultaneously. **(3)** Re-presentation required = No AND moved to next stage = No → opens Task 17 (Project Closure) directly. |
| 8 | Solution Blueprint Repeat Presentation | Same execution red/BD/brown as Task 7 (default) | 8.1 Presentation dates locked · 8.2 SnT workshop done | Presentation date (date); Re-presentation required again? (Yes/No); **Has project moved to the next stage? (Yes/No — shown & required only when Re-presentation required again = No)** | Three paths on close: **(1)** Re-presentation required again = Yes → loops back to Task 8 (new instance). **(2)** Re-presentation required again = No AND moved to next stage = Yes → opens Task 9 AND Task 10 simultaneously. **(3)** Re-presentation required again = No AND moved to next stage = No → opens Task 17 (Project Closure) directly. |
| 9 | Solution Blueprint Payment | User assigned by Resource Manager (Solution Blueprint block) | 9.1 Fixed fee invoices received · 9.2 Reimbursement expenses invoiced · 9.3 Reimbursement expenses received | Delay reasons if any (text); Expected date of receipt (date) | **On close: the `SNT`-type `resource_allocation` row (from Task 6) auto-closes — resources freed up.** |
| 10 | Project Proposal Submission | Default BD Person | 10.1 Proposal submission · 10.2 Terms agreed | Planned engagement start date; Planned engagement end date; Period (months); Fixed fee (blocks generated based on period months, capturing fee + manpower per block); Total variable fee cap; Variable milestone fee cap; Variable performance fee cap; Manpower (Brown — number, White — number) | Entry point when Solution Blueprint was skipped |
| 11 | Project Team Allocation | Resource Manager by default | *None — allocation task* | Status only | Opens per `workflow_trigger_config` offset before Planned Engagement Start Date (Task 10). Creates `resource_allocation` row (type = project/implementation): execution_red, execution_brown, white, auditor1, auditor2 |
| 12 | Implementation | Execution red (assigned by Resource Manager via Task 11) | 12.1 Handover & engagement start · 12.2 PO from customer · 12.3 First fixed fee invoice raised · 12.4 Agreement/contract · 12.5 Variable parameter finalisation · 12.6 Variable baseline sign-off · 12.7 Addendum agreement · 12.8 Expected variable fee over eligible period submitted | Actual engagement start date; Modified planned engagement end date; Period (months); Actual fixed fee invoice date; Variable fee start date | **On close: lead status → `Hybernation`. `leads.extension` defaults to `00`. `project_id` is generated (using country/industry/area/year/sequence + extension `00`) and stored on `leads`. A `project_details` row is inserted (extension_no `00`, status `In Progress`, linked to the Task 11 `resource_allocation` row). The `Implementation`-type `resource_allocation` row itself stays `Open` — it does not auto-close here.** |
| 13 | Extension Proposal | View: same BD; Edit: execution red | 13.1 Discuss next set of problems with client · 13.2 Identify area of extension · 13.3 Solution design & preparation · 13.4 Pitch extension proposal | Extension approved? (Yes/No) | Opens per `workflow_trigger_config` offset (2 months) before engagement end date (Task 12). If No → opens Task 17 (Project Closure). If Yes → opens Task 14 |
| 14 | Extension Detail | View: same BD; Edit: execution red | 13.8 Addendum agreement · 13.9 Expected variable fee over eligible period submitted | Engagement start date; Engagement end date; Period (months); Actual fixed fee invoice date; Variable fee start date; Manpower (Brown, White) | Opens only if Task 13 approved = Yes |
| 15 | Project Extension Team Allocation | Resource Manager by default | *None — allocation task* | Status only | Opens if Task 13 approved = Yes. Creates `resource_allocation` row (type = `Extension`) |
| 16 | Extension Implementation | Execution red (assigned by Resource Manager via Task 15) | Same checklist set as Task 12 (12.1–12.8) | Engagement start date; Engagement end date; Period (months); Actual fixed fee invoice date; Variable fee start date | **On close: `leads.extension` increments by one (e.g. `00`→`01`, `01`→`02`). `project_id` is regenerated using the new extension value and updated on `leads`. The previous `project_details` row flips to `status = Extended`; a new `project_details` row is inserted for the new extension_no, linked to this cycle's Task 15 `resource_allocation` row. The superseded previous cycle's `resource_allocation` row (Implementation, or the prior Extension) auto-closes — this cycle's `Extension` row stays `Open` (v14).** Then loops back to Task 13 (new extension cycle). Repeats until Task 13 = No |
| 17 | Project Closure | Execution red | 16.1 All fixed fee received · 16.2 All variable fee received · 16.3 All reimbursements received | Final closed (Yes/No) | Opens when **any** of: engagement end date (from Task 12) is reached, **or** Task 13's "Extension approved" = No, **or** the Resource Manager short-closes the project from the Project Closure screen. **On close: lead status → `Complete`; the current `project_details` row's status → `Complete`; the current cycle's still-open `Implementation`/`Extension` `resource_allocation` row auto-closes (earlier cycles already closed when they were superseded, v14); any still-pending tasks become `skipped`.** |

**Cross-cutting rules:**
- "Default BD Person" = the user the lead is assigned to on the lead form (`leads.assigned_to`).
- Allocation tasks (2, 6, 11, 15) never have checklists/extra fields — only a status of `pending` until the Resource Manager completes the allocation form, which auto-closes the task and opens the next one, assigning it to the `execution_red` selected by the Resource Manager.
- Manpower captured upstream (Tasks 1, 5, 10, 14) is the reference count used to detect resource over-allocation on the Resource Manager's reporting screen.
- All numeric fields above follow the ≥0/no-negative rule; all date fields follow the no-past-date rule (§3).

---

## 6. Task, Checklist & Hold/Unhold Rules

### Checklist rules
- Two fields per checklist item: `status` (`not_started` / `inprogress` / `complete`) and `remark`.
- Edited via an edit icon per checklist row → opens a popup with `status` + `remark`.
- **A checklist item can also be checked/unchecked directly by clicking its tickmark** — clicking toggles between `complete` and `not_started` without opening the popup (the popup remains available for `inprogress` and remarks).
- Every save persists immediately and independently of task closure, and records the edit timestamp.
- Un-checking a previously checked item is allowed.

### Task closure rules
1. A task can only be closed once **all** checklist items are complete **and** all mandatory extra fields are filled.
2. A task is visible **and editable** only by its assigned user.
3. If a task isn't assigned to a user but the parent lead is, that user gets **view-only** access to the task.
4. Closed tasks are non-editable.
5. Allocation tasks (2, 6, 11, 15) show status only (no checklist/extra fields) until closed by the Resource Manager.
6. Every task has **Save as Draft** (persists without closing) and **Save & Complete** (validates + closes + opens next task per workflow). *(The v14 "return to the My Tasks page" clause is void — confirmed with the user 2026-07-16 that no My Tasks screen exists or will be built; tasks are worked from the lead's task stepper, and both actions keep the user there.)*
7. Validation errors always reference the field's **display label**, never internal field keys (v14).
8. Task lists show only tasks that have opened (`open` / `hold` / `closed`) plus `skipped` ones — `pending` tasks are hidden (v14).

### Task Reassignment
- Any task can be reassigned to a different user.
- On reassignment, the task immediately becomes visible with edit access to the new assignee (and reverts the previous assignee to view-only, per the assignment rule above).
- Reassign action is available inside the task view.

### Hold / Unhold
- **Lead-level:** holding a lead puts all its open tasks on hold; unholding restores them to unhold state.
- **Task-level:** a held task is non-editable; unholding restores normal edit behavior.
- Every hold/unhold transition records timestamp + acting user (`lead_hold`, `task_hold` tables) so **elapsed/active time** can be computed by subtracting held duration from total duration.
- **Remark popups (v16):** every hold, unhold, and drop action (lead-level and task-level) opens a popup asking the acting user for a **remark — optional**; the action proceeds with or without one. Remarks are stored per hold/unhold cycle (`remark` / `unhold_remark` on `lead_hold` and `task_hold`; `leads.drop_remark` for drops), appended to the activity-log description, and displayed as a banner on the Lead/Task Detail pages while the item is on hold (or dropped). A lead-level hold/unhold copies its remark onto the task holds it creates/releases.
- A dedicated **"Hold Items"** menu is required, with two views: **"Hold Tasks"** (all tasks currently on hold) and **"Hold Leads"** (all leads currently on hold).

---

## 7. Resource Allocation Flow (Detail)

1. An allocation task (2 / 6 / 11 / 15) opens per the `workflow_trigger_config` offset rules (§4.12).
2. A `resource_allocation` row is inserted immediately: `lead_id`, `type` (`2HR` / `SNT` / `Extension`/ implementation), all resource fields empty, plus `remark`, `status`. **Exception (v14): `Extension` rows are prefilled with the previous cycle's allocated resources.**
3. The row becomes visible to the **Resource Manager** role with an **Edit** action.
4. The Resource Manager opens the edit form. The screen shows an **accordion with the lead's details** (including the man-power figure captured upstream) above the resource allocation form itself, so allocation happens against the required headcount.
5. On submit:
   - The allocation task closes.
   - The next workflow task opens and is assigned to the `execution_red` selected by the Resource Manager.
6. Reporting screen: shows all resource allocation rows with an Edit button; if allocated resource count > required man-power, show a **red exceeded-indicator icon** next to Edit; if the allocated count is **below** the required man-power (on a submitted row), show an **amber under-allocation icon** (v14).

---

## 8. Follow-Up Requests

> **Phase 12 override (confirmed with the user 2026-07-16):** follow-up creation is broadened beyond Lead Managers — **anyone who can view a lead** (its owner, a task assignee, the Resource Manager, …) may raise a follow-up on it, from both the lead's Follow-up tab and the standalone Other Tasks screen. This supersedes the LM-only wording below and the "Add follow-up task" row in §12.

- Lead Manager can add a follow-up against a lead (button on the lead row, or a global "Add Follow-up" button with a lead dropdown).
- Fields: Lead (dropdown, if not launched from the lead row), assignee (dropdown of Employee-role users, including the Lead Manager themself), follow-up date (must not be a past date), remark.
- Surfaced on an **"Other Tasks"** screen, filtered to the logged-in user — whether that's an Employee the follow-up was assigned to, or the Lead Manager if self-assigned.

---

## 9. Resource Manager Role Screens

### 9.1 Resource Allocation
As described in §7 — list + edit view with the accordion/man-power context and exceeded-resource indicator. Each `resource_allocation` row shows its current `status` (`Pending` / `Open` / `Closed`) so the Resource Manager can see at a glance which resources are still tied up versus freed (§4.7 auto-close rules).

### 9.2 Project Closure
**List view:** shows **one row per `project_details` entry (§4.8), not one row per lead** — so a lead that has gone through extensions shows its original implementation plus every extension cycle as separate rows, each with its own Project ID, extension number, status (`In Progress` / `Extended` / `Complete`), and generation date. This is how first-time projects and their extensions are all made visible together on this screen.

**Edit/detail fields** (per row, i.e. per project cycle):
| Field | Source |
|---|---|
| Project No | `project_details.project_id` for that row |
| Extension No | `project_details.extension_no` |
| Project Status | `project_details.status` |
| Lead Manager | lead's assigned BD/lead manager |
| Execution Brown | the `resource_allocation` row linked via `project_details.resource_allocation_id` |
| White | same linked `resource_allocation` row |
| Execution Red | same linked `resource_allocation` row (the value assigned by the Resource Manager in the allocation form) |
| Fixed Fee | latest captured value from workflow (Task 10/14 "Fixed Fee") |
| Variable Fee | latest captured value from workflow |
| Fix Fee Upto | latest captured "fixed fee upto" value from workflow |
| Do you want to short-close? (Yes/No) | user input — only actionable on the `is_current = true` row |

- Selecting **Yes** opens Task 17 (Project Closure); closing it sets lead status to `Complete`, which in turn sets the current `project_details` row's `status` to `Complete` (§4.8) and closes out the `Implementation` and every `Extension` `resource_allocation` row for that lead (§4.7).

## 9.3 Finance Role (Future Scope)
The **Finance** role is defined in the role list but has **no screens, permissions, or workflow interaction in this phase**. It should exist as a role option (for future-proofing role management) but requires no functional build now.

---

## 10. Marketing Role

- Can **add** a lead (all standard lead fields) but the `assigned_to` field is hidden/disabled on their form.
- On save, `assigned_to` is left `NULL` (shown as "Not Assigned" in the UI); the lead is created but the BD workflow does **not** start yet (no Task 1).
- **Can view and edit the leads they created** at any time (all fields except `assigned_to`) — this is not limited to the initial add screen. They cannot assign an owner themselves; only Lead Admin can do that.
- Once Lead Admin assigns an owner and the workflow starts, Marketing retains view/edit rights to the lead's own fields (not workflow tasks) — task-level access continues to follow the standard assignment/visibility rules in §6.

---

## 11. Lead Admin

- View access to all screens except User Management.
- **Can edit `Not Assigned` leads (i.e. leads created by Marketing) to set the `assigned_to` owner.** This assignment action is what triggers the BD workflow to start (opens Task 1) for that lead.

---

## 12. Role-Based Permission Matrix

| Action | Lead Manager | Lead Admin | User Mgmt | Employee | Resource Manager | Marketing | Finance |
|---|---|---|---|---|---|---|---|
| Add lead (no owner assignment) | No | No | No | No | No | Yes | No |
| Add / edit own leads (with owner) | Yes | No | No | No | No | No | No |
| Assign owner to unassigned (Marketing) leads | No | Yes | No | No | No | No | No |
| View own (created) leads | Yes | Yes | No | No | No | Yes | No |
| Edit own (created) leads (excluding owner field) | Yes | Yes | No | No | No | Yes | No |
| View all leads | No | Yes | No | No | No | No | No |
| View own tasks | Yes | Yes | No | No | No | No | No |
| View all tasks | No | Yes | No | No | No | No | No |
| Edit own open tasks | Yes | Yes | No | No | No | No | No |
| Edit all open tasks | No | No | No | No | No | No | No |
| Add follow-up task | Yes | No | No | No | No | No | No |
| View own follow-up tasks | Yes | No | No | Yes | No | No | No |
| View all follow-up history | No | Yes (Lead Detail) | No | No | No | No | No |
| View / add / edit resource allocation | No | No | No | No | Yes | No | No |
| View own leads-funnel dashboard | Yes | Yes | No | No | No | No | No |
| View all leads-funnel dashboard | No | Yes | No | No | No | No | No |
| Manage users | No | No | Yes | No | No | No | No |
| View own activity log | Yes | Yes | No | No | Yes | No | No |
| View all activity log | No | Yes | No | No | No | No | No |

> **Finance** column is entirely "No" in this phase — reserved for future scope, no build required now.

---

## 13. Project ID Generation

Format components:

- **Country Code** — 2-letter code, taken via the lead's `country` foreign key into the `countries` reference table (§4.2) — not inferred or hardcoded. See lookup below.
- **Industry Code** — taken via the lead's `industry` foreign key into the `industries` reference table (§4.2). See full lookup below.
- **Area Code** — taken via the lead's `domain` foreign key into the `areas` reference table (§4.2). See full lookup below.
- **Year** — 2-digit year.
- **Sequence number** — 3-digit incrementing number.
- **Extension marker** — `I` followed directly by the current value of `leads.extension` (§4.3) — a 2-digit, zero-padded value that defaults to `00` and increments by one every time Task 16 (Extension Implementation) closes.

**Pattern:**
`{CountryCode}-{IndustryCode}{AreaCode}{YY}{SeqNo}-I{ExtensionValue}`

Examples from the source sheet (illustrating the pattern; extension shown as single-digit there — this build uses the 2-digit `leads.extension` value going forward, e.g. `I00`, `I01`):
- `IN-PHNPD26001-I0`
- `IN-TXOPS26002-I1`

### 13.1 Generation triggers
- **Task 12 (Implementation) closes:** `leads.extension` is set to its default `00`. The full `project_id` is generated for the first time (country + industry + area + year + sequence + `-I00`) and stored on `leads.project_id`. A `project_details` row is also inserted (§4.8) — `extension_no = "00"`, `is_current = true` — which is now the authoritative historical record of this Project ID.
- **Task 16 (Extension Implementation) closes:** `leads.extension` increments by one (`00`→`01`, `01`→`02`, ...). The `project_id` is **regenerated** — the country/industry/area/year/sequence portion stays the same as the original, only the extension suffix changes — and the new value overwrites `leads.project_id`. The previous `project_details` row is flipped to `status = "Extended"`, `is_current = false`, and a new `project_details` row is inserted for the new extension_no.
- The base (non-extension) portion of the `project_id` is **locked in at Task 12 and reused as-is on every regeneration** — it is computed once from the lead's field values at that time and never recomputed from current field values, even if industry/area/country are edited on the lead afterward. Only the extension suffix changes when Task 16 closes.
- **Implementation note:** store the locked base string (e.g. `IN-PHNPD26001`) in its own field (`leads.project_id_base`, also copied onto each `project_details` row) at Task 12, separate from the full `project_id`. Regeneration on Task 16 then becomes a simple concatenation of `project_id_base` + `-I` + `leads.extension`, with no dependency on the lead's current field values.
- `leads.project_id` and `resource_allocation` hold only the **current** value at all times — `project_details` (§4.8) is the only place the full history (every Project ID a lead has ever had, and how many times it's been extended) is preserved.

### 13.2 Country Codes — seed data for `countries`
| Country | Code |
|---|---|
| India | IN |
| Indonesia | ID |

The lead form's `country` field is a foreign key into `countries` (§4.2), currently seeded with just these two rows.

### 13.3 Industry Codes — seed data for `industries` (complete)
| Industry | Code |
|---|---|
| Auto Comp | COMP |
| Auto OEM | OEM |
| Banking | BNK |
| Building & Construction Goods | BCG |
| CapEx | CEX |
| Consumer Goods | CG |
| EPC | EPC |
| ETO | ETO |
| FMCG | FMCG |
| FMEG | FMEG |
| Industrial Goods | IG |
| Information Technology | IT |
| Machinery & Equipment | ME |
| Organised Retail | RE |
| Pharma & Chemical | PH |
| Textile & Fashion | TX |

### 13.4 Area Codes — seed data for `areas` (complete)
| Area (Domain) | Code |
|---|---|
| B2B Sales | B2B |
| B2C Sales | B2C |
| Distribution | DIST |
| NPD | NPD |
| Operations | OPS |
| Projects | PROJ |
| Supply Chain | SC |
| VectorFLOW AMC | VFAMC |
| VectorFLOW Upgrade | VFUPG |
| VectorPRO AMC | VPAMC |
| VectorPRO Upgrade | VPUPG |

This data is seeded into the `countries`, `industries`, and `areas` reference tables described in §4.2 — not hardcoded — so it can be maintained (added to, renamed, recoded) from the Django admin panel without a deployment.

---

## 14. Lead Attribute Dropdowns (seed data reference)

**Country:** India, Indonesia (only these two for now)

**Industry:** Auto Comp, Auto OEM, Banking, Building & Construction Goods, CapEx, Consumer Goods, EPC, ETO, FMCG, FMEG, Industrial Goods, Information Technology, Machinery & Equipment, Organised Retail, Pharma & Chemical, Textile & Fashion

**Domain / Area (single-select, FK → `areas`):** B2B Sales, B2C Sales, Distribution, NPD, Operations, Projects, Supply Chain, VectorFLOW AMC, VectorFLOW Upgrade, VectorPRO AMC, VectorPRO Upgrade

**Lead status:** In Progress, On Hold, Dropped, Hybernation, Closed/Complete

**Lead type:** BD, Mining (Mining = future phase)

---

## 15. Future Scope (Confirmed, Not Built Now)

- **Mining** lead-type workflow. The `workflows` table/engine is designed generically enough to support it later without a schema change.
- **Finance** role screens/permissions.
- **Notifications** (email / in-app) for task opening, task reassignment, and follow-up due dates — confirmed as a required capability, but deferred to a later phase. The notification-worthy events (task open, reassignment, follow-up due) are already identifiable from the data model in this document, so this can be layered on without redesigning the core schema.

---

