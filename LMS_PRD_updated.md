**Lead Management System**

Product Requirements Document (PRD)

Version 3.0 · Draft

# 1. Document Overview

This PRD defines the product requirements for the Lead Management System
(LMS) --- an internal platform to manage the full lifecycle of Business
Development (BD) leads, from first client contact through
implementation, extensions, and project closure. It formalizes the
workflow, roles, permissions, and screen-level behavior needed for
engineering to build the system.

A companion engineering document, LMS_Technical_Requirements_updated.md,
provides the detailed data model, full BD workflow task table, and
field-level specifications referenced throughout this PRD.

# 2. Goals

-   Give Lead Managers a single system to create and progress leads
    through a structured, auditable BD workflow.

-   Automate task sequencing so the right task opens for the right
    person at the right time, with no manual hand-offs.

-   Give the Resource Manager a clear resource-allocation workflow tied
    directly to workflow tasks, with visibility into over-allocation
    against approved man-power.

-   Provide Lead Admin and management full visibility into leads, tasks,
    and follow-ups across the organization.

-   Support hold/unhold at both lead and task level.

-   Be mobile-responsive and usable from any device.

# 3. Tech Stack

  -----------------------------------------------------------------------
  **Layer**                **Choice**
  ------------------------ ----------------------------------------------
  Backend                  Django + Django REST Framework

  Authentication           DRF SimpleJWT (access + refresh tokens)

  Frontend                 React JS

  UI Styling               Tailwind CSS + shadcn/ui

  Data fetching            React Query + Axios

  Database                 PostgreSQL

  Admin / role & workflow  Django default admin panel
  management               

  Layout                   Mobile-responsive
  -----------------------------------------------------------------------

# 4. Roles

The system supports the following roles. Employee-level access applies
to every user in addition to their specific role\'s permissions.

1.  User Management

2.  Lead Admin

3.  Lead Manager

4.  Marketing

5.  Resource Manager

6.  Finance

7.  Employee (default --- applies to all users)

# 5. Functional Requirements

## 5.1 User Management

The User Management role has full CRUD access over user accounts,
managed through the system (and reflected in the Django admin panel for
role/user administration).

User form fields:

-   Username

-   Password

-   Roles --- multi-select; a user can hold several roles at once. Each
    selected role is a membership in Django\'s built-in Groups table
    (one group per role); there is no role column on the user record.
    Permissions are any-match across a user\'s roles.

-   Name --- text

-   Employee ID --- number (≥ 0, no negative values, unique ---
    duplicate IDs are rejected with a friendly message)

-   Email --- text

-   Mobile No --- text, exactly 10 digits (numeric characters only)

-   Acting Belt Level --- dropdown, sourced from the Belt reference
    table (section 5.17)

-   Belt --- dropdown, sourced from the same Belt reference table
    (section 5.17)

-   Domain --- dropdown, sourced from the same Domain/Area reference
    table used on the lead form (section 5.17)

-   Date of Joining --- date field (past dates allowed here --- exempt
    from the global \"no past dates\" rule, since joining dates are
    historical)

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

  -----------------------------------------------------------------------
  **Status**       **How set**         **Notes**
  ---------------- ------------------- ----------------------------------
  In Progress      System --- on       Default. Active workflow.
                   creation            

  On Hold          BD user --- manual  Pauses workflow and all its open
                                       task. Set via a popup that
                                       captures an optional hold remark.

  Dropped          BD user --- manual  Cancels the lead. Set via a popup
                                       that captures an optional drop
                                       remark, stored on the lead and
                                       shown on its detail page.

  Hybernation      System --- auto     Set when Implementation task is
                                       closed. Cannot be set manually.

  Complete         System --- auto     Set when final task is closed.
                                       Cannot be set manually.
  -----------------------------------------------------------------------

## 

There are two ways a lead enters the system:

-   Lead Manager: adds a lead and selects the owner (assigned_to)
    directly. The BD workflow starts immediately on save.

-   Marketing: can add a lead using the same form, but has no access to
    the assigned_to field --- it is hidden/disabled. On save,
    assigned_to is left blank (NULL) --- assigned_to is a plain nullable
    foreign key and no \"Not Assigned\" value is ever stored; the label
    is rendered by the application --- and the workflow does not start
    yet.

Lead Admin can open any \"Not Assigned\" lead and assign an owner to it.
That assignment action is what starts the BD workflow (opens Task 1) for
a Marketing-sourced lead.

Marketing also has view and edit access to the leads they created (all
fields except assigned_to) at any point afterward --- not just at
initial creation.

The lead form\'s Country, Industry, and Domain/Area dropdowns are
populated from three admin-managed reference tables (Country, Industry,
Area) rather than hardcoded choice lists --- see section 5.17. The
Country field is currently limited to India and Indonesia, per the
seeded reference data. Domain/Area is confirmed single-select (one value
per lead).

## 5.3 Lead Management & the BD Workflow

Each lead has a lead_type field with two options: BD and Mining.
Selecting BD starts the BD workflow once the lead has an assigned owner,
per section 5.2 (Mining is planned for a future phase and is out of
scope here).

The BD workflow is a fixed, ordered sequence of 17 tasks. Task 1 opens
once the lead is assigned an owner. Each task contains a checklist and,
in most cases, a set of additional fields the assignee must complete. A
task can only be closed once all of its checklist items are marked
complete and all mandatory extra fields are filled --- closing a task
automatically opens the next task in sequence (per the routing rules in
the workflow). When the final task (Project Closure) is closed, the
lead\'s status changes to Complete.

The full 17-task table --- names, assignees, checklist items, extra
fields, and notes on routing/branching --- is shown below.

**Full BD Workflow --- Tasks 1--17**

  ----------------------------------------------------------------------------------------------------------
  **\#**   **Task Name**    **Assigned     **Checklist**        **Extra Fields**  **Notes**
                            To**                                                  
  -------- ---------------- -------------- -------------------- ----------------- --------------------------
  1        Introduction and Default BD     1.1 Vector\'s Intro  Expected start    First task; opens once the
           First Meeting    Person         Email · 1.2 Intro    date of next      lead is assigned an owner
                                           presentation to      stage; Manpower   
                                           decision maker · 1.3 required (Brown   
                                           Area of              --- number, White 
                                           work/objective       --- number); Key  
                                           agreed · 1.4 Email   stakeholder       
                                           sent to initiate     contact form      
                                           study · 1.5 First    (Name, Role --- 3 
                                           meeting completed    rows default +    
                                                                \"add more\")     

  2        2Hr Study &      Resource       None --- allocation  Status only       Opens per configured
           Presentation     Manager        task                 (pending until    offset before the expected
           Team Allocation  (default)                           closed)           start date from Task 1.
                                                                                  Creates
                                                                                  resource_allocation row
                                                                                  (type = 2HR):
                                                                                  execution_red,
                                                                                  execution_brown, white,
                                                                                  auditor1, auditor2

  3        2Hr Study &      User assigned  3.1 Study plan done  Date of 2Hr       
           Presentation     by Resource    · 3.2 NDA formality  presentation      
                            Manager in     completed · 3.3      (date); Key       
                            Task 2         Study interactions   stakeholders      
                                           done · 3.4 Data      mapped form       
                                           received · 3.5 2Hr   (Name, Role --- 3 
                                           presentation date    rows + add more)  
                                           confirmed · 3.6 2Hr                    
                                           presentation done                      

  4        2Hr Study        User assigned  4.1 Reimbursement    Delay reasons if  Opens after 3.6. On close:
           Reimbursement    by Resource    expenses invoiced ·  any (text);       the 2HR
                            Manager in     4.2 Reimbursement    Expected date of  resource_allocation row
                            Task 2         expenses received    receipt (date)    (Task 2) auto-closes ---
                                                                                  resources freed up.

  5        Solution         Default BD     5.1 Proposal         Is Solution       Opens after 3.6. If No →
           Blueprint        Person         submitted · 5.2      Blueprint         skip to Task 10 (Project
           Proposal                        Proposal terms       required?         Proposal Submission)
                                           agreed               (Yes/No). If Yes: 
                                                                Fee for           
                                                                engagement (allow 
                                                                zero, no          
                                                                negative);        
                                                                Manpower (Brown,  
                                                                White); Expected  
                                                                start date of     
                                                                next stage;       
                                                                Number of         
                                                                tranches of       
                                                                payment           

  6        Solution         Resource       None --- allocation  Status only       Opens per configured
           Blueprint Team   Manager        task                                   offset before the expected
           Allocation       (default)                                             start date from Task 5.
                                                                                  Creates
                                                                                  resource_allocation row
                                                                                  (type = SNT):
                                                                                  execution_red,
                                                                                  execution_brown, white,
                                                                                  auditor1, auditor2

  7        Solution         User assigned  7.1 Engagement start Presentation date Three paths on close: (1)
           Blueprint        by Resource    · 7.2 Initial        (date); Invoices  Re-presentation required =
                            Manager        invoice raised · 7.3 raised block      Yes - opens Task 8. (2)
                            (Solution      Data receipt · 7.4   (Invoice Number,  Re-presentation required =
                            Blueprint      Presentation dates   Value, Date - 3   No AND moved to next stage
                            block)         locked · 7.5 SnT     rows + add more); = Yes - opens Task 9
                                           workshop done · 7.6  Re-presentation   (Solution Blueprint
                                           Completion invoice   required?         Payment) and Task 10
                                                                (Yes/No); Has     (Project Proposal
                                                                project moved to  Submission)
                                                                the next stage?   simultaneously. (3)
                                                                (Yes/No - shown   Re-presentation required =
                                                                and required only No AND moved to next stage
                                                                when              = No - opens Task 17
                                                                Re-presentation   (Project Closure)
                                                                required = No)    directly.

  8        Solution         Same execution 8.1 Presentation     Presentation date Three paths on close: (1)
           Blueprint Repeat red/BD/brown   dates locked · 8.2   (date);           Re-presentation required
           Presentation     as Task 7      SnT workshop done    Re-presentation   again = Yes - loops back
                            (default)                           required again?   to Task 8 (new instance).
                                                                (Yes/No); Has     (2) Re-presentation
                                                                project moved to  required again = No AND
                                                                the next stage?   moved to next stage =
                                                                (Yes/No - shown   Yes - opens Task 9 and
                                                                and required only Task 10 simultaneously.
                                                                when              (3) Re-presentation
                                                                Re-presentation   required again = No AND
                                                                required again =  moved to next stage = No -
                                                                No)               opens Task 17 (Project
                                                                                  Closure) directly.

  9        Solution         User assigned  9.1 Fixed fee        Delay reasons if  On close: the SNT
           Blueprint        by Resource    invoices received ·  any (text);       resource_allocation row
           Payment          Manager        9.2 Reimbursement    Expected date of  (Task 6) auto-closes ---
                            (Solution      expenses invoiced ·  receipt (date)    resources freed up.
                            Blueprint      9.3 Reimbursement                      
                            block)         expenses received                      

  10       Project Proposal Default BD     10.1 Proposal        Planned           Entry point when Solution
           Submission       Person         submission · 10.2    engagement start  Blueprint was skipped
                                           Terms agreed         date; Planned     
                                                                engagement end    
                                                                date; Period      
                                                                (months); Fixed   
                                                                fee (blocks by    
                                                                period months,    
                                                                capturing fee +   
                                                                manpower per      
                                                                block); Total     
                                                                variable fee cap; 
                                                                Variable          
                                                                milestone fee     
                                                                cap; Variable     
                                                                performance fee   
                                                                cap; Manpower     
                                                                (Brown, White)    

  11       Project Team     Resource       None --- allocation  Status only       Opens per configured
           Allocation       Manager        task                                   offset before Planned
                            (default)                                             Engagement Start Date
                                                                                  (Task 10). Creates
                                                                                  resource_allocation row:
                                                                                  execution_red,
                                                                                  execution_brown, white,
                                                                                  auditor1, auditor2

  12       Implementation   Execution red  12.1 Handover &      Actual engagement On close: lead status →
                            (assigned by   engagement start ·   start date;       Hybernation.
                            Resource       12.2 PO from         Modified planned  leads.extension defaults
                            Manager via    customer · 12.3      engagement end    to 00. Project ID is
                            Task 11)       First fixed fee      date; Period      generated and stored on
                                           invoice raised ·     (months); Actual  lead. A Project History
                                           12.4                 fixed fee invoice (project_details) row is
                                           Agreement/contract · date; Variable    created for this cycle.
                                           12.5 Variable        fee start date    The Implementation
                                           parameter                              resource_allocation row
                                           finalisation · 12.6                    stays Open --- it does not
                                           Variable baseline                      auto-close here.
                                           sign-off · 12.7                        
                                           Addendum agreement ·                   
                                           12.8 Expected                          
                                           variable fee over                      
                                           eligible period                        
                                           submitted                              

  13       Extension        View: same BD; 13.1 Discuss next    Extension         Opens per configured
           Proposal         Edit:          set of problems with approved?         offset (2 months) before
                            execution red  client · 13.2        (Yes/No)          engagement end date (Task
                                           Identify area of                       12). If No → opens Task
                                           extension · 13.3                       17. If Yes → opens Task 14
                                           Solution design &                      
                                           preparation · 13.4                     
                                           Pitch extension                        
                                           proposal                               

  14       Extension Detail View: same BD; 13.8 Addendum        Engagement start  Opens only if Task 13
                            Edit:          agreement · 13.9     date; Engagement  approved = Yes
                            execution red  Expected variable    end date; Period  
                                           fee over eligible    (months); Actual  
                                           period submitted     fixed fee invoice 
                                                                date; Variable    
                                                                fee start date;   
                                                                Manpower (Brown,  
                                                                White)            

  15       Project          Resource       None --- allocation  Status only       Opens if Task 13 approved
           Extension Team   Manager        task                                   = Yes. Creates
           Allocation       (default)                                             resource_allocation row
                                                                                  (type = Extension)

  16       Extension        Execution red  Same checklist set   Engagement start  On close: leads.extension
           Implementation   (assigned by   as Task 12           date; Engagement  increments by one
                            Resource       (12.1--12.8)         end date; Period  (00→01→02\...); Project ID
                            Manager via                         (months); Actual  is regenerated. Previous
                            Task 15)                            fixed fee invoice Project History row is
                                                                date; Variable    marked Extended; a new one
                                                                fee start date    is created for this cycle.
                                                                                  That Extension
                                                                                  resource_allocation row
                                                                                  stays Open --- it does not
                                                                                  auto-close here. Then
                                                                                  loops back to Task 13.
                                                                                  Repeats until Task 13 = No

  17       Project Closure  Execution red  16.1 All fixed fee   Final closed      Opens when any of:
                                           received · 16.2 All  (Yes/No)          engagement end date (from
                                           variable fee                           Task 12) is reached, or
                                           received · 16.3 All                    Task 13\'s \"Extension
                                           reimbursements                         approved\" = No, or
                                           received                               Resource Manager
                                                                                  short-closes from Project
                                                                                  Closure screen. On close:
                                                                                  lead status = Complete;
                                                                                  current Project History
                                                                                  row status = Complete;
                                                                                  every
                                                                                  Implementation/Extension
                                                                                  resource_allocation row
                                                                                  for this lead auto-closes
                                                                                  at once.
  ----------------------------------------------------------------------------------------------------------

Key branch points:

-   Task 5 (Solution Blueprint Proposal): if \"Is Solution Blueprint
    Required\" = No, the workflow skips directly to Task 10 (Project
    Proposal Submission).

-   Task 7/8 (Solution Blueprint presentations): when no further
    re-presentation is required, the user must also answer \"Has project
    moved to the next stage?\" If Yes - Tasks 9 (Solution Blueprint
    Payment) and 10 (Project Proposal Submission) open simultaneously.
    If No - Task 17 (Project Closure) opens directly, short-circuiting
    the remaining workflow. Task 8 loops back to itself if a further
    repeat presentation is required.

-   Task 12 (Implementation): on closure, the lead status changes to
    Hybernation, and a Project ID is generated for the first time and
    stored against both the lead and its resource allocation record ---
    see section 5.15.

-   Task 13 (Extension Proposal): drives a repeatable Extension cycle
    (Tasks 13→16) until \"Extension approved\" = No, at which point Task
    17 (Project Closure) opens.

-   Task 16 (Extension Implementation): on closure, the lead\'s
    extension counter increments and the Project ID is regenerated with
    the new extension value --- see section 5.15.

## 5.4 Checklists

Each checklist item has two editable fields: status (not_started /
inprogress / complete) and remark. An edit icon against each checklist
item opens a popup containing these two fields. A checklist item can
also be checked or unchecked directly by clicking its tickmark ---
clicking toggles between complete and not started.

-   Checklist edits save independently of task closure --- every save
    persists immediately.

-   Every save captures the edit timestamp and the editing user.

-   A checked item can be unchecked; there is no one-way lock.

## 

## 5.5 Task Rules

1.  A task can be closed only once all its checklist items are complete
    and all mandatory extra fields are filled.

2.  A task is visible and editable only to its assigned user.

3.  If a task isn\'t assigned to a given user but the parent lead is
    assigned to them, that user gets view-only access to the task.

4.  Closed tasks are not editable.

5.  Allocation tasks (Tasks 2, 6, 11, 15) have no checklist or extra
    fields --- they simply show a Pending status until the Resource
    Manager completes the corresponding resource allocation.

6.  Every task provides both a \"Save as Draft\" button (saves without
    closing) and a \"Save & Complete\" button (validates and closes the
    task, opening the next one). Both actions return the user to the My
    Tasks page. Validation errors always reference the field\'s display
    label, never internal field names.

7.  Tasks that a branch condition routes around (e.g. Tasks 6-9 when
    Solution Blueprint = No, Tasks 14-16 when Extension approved = No)
    are marked with a Skipped status, since they will never open. Task
    lists only show tasks that have actually opened (open / hold /
    closed) plus skipped ones --- pending tasks are hidden.

Task Reassignment: any task can be reassigned to a different user, at
which point the task becomes visible with edit access on the new
assignee\'s screen. The reassign action is available from within the
task.

## 5.6 Task-Opening Trigger Configuration

Several tasks (2, 6, 11, 13, 15) open on rules like \"X days before the
expected start date captured earlier.\" Rather than hardcoding these
offsets, a Django admin configuration screen will capture, per trigger
task: which earlier task/field supplies the reference date, and the
number of days before that date the task should open. A scheduled
background job checks this configuration and opens tasks automatically
once the offset condition is met --- so the business can adjust these
day-offsets without needing a code change.

Latency requirement: a task must open on the same calendar day its
trigger date is reached --- next-day opening is not acceptable. The
scheduled job\'s run frequency must be set accordingly (e.g. an early
daily run, or more frequent checks).

## 5.7 Resource Allocation (Resource Manager)

When an allocation task (2, 6, 11, or 15) opens, a resource allocation
record is created automatically against the lead, tagged with a type
(2HR / SNT --- Solution Blueprint / Extension / Implementation) that
reflects which stage triggered it. This record is immediately visible to
the Resource Manager role with an Edit action.

On the Resource Manager\'s edit screen, an accordion displays the
lead\'s relevant details --- including the man-power figure captured
earlier in the workflow --- directly above the resource allocation form
itself, so allocation happens against the approved headcount with full
context.

Fields on the allocation form: Execution Red, Execution Brown, White,
Auditor 1--4, Project Member 1--10, Remark, Status.

Submitting the form closes the allocation task and opens the next
workflow task, assigned to the Execution Red selected by the Resource
Manager.

Reporting view: all allocation records are listed with an Edit action,
each showing its current status (Pending / Open / Closed) so it\'s clear
at a glance which resources are still tied up versus freed up. If the
number of resources allocated exceeds the man-power figure captured
upstream, a red indicator icon appears next to Edit to flag the
over-allocation; if fewer resources are allocated than required, an
amber indicator flags the under-allocation (shown on submitted records
and live inside the allocation form).

Resources are freed up automatically --- the Resource Manager doesn\'t
have to manually close an allocation.

Each allocation\'s status flips to Closed as soon as its resources are
no longer needed:

  -----------------------------------------------------------------------
  **Allocation type**        **Auto-closes when**
  -------------------------- --------------------------------------------
  2Hr Study & Presentation   Task 4 (2Hr Study Reimbursement) closes
  (2HR)                      

  Solution Blueprint (SNT)   Task 9 (Solution Blueprint Payment) closes

  Implementation             The first Extension Implementation (Task 16)
                             closes (superseded by the extension) --- or
                             the lead\'s overall status becomes Complete
                             if the lead never extends

  Extension (each cycle)     The next cycle\'s Extension Implementation
                             (Task 16) closes (superseded) --- or, for
                             the final cycle, the lead\'s overall status
                             becomes Complete (Task 17 closes)
  -----------------------------------------------------------------------

Note the difference: 2HR and SNT free up as soon as their own short
engagement finishes. Implementation and Extension allocations hand over
cycle to cycle: when an Extension Implementation (Task 16) closes, the
superseded previous cycle\'s allocation auto-closes and the new
Extension allocation carries the engagement forward --- it is prefilled
with the previous cycle\'s allocated resources when created, so the
Resource Manager only adjusts what changed. Only the current cycle\'s
allocation is ever open; it closes when the lead finally completes.

## 5.8 Lead & Task Hold / Unhold

Lead-level hold: putting a lead on hold places all of its currently open
tasks on hold; unholding the lead restores those tasks to their normal
(unhold) state.

Task-level hold: a hold task cannot be edited; unholding restores normal
edit behavior.

Every hold and unhold action records the acting user and timestamp.

Hold, Unhold, and Drop are each confirmed through a popup that asks the
acting user for a remark. The remark is optional --- the action proceeds
with or without one.

Remarks are stored against the specific hold/unhold cycle (and on the
lead itself for drops), appended to the activity-log entry, and
displayed on the Lead and Task detail pages --- the active hold remark
appears as a banner while the item is on hold, and the drop remark on
dropped leads. A lead-level hold or unhold copies its remark onto the
task holds it creates or releases.

A dedicated Hold Items menu is required, with a Hold Leads view and a
Hold Tasks view, so hold items can be reviewed at any time.

## 5.9 Visibility Model

Each Lead Manager sees only the leads assigned to them, and all tasks
under those leads. Within a lead, if a specific task is assigned to a
different user, the Lead Manager gets view-only access to that task.

## 5.10 Finance Role (Future Scope)

The Finance role exists in the role list for future-proofing but has no
screens, permissions, or workflow interaction in this phase. It requires
no functional build now --- all resource-allocation and project-closure
behavior described in this document belongs to the Resource Manager role
instead.

## 5.11 Follow-Up Requests

Lead Managers can raise a follow-up against a lead --- either via a
button on the lead itself, or a standalone \"Add Follow-up\" action with
a lead dropdown. The follow-up form captures: the lead, the assignee (an
Employee-role user, including the Lead Manager themself), a follow-up
date, and a remark.

> **Phase 12 override (confirmed with the user 2026-07-16):** follow-up
> creation is broadened beyond Lead Managers --- **anyone who can view a
> lead** (its owner, a task assignee, the Resource Manager, ...) may raise
> a follow-up on it, from both the lead's Follow-up tab and the
> standalone Other Tasks screen. This supersedes the LM-only wording
> above and the "Add follow-up task" row in the section 6 matrix.

A shared \"Other Tasks\" screen surfaces follow-ups relevant to the
logged-in user: an Employee sees follow-ups assigned to them there, and
a Lead Manager sees follow-ups they assigned to themselves.

## 5.12 Resource Manager --- Project Closure Screen

In addition to Resource Allocation, the Resource Manager has a Project
Closure screen. Instead of one row per lead, it lists one row per
project cycle --- so a lead\'s first-time project and every extension
it\'s been through afterward are all visible together, each with its own
Project No, extension number, and status (In Progress / Extended /
Complete). Opening a row shows: Project No, Extension No, Project
Status, Lead Manager, Execution Brown, White, Execution Red (the
resource allocated by the Resource Manager for that cycle), Fixed Fee,
Variable Fee, and Fixed Fee Upto (each pulled as the latest captured
value from the workflow), plus a \"Do you want to short-close?\"
(Yes/No) control on the current cycle.

Selecting Yes opens the final workflow task (Project Closure); closing
that task sets the lead\'s status to Complete, which also marks the
current project cycle\'s status as Complete and frees up (auto-closes)
the Implementation and every Extension allocation for that lead --- see
section 5.7.

## 5.13 Lead Admin

Lead Admin has view access to all screens across the system, excluding
the User Management screens, and can assign owners to \"Not Assigned\"
(Marketing-sourced) leads as described in section 5.2.

## 5.14 Field Validation Rules

-   Numeric fields: zero (0) is allowed; negative values are not
    allowed, anywhere in the system (lead form, task fields, resource
    allocation, fees, manpower counts, etc.).

-   Date fields: past dates are not allowed --- every date field must be
    today or later, wherever a date is captured on a task or lead form.
    Exception: Date of Joining on the user form, which is historical by
    nature and allows past dates.

## 5.15 Project ID Generation

A Project ID is generated on Task 12 (Implementation) closure, and
regenerated on every subsequent Task 16 (Extension Implementation)
closure. It is composed of a country code, industry code, area code,
two-digit year, sequence number, and an extension suffix, e.g.:
IN-PHNPD26001-I00.

-   Country code comes from the Country reference table (section 5.17),
    via the lead\'s selected Country.

-   Industry and Area codes come from the Industry and Area reference
    tables (section 5.17), via the lead\'s selected Industry and
    Domain/Area.

-   Extension suffix comes from a new Extension field on the lead --- a
    2-digit counter that defaults to 00 when Task 12 closes, and
    increments by one (00 → 01 → 02 \...) every time Task 16 closes.

Confirmed: the country/industry/area/year/sequence portion of the
Project ID is locked in the first time it\'s generated (Task 12) and
reused as-is on every later regeneration --- it is not recomputed even
if the lead\'s industry, area, or country fields are edited afterward.
Only the extension suffix changes when Task 16 closes.

The lead record always shows the current Project ID, but every Project
ID a lead has ever had --- including every extension cycle --- is
preserved in a Project History record (technical name: project_details),
so nothing is lost when an extension regenerates the ID. This history is
what powers the Project Closure screen\'s one-row-per-cycle view
described in section 5.12.

## 5.16 Workflow Configuration

Workflows are stored as JSON in a workflow table rather than hardcoded,
so the task engine can read the active workflow definition for a given
lead type. The Django admin panel provides add/edit access to workflow
records with fields: Name, Type (dropdown: BD, Mining), Workflow (JSON
definition), and Status.

This design is intentional: it lets the BD workflow evolve, and lets the
future Mining workflow be added, without changing the underlying task
engine code.

## 5.17 Reference Data --- Country, Industry, Area, Belt

Country, Industry, Area (Domain), and Belt are each maintained as their
own reference table --- not hardcoded dropdown lists --- so the business
can add, rename, or recode entries without a code deployment. Every
reference table also carries a status column (active / inactive, default
active); only active rows are offered in dropdowns. Country, Industry,
and Area follow the same id / name / code / status shape (the code feeds
Project ID generation, section 5.15). Belt has no code --- it carries id
/ name / order / status, where order drives the sort order of the Acting
Belt Level and Belt dropdowns.

-   id --- primary key

-   name --- the display value shown in the lead form\'s dropdown

-   code --- the short code used when building the Project ID (section
    5.15)

The lead form\'s Country, Industry, and Domain/Area fields are foreign
keys into their respective tables; the user form\'s Acting Belt Level
and Belt fields are both foreign keys into the Belt table; and the user
form\'s Domain field is a foreign key into the same Area (Domain) table
used on the lead form --- one shared table, two independent fields on
two different forms. When a Project ID is generated, the code is read
directly from the linked Country/Industry/Area row --- it is never
re-typed or hardcoded elsewhere.

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

Belt (used for both Acting Belt Level and Belt on the user form --- same
table, two independent fields):

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

## 5.18 Leads List --- Tracker & Column Filters

Every lead row on the Leads list shows a Tracker column: a progress bar
driven by task closure --- the count of closed vs. total workflow task
instances and a percentage. Skipped tasks (routed around by branching)
are excluded from the total, and extension/repeat cycles add instances,
so the tracker always reflects the real remaining work. The bar is
colored by lead status (green while In Progress or Complete, amber when
On Hold, red when Dropped); leads whose workflow has not started yet
show "Not started".

Every column of the Leads table is filterable from a filter row directly
under the headers: free-text search for Company/Project and Project ID,
and dropdown filters for Industry, Domain, Owner (including "Not
Assigned"), Current Task (sorted by task number), and Status. Dropdown
options are built from the data on screen, all filters combine (AND),
and a "Clear filters" action resets them in one click.

# 6. Role Permission Matrix

  --------------------------------------------------------------------------------------
  **Action**         **Lead   **Lead    **User   **Employee**   **Res.   **Marketing**
                     Mgr**    Admin**   Mgmt**                  Mgr**    
  ------------------ -------- --------- -------- -------------- -------- ---------------
  Add lead (no owner No       No        No       No             No       Yes
  assignment)                                                            

  Add / edit own     Yes      No        No       No             No       No
  leads (with owner)                                                     

  Assign owner to    No       Yes       No       No             No       No
  unassigned leads                                                       

  View own (created) Yes      Yes       No       No             No       Yes
  leads                                                                  

  Edit own (created) Yes      Yes       No       No             No       Yes
  leads (excl. owner                                                     
  field)                                                                 

  View all leads     No       Yes       No       No             No       No

  View own tasks     Yes      Yes       No       No             No       No

  View all tasks     No       Yes       No       No             No       No

  Edit own open      Yes      Yes       No       No             No       No
  tasks                                                                  

  Edit all open      No       No        No       No             No       No
  tasks                                                                  

  Add follow-up task Yes      No        No       No             No       No

  View own follow-up Yes      No        No       Yes            No       No
  tasks                                                                  

  View all follow-up No       Yes (Lead No       No             No       No
  history                     Detail)                                    

  View / add / edit  No       No        No       No             Yes      No
  resource                                                               
  allocation                                                             

  View own           Yes      Yes       No       No             No       No
  leads-funnel                                                           
  dashboard                                                              

  View all           No       Yes       No       No             No       No
  leads-funnel                                                           
  dashboard                                                              

  Manage users       No       No        Yes      No             No       No

  View own activity  Yes      Yes       No       No             Yes      No
  log                                                                    

  View all activity  No       Yes       No       No             No       No
  log                                                                    
  --------------------------------------------------------------------------------------

# 7. Non-Functional Requirements

-   Mobile-responsive layout across all screens.

-   JWT-based authentication with access + refresh tokens; role-based
    authorization enforced on every API endpoint.

-   Every checklist, task, hold/unhold, and resource-allocation action
    should be timestamped and attributable to a user.

-   UI should be polished and modern (Tailwind + shadcn/ui) rather than
    a purely functional/utilitarian interface.

-   Global numeric and date validation rules (section 5.14) are enforced
    server-side, not just in the UI.

-   Every table carries audit columns --- created_by, created_on,
    updated_by, updated_on --- with timestamps stored automatically;
    updated_by/updated_on are nullable and filled on every update.

# 8. Out of Scope (This Phase)

-   Mining lead-type workflow --- planned for a future phase. The
    workflow engine should be built generically enough to support it
    later.

-   Finance role screens and permissions --- role exists for
    future-proofing only.

-   Notifications (email / in-app) for task opening, task reassignment,
    and follow-up due dates --- confirmed as a needed capability, but
    deferred to a later phase.

.

# 9. Related Documents

LMS_Technical_Requirements_updated.md --- full data model, complete
17-task BD workflow table, task-trigger configuration design, and the
finalized Project ID code lookup.
