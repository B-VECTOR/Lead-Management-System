**Lead Management System**

Product Requirements Document (PRD)

Version 4.0 · Draft

# 1. Document Overview

This PRD defines the product requirements for the Lead Management System (LMS) — an internal platform to manage the full lifecycle of a Business Development (BD) engagement, from first client contact through the 2-Hour Study, Solution Blueprint, Implementation, Mining, Extension, and Project Closure. It formalizes the workflow, stages, roles, permissions, and screen-level behavior needed for engineering to build the system.

A companion engineering document, `LMS_Technical_Requirements_updated.md`, provides the detailed data model, the full 28-task workflow table, and field-level specifications referenced throughout this PRD.

**What changed in v4.0 (rebuild against the updated workflow sheet `lms_updated_wf.csv`):**

- The workflow is now a single **BD → Extension → Mining** flow of **28 tasks** (was 17). Mining and Extension are **in scope**.
- Every task now belongs to a **Stage** (BD, 2HR, SnT, Implementation, Extension, Mining). Stage is a first-class, tracked concept — a lead can have **more than one stage open at once** (Mining and Extension run in **parallel**).
- The lead now carries a **Flow of tasks** selector (which stages run) and a **Type of Project** label, alongside **Type** (BD / Extension / Mining).
- **Resource Manager** (Shailesh) and **Finance** (Abhay) are both **live roles**. Finance now owns three **payment-approval gate tasks** (7, 15, 28). Resource allocation is done through workflow tasks, and the full allocation history (who worked which slot, for how long, including reassignments) is retained for the dashboard.
- **Project ID** is auto-generated at lead creation with the **current stage shown as a suffix** (e.g. `IN-PHNPDCFF26001-2HR`, `…-IM`, `…-E1`, `…-M`). ~~Now `Area + YY + Sequence`; Country and Industry codes are no longer part of the ID.~~ **Composition finalized by the user 2026-07-28:** Country Code + Industry + Area + Type of Project + Year + auto-generated number + stage of intervention — see §5.15.
- Lead **Status** is simplified to **In Progress / Hold / Dropped / Completed**. "Hybernation" and "Short Closed" statuses are removed; short-close remains as an **action** that routes to closure.
- ~~**Country** is dropped from the lead.~~ **Superseded 2026-07-28:** Country is captured on the lead again and leads the Project ID (§5.15). **Domain** is now **multi-select** *(built single-select per decision D2)*.

# 2. Goals

- Give BD owners a single system to progress an engagement through a structured, auditable, stage-based workflow with no manual hand-offs.
- Automate task sequencing so the right task opens for the right person at the right time.
- Let a lead's path be shaped up front by a **Flow of tasks** selection, while still honoring in-flow branch decisions.
- Support **Mining** (spinning a fresh BD cycle off a live engagement) and **Extension** (renewing an engagement) — including running them **in parallel** on the same project.
- Give the **Resource Manager** a clear allocation workflow and give management a **resource-history dashboard** — not just "occupied vs. free," but who worked which role, on which stage, for how many days, including reassignments.
- Give **Finance** payment-approval gates at the money checkpoints, with the ability to bounce a completed task back when payment hasn't landed.
- Provide Lead Admin and management full visibility into leads, stages, tasks, and follow-ups.
- Support hold/unhold at both lead and task level, and be mobile-responsive.

# 3. Tech Stack

| Layer | Choice |
|---|---|
| Backend | Django + Django REST Framework |
| Authentication | DRF SimpleJWT (access + refresh tokens) |
| Frontend | React JS |
| UI Styling | Tailwind CSS + shadcn/ui |
| Data fetching | React Query + Axios |
| Database | PostgreSQL |
| Admin / role & workflow management | Django default admin panel |
| Layout | Mobile-responsive |

# 4. Roles

Employee-level access applies to every user in addition to their specific role's permissions.

1. User Management
2. Lead Admin
3. Lead Manager
4. Marketing
5. **Resource Manager** — the allocation role (referred to as "Shailesh" in the workflow sheet)
6. **Finance** — the accounts/payment-approval role (referred to as "Abhay / Accounts" in the workflow sheet). **Active in this phase** (see §5.7).
7. Employee (default — applies to all users)

> **Change from v3:** Finance is no longer future-scope. It is a live role that owns the three payment-approval gate tasks (7, 15, 28).

# 5. Functional Requirements

## 5.1 User Management

The User Management role has full CRUD over user accounts, managed through the system and reflected in the Django admin panel.

User form fields:

- Username
- Password
- Roles — multi-select; a user can hold several roles at once. Each selected role is a membership in Django's built-in Groups table (one group per role); there is no role column on the user record. Permissions are any-match across a user's roles.
- Name — text
- Employee ID — number (≥ 0, no negatives, unique — duplicates rejected with a friendly message)
- Email — text
- Mobile No — text, exactly 10 digits (numeric only)
- Acting Belt Level — dropdown, from the Belt reference table (§5.17)
- Belt — dropdown, from the same Belt reference table (§5.17)
- Domain — dropdown, from the same Area (Domain) reference table used on the lead form (§5.17)
- Date of Joining — date (past dates allowed here; exempt from the global "no past dates" rule)

## 5.2 Lead Creation — Lead Manager vs. Marketing

### 5.2.1 Fields

| Field | Type | Required |
|---|---|---|
| Company Name | Text | Yes |
| Project Name | Text | Yes |
| Industry | Dropdown (reference table) | Yes |
| Domain | **Multi-select** dropdown (reference table) | Yes |
| Division | Text | No |
| Scope | Text | No |
| Assigned To | Dropdown — BD users | Yes (Lead Manager); left blank for Marketing |
| Type | BD / Extension / Mining | Yes |
| Flow of tasks | Dropdown (4 options — §5.3.1) | Yes |
| Type of Project | Dropdown (6 options — §5.2.2) | Yes |
| Status | System-managed | Auto |

> **Country is captured on the lead** (decision 2026-07-28, reversing v4.0's removal) — it is a **required** dropdown and its code leads the Project ID (§5.15).
> **Domain is multi-select.** A lead can carry more than one Area/Domain. See §5.15 for how the primary Domain feeds the Project ID.

### 5.2.2 Type of Project (label)

**Type of Project** is a classification label used for reporting, filtering, and dashboards. It **does not change which tasks run** — the task path is decided by Type + Flow of tasks (§5.3). Options: *Consulting Full Fledged, AMC, Upgrade, Vectorflow Lite, Audit only, Consulting Lite + No software.*

### 5.2.3 Status Flow

| Status | How set | Notes |
|---|---|---|
| In Progress | System — on creation | Default. Active workflow. |
| Hold | User — manual | Pauses the workflow and all its open tasks. Set via a popup that captures an optional hold remark. |
| Dropped | User — manual, **or** system via Task 8 | Cancels the lead. Set via a popup with an optional drop remark. May also be set automatically when Task 8 "Go-ahead received?" = No (§5.5). |
| Completed | System — auto | Set when **both** Task 27 (Project Closure) **and** Task 28 (Project Closure Accounts Approval) close. Cannot be set manually. |

> Removed from v3: **Hybernation** and **Short Closed** are no longer statuses. Short-close remains as an action (§5.12) that routes the lead to closure and ends as Completed like any other closure.

### 5.2.4 Two ways a lead enters the system

- **Lead Manager:** adds a lead and selects the owner (assigned_to) directly. The workflow starts immediately on save.
- **Marketing:** uses the same form but has no access to assigned_to (hidden/disabled). On save, assigned_to is left blank (NULL — no "Not Assigned" value is stored; the label is rendered by the app) and the workflow does not start yet.

Lead Admin can open any "Not Assigned" lead and assign an owner; that assignment starts the workflow (opens Task 1). Marketing retains view/edit access to leads they created (all fields except assigned_to) at any time.

Industry and Domain/Area dropdowns are populated from admin-managed reference tables (§5.17), not hardcoded lists.

## 5.3 Stages, Types, and the Flow of Tasks

The workflow is organized into **Stages**, each a group of tasks:

| Stage | Tasks | Purpose |
|---|---|---|
| BD | 1–2 (and Mining task 21) | Introduction, first meeting, 2HR agreement |
| 2HR | 3–8 | 2-Hour Study & Presentation, reimbursement, accounts approval, Solution Blueprint confirmation |
| SnT | 9–16 | Solution Blueprint proposal, study, payment, accounts approval, Project Proposal Submission |
| Implementation | 17–20 | Team & auditor allocation, initiation, implementation |
| Mining | 21 | Exploit Mining Opportunities (spawns a fresh BD cycle) |
| Extension | 22–26 | Extension proposal, detail, team & auditor allocation, extension implementation |
| Closure | 27–28 | Project closure + accounts approval |

Stage is **tracked as its own record** with its own start/end dates and status, so the dashboard can report how long each stage took and who worked it. **A lead can have two stages open at once** — Mining and Extension can run in parallel on the same project.

### 5.3.1 Type (macro entry point)

| Type | Behavior |
|---|---|
| BD | Runs the workflow from Task 1, shaped by the Flow of tasks selection. |
| Mining | Runs the workflow from Task 1 with a `-M` marker on the Project ID (§5.15). |
| Extension | Enters directly at the Extension stage (Task 22, Extension Proposal). Flow of tasks does not apply. |

### 5.3.2 Flow of tasks (BD & Mining only)

The Flow of tasks selection decides which stages run for a BD/Mining lead. In-flow branch questions (Tasks 8, 12, 13) still operate for the paths that reach them.

| Flow | Intro (1–2) | 2HR (3–8) | SnT (9–15) | From Project Proposal (16→) |
|---|---|---|---|---|
| 1 · DEFAULT (2hr → SnT → Proposal) | ✓ | ✓ | ✓ | ✓ |
| 2 · 2hr → Project Proposal | ✓ | ✓ | ✗ | ✓ (Task 8 "SnT required = No" routes to Task 16) |
| 3 · Direct Project Proposal | ✗ (skips intro) | ✗ | ✗ | ✓ (enters at Task 16) |
| 4 · SnT → Project Proposal | ✓ | ✗ | ✓ | ✓ |

Stages that a flow skips are marked **Skipped** so the path taken is explicit and the tracker stays accurate.

## 5.4 The 28-Task Workflow

The workflow is a fixed, ordered sequence of **28 tasks** grouped by stage. Task 1 opens once the lead has an assigned owner (except Direct Proposal, which opens at Task 16). Each task contains a checklist and, in most cases, additional fields the assignee must complete. A task can be closed only when all its checklist items are complete and all mandatory fields are filled — closing a task opens the next task per the routing rules. Some tasks branch, some loop, and some (Finance gates) can **re-open a previously closed task**.

The full 28-task table — names, assignees, checklists, extra fields, stage, and routing notes — is in the Technical Requirements document (§5). The key behaviors and branch points are summarized below.

**Stage entry & conditional allocation**

- **Task 2 (2HR Study Agreement)** asks *"Is manpower support required from the resource allocation team?"* If **Yes**, Task 3 (2HR Team Allocation) opens against the Resource Manager and captures manpower. If **No**, Task 3 is **skipped** and the **Default BD Person** carries the study (Task 5) themselves.
- **Allocation tasks** (3, 10, 17, 18, 24, 25) are worked by **Shailesh + the Default BD Person** — two people can allocate. They capture Execution Red / Execution Brown / White (each named to a real person — no "TBD" occupant), plus the Resource Manager's own named team slots Project Member 1–10 (optional). **Auditor allocation is split into its own tasks** (18 for implementation, 25 for extension) and captures Auditor 1–4 (1–2 required, 3–4 optional); Task 18 is a **hanging task** (non-blocking — it can be completed in parallel and does not hold up the sequence), and it closes itself if the auditors were already allocated in advance. See §5.7.

**Branch points**

- **Task 8 (Solution Blueprint Confirmation):**
  - *"Go-ahead received from client?"* — **No** → the lead is **Dropped**, no further tasks open, **but Tasks 6 and 7 remain open** (reimbursement and its accounts approval still need to complete).
  - *"Is Solution Blueprint required?"* — **No** → skip the SnT body and open **Task 16 (Project Proposal Submission)**. **Yes** → continue into the SnT stage.
- **Task 12 (Solution Blueprint)** and **Task 13 (Repeat Presentation):**
  - *"Re-presentation required?"* — **Yes** → open Task 13 (loops).
  - **No** + *"Has project moved to the next stage?"* = **Yes** → open **Task 14 (Solution Blueprint Payment)** and **Task 16 (Project Proposal Submission)**.
  - **No** + moved to next stage = **No** → open **Task 27 (Project Closure)** directly.
- **Task 21 (Exploit Mining Opportunities):** *"Client go-ahead for a new project?"* — **Yes** → a **new Project ID with a `-M` marker** is opened and a **fresh BD cycle begins from Task 1** (see §5.15, Mining). Mining runs **in parallel** with any ongoing extension.
- **Task 22 (Extension Proposal):** *"Extension approved?"* — **Yes** → Task 23 (Extension Detail) and the extension cycle. **No** → Task 27 (Project Closure). The extension cycle can loop (an extension of an extension); each loop increments the extension marker `-E1 → -E2 → -E3` (§5.15).

**Closure**

- **Task 27 (Project Closure)** opens when any of: the engagement end date is reached, extension not approved, a short-close is triggered, or a "moved to next stage = No" branch fires. **When Task 27 opens, the currently allocated resources are released** (§5.7).
- **Task 28 (Project Closure Accounts Approval)** is Finance's final gate. **The lead becomes Completed only when both Task 27 and Task 28 are closed.**

## 5.5 Automatic Drop (Task 8)

In addition to the manual Drop action (§5.8), a lead is **dropped automatically** when Task 8's *"Go-ahead received from client?"* = No. On this drop: no further workflow tasks open, the lead status becomes **Dropped**, and **Tasks 6 and 7 remain open** so the 2HR reimbursement and its accounts approval can still be completed. The manual drop popup remark rules (§5.8) apply; the system records the drop with the acting user and timestamp.

## 5.6 Checklists

Each checklist item has two editable fields: status (not_started / inprogress / complete) and remark. An edit icon opens a popup with these two fields; an item can also be checked/unchecked directly by clicking its tickmark (toggles complete ↔ not started).

- Checklist edits save independently of task closure — every save persists immediately and records the timestamp and editing user.
- A checked item can be unchecked; there is no one-way lock.

## 5.7 Resource Allocation & Resource History (Resource Manager)

Resource allocation is performed through the workflow allocation tasks (3, 10, 17, 18, 24, 25), worked by **Shailesh (Resource Manager) + the Default BD Person**. Each allocation captures the resources for that stage:

- **Team allocation** (3, 10, 17, 24): Execution Red, Execution Brown, White, **plus the named team slots Project Member 1–10**. **Every slot names a real person** — there is no "TBD" occupant (decision 2026-07-29: TBD is not a user; a slot still to be decided is simply left unfilled, and can be filled later while the resources are allocated).
- **Auditor allocation** (18, 25): **Auditor 1–4** — 1 and 2 are required to submit, 3 and 4 are optional. Task 18 is a **hanging task** — non-blocking, completable in parallel.
- **The named extras (Project Member 1–10, Auditor 3–4) are the Resource Manager's own.** Only that role sees or fills them — the Default BD Person, who may also staff an allocation task, works Execution Red / Brown / White only, and a lead's Resources tab shows just those three. They are always optional: leaving one empty is neither under-allocation nor a submit blocker.
- **Allocation in advance.** An allocation task that is scheduled but not yet due can be staffed early from the Resources screen. For **Task 18** this is final: if both auditors are allocated by the time the task's date arrives, the task **completes itself on opening** and never appears as outstanding work; if they are not, it opens and waits to be staffed as normal.
- **Changing a person mid-engagement.** Submitting an allocation does not freeze it. For as long as the resources are still allocated (i.e. until they are released), the **Resource Manager** can change who holds a slot; the outgoing person's allocation is released and a new one opened in its place (see Resource History below), and any open task the outgoing Execution Red was working moves to the incoming one. The Default BD Person's own staffing rights end when the allocation task closes.

**Resource History (dashboard requirement).** The system keeps a full, append-only history of allocations — not just whether a resource is currently occupied or free, but **who was allocated to which slot (Red / Brown / White / Auditor), on which stage, from when to when, and every reassignment**. A reassignment does not overwrite the previous record: the old allocation is **released** (with a release date) and a **new** allocation is opened, linked to the one it replaces. This lets the dashboard later report how many days each resource worked on each stage, and how the allocation changed over time.

**Manpower context & indicators.** When allocating, the Resource Manager sees the manpower figure captured upstream (Task 2 for 2HR, Task 9 for SnT, Task 16 for the project). If more resources are allocated than the approved manpower, a **red over-allocation** indicator appears; if fewer, an **amber under-allocation** indicator appears.

**Release of resources.** A stage's resources are released when that stage's work ends. In particular, the Implementation/Extension resources default to showing as occupied on the project **until Task 27 (Project Closure) opens**, at which point the currently allocated resources are released.

**Screen access.** The Resource Manager works **entirely inside the Resource module** — they do not get the Leads tab. Their Resources screen lists every allocation task waiting on them (including ones **not yet due**, so a team or the auditors can be staffed ahead of time) and each row opens in place to the slots and the submit action. Alongside it they have **Resource History** (days worked per resource, per slot and stage, with reassignment chains) and **Project Closure**. The lead's Default BD Person staffs their own lead's allocation from the lead's task list, as before.

## 5.8 Lead & Task Hold / Unhold

Lead-level hold puts all currently open tasks on hold; unholding restores them. A held task cannot be edited; unholding restores normal edit behavior. Every hold/unhold records the acting user and timestamp.

Hold, Unhold, and Drop are each confirmed through a popup asking for a remark — the remark is **optional**; the action proceeds with or without one. Remarks are stored against the hold/unhold cycle (and on the lead for drops), appended to the activity log, and shown as a banner on the Lead/Task detail pages. A lead-level hold/unhold copies its remark onto the task holds it creates or releases.

A **Hold Items** menu is required, with a Hold Leads view and a Hold Tasks view.

## 5.9 Visibility Model

Each BD owner sees only the leads assigned to them and all tasks under those leads. Within a lead, a task assigned to a different user is view-only for the owner.

## 5.10 Finance Role (Abhay) — Payment Approval Gates

Finance is a **live role** owning three payment-approval gate tasks that sit right after the money checkpoints:

| Gate task | Follows | Purpose |
|---|---|---|
| Task 7 — 2HR Reimbursement Accounts Approval | Task 6 (2HR Reimbursement) | Confirm reimbursement payments received |
| Task 15 — Solution Blueprint Payment Accounts Approval | Task 14 (Solution Blueprint Payment) | Confirm SnT payments received |
| Task 28 — Project Closure Accounts Approval | Task 27 (Project Closure) | Confirm all fees received before completion |

Each gate asks: *"Payment received against all invoices?"*

- **Yes** → Finance closes the gate; the workflow proceeds.
- **No** → Finance closes the gate **with a remark**, and the system **re-opens the immediately preceding task** so the responsible person chases the outstanding payment. When they close it again, the gate re-opens for Finance. This can repeat until payment is confirmed.

This introduces a deliberate exception to the usual "closed is final" rule: **a Finance gate can re-open a previously closed task.** The task history retains every close → re-open → close cycle for audit. The lead reaches **Completed** only when both Task 27 and Task 28 are closed.

## 5.11 Follow-Up Requests

Anyone who can view a lead (its owner, a task assignee, the Resource Manager, …) may raise a follow-up on it, from the lead's Follow-up tab or a standalone "Other Tasks" screen. The follow-up form captures: the lead, an assignee (any Employee-role user, including the creator), a follow-up date, and a remark. The "Other Tasks" screen surfaces follow-ups relevant to the logged-in user.

## 5.12 Short-Close

The engagement can be short-closed to move it straight to closure regardless of which step it is on. When Task 26 (Extension Implementation) opens, Shailesh is given short-close access. Triggering a short-close opens **Task 27 (Project Closure)** and sweeps whatever other task is currently open, on hold, or waiting on a date trigger to **Skipped** in the same action. A **remark is compulsory** on short-close (the confirm control stays disabled until a remark is typed).

> **Change from v3:** there is **no separate "Short Closed" status**. A short-closed engagement runs Task 27 (and Task 28) and ends as **Completed**, like any other closure — the short-close remark and the swept-task notes remain in the record for traceability.

## 5.13 Lead Admin

Lead Admin has view access to all screens except User Management, and can assign owners to "Not Assigned" (Marketing-sourced) leads (§5.2), which starts the workflow.

## 5.14 Field Validation Rules

- Numeric fields: zero is allowed; negatives are not allowed anywhere.
- Date fields: past dates are not allowed — every date must be today or later. Exception: Date of Joining on the user form (historical, past dates allowed).
- Mobile fields: exactly 10 digits, numeric only.

## 5.15 Project ID Generation

**Composition finalized 2026-07-28.** The Project ID is readable at a glance: it tells you what the engagement is and **where the project stands**. It is a **stable base code** plus the **current stage** as a suffix (and a `-M` marker for mining-originated cycles).

**Base code:** Country Code + Industry + Area + Type of Project + Year + auto-generated number:

```
IN-PHNPDCFF26001
│  │  │  │  │ └── 001  auto-generated number (one counter per year)
│  │  │  │  └──── 26   year
│  │  │  └─────── CFF  type of project
│  │  └────────── NPD  area (the lead's Domain)
│  └───────────── PH   industry
└──────────────── IN   country
```

Type-of-Project codes: Consulting Full Fledged `CFF`, AMC `AMC`, Upgrade `UPG`, Vectorflow Lite `VFL`, Audit only `AO`, Consulting Lite + No software `CLNS`. The Country, Industry and Area codes come from their reference tables (§5.17).

- The base code is generated automatically at **lead creation** and **never changes** for that project — editing the lead's Country, Industry, Domain or Type of Project afterwards does **not** renumber an ID that is already in circulation on tasks, allocations and reports.
- The **auto-generated number is one counter per year**, shared across all countries, industries, areas and project types — so `…26001`, `…26002`, `…26003` never repeat within a year.
- The lead's Domain supplies the Area code. *(The spec's multi-select Domain would use the primary/first-selected one; Domain is built single-select per decision D2.)*

**Displayed ID = base code [+ `-M`] + `-` + current stage code**, e.g.:

| Situation | Displayed ID |
|---|---|
| BD stage | `IN-PHNPDCFF26001-BD` |
| 2HR stage | `IN-PHNPDCFF26001-2HR` |
| SnT stage | `IN-PHNPDCFF26001-SnT` |
| Implementation | `IN-PHNPDCFF26001-IM` |
| First extension loop | `IN-PHNPDCFF26001-E1` |
| Second extension loop | `IN-PHNPDCFF26001-E2` |
| Mining cycle | `IN-PHNPDCFF26001-M` |
| Mining cycle that itself extends | `IN-PHNPDCFF26001-M-E1` |

- **Extension marker `-E1 / -E2 / -E3 …`** — the number is the extension **loop counter**; the **first** extension shows `-E1` (numbering starts at 1 — user decision 2026-07-29). It increments each time the extension cycle repeats.
- **Mining (`-M`)** — when Task 21 = Yes, a **new lead record is created for the same project** (same base code, so no new number is consumed), carrying the `-M` marker and a link back to the parent lead, and a fresh BD cycle begins from Task 1. Because it is a separate lead record, its Mining stage can run **in parallel** with the parent's Extension stage; the data for each is tracked independently.
- The stage suffix is **derived** from the lead's current stage — it is display logic, not a stored key. Internally the system joins on stable identifiers, never on the suffixed string.

## 5.16 Workflow Configuration

Workflows are stored as JSON in a workflow table rather than hardcoded, so the task engine reads the active workflow definition for a given lead. The Django admin panel provides add/edit access with fields: Name, Type, Workflow (JSON), Status. This lets the workflow evolve without changing the engine code.

## 5.17 Reference Data — Industry, Area, Belt

Country, Industry, Area (Domain), and Belt are each maintained as their own reference table (not hardcoded lists), so the business can add, rename, or recode entries without a deployment. Each carries a status column (active/inactive, default active); only active rows appear in dropdowns.

- **Country**, **Industry** and **Area** follow the id / name / code / status shape.
- **Belt** carries id / name / order / status (order drives dropdown sort). Belt has no code.
- The **Country, Industry and Area codes** all feed the Project ID base (§5.15), alongside the Type of Project's code.

> **Country reference table is live** (decision 2026-07-28, reversing v4.0's removal) — Country is captured on the lead and its code is the Project ID's leading segment. Same id / name / code / status shape as Industry and Area.

Seed data:

**Country:** India (IN), Indonesia (ID).

**Industry:** Auto Comp (COMP), Auto OEM (OEM), Banking (BNK), Building & Construction Goods (BCG), CapEx (CEX), Consumer Goods (CG), EPC (EPC), ETO (ETO), FMCG (FMCG), FMEG (FMEG), Industrial Goods (IG), Information Technology (IT), Machinery & Equipment (ME), Organised Retail (RE), Pharma & Chemical (PH), Textile & Fashion (TX).

**Area (Domain):** B2B Sales (B2B), B2C Sales (B2C), Distribution (DIST), NPD (NPD), Operations (OPS), Projects (PROJ), Supply Chain (SC), VectorFLOW AMC (VFAMC), VectorFLOW Upgrade (VFUPG), VectorPRO AMC (VPAMC), VectorPRO Upgrade (VPUPG).

**Belt:** Potential Black, Black, White, Brown, Red, Potential Brown, Potential White, Potential Red, NA.

## 5.18 Leads List — Tracker & Column Filters

Every lead row shows a **Tracker** column: a progress bar driven by task closure (closed vs. total workflow task instances, plus a percentage). Skipped tasks are excluded from the total; extension/mining/repeat cycles add instances, so the tracker reflects real remaining work. The bar is colored by lead status (green while In Progress or Completed, amber on Hold, red on Dropped); leads whose workflow hasn't started show "Not started".

Every column is filterable from a filter row under the headers: free-text search for Company/Project and Project ID, and dropdown filters for Industry, Domain, Owner (including "Not Assigned"), Current Stage, Current Task, and Status. Options are built from the data on screen, all filters combine (AND), and a "Clear filters" action resets them.

# 6. Role Permission Matrix

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
| Work resource-allocation tasks | No | No | No | No | Yes (+ BD owner co-assignee) | No | No |
| Work Finance approval gates (7,15,28) | No | No | No | No | No | No | Yes |
| Add follow-up on a viewable lead | Yes | Yes | No | Yes | Yes | Yes | Yes |
| View own follow-up tasks | Yes | Yes | No | Yes | Yes | No | No |
| View all follow-up history | No | Yes (Lead Detail) | No | No | No | No | No |
| View / add / edit resource allocation & history | No | No | No | No | Yes | No | No |
| View own leads-funnel dashboard | Yes | Yes | No | No | No | No | No |
| View all leads-funnel dashboard | No | Yes | No | No | No | No | No |
| Manage users | No | No | Yes | No | No | No | No |
| View own activity log | Yes | Yes | No | No | Yes | No | Yes |
| View all activity log | No | Yes | No | No | No | No | No |

# 7. Non-Functional Requirements

- Mobile-responsive layout across all screens.
- JWT-based auth (access + refresh); role-based authorization enforced on every endpoint.
- Every checklist, task, hold/unhold, allocation, and Finance-approval action is timestamped and attributable to a user; task history retains re-open cycles.
- Polished, modern UI (Tailwind + shadcn/ui).
- Global numeric and date validation enforced server-side.
- Every table carries audit columns (created_by, created_on, updated_by, updated_on).

# 8. Out of Scope (This Phase)

- **Email / in-app notifications.** The workflow marks notification points ("trigger mail to accounts on Task 5 / 9 close") but the **email integration is deferred** — captured as workflow notes only, no outbound email in this phase.
- **Sutradhar integration.** Sutradhar is an external system; the "add project on Sutradhar" note is recorded for context only — no integration is built now (a future decision).

# 9. Related Documents

`LMS_Technical_Requirements_updated.md` — full data model, complete 28-task workflow table, stage model, resource-history design, and Project ID composition.
