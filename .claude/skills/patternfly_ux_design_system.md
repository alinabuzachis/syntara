<!--
  SYNC NOTE: A condensed version of this file exists at .cursor/rules/patternfly-ux-design-system.mdc
  (the Cursor rule). Both files must stay in sync — when updating one, update the other.
  This file is the comprehensive source of truth. The Cursor rule is the lightweight version.
-->

# Claude Skill: PatternFly UX Design System — Opinionated Implementation

> **Before writing React, Zod, Zustand, or other library code**, fetch current docs from [`./library_references.md`](./library_references.md).

Your goal is to build frontend UI that adheres to PatternFly standards **and** the Automation Orchestrator UX team's opinionated component usage. This skill codifies specific "Ansible-first" patterns to ensure consistency across all feature teams and reduce cognitive load for users.

---

## Overview

### Purpose of this Framework

This document serves as the definitive technical and design North Star for the **Automation Orchestrator User Experience**. It is designed specifically for engineers and designers to ensure we build a scalable, maintainable, and cohesive experience.

### Why This Exists

- **Accelerated Velocity:** By establishing a clear UX framework and component library upfront, we eliminate "decision fatigue." Engineers can focus on implementation logic rather than debating UI patterns or custom CSS. PatternFly is that design framework for all products across the Red Hat portfolio.
- **The Power of PatternFly:** Our commitment to a **PatternFly-first** architecture is strategic. Utilizing the core library ensures that our UI is accessible (WCAG 2.1 AA compliant), themeable, and — most importantly — **upgrade-compatible**. Staying aligned with PF reduces long-term maintenance overhead and prevents "technical debt" through custom, one-off components.
- **A Shared Language:** This skill codifies the UI/UX team's guidelines for this specific product. It bridges the gap between UX design and React implementation, ensuring that "Opinionated" choices are applied consistently across every feature branch.
- **Contribution over Customization:** When you encounter a UI gap, this framework provides the process for feeding requirements back into the core PatternFly system, ensuring fixes land in the shared library rather than as "snowflake" code in the local repo.

**In short:** We use this framework to build faster, stay aligned with the broader Red Hat ecosystem, and ensure that the project remains stable.



### Tech Stack

| Category            | Tools                                     |
| ------------------- | ----------------------------------------- |
| IDE and Agent Tools | Cursor, Claude Code, Gemini               |
| Design Library      | [PatternFly](https://www.patternfly.org/) |
| Design Tooling      | Figma, Miro                               |

---

## AO Design System

How the Automation Orchestrator UI is anchored, and how it relates to other Red Hat design tooling:

- **Foundation** — Built on top of [PatternFly](https://www.patternfly.org/) for [components](https://www.patternfly.org/components/all-components), [patterns](https://www.patternfly.org/patterns/about-patterns), and [accessibility](https://www.patternfly.org/accessibility/patternflys-accessibility) baselines.
- **Layout** — Page and shell structure follow PatternFly's **Compass** layout architecture.
- **Theming** — Visual treatment uses PatternFly's **Unified Theme**, accounting for layout and color palettes.
- **Icons** — Based on the [Red Hat design system](https://ux.redhat.com/), specifically the [icon set](https://ux.redhat.com/foundations/iconography/#ui-icons) for Red Hat UI.
- **Automation builder** — Based on [React Flow](https://reactflow.dev/) as the underlying graph/canvas foundation while PatternFly acts as a visual wrapper. The layout reads from left to right.
- **Accessibility** — While PatternFly provides a strong foundation with accessibility built into its individual components, achieving full [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG2AA-Conformance) and [Section 508](https://www.section508.gov/) compliance requires careful implementation within the Automation Orchestrator codebase.
- **PatternFly gaps** — Before implementing a custom component or styling override:
  1. **Check first.** Search PatternFly docs and the Ansible UI Framework to confirm the need is not already covered by a component, variant, or token.
  2. **Raise it with UX.** Discuss in #forum-ansible-ux or tag @ansible-ux in your team channel. Describe the gap with a clear before/after versus what PatternFly provides today. UX will confirm whether the gap is valid or an existing pattern applies.
  3. **Engage PatternFly.** If UX confirms the gap, UX coordinates with PatternFly on resolution — new component, variant, token, or an accepted override — often via a PatternFly GitHub issue or direct conversation.
  4. **Document and track.** If a temporary override is approved, create a Jira issue in AAP with the label `patternfly-override` to track technical debt. Link the PatternFly issue if one exists. The UXSC reviews active overrides periodically.
  5. **Resolve upstream.** The aim is to remove the override by contributing back to PatternFly or the Ansible UI Framework. Overrides without a resolution path are flagged in quarterly reviews.
- **What this is not** — The experience is **not** built on custom libraries, like the Genie proof-of-concept tech demo. Orchestrator deliberately uses a PatternFly-first stack so it stays aligned with the rest of the Red Hat portfolio.

---

## AO Research Process

The Automation Orchestrator project is committed to evidence-based development, utilizing user research to steer both product capabilities and the overall user experience.

### Competitive Analysis

Early in the project, the UX Research team conducted a deep-dive competitive analysis of eight key players in the agentic and workflow automation space (including UiPath, ServiceNow, and n8n). This research was instrumental in defining the "PatternFly-first" strategy and identifying where we could uniquely differentiate the Ansible experience.

### Key Insights & Established Patterns

The study identified several "table stakes" features that users expect as standard in a modern builder:

- **The Three-Panel Layout:** Industry-standard layout consisting of an **Explorer** (left), **Canvas** (center), and **In-Context Configuration** (right) to progressively disclose complexity without overwhelming the user.
- **Standardized Terminology:** Familiar terms such as "Workflow," "Trigger," "Action," and "Logs" to reduce cognitive load.
- **Visual Data Mapping:** "Data pills" and visual mapping for low-code users, with advanced expression editors as an "escape hatch" for power users.

### Strategic Differentiators for Ansible

Research revealed critical friction points in competitor products — specifically around fragmented AI integration and poor observability:

- **Hybrid Workflow Debugging:** Unlike competitors who struggle to differentiate between probabilistic (AI) and deterministic (code) failures, Orchestrator provides superior debugging and observability for hybrid workflows.
- **Safety as a First-Class Object:** "Gating" nodes and Human-In-The-Loop (HITL) checkpoints build trust, ensuring users can safely manage non-deterministic AI outputs before they execute against critical infrastructure.
- **In-Context Documentation:** Context-aware help and documentation integrated directly into configuration panels to save users from switching tabs.

### Accessibility & Compliance

A major finding was that basic usability and accessibility are often an "afterthought" in technical automation tools. By building on PatternFly, Automation Orchestrator meets high accessibility standards (WCAG 2.1 AA) from the start, providing a more inclusive experience than the current market leaders.

---

## Philosophy

### The Opinionated Implementation

While PatternFly provides flexible building blocks, this project follows an **opinionated implementation**. We pick the components that best serve the "supervisor" mental model — an operator who must understand, trust, and intervene in complex automation across scale.

**Key principles:**

- **Standardized compositions** — Atomic PatternFly components are combined into larger, opinionated compositions (e.g., a "complete table view" with prescribed pagination, filtering, and bulk action patterns). These compositions are the unit of consistency, not individual components.
- **Data-driven adjustments** — Side-out panels instead of modals for node configuration, preserving workflow canvas context.
- **No custom one-offs** — When PatternFly does not meet a requirement, collaborate via the PatternFly liaison path rather than building a custom component. This keeps the product upgrade-compatible.

### Framework & Source of Truth

| Source                                       | Description                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| **Compass Layout**                           | Layout architecture providing systematic page structure and spacing                   |
| **AO UI Repository**                         | The opinionated PatternFly implementation — the reference for tables, filters, modals |
| **PatternFly (https://www.patternfly.org/)** | The upstream design system; always check here first for component docs                |

### Key Experience Principles

The automation platform market has matured, but the user experience across it has not. Most competitors were architected as engineering tools first and operator interfaces second. Their UX accrued over years of feature addition without a unifying experience philosophy. The result is a category where power and usability are treated as trade-offs rather than compounding forces.

Our UX is designed around a single mental model: the **supervisor** — an operator who must understand, trust, and intervene in complex automation across scale.

When an automation platform spans inventories, credentials, templates, schedules, and RBAC, the cognitive tax of learning different interaction patterns per domain is enormous. Users shouldn't have to re-learn how filtering, pagination, or bulk actions work in each section. We define opinionated, reusable compositions from PatternFly's atomic components — a "complete table view" that prescribes pagination, toolbar filtering, bulk action placement, and empty-state behavior. These compositions are the unit of consistency, not individual components.

### Addressing Gaps

Opinionated does not mean custom. When PatternFly does not meet a specific design requirement, follow the 5-step PatternFly gaps liaison process defined in the AO Design System section above (Check first → Raise with UX → Engage PatternFly → Document and track → Resolve upstream). Never create custom, one-off components.

---

## 1. Side Navigation Structure

Use a docked icon navigation (left sidebar) with PatternFly's [flyout panels component](https://www.patternfly.org/components/navigation/#flyout) for items with sub-navigation.

### Behavior Rules

| Interaction                      | Behavior                                      |
| -------------------------------- | --------------------------------------------- |
| Hover on nav item (no children)  | Show tooltip with label                       |
| Hover on nav item (has children) | Show flyout panel with sub-items              |
| Click on nav item (no children)  | Navigate to route                             |
| Click on nav item (has children) | Navigate to first enabled child route         |
| Click on flyout sub-item         | Navigate to that route, close flyout          |
| Mouse leaves flyout              | Close flyout after 150ms delay (grace period) |
| Mouse moves from icon to flyout  | Flyout stays open (no gap flicker)            |

---

## 2. Page Layout

Every page **must** follow this structural hierarchy:

| Layer              | Component                    | Purpose                                 |
| ------------------ | ---------------------------- | --------------------------------------- |
| App Shell          | `Compass`                    | Overall application frame               |
| Navigation         | `AppDockedNav`               | Left sidebar with icons                 |
| Page Content       | `CompassContent` + `AppPage` | Main content area wrapper               |
| Page Header        | `AppPageHeader`              | Page title and actions                  |
| Content Frame      | `AppPanel`                   | `Panel` → `PanelMain` → `PanelMainBody` |
| Main Content       | Table / Canvas / Form        | Primary page content                    |
| Footer (on tables) | Pagination component         | Navigation between table pages          |

For **floating panels on the workflow canvas** under the glass theme, prefer `AppPanel` with `variant="raised"` for compact controls (opaque + shadow) or `opaqueFloatingFill` for large flat shells without raised chrome; see JSDoc on `packages/nexus-ui/src/components/AppPanel.tsx`.

### Page Header Structure

The page header appears at the top of every page and contains the title and primary actions.

There are different kinds of page headers:

- **Main page header**
  - Left-aligned page title
  - Right-aligned page actions

- **Details page header**
  - Left-aligned back button + left-aligned page header
  - Right-aligned page actions

- **Form page header**
  - Left-aligned page title
  - Right-aligned page actions

---

## 3. Page Content Frame

### Filter Bar Components

Use PatternFly's [Attribute Search component](https://www.patternfly.org/patterns/filters/#attribute-search).

By default every filter type should be a "Keyword" search which is a `contains` filter on all content.

Filter bar is visible when data exists or when filters are active; hidden only when the resource type has never had data created.

| Component           | Purpose                            |
| ------------------- | ---------------------------------- |
| Filter dropdown     | Select filter category             |
| Search input        | Text search                        |
| Active filter chips | Show applied filters (when active) |
| Clear all           | Remove all filters                 |

### Table Component

- Always use `ScrollableTableContainer` wrapper — this applies the standard table variant by default
- `ScrollableTableContainer` does not set `variant="compact"` — the default (standard) variant is used for main data tables
- Use `variant="compact"` only for dense, supplementary tables (e.g., activity state tables inside panels) where space is constrained
- Always include `<Thead>` with column headers
- Actions column is rightmost
- Header includes title and primary actions for the whole page
- Columns should be sortable if applicable
- Clicking the name of a resource should navigate to the details view
- **Table columns:**
  - Columns for "created" or "modified" should have username (linked) + date together
  - This pattern should be used for any column that includes a date/time and a who
- **Row Actions:**
  - Every table row has a kebab menu (⋮) in the rightmost column containing all available actions for that resource
  - The actions column has no column header label
  - All row actions live inside the kebab — no direct buttons or links in the actions column
  - Action order: non-destructive actions first (e.g., "Edit", "Duplicate", "Disable"), then a divider, then destructive actions last (e.g., "Delete", "Remove")
  - On the **details page header**, the same actions appear in a kebab menu. Frequently used actions are promoted to direct buttons in the header based on usage patterns — these become the primary actions for that resource. The remaining actions stay in the kebab.
- **Footer/pagination** — uses cursor-based pagination via `ScrollableTableContainer`'s `footer` prop (`TableFooterProps`):
  - Left: Item count — `"5 workflows (of 100 total)"` format showing current page count and overall total
  - Right: **Previous / Next** buttons using cursor tokens from the API (`prev`, `next`). No page numbers, no per-page selector, no jump-to-page — the API returns opaque cursor strings, not offsets
  - Pass `{ content, prev, next, onPrev, onNext }` to the `footer` prop

### Form Component

- Use PatternFly's [Basic Form component](https://www.patternfly.org/components/forms/form/#basic)
- Forms should be left-aligned, one column, max-width of 600px
- Header includes title, primary action button, and secondary cancel
- **Inputs/fields:**
  - Use PatternFly's [typeahead component](https://www.patternfly.org/components/menus/select/#multiple-typeahead-with-labels) to easily find options in a list of items (use when there are 10+ options)
  - Use PatternFly's [Read-only Clipboard Copy](https://www.patternfly.org/components/clipboard-copy/#clipboardcopy) when an input is pre-populated by the system and the user needs to copy
  - Use PatternFly's [Validated component](https://www.patternfly.org/components/forms/form/#validated) for general form validation
  - Use PatternFly's [Number Input component](https://www.patternfly.org/components/number-input/#numberinput) for number input fields
  - Use PatternFly's [popover help text](https://www.patternfly.org/components/popover/design-guidelines) on form field labels

### Details Component

- Use `DescriptionList isCompact isHorizontal`
- Group related fields using headers
- Use consistent formatting for dates and durations — follow PatternFly's [Date/Time guidelines](https://www.patternfly.org/ux-writing/numerics/#date-and-time-formats)
- Header includes title and primary actions for the specific resource (pulled from the table row actions)

---

## 4. Empty States

Use PatternFly's [Basic Empty State component](https://www.patternfly.org/components/empty-state#basic).

Empty states replace the main content area when there is no data to display.

| Scenario          | Title                          | CTA: Primary button                  | Filter?                          |
| ----------------- | ------------------------------ | ------------------------------------ | -------------------------------- |
| No data exists    | `"No [resources] yet"`         | If applicable: `"Create [resource]"` | No                               |
| No filter results | `"No results found"`           | `"Clear all filters"`                | Yes, with active filters showing |
| Service error     | `"Unable to load [resources]"` | `"Retry"`                            | No                               |

---

## 5. Page Layout Checklist

When building or reviewing any page, verify every item:

### Structure

- [ ] Uses `AppPage` as outer wrapper
- [ ] Uses `AppPageHeader` for title and actions
- [ ] Uses `StackItem isFilled` + `AppPanel isFullHeight` for content
- [ ] Inner content has consistent padding

### Header

- [ ] Title is clear and matches navigation
- [ ] Primary action is the rightmost button
- [ ] Action buttons follow standard order

### Filter Bar

- [ ] Visible when data exists or when filters are active
- [ ] Hidden only when the resource type has never had data created

### Main Content

- [ ] Tables use `ScrollableTableContainer`
- [ ] Main data tables use `ScrollableTableContainer` (standard variant by default)
- [ ] `variant="compact"` only used for dense, supplementary tables where space is constrained
- [ ] Tables have proper column headers
- [ ] Forms have max-width of 600px
- [ ] Canvas views use `hasNoPadding`

### Footer

- [ ] Only present for tables
- [ ] Shows item count on left
- [ ] Navigation controls on right
- [ ] Buttons disabled when at boundary

### Empty States

- [ ] Correct empty state for the scenario (no data / no results / error)
- [ ] CTA button when applicable

### Button Placement Rules

Button alignment differs by context — this is intentional and follows PatternFly convention:

| Context           | Primary action position               | Example                                                            |
| ----------------- | ------------------------------------- | ------------------------------------------------------------------ |
| Page headers      | **Rightmost**                         | "Create credential" button on the far right of the header          |
| Modals            | **Leftmost**                          | "Delete" danger button on the far left, "Cancel" link on the right |
| Forms (full page) | **Leftmost**                          | "Save" button on the far left, "Cancel" link on the right          |
| Toolbars          | **Leftmost**, kebab menu on far right | "Create" button left, bulk action kebab on right                   |

---

## 6. CRUD Patterns

### Create: Full Page

Use for complex resources with many fields or multi-step creation.

- Multi-step wizards
- Forms with 5+ fields

### Create: Modal

Use for simple resources with few fields.

- Simple resources (2–4 fields)
- Quick creation without leaving context
- Tags, labels, simple configurations

### Read/Detail: Full Page

Use for resources with rich information.

### Update/Edit: Full Page

Use for editing complex resources with many fields or multi-step creation.

- Multi-step wizards
- Forms with 5+ fields
- If the create form is full page

**Key behaviors:**

- Pre-populate all fields with existing values
- Track dirty state (unsaved changes)
- Warn on navigation with unsaved changes
- Show loading state while saving

### Update/Edit: Modal

Use for simple resources with few fields.

- Simple resources (2–4 fields)
- Quick creation without leaving context
- Tags, labels, simple configurations
- If the create form is a modal

### Update/Edit: Inline

Use for single-field quick edits.

- Renaming resources (when save happens elsewhere)
- Toggling settings — use PatternFly's [Switch Checked with Label component](http://patternfly.org/components/switch#checked-with-label)
- Single-value changes

### Delete/Remove/Cancel/Stop: Destructive Confirmation Modal

**Always** use a destructive confirmation modal for these actions.

| Element       | Specification                                                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Modal variant | Small — PatternFly's [Small Variant Modal](https://www.patternfly.org/components/modal#modal-sizes)                                                          |
| Title         | `"[Delete/Remove/Cancel/Stop] [resource type]?"` with warning icon — PatternFly's [Title Icon Modal](https://www.patternfly.org/components/modal#title-icon) |
| Body          | `[Name of resource]` and consequence                                                                                                                         |
| Action button | `variant="danger"`                                                                                                                                           |
| Cancel button | `variant="link"`                                                                                                                                             |

**Post-delete behavior:**

- From list/table view → stay on list, item removed
- From details page → navigate back to list/table
- Show feedback → PatternFly's [Dismissible Success Toast Alert](https://www.patternfly.org/components/alert#alert-variations)

**Post-cancel/stop behavior:**

- From list/table view → stay on list, item updated
- From details page → stay on details page
- Show feedback → PatternFly's [Dismissible Success Toast Alert](https://www.patternfly.org/components/alert#alert-variations)

### Disable: Standard Confirmation Modal

Disable is **not** a destructive action — use a standard confirmation modal (no warning icon, no danger button).

| Element        | Specification                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Modal variant  | Small — PatternFly's [Small Variant Modal](https://www.patternfly.org/components/modal#modal-sizes) |
| Title          | `"Disable [resource type]?"`                                                                        |
| Body           | `[Name of resource]` and consequence                                                                |
| Confirm button | `variant="primary"`                                                                                 |
| Cancel button  | `variant="link"`                                                                                    |

**Post-disable behavior:**

- From list/table view → stay on list, item updated
- From details page → stay on details page
- Show feedback → PatternFly's [Dismissible Success Toast Alert](https://www.patternfly.org/components/alert#alert-variations)

---

## 7. Modals

- Use PatternFly's [Small Variant Modal component](https://www.patternfly.org/components/modal#modal-sizes)
- Delete modals should use PatternFly's [Title Icon Modal component](https://www.patternfly.org/components/modal#title-icon)
- **Buttons:**
  - Left-aligned in the modal
  - Primary action on the far left, then secondary, then tertiary
  - If there is a primary action and a cancel, the cancel should be a link button (`variant="link"`)
  - This applies to all modals, including delete confirmations

---

## 8. Feedback & Notifications

### Success Feedback

- Use PatternFly's [Dismissible Success Toast Alert component](https://www.patternfly.org/components/alert#alert-variations) for success messages after create, update, delete, and other actions
- Toast alerts should auto-dismiss after a reasonable duration
- Message format: `"[Resource type] [action] successfully"` (e.g., "Credential created successfully")

### Error Feedback

- For page-level data loading errors, use `useQueryState(query, { title: '...', onRetry: ... })` — this hooks up the `ErrorState` component with a retry button automatically for retryable (5xx) errors
- For mutation errors (create/update/delete), use `useMutationErrorHandler` — this wires up `ErrorState` and toast alerts automatically
- For form validation errors, use inline field-level errors via PatternFly's Validated component (see Form Component section)

### Loading States

- Show PatternFly's [Spinner component](https://www.patternfly.org/components/spinner) during async operations
- For page-level loading, use a centered spinner in the content area
- For button actions (save, submit), show a loading spinner on the button and disable it during the operation
- For tables, show a skeleton or spinner in the content area while data loads

---

## 9. Bulk Actions

### Table with Selection Checkboxes

- Use PatternFly's [Selectable with Checkbox Table component](https://www.patternfly.org/components/table#selectable-with-checkbox)
- If the table is expandable, column order left to right: expand/collapse chevron → checkbox → table columns
- Bulk actions are found in the kebab menu in the toolbar, to the right of the primary button
- If applicable, delete/remove option is always last
- Will have a bulk action confirmation modal

---

## 10. Statuses and Labels

### Statuses

- Use PatternFly's [Outline Status Label component](https://www.patternfly.org/components/label#outlined-labels)

### Labels/Tags

- Use PatternFly's [Filled Non-status Label component](https://www.patternfly.org/components/label#filled-labels) and default to gray
- If labels on a table reference a resource, make them clickable labels, navigating to the details page of the resource if one exists

---

## 11. Icons

All icons **must** come from the [Red Hat Design System](https://ux.redhat.com/) and the [icon set](https://ux.redhat.com/foundations/iconography/#ui-icons) for Red Hat UI. Although AO is built on top of PatternFly, it uses the Compass and Unified Theme frameworks. All icons must adhere to the Red Hat Design System (RHDS) icon set rather than the standard PatternFly defaults.

---

## 12. Expand/Collapse Chevrons

- Use PatternFly's [Expandable Table component](https://www.patternfly.org/components/table#expandable) to ensure expand/collapse chevrons are correct:
  - **Collapsed:** chevron pointed to the right
  - **Expanded:** chevron pointed down
- **Exception:** expand and collapse of nodes on the canvas

---

## 13. Content Rules

- Use **sentence case** by default across the application
- Use **title case** only for navigation items and page titles
- **User-generated strings** are displayed exactly as the user entered them — do not transform casing
- **Alert titles** (`showSuccess`, `showError`, `showWarning`, `showInfo`) must use sentence case — e.g., "Workflow created successfully", not "Workflow Created Successfully"

### No Raw HTML for Text Content

Never use raw `<span>`, `<p>`, or `<div>` for text content. Use PatternFly typography components instead — they pick up design tokens for font size, color, and spacing automatically and stay theme-compatible.

| Scenario                           | Use                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------ |
| Body text, helper text, muted text | [`Content`](https://www.patternfly.org/components/content) with `ContentVariants`          |
| Form field hints                   | [`HelperText`](https://www.patternfly.org/components/forms/helper-text) / `HelperTextItem` |
| Inline status                      | [`Label`](https://www.patternfly.org/components/label)                                     |
| Empty state descriptions           | `EmptyStateBody`                                                                           |
| Headings                           | [`Title`](https://www.patternfly.org/components/title) or semantic `<h1>`–`<h6>`           |

```tsx
// ❌ BAD
<span style={{ fontSize: '12px', color: 'gray' }}>Type to refine results</span>

// ✅ GOOD
<Content component={ContentVariants.small}>Type to refine results</Content>
```

---

## 14. Workflow Builder

The automation builder experience is based on [React Flow](https://reactflow.dev/) as the underlying graph/canvas foundation, with PatternFly as the visual wrapper. The canvas is built **left to right**.

### Step Interactions

| Interaction            | Result                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------ |
| Single click on a step | Select the step, expand/collapse step                                                                  |
| Double click on a step | Opens panel view with Input and Output information (also via "View step details" from step kebab menu) |
| Right click on a step  | Same as clicking the kebab menu — opens the menu items                                                 |

### View-Only Views

- Run view
- Run history
- Version history

### Add Step

- Opens "Add step" side panel and auto-adjusts the canvas view
- Via "Add step" action from canvas toolbar
- Clicking `+` on the connector line after a step adds a new connected step
- Clicking `+` on the connector line between two steps inserts a new step in between

### Canvas Controls

- Should be anchored to the **bottom-left corner** of the canvas view

---

## 15. Accessibility Guidelines

While PatternFly provides a strong foundation with accessibility built into its individual components, achieving full [WCAG 2.1 AA](https://www.w3.org/WAI/WCAG2AA-Conformance) and [Section 508](https://www.section508.gov/) compliance requires careful implementation within the Automation Orchestrator codebase.

An accessible component can still be used in an inaccessible way. The goal is to ensure that the holistic user journey — including page structure, dynamic content, and complex workflows — remains fully inclusive and navigable for all users, including those relying on assistive technologies.

### Where PatternFly Isn't Enough

PatternFly handles the internal accessibility of its elements (e.g., a dropdown menu will have correct internal focus management), but developers are responsible for the **contextual accessibility** of the application:

- **Page Structure & Landmark Roles:** Ensuring the macro-layout of the application is navigable.
- **Focus Management:** Handling user focus when views change, modals open/close, or elements are dynamically added/removed from the DOM.
- **Custom Components:** Ensuring any UI elements built outside of PatternFly (such as workflow canvases built on React Flow) adhere to strict accessibility standards.

### Core Implementation Standards

#### Semantic HTML & Page Structure

- **Proper Heading Hierarchy:** Headings (`<h1>` through `<h6>`) must be used sequentially without skipping levels. Screen reader users rely on headings to map out the page.
- **Landmarks:** Use semantic tags (`<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`) or ARIA landmark roles so users can quickly jump to specific regions of the application.

#### Keyboard Navigation & Focus Management

- **Keyboard Operability:** Every interactive element (buttons, links, form fields, drag-and-drop interfaces) must be fully operable using only a keyboard.
- **Visible Focus Indicator:** Never remove the default focus outline (`outline: none;`) unless providing a highly visible custom alternative with a contrast ratio of at least 3:1 against the background.
- **Routing and Modals:** When navigating between routes in a SPA, focus should be programmatically managed (e.g., sent to the new page's main heading). When opening a modal, focus must be trapped inside it until dismissed, and returned to the triggering element upon closing.

#### Dynamic Content & State Changes

- **Live Regions:** Use `aria-live` attributes (`polite` or `assertive`) to announce dynamic updates (e.g., job completing, failing, notification toast appearing) without requiring a page refresh.
- **State Communication:** Use attributes like `aria-expanded`, `aria-disabled`, and `aria-current` to ensure screen readers understand the current state of toggleable or actionable UI elements.

#### Forms & Error Handling

- **Explicit Labeling:** Every input field must have an associated `<label>`. Do not rely solely on placeholder text, as it disappears on input and often fails color contrast standards.
- **Accessible Validation:** Form errors must be communicated to assistive tech. Use `aria-invalid="true"` on the input and `aria-describedby` to link the input to the specific error message text.

#### Color, Contrast, and Iconography

- **Color Contrast:** All text and meaningful icons must meet the WCAG AA minimum contrast ratio of 4.5:1 for normal text and 3:1 for large text/UI components against their background.
- **Don't Rely Solely on Color:** Information must never be conveyed by color alone. If a job fails, include an error icon and descriptive text (e.g., "Status: Failed"), not just red text.
- **Alternative Text:** Provide concise `alt` text for informative images. Use empty `alt=""` or `aria-hidden="true"` for purely decorative images or icons so screen readers can ignore them.

### Testing & Validation

- **Automated Testing:** Integrate accessibility tools into unit tests and CI/CD pipelines to catch basic DOM-level violations (e.g., missing labels, contrast failures).
- **Manual Keyboard Testing:** Test features using only `Tab`, `Shift+Tab`, `Enter`, `Space`, and Arrow keys.
- **Screen Reader Testing:** Features should be tested using standard screen readers to verify the actual user experience.

---

## 16. Styling Rules

### No Global, Unscoped CSS

**Never write global CSS rules** that target element types, PatternFly class names, or broad selectors from a shared stylesheet. Global styles bleed across component boundaries, override PatternFly's design tokens silently, and break theming and upgrade-compatibility.

```css
/* ❌ BAD: global rules that affect all matching elements */
.pf-v6-c-menu__item {
  min-height: 0;
}

p {
  margin-bottom: 8px;
}
```

```css
/* ✅ GOOD: scoped to a CSS Module, applied via className */
/* MyComponent.module.css */
.menuItem {
  min-height: 0;
}
```

```tsx
/* ✅ GOOD: apply the scoped class in the component */
import styles from './MyComponent.module.css'
;<MenuItem className={styles.menuItem} />
```

### Styling Priority Order

Follow this hierarchy when applying styles — always start from the top:

1. **PatternFly props and variants** — use built-in component props (`variant`, `isCompact`, `hasNoPadding`, etc.) before writing any CSS.
2. **PF6 design tokens** — use `var(--pf-t--global--*)` custom properties for spacing, color, and sizing. Never use hardcoded `px` values for these concerns.
3. **CSS Modules** (`.module.css`) — for component-specific overrides that cannot be expressed via tokens or props. Styles must be scoped to the module; never use `:global()` selectors inside a module.
4. **Inline `style` prop** — acceptable only for dynamic values (e.g., a width computed at runtime) that cannot be expressed as a token or class.

### When a Global Style Seems Necessary

If you believe a global style is the only option, follow the PatternFly gaps process (see "AO Design System" → "PatternFly gaps" above): check PatternFly docs and tokens first, raise with UX, then engage PatternFly upstream. Approved temporary exceptions must be documented with a `patternfly-override` Jira label.

---

## 17. Use Chrome DevTools MCP to Verify Implementation

This project ships with a Chrome DevTools MCP server configured in `.mcp.json`. Use it to inspect the live application while implementing or reviewing UI — verify that PatternFly components render correctly, design tokens are applied, and layouts match the spec.

### Available Capabilities

| Capability                | What it helps verify                                                     |
| ------------------------- | ------------------------------------------------------------------------ |
| **DOM inspection**        | Correct PatternFly component structure, semantic HTML, landmark roles    |
| **Computed styles**       | Design tokens (`var(--pf-t--global--*)`) applied instead of hardcoded px |
| **Layout inspection**     | Page structure matches Compass layout, spacing is consistent             |
| **Network monitoring**    | API calls use typed clients, responses match expected contracts          |
| **Console monitoring**    | No runtime errors, warnings, or accessibility violations in console      |
| **JavaScript evaluation** | Inspect component state, verify Zustand store, check React props         |

### When to Use

| Situation                                           | What to check                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------- |
| Implementing a new page or component                | Verify PatternFly classes and tokens render correctly            |
| Reviewing spacing or alignment issues               | Inspect computed styles for hardcoded px vs design tokens        |
| Checking empty states, loading states, error states | Navigate to each state and verify correct component usage        |
| Verifying accessibility                             | Inspect DOM for landmark roles, heading hierarchy, aria attrs    |
| Debugging layout issues                             | Check flex/grid containers, overflow, and responsive breakpoints |
| Validating modal/dialog behavior                    | Verify focus trap, button order, variant usage                   |

### Workflow

1. **Start the dev server** (`npm start`)
2. **Navigate to the page** in the browser
3. **Inspect the DOM** — verify PatternFly component structure (e.g., `pf-v6-c-table`, `pf-v6-c-empty-state`)
4. **Check computed styles** — confirm spacing uses design tokens, not hardcoded values
5. **Monitor console** — watch for React warnings, accessibility violations, or runtime errors
6. **Fix issues** before submitting for review

### Checklist for UI Verification

- [ ] PatternFly components used (no custom equivalents)
- [ ] Design tokens applied for spacing and colors (`var(--pf-t--global--*)`)
- [ ] No hardcoded `px` for spacing or colors
- [ ] Semantic HTML and ARIA attributes present
- [ ] Heading hierarchy correct (h1 → h2 → h3, no skipping)
- [ ] No console errors or warnings in the page
- [ ] Empty, loading, and error states all render correctly

---

## 18. Getting Started for Developers

- Point to the AO UI repository for implementation references
- Utilize the UI/UX skills defined in this document and the Cursor rules
- Follow the accessibility guidelines in section 15
- Follow the styling rules in section 16
- Use Chrome DevTools MCP (section 17) to verify your implementation against the live app

---

## Quick Reference: Component Selection

When implementing a new page or feature, use this decision tree:

```text
What are you building?
├── List/table view
│   ├── Use ScrollableTableContainer (standard variant by default, "compact" only for dense supplementary tables)
│   ├── Add AppPageHeader with title + primary action
│   ├── Add FilterBar (Attribute Search)
│   ├── Add cursor-based pagination footer via ScrollableTableContainer's footer prop
│   ├── "Created"/"Modified" columns: username (linked) + date together
│   └── Handle 3 empty states (no data / no results / error)
│
├── Detail view
│   ├── Use DescriptionList isCompact isHorizontal
│   ├── Add AppPageHeader with back button + title + resource actions
│   └── Group related fields with headers
│
├── Create/Edit form
│   ├── 5+ fields or multi-step? → Full page
│   ├── 2–4 simple fields? → Modal
│   ├── Use PatternFly Basic Form, left-aligned, one column, max-width 600px
│   └── Use Zod + react-hook-form for validation
│
├── Delete/Remove/Cancel/Stop (destructive)
│   ├── Always use confirmation modal (Small variant)
│   ├── Title with warning icon
│   ├── Action button variant="danger", Cancel variant="link"
│   └── Post-delete: remove from list or navigate back + toast
│
├── Disable (non-destructive)
│   ├── Standard confirmation modal (Small variant, no warning icon)
│   ├── Confirm button variant="primary", Cancel variant="link"
│   └── Post-disable: stay in place + toast
│
└── Canvas/builder view
    ├── Use React Flow + PatternFly wrapper
    ├── Left-to-right layout
    ├── Canvas controls at bottom-left
    └── Side panel for step details (not modal)
```
