**Lead Management System**

Product Requirements Document (PRD)

Version 1.0 · Draft

# 1. Document Overview

This PRD defines the product requirements for the Lead Management System (LMS) --- an internal platform to manage the full lifecycle of Business Development (BD) leads, from first client contact through implementation, extensions, and project closure. It formalizes the workflow, roles, permissions, and screen-level behavior needed for engineering to build the system.

A companion engineering document, LMS_Technical_Requirements.md, provides the detailed data model, full BD workflow task table, and field-level specifications referenced throughout this PRD.

# 2. Goals

-   Give Lead Managers a single system to create and progress leads through a structured, auditable BD workflow.

-   Automate task sequencing so the right task opens for the right person at the right time, with no manual hand-offs.

-   Give the Resource Manager a clear resource-allocation workflow tied directly to workflow tasks, with visibility into over-allocation against approved man-power.

-   Provide Lead Admin and management full visibility into leads, tasks, and follow-ups across the organization.

-   Support hold/unhold at both lead and task level.

-   Be mobile-responsive and usable from any device.

# 3. Tech Stack

  -----------------------------------------------------------------------------------
  **Layer**                            **Choice**
  ------------------------------------ ----------------------------------------------
  Backend                              Django + Django REST Framework

  Authentication                       DRF SimpleJWT (access + refresh tokens)

  Frontend                             React JS

  UI Styling                           Tailwind CSS + shadcn/ui

  Data fetching                        React Query + Axios

  Database                             PostgreSQL

  Admin / role & workflow management   Django default admin panel

  Layout                               Mobile-responsive
  -----------------------------------------------------------------------------------

# 4. Roles

The system supports the following roles. Employee-level access applies to every user in addition to their specific role\'s permissions.

1.  User Management

2.  Lead Admin

3.  Lead Manager

4.  Marketing

5.  Resource Manager

6.  Finance

7.  Employee (default --- applies to all users)

# 5. Functional Requirements

## 5.1 User Management

The User Management role has full CRUD access over user accounts, managed through the system (and reflected in the Django admin panel for role/user administration).

User form fields:

-   Username

-   Password

-   Role

-   Name --- text

-   Employee ID --- number (≥ 0, no negative values)

-   Email --- text

-   Mobile No --- number (≥ 0, no negative values)

-   Acting Belt Level --- dropdown, sourced from the Belt reference table (section 5.17)

-   Belt --- dropdown, sourced from the same Belt reference table (section 5.17)

-   Domain --- dropdown, sourced from the same Domain/Area reference table used on the lead form (section 5.17)

-   Date of Joining --- date field (past dates allowed here --- exempt from the global \"no past dates\" rule, since joining dates are historical)

## 5.2 Lead Creation --- Lead Manager vs. Marketing

## 4.1 Fields

  ------------------------------------------------------------------------
  **Field**                **Type**                    **Required**
  ------------------------ --------------------------- -------------------
  Country                  Dropdown                    Yes

  Company Name             Text                        Yes

  Project Name             Text                        Yes

  Industry                 Dropdown                    Yes

  Domain                   Dropdown                    Yes

  Division                 Text                        No

  Scope                    Text                        No

  Assigned To              Dropdown --- BD users       Yes

  Type                     BD / Mining                 Yes

  Status                   System-managed              Auto
  ------------------------------------------------------------------------

## 4.2 Status Flow

  -----------------------------------------------------------------------------------------------------------
  **Status**       **How set**              **Notes**
  ---------------- ------------------------ -----------------------------------------------------------------
  In Progress      System --- on creation   Default. Active workflow.

  On Hold          BD user --- manual       Pauses workflow and all its open task

  Dropped          BD user --- manual       Cancels the lead.

  Hybernation      System --- auto          Set when Implementation task is closed. Cannot be set manually.

  Complete         System --- auto          Set when final task is closed. Cannot be set manually.
  -----------------------------------------------------------------------------------------------------------

## 

There are two ways a lead enters the system:

-   Lead Manager: adds a lead and selects the owner (assigned_to) directly. The BD workflow starts immediately on save.

-   Marketing: can add a lead using the same form, but has no access to the assigned_to field --- it is hidden/disabled. On save, assigned_to is automatically set to \"Not Assigned\" and the workflow does not start yet.

Lead Admin can open any \"Not Assigned\" lead and assign an owner to it. That assignment action is what starts the BD workflow (opens Task 1) for a Marketing-sourced lead.

Marketing also has view and edit access to the leads they created (all fields except assigned_to) at any point afterward --- not just at initial creation.

The lead form\'s Country, Industry, and Domain/Area dropdowns are populated from three admin-managed reference tables (Country, Industry, Area) rather than hardcoded choice lists --- see section 5.17. The Country field is currently limited to India and Indonesia, per the seeded reference data. Domain/Area is confirmed single-select (one value per lead).

## 5.3 Lead Management & the BD Workflow

Each lead has a lead_type field with two options: BD and Mining. Selecting BD starts the BD workflow once the lead has an assigned owner, per section 5.2 (Mining is planned for a future phase and is out of scope here).

The BD workflow is a fixed, ordered sequence of 17 tasks. Task 1 opens once the lead is assigned an owner. Each task contains a checklist and, in most cases, a set of additional fields the assignee must complete. A task can only be closed once all of its checklist items are marked complete and all mandatory extra fields are filled --- closing a task automatically opens the next task in sequence (per the routing rules in the workflow). When the final task (Project Closure) is closed, the lead\'s status changes to Complete.

The full 17-task table --- names, assignees, checklist items, extra fields, and notes on routing/branching --- is shown below.

**Full BD Workflow --- Tasks 1--17**

  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  **\#**   **Task Name**                              **Assigned To**                                                **Checklist**                                                                                                                                                                                                                                                                             **Extra Fields**                                                                                                                                                                                                                                                  **Notes**
  -------- ------------------------------------------ -------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
  1        Introduction and First Meeting             Default BD Person                                              1.1 Vector\'s Intro Email · 1.2 Intro presentation to decision maker · 1.3 Area of work/objective agreed · 1.4 Email sent to initiate study · 1.5 First meeting completed                                                                                                                 Expected start date of next stage; Manpower required (Brown --- number, White --- number); Key stakeholder contact form (Name, Role --- 3 rows default + \"add more\")                                                                                            First task; opens once the lead is assigned an owner

  2        2Hr Study & Presentation Team Allocation   Resource Manager (default)                                     None --- allocation task                                                                                                                                                                                                                                                                  Status only (pending until closed)                                                                                                                                                                                                                                Opens per configured offset before the expected start date from Task 1. Creates resource_allocation row (type = 2HR): execution_red, execution_brown, white, auditor1, auditor2 (TBD allowed for white)

  3        2Hr Study & Presentation                   User assigned by Resource Manager in Task 2                    3.1 Study plan done · 3.2 NDA formality completed · 3.3 Study interactions done · 3.4 Data received · 3.5 2Hr presentation date confirmed · 3.6 2Hr presentation done                                                                                                                     Date of 2Hr presentation (date); Key stakeholders mapped form (Name, Role --- 3 rows + add more)                                                                                                                                                                  

  4        2Hr Study Reimbursement                    User assigned by Resource Manager in Task 2                    4.1 Reimbursement expenses invoiced · 4.2 Reimbursement expenses received                                                                                                                                                                                                                 Delay reasons if any (text); Expected date of receipt (date)                                                                                                                                                                                                      Opens after 3.6. On close: the 2HR resource_allocation row (Task 2) auto-closes --- resources freed up.

  5        Solution Blueprint Proposal                Default BD Person                                              5.1 Proposal submitted · 5.2 Proposal terms agreed                                                                                                                                                                                                                                        Is Solution Blueprint required? (Yes/No). If Yes: Fee for engagement (allow zero, no negative); Manpower (Brown, White); Expected start date of next stage; Number of tranches of payment                                                                         Opens after 3.6. If No → skip to Task 10 (Project Proposal Submission)

  6        Solution Blueprint Team Allocation         Resource Manager (default)                                     None --- allocation task                                                                                                                                                                                                                                                                  Status only                                                                                                                                                                                                                                                       Opens per configured offset before the expected start date from Task 5. Creates resource_allocation row (type = SNT): execution_red, execution_brown, white, auditor1, auditor2

  7        Solution Blueprint                         User assigned by Resource Manager (Solution Blueprint block)   7.1 Engagement start · 7.2 Initial invoice raised · 7.3 Data receipt · 7.4 Presentation dates locked · 7.5 SnT workshop done · 7.6 Completion invoice                                                                                                                                     Presentation date (date); Invoices raised block (Invoice Number, Value, Date --- 3 rows + add more); Re-presentation required? (Yes/No)                                                                                                                           If re-presentation required → Yes opens Task 8; No → opens Task 9

  8        Solution Blueprint Repeat Presentation     Same execution red/BD/brown as Task 7 (default)                8.1 Presentation dates locked · 8.2 SnT workshop done                                                                                                                                                                                                                                     Presentation date (linked to 8.1); Re-presentation required again? (Yes/No)                                                                                                                                                                                       Loops back to itself if Yes, else opens Task 9

  9        Solution Blueprint Payment                 User assigned by Resource Manager (Solution Blueprint block)   9.1 Fixed fee invoices received · 9.2 Reimbursement expenses invoiced · 9.3 Reimbursement expenses received                                                                                                                                                                               Delay reasons if any (text); Expected date of receipt (date)                                                                                                                                                                                                      On close: the SNT resource_allocation row (Task 6) auto-closes --- resources freed up.

  10       Project Proposal Submission                Default BD Person                                              10.1 Proposal submission · 10.2 Terms agreed                                                                                                                                                                                                                                              Planned engagement start date; Planned engagement end date; Period (months); Fixed fee (blocks by period months, capturing fee + manpower per block); Total variable fee cap; Variable milestone fee cap; Variable performance fee cap; Manpower (Brown, White)   Entry point when Solution Blueprint was skipped

  11       Project Team Allocation                    Resource Manager (default)                                     None --- allocation task                                                                                                                                                                                                                                                                  Status only                                                                                                                                                                                                                                                       Opens per configured offset before Planned Engagement Start Date (Task 10). Creates resource_allocation row: execution_red, execution_brown, white, auditor1, auditor2

  12       Implementation                             Execution red (assigned by Resource Manager via Task 11)       12.1 Handover & engagement start · 12.2 PO from customer · 12.3 First fixed fee invoice raised · 12.4 Agreement/contract · 12.5 Variable parameter finalisation · 12.6 Variable baseline sign-off · 12.7 Addendum agreement · 12.8 Expected variable fee over eligible period submitted   Actual engagement start date; Modified planned engagement end date; Period (months); Actual fixed fee invoice date; Variable fee start date                                                                                                                       On close: lead status → Hybernation. leads.extension defaults to 00. Project ID is generated and stored on lead. A Project History (project_details) row is created for this cycle. The Implementation resource_allocation row stays Open --- it does not auto-close here.

  13       Extension Proposal                         View: same BD; Edit: execution red                             13.1 Discuss next set of problems with client · 13.2 Identify area of extension · 13.3 Solution design & preparation · 13.4 Pitch extension proposal                                                                                                                                      Extension approved? (Yes/No)                                                                                                                                                                                                                                      Opens per configured offset (2 months) before engagement end date (Task 12). If No → opens Task 17. If Yes → opens Task 14

  14       Extension Detail                           View: same BD; Edit: execution red                             13.8 Addendum agreement · 13.9 Expected variable fee over eligible period submitted                                                                                                                                                                                                       Engagement start date; Engagement end date; Period (months); Actual fixed fee invoice date; Variable fee start date; Manpower (Brown, White)                                                                                                                      Opens only if Task 13 approved = Yes

  15       Project Extension Team Allocation          Resource Manager (default)                                     None --- allocation task                                                                                                                                                                                                                                                                  Status only                                                                                                                                                                                                                                                       Opens if Task 13 approved = Yes. Creates resource_allocation row (type = Extension)

  16       Extension Implementation                   Execution red (assigned by Resource Manager via Task 15)       Same checklist set as Task 12 (12.1--12.8)                                                                                                                                                                                                                                                Engagement start date; Engagement end date; Period (months); Actual fixed fee invoice date; Variable fee start date                                                                                                                                               On close: leads.extension increments by one (00→01→02\...); Project ID is regenerated. Previous Project History row is marked Extended; a new one is created for this cycle. That Extension resource_allocation row stays Open --- it does not auto-close here. Then loops back to Task 13. Repeats until Task 13 = No

  17       Project Closure                            Execution red                                                  16.1 All fixed fee received · 16.2 All variable fee received · 16.3 All reimbursements received                                                                                                                                                                                           Final closed (Yes/No)                                                                                                                                                                                                                                             Opens when any of: engagement end date (from Task 12) is reached, or Task 13\'s \"Extension approved\" = No, or Resource Manager short-closes from Project Closure screen. On close: lead status = Complete; current Project History row status = Complete; every Implementation/Extension resource_allocation row for this lead auto-closes at once.
  --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

Key branch points:

-   Task 5 (Solution Blueprint Proposal): if \"Is Solution Blueprint Required\" = No, the workflow skips directly to Task 10 (Project Proposal Submission).

-   Task 7/8 (Solution Blueprint presentations): a repeat-presentation loop runs until no further re-presentation is required.

-   Task 12 (Implementation): on closure, the lead status changes to Hybernation, and a Project ID is generated for the first time and stored against both the lead and its resource allocation record --- see section 5.15.

-   Task 13 (Extension Proposal): drives a repeatable Extension cycle (Tasks 13→16) until \"Extension approved\" = No, at which point Task 17 (Project Closure) opens.

-   Task 16 (Extension Implementation): on closure, the lead\'s extension counter increments and the Project ID is regenerated with the new extension value --- see section 5.15.

## 5.4 Checklists

Each checklist item has two editable fields: status (not_started / inprogress / complete) and remark. An edit icon against each checklist item opens a popup containing these two fields.

-   Checklist edits save independently of task closure --- every save persists immediately.

-   Every save captures the edit timestamp and the editing user.

-   A checked item can be unchecked; there is no one-way lock.

## 

## 5.5 Task Rules

1.  A task can be closed only once all its checklist items are complete and all mandatory extra fields are filled.

2.  A task is visible and editable only to its assigned user.

3.  If a task isn\'t assigned to a given user but the parent lead is assigned to them, that user gets view-only access to the task.

> **Phase 13 override (2026-07-15, confirmed with the user):** for the post-allocation execution tasks (3, 4, 7, 8, 9, 12, 13, 14, 16, 17) the *editor* is the allocated **Execution Brown together with the allocated White(s)** — not the Execution Red. The **Execution Red is a view-only overseer** of every step in the block (as are the BD owner / Lead Manager). The task's `assigned_to` is the Brown (or the first White when there is no Brown); the other Whites of the same allocation may co-edit. This supersedes the "Edit: execution red" cells in the workflow table above for those tasks.

4.  Closed tasks are not editable.

5.  Allocation tasks (Tasks 2, 6, 11, 15) have no checklist or extra fields --- they simply show a Pending status until the Resource Manager completes the corresponding resource allocation.

6.  Every task provides both a \"Save as Draft\" button (saves without closing) and a \"Save & Complete\" button (validates and closes the task, opening the next one).

Task Reassignment: any task can be reassigned to a different user, at which point the task becomes visible with edit access on the new assignee\'s screen. The reassign action is available from within the task.

## 5.6 Task-Opening Trigger Configuration

Several tasks (2, 6, 11, 13, 15) open on rules like \"X days before the expected start date captured earlier.\" Rather than hardcoding these offsets, a Django admin configuration screen will capture, per trigger task: which earlier task/field supplies the reference date, and the number of days before that date the task should open. A scheduled background job checks this configuration and opens tasks automatically once the offset condition is met --- so the business can adjust these day-offsets without needing a code change.

Latency requirement: a task must open on the same calendar day its trigger date is reached --- next-day opening is not acceptable. The scheduled job\'s run frequency must be set accordingly (e.g. an early daily run, or more frequent checks).

## 5.7 Resource Allocation (Resource Manager)

When an allocation task (2, 6, 11, or 15) opens, a resource allocation record is created automatically against the lead, tagged with a type (2HR / SNT --- Solution Blueprint / Extension / Implementation) that reflects which stage triggered it. This record is immediately visible to the Resource Manager role with an Edit action.

On the Resource Manager\'s edit screen, an accordion displays the lead\'s relevant details --- including the man-power figure captured earlier in the workflow --- directly above the resource allocation form itself, so allocation happens against the approved headcount with full context.

Fields on the allocation form: Execution Red, Execution Brown, White, Auditor 1--4, Project Member 1--5, Remark, Status (TBD is allowed for White).

Submitting the form closes the allocation task and opens the next workflow task, assigned to the allocated **Execution Brown** (or a White if no Brown is set) — the resource who *edits* the step. The **Execution Red is a view-only overseer** across every step of the block and is not the assignee. *(Phase 13 override, confirmed with the user 2026-07-15 — this replaces the earlier "assigned to the Execution Red" wording and the workflow table's "Edit: execution red" cells; Execution Red remains a mandatory selection as the overseer.)*

Reporting view: all allocation records are listed with an Edit action, each showing its current status (Pending / Open / Closed) so it\'s clear at a glance which resources are still tied up versus freed up. If the number of resources allocated exceeds the man-power figure captured upstream, a red indicator icon appears next to Edit to flag the over-allocation.

Resources are freed up automatically --- the Resource Manager doesn\'t have to manually close an allocation.

Each allocation\'s status flips to Closed as soon as its resources are no longer needed:

  -----------------------------------------------------------------------------------------------
  **Allocation type**              **Auto-closes when**
  -------------------------------- --------------------------------------------------------------
  2Hr Study & Presentation (2HR)   Task 4 (2Hr Study Reimbursement) closes

  Solution Blueprint (SNT)         Task 9 (Solution Blueprint Payment) closes

  Implementation                   The lead\'s overall status becomes Complete (Task 17 closes)

  Extension (each cycle)           The lead\'s overall status becomes Complete (Task 17 closes)
  -----------------------------------------------------------------------------------------------

Note the difference: 2HR and SNT free up as soon as their own short engagement finishes, but Implementation and every Extension cycle\'s allocation stay tied up for the life of the whole engagement --- they all close together, only once, when the lead finally completes.

## 5.8 Lead & Task Hold / Unhold

Lead-level hold: putting a lead on hold places all of its currently open tasks on hold; unholding the lead restores those tasks to their normal (unhold) state.

Task-level hold: a hold task cannot be edited; unholding restores normal edit behavior.

Every hold and unhold action records the acting user and timestamp.

Two dedicated menus are required: a Hold Tasks view and a Held Leads view, so hold items can be reviewed at any time.

## 5.9 Visibility Model

Each Lead Manager sees only the leads assigned to them, and all tasks under those leads. Within a lead, if a specific task is assigned to a different user, the Lead Manager gets view-only access to that task.

## 5.10 Finance Role (Future Scope)

The Finance role exists in the role list for future-proofing but has no screens, permissions, or workflow interaction in this phase. It requires no functional build now --- all resource-allocation and project-closure behavior described in this document belongs to the Resource Manager role instead.

## 5.11 Follow-Up Requests

Lead Managers can raise a follow-up against a lead --- either via a button on the lead itself, or a standalone \"Add Follow-up\" action with a lead dropdown. The follow-up form captures: the lead, the assignee (an Employee-role user, including the Lead Manager themself), a follow-up date, and a remark.

A shared \"Other Tasks\" screen surfaces follow-ups relevant to the logged-in user: an Employee sees follow-ups assigned to them there, and a Lead Manager sees follow-ups they assigned to themselves.

## 5.12 Resource Manager --- Project Closure Screen

In addition to Resource Allocation, the Resource Manager has a Project Closure screen. Instead of one row per lead, it lists one row per project cycle --- so a lead\'s first-time project and every extension it\'s been through afterward are all visible together, each with its own Project No, extension number, and status (In Progress / Extended / Complete). Opening a row shows: Project No, Extension No, Project Status, Lead Manager, Execution Brown, White, Execution Red (the resource allocated by the Resource Manager for that cycle), Fixed Fee, Variable Fee, and Fixed Fee Upto (each pulled as the latest captured value from the workflow), plus a \"Do you want to short-close?\" (Yes/No) control on the current cycle.

Selecting Yes opens the final workflow task (Project Closure); closing that task sets the lead\'s status to Complete, which also marks the current project cycle\'s status as Complete and frees up (auto-closes) the Implementation and every Extension allocation for that lead --- see section 5.7.

## 5.13 Lead Admin

Lead Admin has view access to all screens across the system, excluding the User Management screens, and can assign owners to \"Not Assigned\" (Marketing-sourced) leads as described in section 5.2.

## 5.14 Field Validation Rules

-   Numeric fields: zero (0) is allowed; negative values are not allowed, anywhere in the system (lead form, task fields, resource allocation, fees, manpower counts, etc.).

-   Date fields: past dates are not allowed --- every date field must be today or later, wherever a date is captured on a task or lead form. Exception: Date of Joining on the user form, which is historical by nature and allows past dates.

## 5.15 Project ID Generation

A Project ID is generated on Task 12 (Implementation) closure, and regenerated on every subsequent Task 16 (Extension Implementation) closure. It is composed of a country code, industry code, area code, two-digit year, sequence number, and an extension suffix, e.g.: IN-PHNPD26001-I00.

-   Country code comes from the Country reference table (section 5.17), via the lead\'s selected Country.

-   Industry and Area codes come from the Industry and Area reference tables (section 5.17), via the lead\'s selected Industry and Domain/Area.

-   Extension suffix comes from a new Extension field on the lead --- a 2-digit counter that defaults to 00 when Task 12 closes, and increments by one (00 → 01 → 02 \...) every time Task 16 closes.

Confirmed: the country/industry/area/year/sequence portion of the Project ID is locked in the first time it\'s generated (Task 12) and reused as-is on every later regeneration --- it is not recomputed even if the lead\'s industry, area, or country fields are edited afterward. Only the extension suffix changes when Task 16 closes.

The lead record always shows the current Project ID, but every Project ID a lead has ever had --- including every extension cycle --- is preserved in a Project History record (technical name: project_details), so nothing is lost when an extension regenerates the ID. This history is what powers the Project Closure screen\'s one-row-per-cycle view described in section 5.12.

## 5.16 Workflow Configuration

Workflows are stored as JSON in a workflow table rather than hardcoded, so the task engine can read the active workflow definition for a given lead type. The Django admin panel provides add/edit access to workflow records with fields: Name, Type (dropdown: BD, Mining), Workflow (JSON definition), and Status.

This design is intentional: it lets the BD workflow evolve, and lets the future Mining workflow be added, without changing the underlying task engine code.

## 5.17 Reference Data --- Country, Industry, Area, Belt

Country, Industry, Area (Domain), and Belt are each maintained as their own reference table --- not hardcoded dropdown lists --- so the business can add, rename, or recode entries without a code deployment. Country, Industry, and Area follow the same id / name / code shape (the code feeds Project ID generation, section 5.15). Belt is simpler --- id / name only --- since it isn\'t used in Project ID generation; it just backs the Acting Belt Level and Belt dropdowns on the user form.

-   id --- primary key

-   name --- the display value shown in the lead form\'s dropdown

-   code --- the short code used when building the Project ID (section 5.15)

The lead form\'s Country, Industry, and Domain/Area fields are foreign keys into their respective tables; the user form\'s Acting Belt Level and Belt fields are both foreign keys into the Belt table; and the user form\'s Domain field is a foreign key into the same Area (Domain) table used on the lead form --- one shared table, two independent fields on two different forms. When a Project ID is generated, the code is read directly from the linked Country/Industry/Area row --- it is never re-typed or hardcoded elsewhere.

All four tables are managed from the Django admin panel.

Seed data (from the source workflow sheet):

  -----------------------------------------------------------------------
  **Country**                         **Code**
  ----------------------------------- -----------------------------------
  India                               IN

  Indonesia                           ID
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------
  **Industry**                        **Code**
  ----------------------------------- -----------------------------------
  Auto Comp                           COMP

  Auto OEM                            OEM

  Banking                             BNK

  Building & Construction Goods       BCG

  CapEx                               CEX

  Consumer Goods                      CG

  EPC                                 EPC

  ETO                                 ETO

  FMCG                                FMCG

  FMEG                                FMEG

  Industrial Goods                    IG

  Information Technology              IT

  Machinery & Equipment               ME

  Organised Retail                    RE

  Pharma & Chemical                   PH

  Textile & Fashion                   TX
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------
  **Area (Domain)**                   **Code**
  ----------------------------------- -----------------------------------
  B2B Sales                           B2B

  B2C Sales                           B2C

  Distribution                        DIST

  NPD                                 NPD

  Operations                          OPS

  Projects                            PROJ

  Supply Chain                        SC

  VectorFLOW AMC                      VFAMC

  VectorFLOW Upgrade                  VFUPG

  VectorPRO AMC                       VPAMC

  VectorPRO Upgrade                   VPUPG
  -----------------------------------------------------------------------

Belt (used for both Acting Belt Level and Belt on the user form --- same table, two independent fields):

  -----------------------------------------------------------------------
  **Belt**
  -----------------------------------------------------------------------
  Potential Black

  Black

  White

  Brown

  Red

  Potential Brown

  Potential White

  Potential Red

  NA
  -----------------------------------------------------------------------

# 6. Role Permission Matrix

  -----------------------------------------------------------------------------------------------------------------------------------------------
  **Action**                                     **Lead Mgr**   **Lead Admin**      **User Mgmt**   **Employee**   **Res. Mgr**   **Marketing**
  ---------------------------------------------- -------------- ------------------- --------------- -------------- -------------- ---------------
  Add lead (no owner assignment)                 No             No                  No              No             No             Yes

  Add / edit own leads (with owner)              Yes            No                  No              No             No             No

  Assign owner to unassigned leads               No             Yes                 No              No             No             No

  View own (created) leads                       Yes            Yes                 No              No             No             Yes

  Edit own (created) leads (excl. owner field)   Yes            Yes                 No              No             No             Yes

  View all leads                                 No             Yes                 No              No             No             No

  View own tasks                                 Yes            Yes                 No              No             No             No

  View all tasks                                 No             Yes                 No              No             No             No

  Edit own open tasks                            Yes            Yes                 No              No             No             No

  Edit all open tasks                            No             No                  No              No             No             No

  Add follow-up task                             Yes            No                  No              No             No             No

  View own follow-up tasks                       Yes            No                  No              Yes            No             No

  View all follow-up history                     No             Yes (Lead Detail)   No              No             No             No

  View / add / edit resource allocation          No             No                  No              No             Yes            No

  View own leads-funnel dashboard                Yes            Yes                 No              No             No             No

  View all leads-funnel dashboard                No             Yes                 No              No             No             No

  Manage users                                   No             No                  Yes             No             No             No

  View own activity log                          Yes            Yes                 No              No             Yes            No

  View all activity log                          No             Yes                 No              No             No             No
  -----------------------------------------------------------------------------------------------------------------------------------------------

# 7. Non-Functional Requirements

-   Mobile-responsive layout across all screens.

-   JWT-based authentication with access + refresh tokens; role-based authorization enforced on every API endpoint.

-   Every checklist, task, hold/unhold, and resource-allocation action should be timestamped and attributable to a user.

-   UI should be polished and modern (Tailwind + shadcn/ui) rather than a purely functional/utilitarian interface.

-   Global numeric and date validation rules (section 5.14) are enforced server-side, not just in the UI.

# 8. Out of Scope (This Phase)

-   Mining lead-type workflow --- planned for a future phase. The workflow engine should be built generically enough to support it later.

-   Finance role screens and permissions --- role exists for future-proofing only.

-   Notifications (email / in-app) for task opening, task reassignment, and follow-up due dates --- confirmed as a needed capability, but deferred to a later phase.

.

# 9. Related Documents

LMS_Technical_Requirements.md --- full data model, complete 17-task BD workflow table, task-trigger configuration design, and the finalized Project ID code lookup.
