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
- **`Nx` prefix convention** — AO opinionated global components use the `Nx` prefix (e.g., `NxPage`, `NxPanel`, `NxConfirmationDialog`, `NxDetailList`) and live in `packages/nexus-ui/src/components/` organized by subdirectory: `layout/`, `dialogs/`, `details/`, `tabs/`, `states/`. These wrap raw PatternFly primitives with AO-specific defaults and behavior — use the `Nx*` wrapper, not the raw PF component, for these patterns.
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
- **Safety as a First-Class Object:** "Gating" steps and Human-In-The-Loop (HITL) checkpoints build trust, ensuring users can safely manage non-deterministic AI outputs before they execute against critical infrastructure.
- **In-Context Documentation:** Context-aware help and documentation integrated directly into configuration panels to save users from switching tabs.

### Accessibility & Compliance

A major finding was that basic usability and accessibility are often an "afterthought" in technical automation tools. By building on PatternFly, Automation Orchestrator meets high accessibility standards (WCAG 2.1 AA) from the start, providing a more inclusive experience than the current market leaders.

---

## Philosophy

### The Opinionated Implementation

While PatternFly provides flexible building blocks, this project follows an **opinionated implementation**. We pick the components that best serve the "supervisor" mental model — an operator who must understand, trust, and intervene in complex automation across scale.

**Key principles:**

- **Standardized compositions** — Atomic PatternFly components are combined into larger, opinionated compositions (e.g., a "complete table view" with prescribed pagination, filtering, and bulk action patterns). These compositions are the unit of consistency, not individual components.
- **Data-driven adjustments** — Side-out panels instead of modals for step configuration, preserving workflow canvas context.
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

| Layer              | Component                   | Purpose                                  |
| ------------------ | --------------------------- | ---------------------------------------- |
| App Shell          | `Compass`                   | Overall application frame                |
| Navigation         | `AppDockedNav`              | Left sidebar with icons                  |
| Page Content       | `CompassContent` + `NxPage` | Main content area wrapper                |
| Page Header        | `NxPageHeader`              | Page title and actions                   |
| Content Frame      | `NxPanel`                   | `Panel` → `PanelMain` → `PanelMainBody`  |
| Content Stack      | `NxPanelContentStack`       | Full-height flex column inside `NxPanel` |
| Main Content       | Table / Canvas / Form       | Primary page content                     |
| Footer (on tables) | `PaginationFooter`          | Navigation between table pages           |

For **floating panels on the workflow canvas** under the glass theme, prefer `NxPanel` with `variant="raised"` for compact controls (opaque + shadow) or `opaqueFloatingFill` for large flat shells without raised chrome; see JSDoc on `packages/nexus-ui/src/components/layout/NxPanel.tsx`.

### Centered Layout for Loading / Empty States

Use `NxPageBody` with `isCentered` for page-level centered layouts (loading spinners, empty states). For nested slots (e.g. `StackItem` + `isFilled`), use `flexCenteredBothAxes` from `src/app/flexCenteredBothAxes.ts`.

### Panel Content Stack

Use `NxPanelContentStack` (from `src/components/layout/NxPanelContentStack.tsx`) as the main content column inside `NxPanel isFullHeight`. It provides the correct flex behavior (`flex: 1`, `minHeight: 0`) so nested scroll areas resolve height correctly.

| Variant   | Use case                                                            |
| --------- | ------------------------------------------------------------------- |
| `default` | Standard full-height panel content                                  |
| `inset`   | List pages with horizontal inset (workflows, executions, approvals) |

### Page Layout Archetypes

The following four compositions are the canonical page structures. Storybook documents each as a composed story under `NxPage`.

| Archetype          | Structure                                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| **List page**      | `NxPageHeader` (Create CTA) → `NxPageBody` → `NxPanel isFullHeight` → `NxPanelContentStack variant="inset"` → filter bar + table |
| **Detail page**    | `NxPageBreadcrumbs` → `NxPageHeader` → `NxPanel isFullHeight` → `NxPanelContentStack` (default) → tabs + content                 |
| **Form page**      | `NxPageBreadcrumbs` → `NxPageHeader` with Cancel/Save toolbar → `NxPanel` → form body (max-width 600px)                          |
| **Error in panel** | Same shell as list page → `NxPageBody isCentered` + `NxErrorState` **inside** `NxPanel` (page header and shell remain visible)   |

### Page Header Structure

The page header appears at the top of every page and contains the title and primary actions.

There are different kinds of page headers:

- **Main page header**
  - Left-aligned page title
  - Right-aligned page actions

- **Details page header**
  - Left-aligned breadcrumbs (via `NxPageBreadcrumbs`) + page title
  - Optional: resource type label badge alongside the resource name
  - Right-aligned toolbar actions ordered left to right: `Switch` toggle (if applicable) → Edit button (primary) → kebab menu with remaining actions

- **Form page header**
  - Left-aligned breadcrumbs (via `NxPageBreadcrumbs`) + page title
  - Right-aligned toolbar actions: Cancel (secondary) → Save [resource] (primary, rightmost)

### Breadcrumbs

Use `NxPageBreadcrumbs` for detail and form page navigation.

- Renders **nothing** when fewer than 2 items (single-level pages have no breadcrumb)
- Last item is the current page (rendered as non-link text)
- Middle segments collapse to a dropdown at ≤768px viewport width
- Use PF6 default breadcrumb styling (dashed underline) — no CSS overrides

For live examples:

```
list-all-documentation → find "NxPageBreadcrumbs" → get-documentation("NxPageBreadcrumbs")
```

### Tabs

When a page uses tabs, the tabs must live inside `NxPanel`, not outside it.

- Tab labels should be clear, professional, and action-oriented
- Use sentence case for tab labels (e.g. "Activity log", not "Activity Log")
- Avoid colloquial language, slang, or informal phrasing
- Avoid punctuation in tab labels (no question marks, exclamation points)
- **Tab intro paragraphs:** For complex admin sections (e.g., Access Management — Groups, Projects, Users, Assignments, Policies, Roles), add a descriptive `<Content component={ContentVariants.p}>` block above the tab content (before filters/toolbars) explaining what the section does and how it relates to RBAC. Use `marginBottom: var(--pf-t--global--spacer--md)` below the intro text. This is not a page header description — it lives inside the tab panel content.

**`NxUrlTabs` API:**

- `basePath` — the URL path prefix for the tabs
- `defaultTab` — tab to show when no tab segment is in the URL (defaults to `"details"`)
- `validTabs` — optional array for dynamic tab lists; invalid tab segments redirect to `defaultTab`
- URL is the single source of truth for the active tab — no local active-tab state
- Tab panel content owns its own inner padding (typically `--pf-t--global--spacer--lg`)

For live examples and story-driven documentation, use the Storybook MCP:

```
list-all-documentation → find "NxUrlTabs" / "NxPage" / "NxPageHeader" / "NxPanel" /
"NxPageBreadcrumbs" / "NxConfirmationDialog" / "NxDetailList" / "NxCodeBlock" → get-documentation(...)
```

---

## 3. Page Content Frame

### Filter Bar Components

Use PatternFly's [Attribute Search component](https://www.patternfly.org/patterns/filters/#attribute-search).

By default every filter type should be a "Keyword" search which is a `contains` filter on all content.

Filter bar is visible when data exists or when filters are active; hidden only when the resource type has never had data created.

- **Filter dropdown search threshold** — Filter select dropdowns hide the `SearchInput` when there are fewer than 10 static options (e.g., Enabled/Disabled toggles), reducing visual clutter for small option lists. Async (server-side) filters always show the search bar since it drives the server query. The threshold is defined as `SEARCH_THRESHOLD = 10` in `textFilterSelectControls.tsx`.

| Component           | Purpose                            |
| ------------------- | ---------------------------------- |
| Filter dropdown     | Select filter category             |
| Search input        | Text search                        |
| Active filter chips | Show applied filters (when active) |
| Clear all           | Remove all filters                 |

### Table Component

- Always use `NxScrollableTableContainer` wrapper — this applies the standard table variant by default
- `NxScrollableTableContainer` does not set `variant="compact"` — the default (standard) variant is used for main data tables
- Use `variant="compact"` only for dense, supplementary tables (e.g., activity state tables inside panels) where space is constrained
- Always include `<Thead>` with column headers
- Actions column is rightmost
- Header includes title and primary actions for the whole page
- Columns should be sortable if applicable
- Clicking the name of a resource should navigate to the details view
- **Table columns:**
  - Columns for "created" or "modified" should have username (linked) + date together
  - This pattern should be used for any column that includes a date/time and a who
  - Date/time format: `MMM DD, YYYY, H:MM:SS AM/PM` — e.g., "Jan 15, 2026, 2:30:45 PM". Comma between date and time. Seconds included.
- **Row Actions:**
  - Every table row has a kebab menu (⋮) in the rightmost column containing all available actions for that resource
  - The actions column has no column header label
  - All row actions live inside the kebab — no direct buttons or links in the actions column
  - **Exception — inline enable/disable**: A `Switch` toggle may appear in a dedicated "State" column (not the actions column) for resources where toggling the enabled state is the most frequent action (e.g., credentials, identity providers). The switch patches the resource directly. **Note:** Workflows no longer use an inline Switch — they use the Publish lifecycle with status badges (see §17).
  - **Full labels:** Always use `"Action + resource"` format in kebab menus — e.g., "Edit credential", "Delete credential", "Duplicate workflow" (not just "Edit" or "Delete"). Each item includes an icon via the `IconLabel` pattern.
  - Destructive items use `isDanger: true` (e.g., "Delete credential" renders in red)
  - Action order: non-destructive actions first (e.g., "Edit credential", "Duplicate workflow", "Disable credential"), then a divider, then destructive actions last (e.g., "Delete credential", "Remove integration")
  - On the **details page header**, the same actions appear in a kebab menu. Frequently used actions (e.g., Edit) are promoted to direct buttons in the header — primary button with icon for the most common action (e.g., `RhUiEditIcon` + "Edit credential"), remaining actions stay in the kebab.
- **Text truncation** — All text-heavy columns (names, descriptions, emails, URLs) must use PatternFly's `<Truncate>` component. Long values show ellipsis with the full text in a tooltip on hover.
  - `NxScrollableTableContainer` uses `table-layout: fixed` for equal column distribution — do not opt out with `useFixedLayout={false}`
  - Wrap cell text in `<Truncate content={value} />` for any column that may contain user-generated or variable-length content
  - `LinkCell` children support `<Truncate>` — the link button constrains overflow automatically
- **`NxKebabMenu` component** — Use `NxKebabMenu` (from `src/components/NxKebabMenu.tsx`) for table row actions and contextual overflow menus. API:
  - `actions`: array of `{ key, title, onClick, isSeparator?, isDanger?, isAriaDisabled?, tooltipProps? }`
  - `aria-label`: must be unique per row (e.g., `` `Actions for ${resource.name}` ``)
  - Action ordering: non-destructive first → `isSeparator: true` → destructive last (`isDanger: true`)
  - Use `IconLabel` for action titles: `<IconLabel icon={<RhUiEditIcon />}>Edit workflow</IconLabel>`
  - Permission-gated items: `isAriaDisabled: true` + `tooltipProps: { content: tooltip }` (visible but non-actionable, stays focusable)
- **Expandable rows** — When a table uses expandable rows to show nested detail (e.g., policies under a role, execution steps in a workflow run):
  - Pass `isExpandable` to `NxScrollableTableContainer` for proper PF6 table styling
  - Include an expand-all / collapse-all toggle in the `<Thead>` using the `expand` prop on the first `<Th>`
  - Use `ExpandableRowContent` for the expanded row body
  - Expanded content should use compact gray `Label` components for list-style data (e.g., attached policies)
  - Column order left to right: expand/collapse chevron → [checkbox if selectable] → data columns → actions
- **Footer/pagination** — use `PaginationFooter` via the `NxScrollableTableContainer` `footer` prop. `PaginationFooter` wraps PatternFly's [Pagination](https://www.patternfly.org/components/pagination) component; supports `page`, `perPage`, `total` (optional), `hasNext`, `onPrev`, `onNext`, and `onPerPageChange`. When `total` is unknown (cursor-based APIs), item count is estimated from `page`, `perPage`, and `hasNext`. Pair with `useCursorPagination` from `src/hooks/useCursorPagination.tsx` for cursor state management

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
  - Use PatternFly's [`HelperText`](https://www.patternfly.org/components/forms/helper-text) / `HelperTextItem` below form inputs to provide brief, contextual guidance (e.g., accepted formats, valid ranges, constraints). The help popover icon on the field label is for longer explanatory descriptions. When both are present, inline helper text gives at-a-glance guidance while the popover provides full context. Validation errors (`validated="error"`) take priority — replace the helper text with the error message when the field is invalid.
- **Dropdowns:** Never use native `<select>` or PatternFly's legacy `FormSelect` / `FormSelectOption`. Always use the PF6 `Select` + `MenuToggle` + `SelectList` + `SelectOption` pattern. Inside modals, use `popperProps={{ appendTo: 'inline' }}` for correct dropdown positioning. Add `shouldFocusToggleOnSelect` for keyboard accessibility after selection.
- **Validation behavior:**
  - The primary action (Save / Create) is **always clickable** — never disable it because of missing required fields
  - When the user clicks Save with invalid or missing fields, apply `validated="error"` (danger styling) to the invalid fields and show a toast notification explaining what needs attention
  - Selecting/filling the required field clears the danger styling immediately
  - **Human-readable validation copy:** Never expose raw regex patterns or API validation strings to users. Use plain-language error messages (e.g., "Project name can only contain letters, numbers, hyphens, underscores, or colons. It must start and end with a letter or number."). Provide proactive field guidance via inline hint text (using `HintOrError` or `HelperText`) that displays before the user triggers an error; the hint is replaced by the error message on validation failure. Use example-style placeholders (e.g., `'my-project-name'`) instead of generic `"Enter project name"`.
- **Cascading field resets:** When one field change should clear or reset dependent fields (e.g., changing "Resource type" resets "Action"), put the reset logic in the field's `onChange` handler — not in a `useEffect` watching the field value. See [coding_standards.md §23](../../.claude/skills/coding_standards.md) and [React docs](https://react.dev/learn/you-might-not-need-an-effect).
- **FormSection for complex forms:** When a single form step has 10+ fields spanning logical domains, group them with PatternFly `FormSection`:
  - `title="Section Name"` + `titleElement="h3"` for each group
  - **Grouping logic:** General (identity/metadata) → Connection (endpoints/secrets) → Options (toggles/advanced)
  - Section-scoped actions belong inside their section (e.g., "Test connection" inside the Connection section, not the global footer)
- **Scrollable form panels:** Full-page forms that may exceed viewport height need `NxPanel isFullHeight isScrollable`. Without `isScrollable`, bottom fields overflow outside the panel boundary. Constrain form width with `maxWidth: '600px'` inside a `Stack hasGutter`.

### Typeahead Selector Patterns

All typeahead dropdown menus should have a **max height** to prevent the dropdown from growing unbounded. Use PatternFly's `menuHeight` prop or equivalent CSS constraint.

#### Project Selector (with favorites)

The project selector is a special typeahead that supports favorites. This pattern is specific to the project selector — resource pickers (e.g., credential selectors, integration pickers) do **not** include favorites.

- **Visible prefix label** — The masthead project selector includes a static `"Project:"` prefix inside the toggle using `InputGroupItem` + `Content` with PF subtle text color token (`--pf-t--global--text--color--subtle`). Global scope selectors must label what they control, not rely on placeholder alone.
- **Favorites** — star icon to mark items as favorites; favorites appear in a grouped section at the top of the dropdown
- **Grouped sections** — separate "Favorites" and "All" groups when favorites are active
- **Sticky footer** — a persistent "Create [resource]" action pinned at the bottom of the dropdown, always visible regardless of scroll position
- **Clear filter** — a clear button (×) in the search field to reset the typeahead filter
- **Data persistence during filtering** — preserve existing data while filtering to avoid loading/error flash states; only show loading on initial fetch

#### Resource Pickers (without favorites)

Resource pickers (credential selectors, integration pickers, etc.) use a standard typeahead without favorites:

- **Typeahead search** — filter options by typing
- **Clear filter** — a clear button (×) to reset the typeahead filter
- **Max height** — constrain the dropdown to prevent unbounded growth

#### Multi-Select Typeahead with Label Chips

For fields where users can select multiple items (e.g., group assignment on user creation), use `MenuToggle variant="typeahead"` + `TextInputGroup` + `LabelGroup` / `Label color="blue"` for selected items:

- **Filter-as-you-type** with checkbox options
- **Selected items as chips** — `Label` components with close (×) button for individual removal; clear-all button with `aria-label` for removing all selections
- **Empty filter message** — `"No results match \"{filter}\""` when typeahead filter matches nothing
- **Options with descriptions** — show supplementary text below option labels when available
- **Create-only fields:** Some multi-select fields (e.g., group assignment) appear on the Create form only; editing is done through a dedicated panel on the detail page (e.g., `UserGroupsPanel`). This avoids overloading the edit form with group management.

### Details Component

- Use `NxDetailList` + `NxDetail` for detail page fields (from `src/components/details/`)
  - **Vertical** (default) for standard detail pages
  - **`isHorizontal`** for compact contexts (e.g., canvas step detail panels)
- `NxDetail` with empty/null/undefined children **renders nothing automatically** — optional fields can be passed unconditionally without manual null checks
- Use `NxCodeBlock` (from `src/components/details/NxCodeBlock.tsx`) for scripts, JSON payloads, or log output
  - Supports `enableCopy` (clipboard), `enableExpand` (full-screen modal), and `jsonObject` (auto-formatted JSON)
  - Default max height of 24rem with scroll; use `noMaxHeight` when inside a height-constrained parent
- Use consistent formatting for dates and durations — follow PatternFly's [Date/Time guidelines](https://www.patternfly.org/ux-writing/numerics/#date-and-time-formats)
- Header includes title and primary actions for the specific resource (pulled from the table row actions)
- **Title:** Pass the resource name as a plain string to `NxPageHeader` / `title` — no decorative icons in h1
- **Informational metadata as plain text:** Attributes like credential type, authentication method, or resource category are plain text — not `Label` badges. Use `Label` only when visual distinction or status communication is needed (see §11).
- **Created / Modified columns in tables:** Use inline `UserTimestamp` mode — `username · date` on one line. Stacked mode is for detail views only.
- **User name display:**
  - Table "Name" column: composed display name via `userDisplayName(user)` — `[first_name, last_name].filter(Boolean).join(' ')`
  - Detail pages: separate "First Name" / "Last Name" fields in `DescriptionList`
  - Forms: separate inputs — "First Name" (required), "Last Name" (optional)
  - Breadcrumbs: `userDisplayName(user) || user.username` (fallback to username)
  - Sorting: by `first_name` (not composed name)
  - Filtering: separate "First Name" / "Last Name" filters (not a single "Name" filter)

For live examples and story-driven documentation:

```
list-all-documentation → find "NxDetailList" / "NxDetail" / "NxCodeBlock" → get-documentation(...)
```

---

## 4. Empty States

Use PatternFly's [Basic Empty State component](https://www.patternfly.org/components/empty-state#basic).

Empty states replace the main content area when there is no data to display.

| Scenario          | Title                          | CTA: Primary button                  | Filter?                          |
| ----------------- | ------------------------------ | ------------------------------------ | -------------------------------- |
| No data exists    | `"No [resources] yet"`         | If applicable: `"Create [resource]"` | No                               |
| No filter results | `"No results found"`           | `"Clear all filters"`                | Yes, with active filters showing |
| Service error     | `"Unable to load [resources]"` | `"Retry"`                            | No                               |

### Empty State Icons, Statuses, and Variants

Each empty state scenario maps to a specific icon, optional `status` prop, and size variant. Follow PatternFly's [empty state design guidelines](https://www.patternfly.org/components/empty-state/design-guidelines) for icon and color conventions.

| Scenario               | Icon                    | `status` prop | `variant`       | Notes                                                                |
| ---------------------- | ----------------------- | ------------- | --------------- | -------------------------------------------------------------------- |
| No data / creation     | `PlusCircleIcon`        | —             | `lg`            | Resource has never had data created; gray icon by default            |
| No filter results      | `SearchIcon`            | —             | `sm`            | Inside tables when filters match nothing                             |
| Service error          | `ExclamationCircleIcon` | `danger`      | `lg`            | Data cannot be loaded; red icon via danger status                    |
| No access / forbidden  | `LockIcon`              | —             | `lg`            | User role doesn't have permission to view the page                   |
| Configuration required | `WrenchIcon`            | —             | `lg`            | User must configure or connect something before using a feature      |
| Success / completion   | `CheckCircleIcon`       | `success`     | default or `xl` | Task or process completed; green icon via success status             |
| Getting started        | `RocketIcon`            | —             | `xl`            | First-time onboarding; can use a custom app-specific graphic instead |

**General rules:**

- Use the `status` prop (`danger`, `warning`, `success`, `info`) for status-driven empty states — PatternFly applies the correct icon color automatically
- For non-status empty states (no data, no results, configuration, no access), icons render in **gray by default** — do not manually set a color
- Variant sizing: `sm` inside tables, modals, or wizards; `lg` for full-page empty states; `xl` for getting started or full-page success
- **CTA deduplication:** When the empty state includes a primary create/configure CTA button, **hide the page-header primary button** to avoid duplicate CTAs. The empty state CTA is sufficient — the header button reappears once data exists.
- **Tab-level empty states:** Use the shared `NxEmptyStateNoData` component (not ad-hoc `EmptyState`) with the correct heading level (`h2` inside tabs) and `isFullHeight` prop
- **Three-state list page pattern:** Every list page must handle three states in this order:
  1. Query error/loading → `useQueryState(query, { title, onRetry })` returns a loading or error component
  2. Truly empty (no data AND no active filters) → `NxEmptyStateNoData` with create CTA; **hide FilterBar entirely**
  3. Has data OR has active filters → show `FilterBar`; if data is empty with filters, show `NxEmptyStateFilter` inside the scroll area
- **Access denied empty state:** Use `EmptyStateAccessDenied` (with `RhUiLockIcon`) when a user navigates directly to a page they cannot read. Message format: "You don't have permission to view {resource}. Contact your administrator to request access."

---

## 5. Page Layout Checklist

When building or reviewing any page, verify every item:

### Structure

- [ ] Uses `NxPage` as outer wrapper
- [ ] Uses `NxPageHeader` for title and actions
- [ ] Uses `StackItem isFilled` + `NxPanel isFullHeight` for content
- [ ] Uses `NxPanelContentStack` for the main content column inside `NxPanel`
- [ ] Loading / empty states use `NxPageBody isCentered`
- [ ] Inner content has consistent padding

### Header

- [ ] Title is clear and matches navigation
- [ ] Primary action is the rightmost button
- [ ] Action buttons follow standard order

### Filter Bar

- [ ] Visible when data exists or when filters are active
- [ ] Hidden only when the resource type has never had data created

### Main Content

- [ ] Tables use `NxScrollableTableContainer`
- [ ] Main data tables use `NxScrollableTableContainer` (standard variant by default)
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

Use consistent action verb pairings across the UI:

- "Create" is paired with "Delete"
- "Add" is paired with "Remove" — when the resources being added and removed exist in the Automation Orchestrator
- "Add" is paired with "Disconnect" — when the resource is coming from an external source
- "Assign" is paired with "Unassign"
- "Transfer" is used when moving ownership of a resource between entities (e.g., "Transfer identity" — moving a federated identity from one user to another). Not "Attach" or "Connect".
- "Configure" is used for integrations — not "Add integration". Integrations are external connections being configured, not in-platform resources being created. Use "Configure integration" for list header button, empty state CTA, and form submit button.

### Create: Full Page

Use for complex resources with many fields or multi-step creation.

- Multi-step wizards
- Forms with 5+ fields

### Create: Full-Page Wizard

Use a full-page PatternFly Wizard (at a dedicated route) when:

- Flow has 2+ steps with independent data requirements
- Each step needs tables with filter, sort, and pagination (too large for a modal)
- UX prototype specifies a dedicated route

**Wizard step anatomy:**

```text
h2 step title
  → explanatory paragraph (with bolded target entity name)
  → compact FilterBar
  → ScrollableTableContainer (radio selection, sortable columns, pagination)
```

**Footer conventions:**

- Step 1: disabled Back, conditional Next, Cancel as `variant="link"` (not button)
- Final step: Back, primary action with loading state, Cancel link
- Cancel navigates back to origin route (not `onClose`)

**State management:**

- Going back clears current step's selection + filters
- Changing selection on step 1 resets step 2 selections
- `isVisitRequired` on wizard prevents skipping ahead

**Layout:** `NxPage` → `NxPageHeader` → `NxPanel isFullHeight hasNoPadding` → `Wizard height="100%"`

**Terminology alignment:** Action verb must be consistent across button text, loading state, toast, and error message (e.g., "Transfer identity" → "Transferring..." → "Identity transferred" → "Failed to transfer identity").

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

### Update/Edit: Dedicated Edit Page (from Read-Only Tab)

Use when the edit experience is too complex for inline editing on a detail tab:

- Form has many editable rows + advanced sections + nested modals (e.g., create sub-resource)
- Flow includes external actions (e.g., test sign-in popup, group discovery)
- Save/Cancel toolbar with unsaved state tracking is needed
- Permission gating requires a full-page access-denied state

**Pattern:**

- Detail tab stays **read-only** with an "Edit [resource]" button navigating to the edit route
- Edit page at a dedicated route (e.g., `.../group-mapping/edit`)
- Page shell: `NxPage` → `NxPageHeader` with breadcrumbs + toolbar (Save primary + Cancel link)
- Permission check: `useCanI('update', 'resource')` → `EmptyStateAccessDenied` if denied
- Query params for entry mode variants: `?discover=1`, `?new=1`

### Update/Edit: Inline

Use for single-field quick edits.

- Renaming resources (when save happens elsewhere)
- Toggling settings — use PatternFly's [Switch Checked with Label component](http://patternfly.org/components/switch#checked-with-label)
  - Do not use `isReversed` on the PatternFly Switch. The default behavior — toggle on the left, label on the right — is the standard. `isReversed` flips them and should be avoided.
- Single-value changes

### View: Read-Only Detail Modal (from Kebab)

Use when users need to inspect structured data (JSON, policy definitions, configuration) without leaving the list page. Triggered from a kebab menu action (e.g., "View policy JSON").

| Element       | Specification                                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Modal variant | Medium — PatternFly's [Modal Sizes](https://www.patternfly.org/components/modal#modal-sizes)                                      |
| Title         | Descriptive label (e.g., "Policy definition")                                                                                     |
| Body          | Read-only content with PatternFly's [Clipboard Copy](https://www.patternfly.org/components/clipboard-copy) when copying is useful |
| Close button  | `variant="primary"` — the only action (no Cancel, no secondary)                                                                   |

### Confirmation Dialog — Three-Tier Severity Model

`NxConfirmationDialog` supports three escalation tiers. Each tier maps to a Storybook story with canonical copy examples.

| Tier                            | Story                        | When                                     | Title icon | Confirm button | Checkbox |
| ------------------------------- | ---------------------------- | ---------------------------------------- | ---------- | -------------- | -------- |
| **Default / Disable**           | `Disable`                    | Reversible state changes                 | None       | `primary`      | No       |
| **Danger**                      | `Danger`                     | Reversible but risky (remove / unassign) | Warning    | `danger`       | No       |
| **Destructive Acknowledgement** | `DestructiveAcknowledgement` | Permanent delete                         | Warning    | `danger`       | Required |

For canonical copy patterns per tier → see Storybook: `list-all-documentation → find "NxConfirmationDialog" → get-documentation("NxConfirmationDialog")`

### Delete: Destructive Confirmation Modal with Checkbox

**Always** use `NxConfirmationDialog` from `src/components/dialogs/NxConfirmationDialog.tsx` for delete actions. Never build modals from raw `Modal` + `ModalHeader` + `ModalBody` + `ModalFooter`.

There are three delete variants depending on what happens downstream when the resource is deleted.

#### Simple Delete

Use when deleting a standalone resource with no downstream effects (e.g., role, policy, group, user, identity provider).

| Element       | Specification                                                 |
| ------------- | ------------------------------------------------------------- |
| Component     | `NxConfirmationDialog` with `destructiveAcknowledgement` prop |
| Modal variant | Small (default)                                               |
| Action button | `confirmVariant="danger"`, `confirmLabel="Delete"`            |
| Cancel button | `variant="link"` (handled by NxConfirmationDialog)            |

For title, body copy, and checkbox label patterns → see Storybook `NxConfirmationDialog` → **DestructiveAcknowledgement** story.

#### Cascade Delete

Use when deleting the resource also permanently deletes other records (e.g., workflow → executions, tool provider → tools).

| Element       | Specification                                                                                                                                                                                            |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component     | `NxConfirmationDialog` with `destructiveAcknowledgement` prop                                                                                                                                            |
| Modal variant | Small (default)                                                                                                                                                                                          |
| Title         | `"Delete [resource type]?"` with `titleIconVariant="warning"`                                                                                                                                            |
| Body          | `"The [resource] <strong>[name]</strong> will be deleted. This cannot be undone."`                                                                                                                       |
| Body 2        | `"Resources that will be deleted"` as a header, then one row per resource type each with its own [Badge](https://www.patternfly.org/components/badge/#read) count — e.g., "Executions [12]", "Tools [3]" |
| Checkbox      | `"I understand this [resource] and the resources shown above will be permanently deleted."` — Delete button stays disabled until checked                                                                 |
| Action button | `confirmVariant="danger"`, `confirmLabel="Delete"`                                                                                                                                                       |
| Cancel button | `variant="link"` (handled by NxConfirmationDialog)                                                                                                                                                       |

#### Ripple Effect Delete

Use when deleting the resource leaves other resources in a broken or invalid state without deleting them (e.g., credential → referencing workflows fail, project → credentials/workflows orphaned, workflow → parent workflows become invalid).

| Element       | Specification                                                                                                                                                                                                 |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component     | `NxConfirmationDialog` with `destructiveAcknowledgement` prop                                                                                                                                                 |
| Modal variant | Small (default)                                                                                                                                                                                               |
| Title         | `"Delete [resource type]?"` with `titleIconVariant="warning"`                                                                                                                                                 |
| Body          | `"The [resource] <strong>[name]</strong> will be deleted. This cannot be undone."`                                                                                                                            |
| Body 2        | `"Resources that will be affected"` as a header, then one row per resource type each with its own [Badge](https://www.patternfly.org/components/badge/#read) count — e.g., "Workflows [2]", "Credentials [5]" |
| Checkbox      | `"I understand this [resource] and the resources shown above will be affected by this deletion."` — Delete button stays disabled until checked                                                                |
| Action button | `confirmVariant="danger"`, `confirmLabel="Delete"`                                                                                                                                                            |
| Cancel button | `variant="link"` (handled by NxConfirmationDialog)                                                                                                                                                            |

**When badge counts are unavailable:** Use a `Stack` layout with an introductory sentence (e.g., "This will immediately:") followed by PatternFly `List` / `ListItem` bullet points enumerating the downstream consequences. **Never use raw `<ul>`, `<ol>`, or `<li>`** — always use PF `List` / `ListItem` components (enforced by the `prefer-pf-list-components` ESLint rule).

**Shared dialog components:** Extract one shared confirmation dialog component per destructive action type (e.g., `IdentityProviderDeleteDialog`, `WorkflowDeleteDialog`) and consume it from both the list and detail views — single source of truth for copy and structure.

> **Note:** A resource can combine both cascade and ripple effects. For example, deleting a workflow both cascade-deletes its executions and ripple-affects parent workflows that reference it as a step. In this case, show both Body 2 sections.

**Post-delete behavior:**

- From list/table view → stay on list, item removed
- From details page → navigate back to list/table
- Show feedback → PatternFly's [Dismissible Success Toast Alert](https://www.patternfly.org/components/alert#alert-variations)

### Remove/Unassign/Cancel/Stop: Confirmation Modal without Checkbox

These are reversible actions. Use `NxConfirmationDialog` with warning icon but no checkbox.

| Element       | Specification                                                      |
| ------------- | ------------------------------------------------------------------ |
| Component     | `NxConfirmationDialog` (no `destructiveAcknowledgement`)           |
| Modal variant | Small (default)                                                    |
| Action button | `confirmVariant="danger"`, `confirmLabel="[Remove/Unassign/etc.]"` |
| Cancel button | `variant="link"` (handled by NxConfirmationDialog)                 |

For title and body copy patterns → see Storybook `NxConfirmationDialog` → **Danger** story.

**Post-cancel/stop behavior:**

- From list/table view → stay on list, item updated
- From details page → stay on details page
- Show feedback → PatternFly's [Dismissible Success Toast Alert](https://www.patternfly.org/components/alert#alert-variations)

### Scoped Destructive Actions (e.g., Token Revocation)

When the same destructive action exists at multiple scopes (global, user, resource), use escalating severity:

| Scope                      | Location           | Trigger                      | Confirmation depth                                                |
| -------------------------- | ------------------ | ---------------------------- | ----------------------------------------------------------------- |
| **Global** (platform-wide) | Dedicated page/tab | `variant="danger"` button    | `NxConfirmationDialog` + **destructive acknowledgement checkbox** |
| **User-scoped**            | Table kebab menu   | `RhUiBanIcon` + action label | Standard danger confirmation naming the user                      |
| **Resource-scoped**        | Table kebab menu   | Same icon/label              | Standard danger confirmation naming the resource                  |

- Global actions may trigger auto-logout (admin's own tokens invalidated)
- Scoped confirmations bold the affected entity name: `"All tokens for **{username}** will be revoked."`
- Global actions get a status card showing current state (e.g., "Last revoked: {date}") before the action button

### Disable: Standard Confirmation Modal

Disable is **not** a destructive action — use a standard confirmation modal (no warning icon, no danger button). **Enable does not require a confirmation dialog** — the toggle takes effect immediately. Only **disable** requires confirmation because it has user-facing consequences (e.g., users can no longer sign in via a disabled identity provider).

| Element        | Specification                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Modal variant  | Small — PatternFly's [Small Variant Modal](https://www.patternfly.org/components/modal#modal-sizes) |
| Confirm button | `variant="primary"`                                                                                 |
| Cancel button  | `variant="link"`                                                                                    |

For title and body copy patterns → see Storybook `NxConfirmationDialog` → **Disable** story.

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

### Unsaved-Changes Confirmation Modal

When a user attempts to navigate away from a form or builder with unsaved changes, show a confirmation modal with three actions:

| Position | Button              | Variant     |
| -------- | ------------------- | ----------- |
| Left     | Save [resource]     | `primary`   |
| Middle   | Exit without saving | `secondary` |
| Right    | Cancel              | `link`      |

- Use specific action labels: `"Save workflow"` instead of generic `"Save"` when the resource type matters
- Cancel dismisses the modal and returns the user to their current context without saving or discarding

---

## 8. Buttons

- Use sentence case for all button labels
- **Primary buttons** (in UI and dropdown menu items): `Icon + Action + Resource` — e.g., "Create project"
- **Secondary / tertiary / link buttons**: `Action + Resource` — e.g., "Edit project" (no icon required)
- When multiple buttons appear together, primary comes first then secondary — unless PatternFly specifies otherwise (e.g., wizards)
- Delete should always use `variant="danger"` and must always be the last item in a dropdown menu, separated by a divider
- **Login button text:** Always "Log in" — never role-specific (e.g., not "Log in as administrator"). Non-admin users can log in locally; role assumptions in button text are misleading.

---

## 9. Feedback & Notifications

### Success Feedback

- Use PatternFly's [Dismissible Success Toast Alert component](https://www.patternfly.org/components/alert#alert-variations) for success messages after create, update, delete, and other actions
- Toast alerts should auto-dismiss after a reasonable duration
- Message format: Title in sentence case, past tense — `"[Resource type] [past-tense action]"` (e.g., "Role created"). Description includes entity name — `"The role {name} has been created successfully."`
- **Verb consistency:** Toast copy must match the triggering action's verb. If the button says "Create role", the toast says "Role created" — not "Role added". Error toast titles mirror the action verb: `"Failed to create role"`

**When NOT to show a success toast:**

Success toasts are **not required** when the UI already communicates the outcome through other means:

| Scenario                          | Why toast is redundant                              |
| --------------------------------- | --------------------------------------------------- |
| Inline control state change       | `Switch` toggle updates visibly after refetch       |
| Navigation confirms the action    | Starting a run → navigates to execution view        |
| Dirty/saved state reflected in UI | Save button disables; tooltip shows last-saved time |
| Bulk status change                | Table rows update visibly after refetch             |

- **Error toasts are always retained** regardless — errors must always be surfaced
- **Create actions** still show a success toast (the new resource may not be immediately visible)
- Special-case alerts kept when they carry essential context (e.g., admin disable → sign-out warning message)

### Error Feedback

- For page-level data loading errors, use `useQueryState(query, { title: '...', onRetry: ... })` — this hooks up the `NxErrorState` component with a retry button automatically for retryable (5xx) errors
- For mutation errors (create/update/delete), use `useMutationErrorHandler` — this wires up `NxErrorState` and toast alerts automatically
- For form validation errors, use inline field-level errors via PatternFly's Validated component (see Form Component section)
- **Error state placement:** Error states render **inside `NxPanel`** using `NxPageBody isCentered` + `NxErrorState` — not as a bare centered message outside the content frame. The page header and app shell remain visible so the user can navigate away.

### Session Timeout Warning

For security-critical time-based warnings, use a non-dismissible alert dialog pattern:

- PatternFly `Modal` with `variant="small"`, `role="alertdialog"`, `titleIconVariant="warning"`
- **Non-dismissible:** `onClose={undefined}`, empty `onEscapePress` — user must explicitly choose
- **Live countdown:** Body text with `aria-live="assertive"` + `aria-atomic="true"` for screen reader updates
- **Actions:** Primary "Continue session" (`variant="primary"`) + "Log out" (`variant="link"`)
- **Centralized constants:** All timing thresholds in a constants file with JSDoc — no inline magic numbers
- **Idle detection:** Activity-based via refs (no re-renders on `mousemove`), passive event listeners, visibility API integration
- **Post-expiry:** Preserve return path (relative path only, validated against application routes) in sessionStorage before logout redirect to prevent open redirect attacks

### Loading States

- Show PatternFly's [Spinner component](https://www.patternfly.org/components/spinner) during async operations
- For page-level loading, use a centered spinner in the content area
- For button actions (save, submit), show a loading spinner on the button and disable it during the operation
- For tables, show a skeleton or spinner in the content area while data loads

---

## 10. Bulk Actions

### Table with Selection Checkboxes

- Use PatternFly's [Selectable with Checkbox Table component](https://www.patternfly.org/components/table#selectable-with-checkbox)
- If the table is expandable, column order left to right: expand/collapse chevron → checkbox → table columns
- Bulk actions are found in the kebab menu in the toolbar, to the right of the primary button
- If applicable, delete/remove option is always last
- Will have a bulk action confirmation modal

### Exception: Header Toolbar Bulk Actions (Approvals)

For high-frequency bulk decisions where speed matters (e.g., Approvals), bulk actions may use **direct header toolbar buttons** instead of the kebab menu. This is an exception to the standard kebab-based bulk action pattern.

**Selection model:**

- Checkbox column on **actionable rows only** (e.g., pending approvals); decided/completed rows render no checkbox
- Checkboxes disabled when user lacks the required permission on that row's project (permission-gated via `/authz/what-can-i`)
- **Selection persists across pagination**; **clears on filter or sort change**
- Header "select all" selects only selectable rows on the current page

**Bulk action toolbar:**

- Lives in the `NxPageHeader` toolbar — always visible, not inside a kebab
- Shows `"{n} selected"` when selection > 0
- **Approve:** secondary button + `RhUiLikeIcon`
- **Reject:** secondary `isDanger` button + `RhUiDislikeIcon`
- Buttons disabled with tooltip when nothing selected: `"At least one [item] needs to be selected to take action"`

**Approve vs. Reject modal differentiation:**

| Modal   | Note field   | Confirm button              | Icon              |
| ------- | ------------ | --------------------------- | ----------------- |
| Approve | Optional     | Primary "Approve"           | —                 |
| Reject  | **Required** | `variant="danger"` "Reject" | `RhUiDislikeIcon` |

- Both modals are medium-sized with `maxLength={1000}` on the note textarea
- Cancel closes dialog but **preserves selection**; reopening resets note fields

---

## 11. Statuses and Labels

Use `Label` only when visual distinction is needed — for statuses, categorical metadata where users need to differentiate between types at a glance (e.g., User vs. Group), and user-authored tags. For informational text that doesn't require visual emphasis, use plain text.

### Component Selection

| Content type                                         | Component                                           | Visual treatment            |
| ---------------------------------------------------- | --------------------------------------------------- | --------------------------- |
| Status indicators (success, danger, warning)         | `NxLabel` with `status` + icon                      | Filled                      |
| Categorical metadata (System, Project, Built-in)     | `NxLabel` with `color`                              | Filled                      |
| Counts, callouts (single-value, no type distinction) | `NxLabel color="grey"`                              | Filled grey                 |
| User-authored tags, workflow tags                    | `NxUserTag`                                         | Outlined compact            |
| Filter chips (active filters)                        | `Label variant="outline" isCompact` in `LabelGroup` | Outlined compact, removable |

**`NxLabel`** (from `src/components/NxLabel.tsx`) — thin wrapper over PF `Label` with UX defaults: `isCompact={true}`, `variant="filled"`.

**`NxUserTag`** (from `src/components/NxUserTag.tsx`) — outline-only wrapper for user-authored content. Always use for content typed by users (workflow tags, custom labels).

### Statuses

| Use case                                                                           | Component   | Variant               |
| ---------------------------------------------------------------------------------- | ----------- | --------------------- |
| All system-generated labels (statuses, categories, metadata, counts, filter chips) | `NxLabel`   | `filled` (default)    |
| User-authored content (workflow tags, user-entered values)                         | `NxUserTag` | `outline` (hardcoded) |

- If labels on a table reference a resource, make them clickable labels, navigating to the details page of the resource if one exists
- Use outline (unfilled) `RhUi*Icon` variants when passing icons to `NxLabel`
- If a label is used for a single thing (a count, a callout) and not to distinguish between 2+ types, use a filled gray label (`color="grey"`)

#### System-generated labels

- Use `NxLabel` (defaults to filled, compact) and default to gray
- If used to categorize types (e.g., User vs. Group), use a colored variant
- Color variants should have enough contrast to distinguish between them

#### Filter labels

- Use PatternFly's gray Filled Non-status Label component

#### User-generated labels

- Use `NxUserTag` (outlined, compact) for any user-entered values (tags, custom names in filter chips)

#### Label colors

**General**

- If a label is used for a single thing (a count, a callout) and not to distinguish between 2+ different types, use a filled gray label

**Workflow versioning**

| State               | Style         |
| ------------------- | ------------- |
| Published           | Filled green  |
| Unpublished changes | Filled yellow |
| Draft               | Filled gray   |

**Access Management — Assignments**

| Dimension | Value   | Style         |
| --------- | ------- | ------------- |
| Type      | User    | Filled teal   |
| Type      | Group   | Filled orange |
| Scope     | System  | Filled blue   |
| Scope     | Project | Filled purple |

**Access Management — Roles**

| Value    | Style       |
| -------- | ----------- |
| Built-in | Filled gray |
| Custom   | Filled blue |
| Policy   | Filled gray |

**Access Management — Policies**

| Value            | Style        |
| ---------------- | ------------ |
| Built-in         | Filled gray  |
| Statement: Allow | Filled green |
| Statement: Deny  | Filled red   |
| Scope & resource | Filled gray  |

---

## 12. Icons

All icons **must** use the `RhUi` prefix — these are the new Red Hat icon standard from the [Red Hat Design System](https://ux.redhat.com/) [icon set](https://ux.redhat.com/foundations/iconography/#ui-icons). Examples: `RhUiAddIcon`, `RhUiEditIcon`, `RhUiTrashIcon`, `RhUiHistoryIcon`, `RhUiKeyIcon`, `RhUiPublishIcon`, `RhUiDuplicateIcon`.

**Do not use** legacy PatternFly icon names (e.g., `PlusCircleIcon`, `PencilAltIcon`, `TrashIcon`). These are the old standard. The `RhUi*` icons are enforced via an ESLint `no-restricted-imports` rule that blocks non-`RhUi` icon imports on action buttons.

> **Exception:** PatternFly empty state icons (`PlusCircleIcon`, `SearchIcon`, `ExclamationCircleIcon`, `LockIcon`, `WrenchIcon`, `CheckCircleIcon`, `RocketIcon`) are still used in `EmptyState` components because they are part of the PF empty state pattern, not action buttons.

---

## 13. Expand/Collapse Chevrons

- Use PatternFly's [Expandable Table component](https://www.patternfly.org/components/table#expandable) to ensure expand/collapse chevrons are correct

---

## 14. Content Rules

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

## 15. Role-Based UI States & Permission Gating

Pages that support role-based access must adapt their UI based on the authenticated user's permissions. The platform uses a layered gating strategy with shared infrastructure.

### Permission Tiers

| Permission Level         | Navigation             | Controls                               | Actions                               |
| ------------------------ | ---------------------- | -------------------------------------- | ------------------------------------- |
| **No read permission**   | Hidden from navigation | `EmptyStateAccessDenied` on direct URL | None                                  |
| **Read only** (auditor)  | Visible in navigation  | All controls rendered as **read-only** | Action buttons disabled with tooltips |
| **Read + write** (admin) | Visible in navigation  | All controls editable                  | Full CRUD actions available           |

### Permission Hook Pattern

Every domain creates a `use{Domain}Permissions()` hook that encapsulates all permission checks:

```tsx
// Return type pattern
type WorkflowPermissions = {
  canCreate: boolean
  canUpdate: boolean
  canDelete: boolean
  canRun: boolean
  isLoading: boolean
  tooltips: {
    create: string
    update: string
    delete: string
    run: string
  }
}
```

**Naming conventions:**

- List/page actions: `use{Entity}Permissions()` (e.g., `useWorkflowPermissions`, `useUserPermissions`)
- Detail page tabs: `use{Entity}DetailPermissions()` (e.g., `useUserDetailPermissions`)
- Specialized domains: `useBuilderPermissions(isNew)`, `useSettingsPermissions()`

**Implementation rules:**

- Use `useCanI(action, resourceType)` for individual checks
- Default to **deny** while `isLoading` (safe-false principle — prevents flash of unauthorized content)
- Build tooltip text via `permissionTooltip(actionDescription, policyName)` for consistent messaging
- Always use `isAriaDisabled` (not `isDisabled`) on gated buttons — keeps elements focusable for tooltip hover and screen readers
- Set `onClick` to `undefined` when permission denied (defense in depth)

### Gating Strategy Decision Tree

```text
Can user read this section?
├─ No → Hide nav item / tab OR show EmptyStateAccessDenied (if direct URL)
└─ Yes → Can user perform action?
    ├─ No, action is primary CTA in empty state → Hide button (pass undefined callback)
    ├─ No, action is toolbar/button → Disable with isAriaDisabled + DisabledWithTooltip
    ├─ No, action is row/kebab item → isAriaDisabled + tooltipProps, onClick undefined
    ├─ No, action is form field → readOnly prop / hide save toolbar
    └─ No, action is create/edit route → ProtectedRoute → EmptyStateAccessDenied
```

### Navigation Gating

- Nav items declare `requiredPermissions` (OR logic — visible if **any** granted)
- `useFilteredNavigationItems()` batch-checks all permissions and filters the tree
- Parent sections auto-hide when all children are filtered out
- Hidden routes (create/edit forms) use `routePermission` + `ProtectedRoute` for direct-URL access

### Tab Gating

- Hub pages (Access Management): filter tab array by permission; redirect to first visible tab
- Detail pages: use `NxUrlTabs validTabs={visibleTabs}` to hide unauthorized tabs
- **Loading stability:** Show all tabs while permissions load to avoid layout shift; filter after resolution
- **Self-permission override:** Users viewing their own profile always see their Groups/Identities/Assignments tabs

### Action Gating

**Toolbar buttons — `DisabledWithTooltip` wrapper:**

```tsx
<DisabledWithTooltip isDisabled={!permissions.canCreate} content={permissions.tooltips.create}>
  <Button
    variant="primary"
    isAriaDisabled={!permissions.canCreate}
    onClick={permissions.canCreate ? handleCreate : undefined}
  >
    Create user
  </Button>
</DisabledWithTooltip>
```

**Row actions — `isAriaDisabled` + `tooltipProps`:**

```tsx
{
  title: <IconLabel icon={<RhUiEditFillIcon />}>Edit</IconLabel>,
  isAriaDisabled: !permissions.canUpdate,
  tooltipProps: permissions.canUpdate ? undefined : { content: permissions.tooltips.update },
  onClick: permissions.canUpdate ? () => navigate(...) : undefined,
}
```

**Empty state CTA — hide button entirely:**

```tsx
onCreateWorkflow={permissions.canCreate ? handler : undefined}
// NxEmptyStateNoData only renders button when addData callback is defined
```

### Read-Only Mode (Builder)

When a user can view but not edit a workflow:

1. **Info banner** — `Alert variant="info" isInline` explaining read-only mode
2. **Hide editing affordances** — Add Node panel hidden, toolbar actions disabled
3. **Canvas lockdown** — `nodesDraggable={false}`, `nodesConnectable={false}`, `deleteKeyCode={null}`
4. **Toolbar actions** — Save/Publish disabled via `DisabledWithTooltip`; Run has its own `canRun` check

### Permission Tooltip Message Format

Standard format via `permissionTooltip()`:

> "To {action}, you need a role with the {policy} policy. Contact your Admin to request access."

### Route Guards (`ProtectedRoute`)

For create/edit forms accessible via direct URL:

1. `isChecking` → `NxLoadingState`
2. `isError` → `NxErrorState title="Unable to verify permissions"`
3. `!allowed` → `EmptyStateAccessDenied`
4. `allowed` → render children

**Note:** List/detail pages use in-page empty states or tab filtering — not route guards. Route guards target mutation form routes only.

See [`docs/permissions-rbac.md`](../../docs/permissions-rbac.md) for the full permission gating architecture.

---

## 16. Data Panel View Modes

For panels that display structured data (input/output panels in the workflow builder), provide a view toggle:

| View       | Use case                                        | Component                |
| ---------- | ----------------------------------------------- | ------------------------ |
| **Schema** | Tree view showing data shape with type labels   | `TreeView` (read-only)   |
| **Table**  | Tabular view with column headers from data keys | `DataTableView` (shared) |
| **JSON**   | Formatted JSON with search                      | `CodeEditor` (read-only) |

- Use a shared `ViewToggle` component with `ToggleGroup` for switching between views
- Use `isCompact` on the `ToggleGroup` in constrained panel contexts (e.g., builder data panels) to reduce vertical/horizontal footprint
- Show the toggle **only when data exists** — hide it and show an empty state when no data is available
- Default view may differ by context (e.g., JSON for output panels, Schema for input panels)
- Output panels are **read-only** (no drag-and-drop); input panels may support drag-and-drop from schema fields

---

## 17. Workflow Builder

The automation builder experience is based on [React Flow](https://reactflow.dev/) as the underlying graph/canvas foundation, with PatternFly as the visual wrapper. The canvas is built **left to right**.

### Builder Toolbar Action Hierarchy

Primary actions are always visible in the toolbar; secondary actions and views live in a grouped kebab menu.

**Always-visible primary actions (left to right):**

- Add step
- Run (or Run dropdown for multi-trigger)
- Save
- Publish workflow

**Kebab menu (⋮) — grouped with `DropdownGroup`:**

| Group       | Items                                                                     |
| ----------- | ------------------------------------------------------------------------- |
| **Views**   | Run history, Workflow details                                             |
| **Actions** | Export workflow, Import workflow, Delete workflow (`isDanger`, last item) |

- Every kebab item has an icon + label (e.g., `RhUiHistoryIcon` + "Run history")
- Delete is always the last item in the kebab and uses `isDanger`
- Header element order: workflow name → edit-details pencil icon → project selector

### Workflow Publish Lifecycle

Workflows use a **Draft → Publish → Unpublish** model instead of enable/disable toggles.

**Builder toolbar:**

- **Save** — persists draft changes; `isAriaDisabled` when `!isDirty` for existing workflows (see Save Behavior below)
- **Publish workflow** — primary button with `RhUiPublishIcon`; promotes the current draft to a named version
- **Unpublish workflow** — kebab action (only when `publishedVersion != null`)

**Status badges (`WorkflowPublishStatusBadge`):**

| State                            | Label               | Style                              |
| -------------------------------- | ------------------- | ---------------------------------- |
| Never published                  | Draft               | Grey filled                        |
| Current version = published      | Published           | Green filled (`status="success"`)  |
| Saved changes after last publish | Unpublished changes | Yellow filled (`status="warning"`) |

These badges use `Label` with no icons — text and color only.

**Publish dialog (`PublishWorkflowDialog`):**

- Small modal, title "Publish workflow?"
- Body explains: overrides prior publish, triggers activate, run history retained
- **Required** version name (defaults to current date/time via `date-fns` `PPp` format)
- **Optional** description ("Describe what changed")
- Primary **Publish** + link **Cancel**

**Unpublish confirmation:**

- `NxConfirmationDialog` with warning icon, `confirmVariant="danger"`, label "Unpublish"
- Body explains workflow will no longer be executable until republished

**Workflow list changes:**

- Status column shows badges (Draft / Published / Unpublished changes) — no inline Switch toggle
- Kebab actions: Publish workflow / Unpublish workflow (conditional on published state)

### Save Behavior

- **Existing workflows:** Save button is `isAriaDisabled` when `!isDirty` (no unsaved changes)
- **New workflows:** Save stays enabled (validation runs on click)
- **Loading:** "Saving…" + spinner via mutation `isPending`
- **Tooltip:** Shows `"Last saved {formatted datetime}"` when previously saved; `"Save workflow"` when never saved
- **Toast policy:** Success toast on **create** (new workflow); **no toast** on update (dirty state clearing + tooltip timestamp are sufficient)

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
- **Empty workflow onboarding:** When a workflow has no triggers and no steps (`hasNoWorkflowNodes`):
  - The "Add step" toolbar button is **hidden entirely** (not disabled — hidden) to prevent confusion when the user should be selecting a trigger first
  - The add-step side panel is **forced open** automatically (showing trigger options)
  - The toolbar returns `null` when `!canEdit && hasNoWorkflowNodes && isNew` (brand-new workflow with no permission and no steps)
  - Once the user adds their first trigger or step, the "Add step" button appears in the toolbar
- **Toggle-style button:** When the add-step panel is open (and the workflow has steps), the toolbar button uses `isClicked` + `aria-pressed` for visible active/inactive feedback. Clicking the button toggles the panel open/closed.

### Duplicate Workflow

- Row kebab action with `RhUiDuplicateIcon` + "Duplicate workflow"
- Positioned after Edit / View run history and before Export (non-destructive action block)
- **No confirmation dialog** — duplication runs immediately on click
- **Naming convention:** `{originalName} - duplicate-{base36Timestamp}`
- **Success toast with deep link:** Toast title "Workflow duplicated"; description includes an inline link button (`variant="link" isInline`) to open the new workflow in the builder
- Button disabled while duplicate request is in flight

### Run Workflow

- **Single trigger** — Plain "Run" button in the builder toolbar
- **Multiple triggers** — "Run" button becomes a dropdown, letting the user select which trigger to start from
- Run flow:
  1. Confirmation dialog ("Run [workflow name]?") with a "Don't show again" checkbox
  2. `RunWorkflowModal` — JSON code editor for providing mock trigger output data; validates against the trigger's `input_schema` when defined
- After run, the execution visualizer panel opens showing real-time results

### Test Step (Run Step)

- Triggered from a step's kebab menu → "Run step"
- Opens a two-step dialog flow:
  1. **Choice dialog** — "Run all previous steps" or "Set mock input data"
  2. **Mock data editor** — PatternFly `CodeEditor` with JSON syntax highlighting, validate/format/clear toolbar actions
- All upstream steps in the graph are mocked and show as "skipped" in execution details
- After clicking "Run", the execution visualizer panel opens (same as full workflow Run) showing real-time results
- Test executions are visible in run history

### Cancel run:

- Secondary destructive button (`variant="secondary"` + `isDanger`) placed directly in the builder live-run header and execution detail header toolbar
- **No confirmation dialog** — inline cancel for running executions (intentional exception to the standard confirmation pattern)
- **Visibility:** Only shown when execution status is `pending` or `running` (`isExecutionCancellable`)
- **Label:** "Cancel run"
- **Feedback:** Success toast "Execution cancellation requested"; error toast "Failed to cancel execution" + API message
- **Loading state:** Button shows spinner and disables while mutation is pending

### Canvas Controls

- Should be anchored to the **bottom-left corner** of the canvas view
- Canvas overlays (controls, step legend, undo/redo) use `NxPanel` with `variant="raised"` for opaque + shadow
- Legend toggle uses accessible labels **Show step legend** / **Hide step legend**
- Workflow steps on the canvas also use `variant="raised"` with a border-radius override to match `Card` / canvas chrome

### Canvas step styling

- Step cards have a fixed width (240px) — all dynamic text elements (`Title`, `Content`) must use `overflow-wrap: anywhere` to prevent text overflow from long expressions, template names, or URLs
- Use `anywhere` instead of `break-word` because it also influences `min-content` intrinsic sizing, preventing overflow in fixed-width flex containers

### Execution View Panels

- The **run details panel** provides an Overview/Details toggle for inspecting execution state
- Panels use `NxPanel isFullHeight` for proper internal scroll behavior — do not hand-roll `display: flex; flexDirection: column` inline styles when `isFullHeight` exists
- Panels may use a `ResizableDivider` to allow users to resize panel split areas
- The most recent run details can display inline in the editor after workflow execution

---

## 18. Accessibility Guidelines

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

## 19. Styling Rules

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

### Semantic Tokens Only

- **No hard-coded border colors** — use `--pf-t--global--border--color--default` and `--pf-t--global--border--width--divider--default` for borders and pagination footer dividers. Never use custom rgba hex overrides (e.g., `rgba(196, 181, 253, 0.2)`) on table or layout components. Semantic tokens adapt to light/dark/glass themes automatically.
- **No breadcrumb CSS overrides** — breadcrumbs use PF6 default styling (dashed underline, default link colors). Do not override `--pf-v6-c-breadcrumb__link--*` tokens to force solid underlines or custom link colors.
- **Compact inline form controls** — for time pickers or number inputs that need explicit widths, use PF spacer tokens (e.g., `--pf-t--global--spacer--4xl`) in CSS modules. Use `flexWrap: nowrap` + `flex={{ default: 'flexNone' }}` to prevent inline fields from collapsing.

### When a Global Style Seems Necessary

If you believe a global style is the only option, follow the PatternFly gaps process (see "AO Design System" → "PatternFly gaps" above): check PatternFly docs and tokens first, raise with UX, then engage PatternFly upstream. Approved temporary exceptions must be documented with a `patternfly-override` Jira label.

---

## 20. Use Chrome DevTools MCP to Verify Implementation

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

## 21. Storybook Review Workflow

The project ships with Storybook for documenting and reviewing `Nx*` components. Use it alongside the dev server for UI verification.

- **Start Storybook:** `npm run storybook` (port 5174)
- **Light and dark mode:** Preview components in both themes via the Storybook toolbar (System / Light / Dark) before sign-off
- **Composed stories over isolated demos:** Stories should reflect real app compositions (e.g., a full list page layout), not isolated prop playgrounds
- **Autodocs:** Foundational `Nx*` components have `autodocs` enabled — browse auto-generated API docs alongside live examples
- **Available stories:** `NxPage`, `NxPageHeader`, `NxPageBreadcrumbs`, `NxPanel`, `NxPanelContentStack`, `NxUrlTabs`, `NxConfirmationDialog`, `NxCodeBlock`, `NxDetail`, `NxDetailList`, `NxErrorState`, `NxLoadingState`, `NxEmptyStateNoData`, `NxEmptyStateFilter`, `NxEmptyStateServiceUnavailable`

---

## 22. Getting Started for Developers

- Point to the AO UI repository for implementation references
- Utilize the UI/UX skills defined in this document and the Cursor rules
- Follow the accessibility guidelines in section 18
- Follow the styling rules in section 19
- Use Chrome DevTools MCP (section 20) to verify your implementation against the live app
- Use Storybook (section 21) to review `Nx*` component documentation and test in light/dark mode

---

## Quick Reference: Component Selection

When implementing a new page or feature, use this decision tree:

```text
What are you building?
├── List/table view
│   ├── Use NxScrollableTableContainer (standard variant by default, "compact" only for dense supplementary tables)
│   ├── Add NxPageHeader with title + primary action
│   ├── Add FilterBar (Attribute Search)
│   ├── Add cursor-based pagination footer via NxScrollableTableContainer's footer prop
│   ├── "Created"/"Modified" columns: username (linked) + date together
│   └── Handle 3 empty states (no data / no results / error)
│
├── Detail view
│   ├── Use NxDetailList + NxDetail (vertical default; isHorizontal for compact)
│   ├── Add NxPageBreadcrumbs + NxPageHeader with title + resource actions
│   ├── NxDetail with empty children renders nothing (no placeholder needed)
│   └── Use NxCodeBlock for JSON/script/log display
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
├── View read-only detail (from kebab)
│   ├── Medium modal with descriptive title
│   ├── Read-only content with optional ClipboardCopy
│   └── Single "Close" button (variant="primary")
│
├── Log / event viewer (read-only)
│   ├── Use NxScrollableTableContainer with expandable rows (isExpandable)
│   ├── Add expand-all/collapse-all toggle in header
│   ├── Add FilterBar with multiple attribute filters (category, date range, status, severity, etc.)
│   ├── All columns sortable
│   ├── Expanded row shows full event details (metadata, request/response payloads)
│   ├── Resource column links to the resource detail page when applicable
│   └── Handle 2 empty states (no events yet / no filter results)
│
├── Role-based access page
│   ├── No read → hide from nav/tab; EmptyStateAccessDenied on direct URL
│   ├── Read only → controls disabled via isAriaDisabled + DisabledWithTooltip
│   ├── Read + write → full edit capability
│   └── Use permission hooks (use{Domain}Permissions) for all gating
│
├── Full-page wizard (multi-step with tables)
│   ├── Dedicated route (not modal)
│   ├── Each step: title + description + FilterBar + ScrollableTableContainer
│   ├── Footer: Back/Next/Cancel (link) per step
│   └── Cancel navigates back to origin route
│
├── Dedicated edit page (complex inline editing)
│   ├── Parent tab stays read-only with "Edit" button
│   ├── Edit page at sub-route with Save/Cancel toolbar
│   └── Permission-gated with EmptyStateAccessDenied fallback
│
└── Canvas/builder view
    ├── Use React Flow + PatternFly wrapper
    ├── Left-to-right layout
    ├── Canvas controls at bottom-left (NxPanel variant="raised")
    ├── Side panel for step details (not modal)
    └── Input/Output panels with Schema/Table/JSON view toggle
```
