# Lead Management System — Product Specification

> **Status:** Draft v0.6 (phase 1 — Task tab redesign, conversion reminder implemented, optional rep assignment, owner-scoped Admin + Manager lead create/edit, BD Admin read-only oversight role, per-lead Follow Up tab (§21.21); BD flow reworked to 9 steps with branching/skipped steps, repeatable-group + conditional fields, per-lead Resources tab (§21.22))
> **Product type:** Internal delivery/lead management tool for Vector Consulting Group. Phase 1 of a planned multi-phase internal platform (see §1.4).
> **Purpose:** Single source of truth describing every part of the system, structured so each section can be handed to Claude in VSCode as a build prompt. This document is written to stand alone — a fresh session with no prior chat history should be able to read it and understand exactly what's built and why.
> **Implementation note:** See §21 for the full changelog of what's actually been built so far and where it diverges from earlier drafts.

---

## 0. How to read this document

- **[ASSUMPTION]** — I invented it; change freely.
- **[DECIDE]** — still open; answer before building.
- **[PLACEHOLDER]** — real content you must supply (Mining/Extension workflows).
- **[DEMO]** — illustrative sample data/content to be replaced.

**Reader context (confirmed):** The company sells consulting engagements to client companies. A **Lead** is the unit of work — a single engagement of one of **3 types** (BD, Mining, Extension), owned by a Manager and (usually) assigned to one Representative who executes it. The app is used **internally** by senior staff. Tool: **React (frontend) + Django (backend)**, **mobile-responsive**, **in-app notifications** (email later).

---

## 1. Overview & objectives

### 1.1 Goal
An internal system where senior staff capture every lead with a client company, drive it through a **type-specific checklist workflow**, assign it to a representative, get in-app notifications, log all activity, and see delivery health on a dashboard.

> **[CHANGED v0.4]** Earlier drafts treated a Lead as a sales opportunity that could spin off multiple Projects, each with its own checklist. Phase 1 collapsed this to a strict 1:1 — a Lead now carries its execution track (assigned rep, dates, task/checklist) directly, with no separate Project entity. See §21.7.

### 1.2 Success criteria (phase 1)
- Every lead lives in one place with its full execution track built in, and is identifiable by a **project name** even when several leads share the same company.
- Each lead runs the correct **type-specific task/step + checklist workflow**, worked through a stepper UI rather than one long scrolling page.
- Managers assign leads to representatives (optionally — see §5.2); reps see only what's theirs. *(Lead creation/editing itself is Admin-only — §21.20.)*
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

> **[CHANGED — §21.23]** Roles are now **many-to-many** (a user can hold several at once) instead of a single string, and a full User Management module (create/list/view/edit/deactivate, set/reset password) was added. See §21.23 for the mapping from the old single-role model.

Each user carries a `roles[]` array drawn from **User Management, Lead Admin, Lead Manager, Marketing, Resource Manager, Finance**, plus an implicit **Employee** role every user always holds (never shown as a selectable checkbox — it's granted automatically on creation).

The company also uses an internal **belt hierarchy**: **White → Brown → Red → Black**, plus **Potential** variants of each (**Potential White/Brown/Red/Black**) and **NA**. Two independent belt fields are stored per user — `belt` and `acting_belt_level` (current) — both **display attributes**; functional access is governed entirely by `roles[]`.

| Role | Responsibility |
|---|---|
| **User Management** | Manages users — create, edit roles, deactivate, reset passwords. |
| **Lead Admin** | Global, strictly **read-only** oversight — sees every lead across the company and pulls reports, but cannot create, edit, assign, update checklists, or manage follow-ups. |
| **Lead Manager** | Owns leads; creates and assigns them; leads a team. |
| **Marketing** | Can create a lead (fills in details) but cannot assign it — a Lead Manager must be picked as owner at creation. |
| **Resource Manager** | Allocates manpower/resources to a lead's Resources step so its workflow can proceed; the same resource can be allocated across multiple leads concurrently, and reassigned later based on budget. *(Allocation UI/flow is future work — see §9.4/§21.22's Resources tab for the current lightweight request-only version.)* |
| **Finance** | Tracks financials. *(Scope to be detailed in a later pass.)* |
| **Employee** *(implicit, always held)* | Executes assigned work — updates checklists, uploads files, completes tasks. The base role everyone has, on top of anything above. |

Reps (Employee-only users) belong to a manager (`manager_id`). Lead Managers own the leads they create (`owner_id` = creator, always — there is no owner picker for them); Marketing users hand ownership to a chosen Lead Manager at creation. Reps are assigned leads by their lead's owner, either at creation or afterward.

### 2.1 Permissions matrix (confirmed)

| Action | Lead Manager | Marketing | Employee-only | Lead Admin |
|---|:--:|:--:|:--:|:--:|
| See dashboard | ✅ own leads | ✅ own leads | ✅ assigned leads | ✅ global (read-only) |
| Create lead / company | ✅ (becomes owner) | ✅ (picks a Lead Manager as owner) | ❌ | ❌ |
| View leads | **own only** | **own only** (until owner picked) | **only leads assigned to them** | **all, view-only** |
| Edit lead details | ✅ own leads | ❌ | ❌ | ❌ |
| Reassign lead owner (Lead Manager) | ✅ own leads | ❌ | ❌ | ❌ |
| Assign / reassign a lead's representative | ✅ (own leads) | ❌ | ❌ | ❌ |
| Add / configure checklist items on own leads | ✅ | ❌ | ❌ | ❌ |
| Update checklist items / notes / upload files | ✅ (own leads) | ❌ | ✅ (assigned) | ❌ |
| Create / update follow-ups | ✅ | ✅ (own) | ✅ (own) | ❌ |
| See first/last follow-up comment preview on the leads table | ❌ | ❌ | ❌ | ✅ (only role that sees this column) |
| Delete an attachment | ✅ own leads | ❌ | ❌ | ❌ |
| Delete / archive lead | ✅ own leads | ❌ | ❌ | ❌ |
| Configure lead types & checklist **templates** (global) | ❌ | ❌ | ❌ | ❌ *(User Management only)* |
| Manage users | ❌ | ❌ | ❌ | ❌ *(User Management only)* |

**Priority defaults to Medium** when unset (any role that can create a lead). *(Changed from Low — see §21.16.)*

**Note on lead create/edit (§21.23, supersedes §21.21):** `createLead` is `Lead Manager`-or-`Marketing`; a `Lead Manager` always becomes the owner it creates, while `Marketing` must pick a `Lead Manager` as owner (the form's owner picker, previously shown only to Admin, now shows for anyone without the `Lead Manager` role). Editing, status changes, archiving, reassigning the owner, deleting an attachment, assigning/reassigning the rep, and configuring checklist items are all scoped to **the lead's owner** (`lead.owner_id === user.id` AND `hasRole(user, 'Lead Manager')`, checked in `frontend/src/api/scope.js`). `configureTemplatesGlobal` and `manageUsers` are `User Management`-only global-config actions, unrelated to lead ownership.

**Note on the assign-rep permission:** the *same* `assignTasks` permission (Admin, or the owning Manager) that lets someone reassign a rep also lets them make the **first** assignment on a lead that was created without one — see §5.2 and §21.15. No separate permission was needed for "assign later."

---

## 3. Domain model & glossary

Core hierarchy:
```
Company (client account)
  └── Lead (the unit of work; carries a PROJECT NAME + LEAD TYPE + its own execution track)
        ├── Task / Step        ← instantiated from the lead type's template, directly on the lead
        │     ├── Checklist item(s)     ← each can require a File; may carry a free-text Note
        │     └── Additional-detail field(s)  ← fixed, non-checklist input fields for that step
        └── Additional Task(s) ← ad-hoc, formerly "follow-ups"
```

| Term | Meaning |
|---|---|
| **Company / Account** | The client organization. Has many leads over time, many contacts. No dedicated screens in phase 1 — see §4. |
| **Lead** | The unit of work with a company, identified by a **project name** + Lead ID. Fixed **lead type**. Owned by a Manager, optionally assigned to one Representative who executes it. |
| **Lead type** | One of **3** kinds: **BD, Mining, Extension**. Determines the **task/steps + checklist template** a lead uses. |
| **Task / Step** | A named phase within a lead type's workflow (e.g. "Discovery"). Contains checklist items and, optionally, a fixed set of additional-detail input fields. |
| **Checklist item** | A single tickable action inside a task/step. Has a 4-value status (Not Started / In Progress / Completed / N/A), may **require a file**, and may carry a free-text **note**. |
| **Additional-detail field** | A fixed, admin-defined plain input field on a task/step (e.g. "Contract value ($)") — **not** a checklist item, always shown for that step regardless of checklist progress, edited with an explicit Save action. See §7.1 and §13. |
| **Custom field** | An extra, type-specific field beyond the default lead fields (`lead_type_custom_fields` — distinct from the per-step additional-detail fields above). |
| **Conversion reminder** | An optional setting on a **BD** lead that schedules an Additional Task later, prompting the owner to consider converting the engagement to Mining or Extension. See §8.2. |
| **Additional Task** *(formerly "Follow-up / Action item")* | An ad-hoc task a manager creates and assigns, separate from the template checklist. Cross-lead list lives in its own tab next to the Leads list — see §13. |
| **Activity** | Timestamped log entry (call, note, status change, checklist update). |
| **Notification** | In-app alert to a user (assignment, additional-task due date, etc.). |
| **Branch / skipped step** *(new, §21.22)* | A task/step's template can carry a `branch_field_id` + `branch_map`: once the lead's answer to that field is known, some later steps are no longer on the path and render as **skipped** — excluded from progress/completion but still viewable. BD-only in this pass. See §7.1, §8.3. |
| **Repeatable-group field** *(new, §21.22)* | An additional-detail field whose value is a small user-editable table (e.g. "Key stakeholders mapped": Name, Role) rather than a single input. Always optional — never blocks step completion. See §7.1. |
| **Conditional (visible-if) field** *(new, §21.22)* | An additional-detail field that only renders once a sibling "controller" field on the same step equals a specific value (e.g. reimbursement fields only appear once "Is Solution Blueprint Required?" = Yes). Hidden fields don't count toward step completion. See §7.1, §8.3. |
| **Resource Request** *(new, §21.22)* | A lightweight per-lead record ("I need a 2Hr Study / SnT resource by this date") created from the lead's **Resources** tab. Records what was asked, by whom, and by when — there's no fulfillment/assignment flow yet. See §13. |

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
| company size | enum | SMB / Mid / Enterprise — **retained in the data model, but not collected** through the simplified inline create flow (§21.13); defaults to `SMB`. No edit UI exists in phase 1 to change it. |
| location | text | |
| contacts | list | see §5.4 |
| leads | list | historical + active |
| created_by / created_at | auto | |

> **[PHASE 1]** No dedicated Companies list/detail screens. Companies are picked or created inline via a single **search/create combobox** on the Lead form (§21.13) — typing a name that doesn't match shows a "Create '\<name\>'" option, which reuses the Lead form's own Industry field so there's only one industry prompt on the whole screen. The entity is kept intact (not flattened into the Lead) specifically so future phases (§1.4) — resource allocation, finance tracking across a client relationship — can hang off it without a rework.

---

## 5. Entity — Lead (the unit of work)

> **[CHANGED v0.4]** This entity absorbs everything the old §6 "Project" entity used to hold (assigned rep, start/target dates, task/checklist). See §21.7.

### 5.1 Identity & classification
| Field | Type | Notes |
|---|---|---|
| Lead ID ✱ | auto (`LD-2026-0042`) | immutable |
| **Project name** ✱ | text | **New (§21.14).** Freeform short name (e.g. "Store Analytics Rollout"). Required at creation. Shown everywhere a lead is listed — the leads table, the lead detail header — specifically so multiple leads against the same company are distinguishable at a glance; the Lead ID alone wasn't legible enough for that. |
| Company ✱ | company ref | |
| Lead type ✱ | enum (BD / Mining / Extension) | drives workflow — see §7 |
| Industry ✱ | enum | (mirrors/overrides company) |
| Domain | enum | dropdown, not free text (§21.13) — options: Store operations, Patient records, Payments, Fleet ops, LMS |
| Product modules / editions in scope | multi-select | placeholder list — **[DECIDE]** confirm the real list |

Screens show the **project name** as the primary label, with the Lead ID and company name as secondary context (e.g. leads-table row: "Store Analytics Rollout / LD-2026-0001" under a "Project" column, "TechNova Retail" under "Company").

### 5.2 Ownership, assignment & status
| Field | Type | Notes |
|---|---|---|
| Status ✱ | enum | In Progress / On Hold / Dropped / Completed — see §8, default **In Progress** |
| Owner ✱ | user ref | **always the creator (§21.21)** — no owner picker on the Lead form; an Admin or Manager creating a lead automatically becomes its owner. Changeable afterward only via the "Reassign owner" action on Lead Detail. |
| Assigned to (Representative) | user ref, **nullable** | **Changed (§21.15) — no longer required at creation.** The New/Edit Lead form offers an explicit "Unassigned — assign later" option. If left unassigned, the lead's **owning Manager** (or any Admin) can assign a rep afterward from the Lead Detail page — the button there reads "Assign rep" when nobody's assigned yet, or "Reassign rep" once someone is. This reuses the existing `assignTasks` permission; no new permission was added. |
| Conversion reminder | enum, **nullable** (`none` / `mining` / `extension`) | **New, implemented (§21.17).** Only selectable when Lead type = BD; auto-resets to `none` if the type is changed away from BD. See §8.2 for what it actually does. |
| Priority | enum | Low / **Medium (default — §21.16)** / High / Urgent |
| Source detail | text | e.g. "inbound", "referral by X" |
| Tags | multi-tag | |
| Start date | date | required to enable the "convert to Mining" reminder option |
| Target date | date | required to enable the "convert to Extension" reminder option |

### 5.3 Commercials — **removed**

> **[REMOVED — §21.14]** The Commercials card/fields (Plan, Seats/licenses, Billing cycle, Contract length, Currency, Renewal date) that existed in earlier drafts have been **deleted from the product entirely** — not just deferred. There is currently no plan/pricing/contract-term concept anywhere on a Lead. If a future phase needs this back, treat it as new scope rather than "restoring" old fields, since the surrounding pipeline/forecast model it depended on (§21.7) is also gone.

### 5.4 Contacts (people at the company)
`id, company_id, name, title, email, phone, decision_role (Decision maker / Influencer / Technical / Procurement / User), is_primary, notes`

No dedicated UI in phase 1 (no Contacts tab on the lead, no Companies screens) — kept as backing data for future phases, per §4.

### 5.5 Lifecycle & free text
| Field | Type | Notes |
|---|---|---|
| Description / requirement summary | long text | shown in the lead's **Details** tab, not the always-visible overview (§21.12) |
| Internal notes | long text | not client-facing; same tab as above |
| Created by / at, Last activity at, Next follow-up | auto/date | |
| Attachments | list | documents at **lead** level — see §10 |

### 5.6 Task/steps + checklist
Instantiated **automatically and mandatorily** the moment the lead is created, from its lead type's template (§7.1) — there's no separate "create project" step. This includes the checklist items **and** the step's fixed additional-detail fields (§7.1, §21.12). Worked through the **Task** tab's stepper UI — see §13 for the full layout.

### 5.7 Conversion reminder mechanism
See §8.2 — kept in one place rather than duplicated here.

---

## 6. *(removed)*

The old "Entity — Project" section merged into §5 as of the phase 1 rework — see §21.7.

---

## 7. Lead types → task/steps → checklist items (+ custom fields + additional-detail fields)

This is the configurable core. **Admins** define the templates globally; **managers** may add/adjust checklist items on their own leads.

### 7.1 Structure
```
Lead Type (1 of 3: BD / Mining / Extension)
  ├── Custom fields              (extra fields beyond defaults, specific to this type)
  └── Task / Step (ordered, named)
        ├── branch_field_id / branch_map   ← NEW, §21.22: optional step-level branch gate
        │     (once this step's named field is answered, branch_map[value] names
        │      the next step id to continue to; steps left off the resulting path
        │      render as "skipped" — see §8.3)
        ├── Checklist item (ordered)
        │     └── requires_file?   (bool — rep must upload a document before marking it Completed)
        └── Additional-detail field (ordered)     ← NEW, §21.12
              (a fixed input, e.g. "Contract value ($)" — not a checklist, not ad-hoc;
               always shown for the step, same shape for every lead of this type, unless:)
              ├── visible_if_field_id / visible_if_value   ← NEW, §21.22: only rendered
              │     (and only required for completion) once a sibling field on the
              │      same step currently equals this value
              └── field_type = 'repeatable_group'          ← NEW, §21.22: value is a small
                    user-editable table (columns[], default_rows) instead of a scalar;
                    always optional, never blocks step completion
```
The moment a **lead** of this type is created, the template above is **copied** onto it as an editable working instance: `lead_tasks` (carrying its own `branch_field_id`/`branch_map`) + `lead_checklist_items` + `lead_task_fields` (with empty values — a `repeatable_group` field's "empty" is a JSON array of `default_rows` blank rows, ready for the rep to fill in). Editing the template later does **not** retroactively change existing leads.

> **[CHANGED v0.4 → removed further in §21.11]** Checklist items used to also carry a `notify` flag (fires a notification when actionable) and rendered a "Notifies" badge. This has been **removed entirely** — checklist items no longer have any notification concept, just `requires_file`.

> **[CHANGED — §21.12]** Checklist items also carry a free-text **note** now (`notes` field) — a simple annotation a rep can attach to a specific item, separate from the fixed additional-detail fields above. See §13 for how notes and file-attach are surfaced (compact CTA buttons + popovers, not always-expanded fields).

### 7.2 The 3 lead types
| # | Lead type name | Status |
|---|---|---|
| 1 | **BD** | Fully specified — see §7.3 |
| 2 | **Mining** | **[PLACEHOLDER]** single-step placeholder seeded; real workflow pending |
| 3 | **Extension** | **[PLACEHOLDER]** single-step placeholder seeded; real workflow pending |

### 7.3 BD — task/steps

> **[CHANGED — §21.22]** Reworked from a flat 4-step flow to a **9-step flow with two branch gates**, reflecting the real BD process (2Hr Study → Solution Blueprint → Proposal → Implementation) instead of a generic demo/proposal/close shape. Numeric prefixes ("1.1 -", "2.3 -") were also stripped from every checklist item label across all 3 lead types as a cosmetic cleanup — no items were removed by that pass.

Custom fields (lead-type-level, §7 "Custom fields" — currently unused in any UI): `POC start date (date)`, `Compliance review needed? (yes/no)`

| # | Step | Additional-detail fields | Branch / notes |
|---|---|---|---|
| 1 | Introduction and First Meeting | — | Items: confirm decision maker & authority, capture required product modules (*requires file: requirement doc*), **First Meeting completed** |
| 2 | 2Hr Study & Presentation | Date field (2Hr Presentation date confirmed); repeatable group **"Key stakeholders mapped"** (Name, Role) | 6 checklist items |
| 3 | 2Hr Study Reimbursement | **Branch gate:** *"Is Solution Blueprint Required?"* (yes/no) | `Yes → Solution Blueprint Proposal` (step 4); `No → Project Proposal Submission` (step 8) |
| 4 | Solution Blueprint Proposal | — | Items: Proposal Submitted, Proposal terms agreed |
| 5 | Solution Blueprint | Date field; repeatable group **"Invoices raised"** (Invoice Number, Value, Date); **branch gate:** *"Is re-presentation required?"* | `Yes → Solution Blueprint Repeat Presentation` (step 6); `No → Solution Blueprint Payment` (step 7) |
| 6 | Solution Blueprint Repeat Presentation | Same **branch gate** as step 5 | `Yes →` loops back to **itself** (step 6, another round); `No → Solution Blueprint Payment` (step 7). *Assignee note: defaults to the same rep assigned to the Solution Blueprint block.* |
| 7 | Solution Blueprint Payment | Fixed-fee / reimbursement invoice fields | *Assignee note: defaults to the same rep assigned to the Solution Blueprint block.* |
| 8 | Project Proposal Submission | Engagement Start Date, Fee for engagement, Period (weeks), Additional Fees for delay, ManPower | This is where step 3's "No" branch lands directly. *Assignee note: defaults to the BD owner.* |
| 9 | Implementation | PO from Customer, First Fixed fee invoice, Total/Milestone/Performance Cap fee fields (variable fee split into three) | Was step 4 in the old 4-step flow; field set expanded |

A step reached only via a "No"/skip branch (e.g. steps 4–7 when step 3 answers "No") renders as **skipped** in the stepper and is excluded from progress/completion — see §8.3 and §13. The `assignee_note` on steps 6–8 is descriptive text only in this pass; it is **not** wired into any assignment-automation logic yet.

### 7.4 Mining / Extension — **[PLACEHOLDER]**
> Supply the real task/steps (and any additional-detail fields) and I'll wire them in exactly. Currently seeded with a single placeholder step ("Getting Started"), 2 placeholder checklist items, and one placeholder additional-detail field ("Notes") each, just so a lead of these types is fully functional in the meantime.

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

Individual **task-steps** within the checklist (§7.1) still carry their own smaller-scoped status — `Not started → In progress → Completed`, recomputed automatically from their items' states — shown on each step card in the Task tab (§13). A step's items now use a **4-value** status themselves (see §8.3) rather than a simple done/not-done checkbox.

### 8.2 BD → Mining/Extension conversion reminder — **implemented (§21.17)**

> **[CHANGED]** This used to be a design-only note (v0.4 §8.2). It is now built.

- Adds a **Conversion reminder** field to the Lead form, next to Lead type (§5.2). Only enabled when Lead type = BD.
- Two selectable options, each disabled until its required date is present on the form:
  - **"Remind to convert → Mining"** — requires **Start date**.
  - **"Remind to convert → Extension"** — requires **Target date**.
- On save (create or edit, whenever this value changes), the system computes a due date:
  - Mining: **start_date + 6 months**
  - Extension: **target_date − 2 months**
- It then creates a normal **Additional Task** (§9.3) — titled `Consider converting {Lead ID} to {Mining|Extension}`, due on the computed date, assigned to the lead's Representative (or its Owner, if the lead is still unassigned — §5.2). No new notification pipeline was needed; this reuses the existing Additional Task mechanism, so the reminder shows up automatically in the cross-lead Additional Task list (§13) like any other follow-up.
- The chosen value (and effectively the schedule it implies) is also visible as an info row in the lead's **Details** tab.

### 8.3 Checklist item status
Each checklist item's status is one of **4** values, shown as a `Select`:

| Internal value | Label |
|---|---|
| `open` | Not Started |
| `in_progress` | In Progress |
| `done` | Completed |
| `na` | N/A |

`done` is disabled in the dropdown until a required file (§7.1 `requires_file`) has been attached. A step's own status (§8.1) is recomputed from its items **and, as of §21.21, its Additional details fields (§7.1) too**: Completed requires every item `done`/`na` **and** every field non-empty; if either any item isn't `open` or any field has a value, it's In progress; otherwise Not started. This makes the per-step gate in §13 stricter than a pure checklist check.

> **[CHANGED — §21.22]** Two refinements to that computation:
> - **Skipped steps don't count.** If a step's `branch_field_id` answer (or an earlier step's) routes the lead's path around a step (§7.1), that step is flagged `skipped` and excluded from both the completion requirement and the progress-ring denominator. The "current stage" shown on the leads table (§13) also skips over these steps when finding where a lead actually stands, including the existing 14-day "stuck" check.
> - **Only *visible*, non-repeatable fields are required.** A field hidden by its `visible_if_field_id`/`visible_if_value` gate (§7.1) doesn't block completion while hidden. A `repeatable_group` field (§7.1) never blocks completion — it's always supplementary, regardless of visibility.
>
> A step with **zero** checklist items can no longer read as trivially "Completed" by default (closed a seed-data edge case, not a template rule change).

---

## 9. Tasks, assignments & notifications

### 9.1 Assignment flow
1. **Admin** creates a **Lead** (§21.20): picks the company, lead type, owner (a Manager), and **optionally** a Representative (§5.2) — all in one form.
2. Creating the lead immediately instantiates its task/steps, checklist items, and additional-detail fields from the type template (mandatory, automatic — no separate creation step).
3. If no rep was assigned at creation, the owning Manager (or Admin) assigns one later from the Lead Detail page whenever ready.
4. Manager may add extra checklist items or ad-hoc **Additional Tasks**, and can reassign the rep at any time — but cannot edit the lead's own record or change its status (Admin-only, §21.20).
5. Rep sees only their assigned leads, works the checklist via the **Task** tab's stepper (§13), uploads any **required files**, jots notes, and moves items through their 4-value status.
6. Completing items updates the step's status, the lead's overall progress ring, and logs activity.

### 9.2 In-app notifications (phase 1) — email later
A `notifications` record + bell icon with unread count. Triggers:
- Lead assigned to a rep (skipped if the lead is created unassigned — §21.15).
- Additional task due date reached / overdue, including auto-generated **conversion reminders** (§8.2).
- Lead assigned to a manager (owner reassignment).
- (Optional) status change on a lead you own/are assigned to.

> **[REMOVED — §21.11]** Checklist items no longer fire notifications; the per-item `notify` flag was removed along with its "Notifies" badge.

Each notification has `type, message, link (to the item), read (bool), created_at`. **Architecture note:** keep a channel abstraction so an **email channel** can be added later without reworking triggers.

### 9.3 Additional tasks *(formerly "ad-hoc follow-ups / action items")*
`id, lead_id, title, due_date, assigned_to, done, reminder_at`. Distinct from the template task/steps; created by managers (or auto-created by the conversion-reminder mechanism, §8.2), surfaced to reps and on the dashboard. Cross-lead list lives in its own **Additional Task** tab next to the Leads list (§13), with a "related lead" field on manual creation.

### 9.4 Resource requests — **new, §21.22**
`resource_requests(id, lead_id, type, due_date, status, requested_by, created_at)`. A per-lead ask for a resource needed to progress it — **not** an attachment/document, just a structured record of what/who/when. `type` is one of `RESOURCE_REQUEST_TYPES` (currently `2Hr Study`, `SnT`); `status` is always `Requested` in this pass — there is no fulfil/assign/close transition yet, and no notification is fired on creation. Created from the lead's **Resources** tab (§13) by anyone who can manage follow-ups (`PERMISSIONS.manageFollowups` — everyone except BD Admin), listed newest-first, scoped by the same lead visibility rules as everything else (§2.1). **[DECIDE]** who/how a request gets fulfilled — routing to a person or team is explicitly out of scope for this pass.

---

## 10. Documents / attachments

Uploads attach at **two levels**: **Lead** and **Checklist item**.
`attachments (id, entity_type[lead|checklist_item], entity_id, filename, title, url, uploaded_by, uploaded_at)`

- `title` is optional free text (e.g. "Signed contract") shown instead of the raw filename when present.
- **File upload is available on every checklist item, not only ones with `requires_file`** (§21.12) — `requires_file` only controls whether it's *mandatory* before the item can be marked Completed, not whether upload is offered at all.
- **View / Download / Delete (§21.18):** every attachment row offers a View (opens in a new tab) and Download (forces a download with the original filename) action; **Delete is Admin-only** (`PERMISSIONS.deleteAttachment`).
- **Mock-layer implementation note:** since there's no real backend yet, the mock layer reads the uploaded file into a data URL (`FileReader`) and stores that as `url`, so View/Download work against real, locally-uploaded content instead of a dead link. Capped at **5MB** with a friendly error toast beyond that, to protect `localStorage`. **[DECIDE]** real storage backend once Django exists — local disk (`MEDIA_ROOT`) for dev vs. cloud (S3) for prod; restrict file types & size; scan filenames.

---

## 11. Activity timeline
`activities (id, lead_id, type[Call|Email|Meeting|Note|StatusChange|ChecklistUpdate|Assignment], summary, body, created_by, created_at)`. **Auto-entries only (§21.21)** — status/checklist/assignment/creation changes; the manual call/note entry form was removed from the Activity tab. Shown newest-first inside the lead's **Activity** tab (§13).

---

## 12. Functional requirements

### 12.1 Must-have (phase 1)
1. Auth + role-based access (Admin/Manager/Rep) with belt attribute.
2. Company CRUD (inline, single search/create combobox on the lead form — §21.13); Lead CRUD is **Admin-only** (create, edit, archive-as-soft-delete — §21.20).
3. Lead auto-instantiates its checklist + additional-detail fields from the type template at creation.
4. Lead-type + checklist **template** config (Admin) — data model only in phase 1, no admin UI yet (§21.9).
5. Assign leads to reps, optionally at creation, always afterward; rep-scoped visibility.
6. Checklist execution via a stepper UI: tick items through a 4-value status, mark N/A, optionally attach a file to any item (mandatory for ones flagged `requires_file`), optionally attach a note.
7. Per-step fixed "additional details" input fields, edited with an explicit Save action.
8. In-app notifications (bell + unread count).
9. Additional tasks (ad-hoc, cross-lead) with due dates, including auto-generated BD conversion reminders (§8.2).
10. List view (filter/search/sort) — search matches project name, Lead ID, company, and industry.
11. Lead detail: top overview card (assigned rep, owner, progress, timeline) + 6 tabs — **Task**, **Activity**, **Files**, **Details**, **Follow Up** (§21.21), **Resources** (§21.22). *(Distinct from the top-level Leads section's own 3 tabs — see §13 for the disambiguation.)*
12. File view/download/delete (Admin) on top of upload.
13. Dashboard: lead counts by status, overdue additional tasks, active leads in scope.

### 12.2 Deferred to a later phase
- Kanban board (visual status board).
- Dedicated Companies list/detail screens (entity still exists, §4).
- Reports (win rate, value by owner/type, rep workload) — depended on the ACV/forecasting fields removed in §5.3.
- Settings/Admin UI for lead types, checklist templates, and user management — configure by editing seed data directly for now (§21.9).
- CSV/Excel import & export.
- Duplicate detection.
- Audit log.
- Resource allocation, finance tracker, feedback management systems (§1.4) — no schema yet.

### 12.3 Later
- Email notification channel.
- Custom-field builder UI for admins.
- Web-to-lead intake form.
- Lead scoring.

---

## 13. Screens / UI map

**Important architectural note — two different "3-tab"/"4-tab" layouts exist and are easy to conflate; keep them distinct:**

1. **Top-level Leads section** (`LeadsLayout`, sits above the leads list, its own route shell): 3 sibling tabs —
   - **Lead** → the leads list/table itself (`/leads`).
   - **Task** → a **cross-lead** list of checklist items assigned to/visible to the current user (`/leads/tasks`).
   - **Additional Task** → a **cross-lead** list of follow-ups (`/leads/additional-tasks`), with a "related lead" field on manual creation.
2. **Individual Lead Detail page** (`/leads/:id`): a top overview card, then its **own, separate** 6 tabs (5th added §21.21, 6th added §21.22) —
   - **Task** → this one lead's stepper + checklist (§7.1, §8.3) plus the active step's "Additional details" fields (§7.1).
   - **Activity** → the log/notes feed (§11) — **read-only, no manual entry (§21.21)**; only auto-logged entries (status/checklist/assignment changes) appear.
   - **Files** → upload + view/download/delete (§10).
   - **Details** → Classification (industry, domain, product modules, source, tags, conversion reminder) + Description & notes. No Commercials card (§5.3 — removed).
   - **Follow Up** *(§21.21)* → the same follow-up list/create/comment functionality as the cross-lead Follow ups page, scoped to this one lead — the "related lead" field is omitted entirely since the current lead is implicit and can't be changed.
   - **Resources** *(new, §21.22)* → request tracker for a lead. Helper copy: "Request a resource needed to move this lead forward." A **"New request"** button (gated on `PERMISSIONS.manageFollowups` — same permission as Follow Up, i.e. hidden for BD Admin) opens a "Request a resource" dialog with required **Resource type** (`2Hr Study` / `SnT`) and **Due date**; submitting creates a `Requested`-status record shown as a card (type, due date, requested-by). No edit/fulfil/cancel flow yet — see §9.4.

| Screen | Purpose | Notes |
|---|---|---|
| Login | Auth | JWT |
| Dashboard | Health + "my leads" | role-scoped; counts by status, not pipeline value |
| Leads — Lead (list) | Browse/manage | filters, search (project name/ID/company/industry), sort, New lead |
| Leads — Task (cross-lead) | Everything assigned to/visible to me across leads | status Select per row, same 4-value scale as §8.3 |
| Leads — Additional Task (cross-lead) | Follow-ups across leads | create with related-lead field, due date, assignee |
| Lead — Detail | One lead's full record | overview card (progress, assigned rep, owner, timeline) + Task/Activity/Files/Details tabs |
| Lead — Create/Edit | Grouped form (§5) | project name, company combobox, lead type + conversion reminder, optional rep assignment |
| Notifications | Bell dropdown + full page | mark read |

**Task tab layout (§21.12) — mobile-responsive stepper:**
- **Desktop (≥`md`):** a vertical step rail on the left (sticky), showing each step's number/checkmark, name, and an "n/m done" count; the active step's checklist card renders to its right, followed by its "Additional details" card below the checklist.
- **Mobile (<`md`):** the rail collapses into a horizontal, scrollable strip above the checklist card, so nothing needs horizontal page scrolling.
- Steps are **always clickable/viewable in any order (§21.21)** — the rep can look ahead or back freely. *Editing* a step (checking items, saving its Additional details) is a separate, stricter gate: a step only becomes editable once every earlier **on-path** step is fully **Completed** — which now means both its checklist items **and** its Additional details fields (§8.3) — otherwise the step renders read-only with a "View only" note. Within the currently-editable step, items themselves are still worked in order (can't check item N before N-1).
- **Skipped steps (§21.22):** a step bypassed by an earlier branch answer (§7.1, §8.3) renders at `opacity-50` in both the desktop rail and mobile strip; the vertical rail additionally swaps its "n/m done" count for a **"Skipped"** label. A skipped step is never treated as the active/editable step — the stepper's "current step" calculation walks only on-path steps to find the first incomplete one. If a user does open a skipped step to look at it, its status badge reads a muted "Skipped" and the usual "View only — complete every earlier step…" caption is replaced with *"Skipped — an earlier answer routed this lead around this step."*
- Each checklist item row shows its label and a read-only status badge (§8.3) — the **only** way to change status, add a remark, or attach a file is the row's **Edit** icon button (pinned to the row's right edge); the checkbox remains as a quick shortcut for marking an item Completed. There's no separate file-attach control on the row anymore — files live inside the Edit dialog alongside status and remark, committed together on Save. A small file-count badge on the row is read-only.
- The step's "Additional details" card (fixed fields, §7.1) sits below the checklist card, with its own explicit **Save** button (disabled until a field's value actually changes) — no silent autosave. **A step's fields now count toward its completion (§8.3, §21.21)** — the "Completed" step status is no longer purely a checklist-item computation.
- **Conditional fields (§21.22):** a field with `visible_if_field_id` only renders once its controller field (elsewhere on the same step) currently equals `visible_if_value` — checked against the *live, unsaved* form state, so fields appear/disappear immediately as the user fills the form, before Save. Only the fields visible at Save time are written or counted toward completion.
- **Repeatable-group fields (§21.22):** a field with `field_type: 'repeatable_group'` renders as a small editable table (columns from the template, e.g. Name/Role) pre-populated with the template's `default_rows` blank rows, plus an **"Add row"** button. Always optional — excluded from the step-completion requirement regardless of visibility.

**Removed from phase 1 nav** (§12.2): Leads — Kanban, Companies, Reports, Settings as standalone screens.

**UX:** mobile-responsive throughout; sidebar collapses to an icon-only rail (state persisted); rep view is a focused "my assigned leads" list; leads-table row shows (§21.21 column order) project name + Lead ID · company · type · status · priority · assigned rep · progress bar+% · *(BD Admin only: first/last follow-up comment preview)* · stage (now the **last** column). The "Next follow-up" column was dropped (low value without an obvious follow-up already on the lead) and the progress indicator changed from a small ring (illegible at table density) to a horizontal bar + % label; the ring is unchanged everywhere else (Lead Detail overview card, Dashboard).

---

## 14. Data model (relational)

```
users(id, name, email, employee_id, mobile_no, domain, date_of_joining,
      roles[]→[User Management|Lead Admin|Lead Manager|Marketing|Resource Manager|Finance|Employee] (many-to-many; Employee always implicitly included),
      belt[Potential Black|Black|White|Brown|Red|Potential Brown|Potential White|Potential Red|NA],
      acting_belt_level (same enum as belt),
      manager_id→users, password_hash, active, created_at)

companies(id, name, industry, domain, website, size, location, created_by→users, created_at)
contacts(id, company_id→companies, name, title, email, phone, decision_role, is_primary, notes)

leads(id, code, name,                                            -- `name` = project name, §21.14
      company_id→companies, lead_type_id→lead_types, industry, domain,
      product_modules[], conversion_reminder[null|mining|extension] default null,   -- §21.17
      status[In Progress|On Hold|Dropped|Completed] default 'In Progress',
      priority default 'Medium',                                 -- changed from 'Low', §21.16
      owner_id→users, assigned_to→users NULLABLE,                 -- optional now, §21.15
      source_detail, tags[],
      description, internal_notes, start_date, target_date,
      created_by→users, created_at, last_activity_at, next_follow_up, archived bool)

-- Templates (Admin-configured; no admin UI yet — edit seed data directly, §21.9)
lead_types(id, name, description, active)                       -- BD | Mining | Extension
task_steps(id, lead_type_id→lead_types, name, order, description,
           branch_field_id→task_step_fields NULLABLE,           -- NEW, §21.22
           branch_map jsonb NULLABLE,                           -- NEW, §21.22: { fieldValue: nextStepId }
           assignee_note text NULLABLE)                         -- NEW, §21.22: descriptive only, not wired to automation
checklist_template_items(id, task_step_id→task_steps, label, order, requires_file bool)
                                                                  -- `notify` column removed, §21.11
task_step_fields(id, task_step_id→task_steps, field_name, order,
                 field_type default 'text',                     -- NEW, §21.22: e.g. 'repeatable_group'
                 columns jsonb NULLABLE,                         -- NEW, §21.22: [{key,label,type}], repeatable_group only
                 default_rows int NULLABLE,                      -- NEW, §21.22: repeatable_group only
                 visible_if_field_id→task_step_fields NULLABLE,  -- NEW, §21.22
                 visible_if_value NULLABLE)                      -- NEW, §21.22
                                                                   -- fixed "additional detail" field template, §21.12
lead_type_custom_fields(id, lead_type_id→lead_types, field_name, field_type, required, options[])

-- Working instances (one set per lead, instantiated automatically at creation)
lead_tasks(id, lead_id→leads, source_task_step_id→task_steps, name, order, status,
           branch_field_id→lead_task_fields NULLABLE, branch_map jsonb NULLABLE,  -- NEW, §21.22: copied from template
           skipped bool default false)                          -- NEW, §21.22: computed, not stored server-side in the mock layer — derived by computeTaskPath() at read time
lead_checklist_items(id, lead_task_id→lead_tasks, label, order,
                     state[open|in_progress|done|na],             -- 4 values now, §21.12/§8.3
                     requires_file bool, notes text default '',   -- `notify` removed, `notes` added
                     done_by→users, done_at)
lead_task_fields(id, lead_task_id→lead_tasks, field_name, field_value, order,
                 source_field_id→task_step_fields,               -- NEW, §21.22
                 visible_if_field_id→lead_task_fields NULLABLE, visible_if_value NULLABLE,  -- NEW, §21.22
                 columns jsonb NULLABLE)                          -- NEW, §21.22: repeatable_group only
                                                                                 -- one row per step per lead,
                                                                                 -- instantiated from task_step_fields, §21.12
lead_custom_values(id, lead_id→leads, custom_field_id→lead_type_custom_fields, value)

-- Cross-cutting
attachments(id, entity_type[lead|checklist_item], entity_id, filename, title, url,
            uploaded_by→users, uploaded_at)
activities(id, lead_id→leads, type, summary, body, created_by→users, created_at)
additional_tasks(id, lead_id→leads, title, due_date, assigned_to→users, done bool, reminder_at)
notifications(id, user_id→users, type, message, link, read bool, created_at)
resource_requests(id, lead_id→leads, type, due_date, status default 'Requested',   -- NEW, §21.22
                   requested_by→users, created_at)                                  -- see §9.4
```

> **[CHANGED v0.4]** `projects`, `project_tasks`, `project_checklist_items`, and `project_custom_values` no longer exist. They merged into `leads`, `lead_tasks`, `lead_checklist_items`, and `lead_custom_values` respectively. `followups` renamed to `additional_tasks` (and dropped its `project_id` column, since there's no project to reference). See §21.7.
>
> **[CHANGED v0.6 — §21.22]** `task_steps`/`lead_tasks` gained branch-gate columns (`branch_field_id`, `branch_map`) plus a `skipped` flag on the working instance; `task_step_fields`/`lead_task_fields` gained `field_type`/`columns`/`default_rows` (repeatable-group fields) and `visible_if_field_id`/`visible_if_value` (conditional fields). New table `resource_requests` (§9.4). None of this touched `lead_checklist_items`' shape.
>
> **[CHANGED v0.5]** `leads` gained `name` (project name) and `conversion_reminder`; lost every commercial field (`plan`, `seats`, `billing_cycle`, `contract_length`, `currency`, `renewal_date` — §5.3) and now allows `assigned_to` to be null (§5.2). `checklist_template_items` and `lead_checklist_items` lost their `notify` column; `lead_checklist_items` gained `notes`; its `state` enum grew from 3 values to 4 (`in_progress` added). Two new tables, `task_step_fields` and `lead_task_fields`, back the per-step "additional details" feature (§7.1). `attachments` gained `title`. See §21.11–§21.18.

---

## 15. API surface (Django REST Framework sketch)

```
POST   /api/auth/login            (JWT: access + refresh)
POST   /api/auth/refresh

GET    /api/companies      POST /api/companies      GET/PATCH /api/companies/:id
GET    /api/contacts       POST /api/contacts

GET    /api/leads          ?status=&type=&owner=&q=&page=       (queryset scoped by role; q matches name/code/company/industry)
POST   /api/leads                                                (Admin only, §21.20; auto-instantiates task/checklist/field template; assigned_to optional)
GET/PATCH/DELETE /api/leads/:id                                  (PATCH/DELETE: Admin only, §21.20)
PATCH  /api/leads/:id/status         {status}                    (Admin only, §21.20)
PATCH  /api/leads/:id/assign-owner   {owner_id}                  (Admin)
PATCH  /api/leads/:id/assign-rep     {assigned_to}                (Admin/Manager, own leads — first assignment or reassignment)

GET    /api/leads/:id/tasks
GET    /api/leads/:id/checklist
PATCH  /api/checklist-items/:id            {state, ...}          (upload handled separately)
PATCH  /api/checklist-items/:id/notes      {notes}                (separate endpoint — doesn't touch status/task recompute)

GET    /api/leads/:id/tasks/:taskId/fields
PATCH  /api/task-fields/:id                {field_value}          (the "additional details" fields, §7.1)

POST   /api/attachments           (multipart: entity_type[lead|checklist_item], entity_id, file, title)
DELETE /api/attachments/:id                                       (Admin only)
GET    /api/leads/:id/activities        POST /api/leads/:id/activities
GET    /api/leads/:id/additional-tasks  POST /api/leads/:id/additional-tasks  PATCH /api/additional-tasks/:id
GET    /api/additional-tasks       ?assignedToMe=&overdueOnly=    (cross-lead list, §13)
GET    /api/checklist-items        ?assignedTo=&status=&q=        (cross-lead list, §13)
GET    /api/leads/:id/resource-requests   POST /api/leads/:id/resource-requests   -- NEW, §21.22/§9.4:
                                                                                    -- list+create only, no PATCH/DELETE yet
GET    /api/notifications   PATCH /api/notifications/:id/read

-- Admin config (data model only in phase 1 — not wired to a screen yet, §21.9)
GET/POST/PATCH /api/lead-types
GET/POST/PATCH /api/lead-types/:id/task-steps
GET/POST/PATCH /api/task-steps/:id/checklist-items
GET/POST/PATCH /api/task-steps/:id/fields                         -- additional-detail field templates

GET    /api/dashboard/summary
```
**Removed vs. earlier drafts:** `/api/leads/:id/projects`, `/api/projects/:id` and friends (no more Project entity); `/api/reports/pipeline`, `/api/import/leads`, `/api/export/leads` (deferred, §12.2).

**Role scoping** is enforced server-side in each queryset/permission class (reps → only their assigned leads; managers → own; admin → all).

---

## 16. Non-functional
- **Security:** hashed passwords, server-side role checks (DRF permissions), input validation, JWT with refresh, file-type/size limits.
- **Performance:** list views < 1s up to ~10k leads; paginate.
- **Auditability:** all mutations logged (activities + audit log).
- **Responsive:** mobile-first for the rep "my work" views; the Task tab's stepper specifically collapses to a horizontal strip on narrow screens instead of a fixed-width sidebar (§13).
- **Backups:** **[DECIDE]** cadence/retention.

---

## 17. Tech stack (confirmed direction)

- **Frontend:** **React (JS)** + Vite, React Router, **Tailwind CSS + shadcn/ui**, **React Query + Axios** for API, mobile-responsive layout.
- **Branding:** Vector Consulting Group wordmark/arrow mark (SVG), `frontend/src/components/layout/Logo.jsx`. Sidebar collapses to an icon-only rail; state persisted client-side.
- **Backend:** **Django + Django REST Framework**. *(Not started yet — see §21.1.)*
- **Auth:** DRF **SimpleJWT** (access + refresh tokens). **[DECIDE]** confirm JWT vs. session auth.
- **Database:** **PostgreSQL** (prod), **SQLite** (local dev) — **[DECIDE]** confirm Postgres.
- **File storage:** Django media (local) in dev → S3-compatible in prod. **[DECIDE]**. Mock layer currently fakes this with data-URL attachments (§10).
- **Notifications:** in-app now; keep a channel abstraction so **email** (Django email backend) drops in later.

**Build sequencing (changed from §20):** built **frontend-first** against a mocked API layer instead of backend-first — see §21.1 for why and how the mock layer is structured so it's a drop-in swap once Django exists.

### Why this maps cleanly to AI prompting
§14 → "generate the Django models + migrations." §15 → "build these DRF viewsets/serializers/permissions." §13 → build each React screen. §7 → the template-instantiation logic. Tackle in the build order below.

---

## 18. Demo data — **[DEMO]**, replace with real leads

| Lead ID | Project name | Company | Type | Status | Assigned to | Owner (Mgr) |
|---|---|---|---|---|---|---|
| LD-2026-0001 | Store Analytics Rollout | TechNova Retail | BD | In Progress | Rohan | Priya |
| LD-2026-0002 | HIPAA Compliance Suite | MediCare Systems | BD | In Progress | Vikram | Arjun |
| LD-2026-0003 | Reconciliation Dashboard Mining | FinEdge Capital | Mining | In Progress | Sana | Priya |
| LD-2026-0004 | Fleet Ops Portal Extension | LogiTrack Freight | Extension | In Progress | Rohan | Arjun |
| LD-2026-0005 | Campus LMS Pilot | Bright Learning Co | BD | In Progress | Sana | Priya |
| LD-2026-0006 | Warehouse Inventory Upsell | TechNova Retail | BD | Completed | Sana | Priya |
| LD-2026-0007 | Legacy Payments Migration | FinEdge Capital | BD | Dropped | Vikram | Arjun |
| LD-2026-0008 | Patient Analytics Expansion | MediCare Systems | Mining | On Hold | Vikram | Arjun |

(Commercial/plan/seat columns removed along with the fields themselves — §5.3. Project names added, §5.1/§21.14 — note TechNova Retail and MediCare Systems each have 2 leads, which is exactly the case the project-name field exists to disambiguate.)

---

## 19. Open questions before/while building
1. **[PLACEHOLDER]** Real task/steps (and any additional-detail fields) for **Mining** and **Extension** (§7.4) — the one big content gap now. BD is fully specified (§7.3).
2. **[DECIDE]** Product **modules/editions** list — still placeholder values.
3. **[DECIDE]** Confirm **PostgreSQL** + **JWT** auth + **file storage** backend. *(Moot until the Django backend is started — §21.1.)*
4. Can a Manager reassign a lead to another manager, or is that Admin-only? — **implemented as Admin-only.**
5. **[DECIDE]** Backup cadence/retention.
6. **[FUTURE]** Resource allocation, finance tracker, feedback management systems (§1.4) — no schema yet, flagged here so it isn't forgotten.
7. **[DECIDE]** How a **Resource Request** (§9.4, §21.22) actually gets fulfilled — who sees/owns the queue, whether it needs its own assignee/status transitions and notifications, or whether it should fold into the existing Additional Task mechanism instead of staying a separate entity.
8. **[DECIDE]** Whether the new `assignee_note` text on BD steps 6–8 (§7.3, §21.22) should become real default-assignee automation, or stay purely descriptive.

*(Former item 6, the BD → Mining/Extension conversion reminder, is no longer open — implemented, see §8.2/§21.17.)*

---

## 20. Build order (roadmap) — **as originally planned**
1. Django project + models (§14) + migrations + admin; JWT auth (§17).
2. Users/roles/belts + DRF permission classes (role scoping).
3. Company + Lead CRUD API + React list/detail/create screens.
4. Lead-type / task-step / checklist-item / additional-detail-field **template** config (Admin) — §7.
5. Checklist execution UI + required-file uploads (§10).
6. Assignment flow + **in-app notifications** (§9).
7. Additional tasks + dashboard (§12/§13).
8. Reports, import/export, polish, permission hardening (later phase, §12.2).

> **Actual order taken diverged from this** — see §21.1. The React frontend was built first against a mocked API layer instead of a live Django backend, so the backend (steps 1–2 and the real persistence behind the rest) is still outstanding.

---

## 21. Implementation status & changelog

This section tracks what has actually been built, so the rest of the spec can stay the intended target design without getting stale. Entries are chronological; later entries may supersede earlier ones (noted inline).

### 21.1 Frontend-first build, mocked backend
The React frontend (`frontend/`) was built first against a **mocked API layer** so the UI/UX could be validated before committing to backend implementation details:
- `frontend/src/mocks/` — an in-memory "database" seeded from `seed.js`, persisted to `localStorage` (versioned key, currently **`lms-mock-db-v11`**; bump the version whenever the seed shape changes, which discards any locally-accumulated demo state and reseeds fresh) with simulated network latency (150ms per call — creating a lead does ~20-30 sequential calls, so expect a few seconds, not a bug).
- `frontend/src/api/*.js` — one module per resource (leads, companies, checklist, followups, notifications, activities, attachments, lead-types, auth) exposing the same function shapes the real DRF endpoints (§15) will need. Swapping mock calls for real `axios` calls later should not require touching hooks or components.
- `frontend/src/hooks/*.js` — React Query hooks wrapping the api layer (caching, invalidation, mutations).
- Role scoping (§2.1) is reimplemented client-side in `frontend/src/api/scope.js`; this moves into DRF permission classes/querysets once the backend exists (§15).

**Not started:** the actual Django + DRF backend (§14, §15, §17's backend bullets), so §19 item 3 (Postgres/JWT/file storage) remains open — there's nothing to configure yet.

### 21.2 Removed "Opportunity name" *(superseded by §21.14 — kept for history)*
An early draft removed the lead's standalone name field, identifying it by Company + Lead ID instead. **This was later reversed** — see §21.14, which reintroduced a project-name field for a different reason (disambiguating multiple leads against the same company).

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
- Lead detail screen restructured around a top overview card (progress, assigned rep, owner, timeline). *(The tab list underneath this card has since been redesigned twice more — see §21.9's original 3-tab cut and §21.12's later 4-tab correction; §13 has the current, correct layout.)*
- Follow-ups renamed **Additional Tasks**.

### 21.8 Real lead types: BD, Mining, Extension (§7)
Replaced the single seeded demo lead type with the 3 real ones. **BD** reuses the old "New Business" worked example's 4-step workflow (closest conceptual match). **Mining** and **Extension** are seeded with placeholder single-step templates — supply their real workflows and they drop into `frontend/src/mocks/seed.js` with no code changes.

### 21.9 Navigation reduced to phase 1 scope, first pass (§12.2, §13)
Sidebar trimmed to **Dashboard / Leads / Notifications**. The Kanban, Companies, Follow-ups, Reports, and Settings *pages* were deleted outright (not just hidden) since they actively conflicted with the merged lead model. `@dnd-kit/*` and `recharts` were removed from `package.json` since nothing uses them anymore.

> **[CORRECTED — §21.10]** This entry originally described a single 3-tab layout ("Lead / Task / Additional Tasks") living *inside* the individual Lead Detail page. That was a misunderstanding, corrected the same session — see §21.10. §13 has the current, correct two-layout structure.

### 21.10 Correction: two separate tab layouts, not one
Caught and fixed a real misunderstanding: the "Lead / Task / Additional Task" 3-way split described in §21.9 was supposed to sit **above/outside** the leads list as its own top-level shell (`LeadsLayout`) — **Lead** tab = the list itself, **Task** tab = a cross-lead checklist-item list, **Additional Task** tab = a cross-lead follow-up list (with the "related lead" field restored on manual creation). It is **not** a tab set on one individual lead's detail page. The individual Lead Detail page has its own, separate tab set instead — originally 3 (Lead info / Task / Files), later corrected again to the current 4 (**Task / Activity / Files / Details** — see §21.12). See §13 for the disambiguated, current layout — this is the single most important structural fact about the UI to get right.

Also folded into this pass: the "New company" dialog + separate industry dropdown was replaced by a single search/create combobox (§21.13), fixing a "double industry input" complaint.

### 21.11 Removed the checklist-item `notify` flag and badge
Checklist items no longer carry any notification concept. `notify` removed from `checklist_template_items`, `lead_checklist_items`, the template-creation API, and the "Notifies" badge removed from both the per-lead Task tab and the cross-lead Task list. (This was distinct from, and should not be confused with, the ad-hoc "additional field" experiment below — §21.12 explains why that was replaced too.)

### 21.12 Task tab redesign: responsive stepper, per-step additional-detail fields, per-item notes
Several iterations landed together as the final Task tab design (§13):
- **Commercials card removed everywhere** (§5.3) and Classification/Description moved out of the always-visible lead overview into a dedicated **Details** tab, alongside Files — bringing the Lead Detail page to its current 4 tabs: **Task / Activity / Files / Details**.
- The Task tab became a **stepper**: only the active step's checklist renders (instead of stacking every step at once), with a **vertical** step rail on desktop (`≥md`, sticky, left side) and a **horizontal** scrollable strip on mobile (`<md`) — steps stay clickable in any order.
- Checklist item status grew from a plain done/not-done toggle to the current **4-value** scale (`open`/`in_progress`/`done`/`na` — §8.3).
- **First attempt** at per-item extra data entry: an ad-hoc "+ Add field" affordance letting users attach arbitrary named fields to a single checklist item. **Reverted** after feedback that these fields actually belonged at the **step** level as a **fixed**, template-defined shape — not ad-hoc per item. Replaced with `task_step_fields` (template) / `lead_task_fields` (per-lead instance) — the current "Additional details" card, positioned **below** the checklist card for the active step, edited via controlled inputs with an explicit **Save** button (disabled until a value actually changes) rather than silent autosave.
- Checklist items separately gained a **notes** field (simple free-text annotation) and file-upload was opened up to **every** item (not just `requires_file` ones). Both were initially always-visible inline (a permanent Textarea + upload strip per item), then **redesigned again** into compact CTA buttons — "Attach file"/"Files (n)" and "Add note"/"Note" — each opening a small popover on demand; the notes popover has its own explicit Save/Cancel.
- **Bug caught and fixed:** `task_step_fields` was added to the seed data and referenced by `createLead`, but never registered in the mock DB's persisted-collections list — so `peek('taskStepFields')` returned `undefined` and **creating any brand-new lead crashed** from the moment that feature landed until this was caught (existing seeded demo leads were unaffected, which is why it went unnoticed for several turns — all testing after that point happened to only touch pre-existing leads).

### 21.13 Company combobox, domain dropdown, size field dropped from the UI
Replaced the separate "New company" dialog + dropdown with a single search/create combobox (`CompanyCombobox`) on the Lead form — typing a non-matching name surfaces a "Create '\<name\>'" option that reuses the Lead form's own Industry value, eliminating a double industry prompt. Company **Domain** on the Lead form became a fixed dropdown (`DOMAINS` in `seed.js`) instead of free text. Company **size** is no longer collected anywhere in the UI (still exists in the data model, defaults to `SMB` — §4).

### 21.14 Project name field added to Lead (reverses §21.2)
Leads for the same company were indistinguishable in the list (multiple rows all just saying "TechNova Retail"). Added a required **project name** field (§5.1) to the Lead form and data model, surfaced as the primary label everywhere a lead appears — the leads table's first column ("Project") and the Lead Detail header — with the Lead ID demoted to secondary/subtext. This directly reverses the earlier §21.2 decision to drop a name field; the two situations aren't the same (§21.2 was about removing a redundant "Opportunity name" next to a full sales-opportunity model that no longer exists) but flagged here since a future reader might otherwise be confused by the apparent contradiction.

### 21.15 Assigned representative made optional at lead creation
The Lead form's "Assigned to (Representative)" field is no longer required — it now defaults to an explicit "Unassigned — assign later" option. The owning Manager (or an Admin) can make the first assignment from the Lead Detail page at any later point; the existing `assignTasks` permission already covered this (Admin, or Manager on leads they own), so no new permission was introduced — only UI/copy changes ("Assign rep" vs. "Reassign rep" depending on current state) and null-safety fixes in `api/leads.js` (skip the "you were assigned" notification when there's no rep; fall back the conversion-reminder follow-up's assignee to the lead's owner if still unassigned).

### 21.16 Default priority changed to Medium
New leads now default to **Medium** priority instead of **Low**, in both the form's initial state and the API's fallback default.

### 21.17 BD → Mining/Extension conversion reminder — implemented (resolves §21.10-era design note, §8.2)
What was previously a design-only placeholder (old §8.2) is now built: a **Conversion reminder** Select next to Lead type on the Lead form, enabled only for BD leads, offering "Remind to convert → Mining" (needs Start date) or "Remind to convert → Extension" (needs Target date), each disabled in the dropdown until its date is filled in. Saving schedules a real **Additional Task** — start date + 6 months for Mining, target date − 2 months for Extension — assigned to the lead's rep (or owner, if unassigned), so it surfaces in the existing cross-lead Additional Task list with no new notification pipeline. Also fixed a **field-width UI bug** noticed in the same pass: shadcn's `SelectTrigger` defaults to `w-fit` while `Input` defaults to full width, so paired fields in a two-column form row rendered uneven — fixed by adding `className="w-full"` to every `SelectTrigger` on the Lead form.

### 21.18 Files tab: real view/download/delete
Attachments previously stored a dead `url: '#'` placeholder. The mock upload path now reads the file into a data URL (`FileReader`) so **View** (opens in a new tab) and **Download** (forces download with the original filename) work against real content; capped at 5MB to protect `localStorage`. Added attachment **Delete**, restricted to Admin (`PERMISSIONS.deleteAttachment`). The 3 seed demo attachments were given placeholder data-URL content so the feature has something real to show out of the box.

### 21.19 Branding and sidebar UX (§17)
Replaced the placeholder logo with the real Vector Consulting Group wordmark/arrow mark (`Logo.jsx`); the sidebar can now collapse to an icon-only rail with hover tooltips (state persisted in `localStorage`).

### 21.20 Lead create/edit restricted to Admin only (§2.1, §9.1, §12.1, §15)
`PERMISSIONS.createLead` and `PERMISSIONS.editLead` (`frontend/src/api/scope.js`) changed from `Admin || Manager` / `Admin || owning Manager` to **Admin-only**. This is enforced in three places: the "New lead" button on the Leads list (`LeadsList.jsx`) is hidden for non-Admins; the New/Edit Lead form (`LeadForm.jsx`) now has a `useEffect` route guard that redirects a Manager away if they navigate to `/leads/new` or `/leads/:id/edit` directly by URL, plus a render-time `return null` fallback; and the Lead Detail page's status-change dropdown and "Edit" button are both gated on the same `canEdit` flag, so a Manager can no longer change a lead's status either, not just its other fields. Managers keep every other own-lead permission unchanged — `assignTasks` (assign/reassign rep) and `configureChecklistOnLead` were not touched. Also fixed in the same pass: Radix `Select`'s `onValueChange` can fire with an empty string during programmatic value-setting (autofill of owner/lead-type before the hidden native `<select>`'s options register); every `Select` on the Lead form now ignores falsy values (`setIfPresent` helper / inline guards) instead of writing them into form state, and the reassign-owner/reassign-rep dialogs on Lead Detail got the same guard.

### 21.21 Ownership rework, BD Admin role, per-lead Follow Up tab, stricter step gating, checklist row & follow-up UI redesign, leads-table cleanup

A large bundled pass reversing/extending several earlier decisions:

- **Ownership & Admin scope (reverses §21.20, §2.1):** `createLead`/`editLead` are Admin-**and**-Manager again, and the created lead's `owner_id` is always the creator — the Lead form's owner picker was removed entirely. Admin's lead **visibility** changed from global to **owner-scoped**, identical to Manager (`frontend/src/api/scope.js`'s `visibleLeadIds`) — the two roles are now symmetric in everything except seniority/typical belt. Every per-lead mutation permission (`editLead`, `reassignLeadOwner`, `archiveLead`, `deleteAttachment`, `assignTasks`, `configureChecklistOnLead`) is now `isOwner(user, lead)` instead of a blanket Admin check.
- **New `BD Admin` role:** global, read-only visibility (`visibleLeadIds` returns `null` for it, same as old Admin) with every mutation permission returning `false` — enforced for free since `'BD Admin' !== 'Admin'` everywhere else already checks the literal `'Admin'` string. Two new permissions: `viewFollowupPreview` (BD Admin only — the leads-table comment-preview column below) and `manageFollowups` (everyone except BD Admin — create/comment/close a follow-up). Seeded with one demo user (`u-devika`).
- **Per-lead Follow Up tab (§13):** Lead Detail gained a 5th tab reusing the cross-lead follow-ups feature (`components/leads/LeadFollowUpsTab.jsx`), scoped to the current lead with no "related lead" selector — the lead is implicit. The shared `FollowupUpdateDialog` was extracted out of `pages/FollowUpsList.jsx` into `components/leads/FollowupUpdateDialog.jsx` so both places render identically.
- **Follow-up comment thread redesign:** `listFollowupUpdates` now sorts oldest-first (was newest-first) so the thread reads top-to-bottom like a chat log; the dialog renders each comment as a chat bubble (avatar, name, timestamp, own-messages-right-aligned) instead of a plain bordered card, and auto-scrolls to the latest comment.
- **Step completion now includes Additional details fields (§7.1, §8.3):** `recomputeTaskStatus` in `api/checklist.js` requires every checklist item done/N/A **and** every field non-empty for a step to be `Completed`; saving a field value now triggers the same recompute `updateChecklistItem` does (previously it was a no-op on step status). Applied retroactively to seed data — `makeLeadTasksAndItems` in `mocks/seed.js` backfills placeholder field values for steps whose demo `doneCounts` already implied "finished," so existing demo leads don't regress to "In progress" purely for lacking seed field data.
- **Step navigation unlocked, editing still gated (§13):** `TaskStepper`/`TaskStepperVertical` no longer disable or lock-icon not-yet-reached steps — every step is freely viewable. `LeadTaskTab` instead gates *editing* (`canUpdate` passed to `ChecklistItemRow`/`TaskStepFields`) behind "every earlier step is fully Completed," showing a "View only" note otherwise. The old "clamp back to the frontier" effect was removed since browsing ahead is now allowed.
- **Checklist item row redesign:** the separate file-attach popover trigger is gone — file upload moved inside the Edit dialog alongside status and remark. Edit is now an icon-only button pinned to the row's right edge (`Pencil`, ghost/icon-sm). Status is shown as a new read-only `ChecklistStatusBadge` (`components/shared/StatusBadge.jsx`) next to the label; the checkbox remains as a shortcut for marking an item Completed, but every other status transition, remark edit, and file attach goes through Edit.
- **Activity tab is read-only:** the manual note-entry Textarea/Add button and `useLogActivity` call were removed from Lead Detail's Activity tab — only auto-logged entries (status/checklist/assignment/creation) appear.
- **Leads table cleanup:** dropped the "Next follow-up" column; moved "Stage" to the last column; replaced the small `ProgressRing` with a new `components/shared/ProgressBar.jsx` (horizontal bar + % label) — the ring is unchanged everywhere else. Added a BD Admin-only "Comments" column sourced from a new sync helper, `getLeadCommentPreview(leadId)` in `api/followups.js`, which pools every comment across all of a lead's follow-ups and returns the earliest/latest.
- Mock DB version bumped to `lms-mock-db-v13` (role/status-semantics changes require a reseed).
- **Known terminology drift, not addressed in this pass:** the domain model (§3, §9.3) and some of §13 still say "Additional Task" in places, but the actual UI/code (`pages/FollowUpsList.jsx`, the "Follow ups" tab, this section's new "Follow Up" tab) already calls the concept "Follow up(s)" — a naming cleanup predating this change. Treat "Additional Task" and "Follow-up" as the same entity until a documentation pass reconciles the term throughout.

### 21.22 BD flow reworked to 9 steps with branching, repeatable/conditional fields, and a new Resources tab (§7.1, §7.3, §8.3, §9.4, §13, §14, §15)

A large pass reflecting the real BD process shape, plus a new lightweight resource-tracking feature:

- **BD flow expanded from 4 to 9 steps** (§7.3): Introduction and First Meeting → 2Hr Study & Presentation → 2Hr Study Reimbursement → Solution Blueprint Proposal → Solution Blueprint → Solution Blueprint Repeat Presentation → Solution Blueprint Payment → Project Proposal Submission → Implementation. Mining and Extension were **not** restructured — only cosmetic numeric-prefix stripping was applied to their checklist item labels (also applied to BD's).
- **Step branching (§7.1, §7.3, §8.3):** `task_steps`/`lead_tasks` gained `branch_field_id`/`branch_map` — once that step's named field is answered, the branch map names the next step id, and every step left off the resulting path is flagged `skipped`. Two gates were seeded on BD: step 3 ("Is Solution Blueprint Required?") skips steps 4–7 entirely when answered "No"; step 5/6 ("Is re-presentation required?") loops step 6 back onto itself for repeat presentations, or advances to payment. `computeTaskPath()` (new, `api/checklist.js`) walks the step order to resolve this. Skipped steps are excluded from the progress-ring denominator, the step-completion requirement, and the "current stage" resolution shown on the leads table (§13) — including its existing stuck-lead threshold check.
- **Conditional (visible-if) fields (§7.1, §13):** `task_step_fields`/`lead_task_fields` gained `visible_if_field_id`/`visible_if_value` — a field only renders (and only counts toward step completion) once a sibling field on the same step currently equals that value, checked against live unsaved form state so it reacts before Save. Seeded on "2Hr Study Reimbursement," where several fee/manpower/payment fields stay hidden until "Is Solution Blueprint Required?" = Yes.
- **Repeatable-group fields (§7.1, §13):** new `field_type: 'repeatable_group'` — value is a small editable table (`columns[]` template, `default_rows` pre-populated blank rows, "Add row" button) rendered by a new `RepeatableGroupInput` in `TaskStepFields.jsx`, values stored as a JSON-stringified array. Always optional and excluded from step-completion requirements regardless of visibility. Seeded as "Key stakeholders mapped" (Name, Role) on 2Hr Study & Presentation, and "Invoices raised" (Invoice Number, Value, Date) on Solution Blueprint.
- **Stepper visuals for skipped steps (§13):** `TaskStepper`/`TaskStepperVertical` render a skipped step at `opacity-50`; the vertical rail swaps its "n/m done" count for a "Skipped" label. `LeadTaskTab`'s active-step resolution now walks only on-path (non-skipped) steps to find the first incomplete one, so a skipped step can never become the active/editable step; viewing one directly shows a muted "Skipped" status badge and the caption "Skipped — an earlier answer routed this lead around this step" instead of the usual "View only" copy.
- **New per-lead Resources tab (§9.4, §13):** a new `resource_requests` entity/table (`id, lead_id, type, due_date, status, requested_by, created_at`) with list+create only (no edit/fulfil/delete yet — routing a request to whoever fulfills it is explicitly out of scope for this pass). New files `api/resources.js`, `hooks/useResources.js`, `components/leads/LeadResourcesTab.jsx`; wired in as Lead Detail's 6th tab, after Follow Up. "New request" reuses the existing `PERMISSIONS.manageFollowups` check (no new permission) — hidden only for BD Admin. `RESOURCE_REQUEST_TYPES` seeded as `['2Hr Study', 'SnT']`.
- **Assignee-note metadata (§7.3):** `task_steps` gained a descriptive `assignee_note` column, seeded on the 3 new post-branch steps (e.g. "Defaults to the same rep assigned to the Solution Blueprint block"). **Not** wired into any actual assignment-automation logic in this pass — display-only, and not currently rendered anywhere in the UI either; flagged here so a future pass either surfaces or automates it rather than forgetting it exists.
- **Small unrelated fixes bundled into the same commit:** `FollowupUpdateDialog` footer buttons reordered ("Close follow-up" now left-aligned, "Save comment" primary/right); closed follow-up titles in `LeadFollowUpsTab`/`FollowUpsList` no longer render with strikethrough (muted color + "Closed" badge only).
- Seed data: `createLead()` (`api/leads.js`) now copies the new branch/visibility/column metadata onto working-instance rows at creation time; a step with zero checklist items can no longer trivially read as "Completed" (closed a seed-data edge case). Mock DB version bumped `lms-mock-db-v15` → **`lms-mock-db-v17`** (forces reseed).

### 21.23 Many-to-many roles + full User Management module (§2, §14, §15)

Replaced the single `role` string with a `roles[]` array and shipped create/list/view/edit/deactivate,
set/reset-password, and richer profile fields:

- **New role set:** `User Management, Lead Admin, Lead Manager, Marketing, Resource Manager, Finance`, plus an implicit `Employee` every user always holds and which is never a selectable checkbox (auto-appended on creation, `api/auth.js`'s `createUser`). `hasRole(user, role)` (new, `api/scope.js`) replaces every old `user.role === '...'` check.
- **Old → new role mapping** (exact capability-preserving relabel, no net permission change for existing seed users): `Admin` → `Lead Manager` + `User Management`; `Manager` → `Lead Manager`; `Representative` → *(none, just implicit `Employee`)*; `BD Admin` → `Lead Admin`.
- **New user profile fields:** `employee_id, mobile_no, acting_belt_level, belt, domain, date_of_joining`. `belt`/`acting_belt_level` share a 9-value enum: `Potential Black, Black, White, Brown, Red, Potential Brown, Potential White, Potential Red, NA`.
- **New screens** (`pages/UsersList.jsx`, `UserForm.jsx`, `UserDetail.jsx`, `components/users/ResetPasswordDialog.jsx`), gated by `PERMISSIONS.manageUsers` (now `hasRole(user, 'User Management')` — the exact pre-existing hook point). Routes: `/users`, `/users/new`, `/users/:id`, `/users/:id/edit`.
- **Password handling remains fully mocked** — `password` is stored as plain text in the mock DB purely as a stand-in for the future hashed-password + DRF SimpleJWT flow (§17); login still doesn't check it.
- Marketing creating a lead now goes through the same owner-picker UX that Admin used to get (`LeadForm.jsx`'s `needsOwnerPicker`, generalized from the old `isAdmin` flag).
- Mock DB version bumped `lms-mock-db-v17` → **`lms-mock-db-v18`** (roles/fields shape change forces reseed).

---
*End of draft v0.7. Supply the real Mining/Extension workflows (§7.4), decide who/how a resource request gets fulfilled (§9.4) and how Resource Manager allocation actually works (§2), detail the Finance role's scope, and answer the remaining §19 items to close out phase 1 of the spec; see §21 for current build status.*
