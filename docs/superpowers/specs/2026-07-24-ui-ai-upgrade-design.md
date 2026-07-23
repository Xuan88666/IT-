# OpsHub UI and AI Upgrade Design

## Goal

Upgrade OpsHub from a functional local toolbox into a modern operations workbench without changing its local-first deployment model, existing HTTP API contracts, or RBAC behavior. The first release focuses on visual hierarchy, reliable interaction states, reusable open-source UI components, and a maintainable `aiAnalyze` pipeline.

## Scope

- Keep the current vanilla JavaScript application and Node.js server.
- Add Shoelace Web Components for dialogs, drawers, tabs, selects, alerts, tooltips, toasts, and loading states.
- Retain Lucide for familiar action icons.
- Modernize the shell, navigation, dashboard, AI workspace, tool execution feedback, and responsive behavior.
- Refactor `aiAnalyze` into explicit stages while preserving its public response shape.
- Preserve the current API endpoints, authentication model, roles, and local-only listener.

## Non-goals

- No React/Vue migration.
- No database migration in this release.
- No new remote-control or destructive repair capability.
- No change to the default `127.0.0.1` network boundary.

## Visual System

The UI will use a compact operations-workbench layout:

- A dark, collapsible left navigation rail organized by work area.
- A neutral application canvas with white tool surfaces, restrained borders, and clear page hierarchy.
- Teal for primary actions and healthy state, amber for attention, and red for failures. Status colors will not be the sole carrier of meaning.
- Compact metrics, incident timelines, and work queues on the dashboard instead of repeated oversized cards.
- Responsive navigation changes to a Shoelace drawer on narrow screens.

## Component Boundaries

- `ui/components.mjs`: initialize Shoelace, expose toast, confirm-dialog, drawer, and loading helpers.
- `ui/shell.mjs`: application header, navigation, page frame, and mobile navigation behavior.
- `ui/ai-workspace.mjs`: AI session list, contextual evidence drawer, message rendering, and run state.
- Existing page renderers remain callable while new components replace ad-hoc `alert`, `prompt`, and manually built modal behavior incrementally.

The first migration keeps `app.js` as the application coordinator. This avoids an all-at-once rewrite while giving new code a stable home.

## AI Analysis Pipeline

`aiAnalyze` will become an orchestration function composed of these steps:

1. Normalize and validate the issue, evidence, and requested provider.
2. Collect bounded relevant knowledge and matching asset context.
3. Build a provider-safe prompt from the normalized context.
4. Select and call the configured provider, recording structured success or failure details.
5. Fall back to the local rule assistant when no provider is configured or a provider call fails.
6. Produce the existing response fields, including the operation brief and suggested tools.
7. Write a bounded audit record without credentials or unneeded raw provider errors.

The API response will remain compatible with the current frontend: `ok`, `provider`, `output`, `suggestedTools`, `opsBrief`, and optional action data.

## Interaction and Failure Behavior

- Long-running tool and AI actions show a pending state and prevent duplicate submission.
- Completion is announced with Shoelace toasts; actionable failures include a retry path.
- Destructive or external-launch actions retain explicit confirmation.
- Empty, loading, error, and permission-denied states are visually distinct and keyboard accessible.
- The app must remain usable when Shoelace fails to load: existing buttons and API flows continue to work.

## Verification

- Keep the existing smoke suite passing.
- Add tests for `aiAnalyze` normalization, provider failure fallback, and stable response fields.
- Run `node --check` on edited JavaScript modules and `vite build`.
- Verify primary flows in a browser at desktop and mobile widths: login, navigation, tool execution, AI analysis, and role-restricted actions.

## Rollout Order

1. Add the component runtime and visual tokens.
2. Upgrade the application shell and shared feedback controls.
3. Upgrade the dashboard, tools, and AI workspace.
4. Extract and test the `aiAnalyze` pipeline.
5. Run build, smoke, and browser verification.
