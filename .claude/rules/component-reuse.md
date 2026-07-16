---
paths:
  - "src/lib/components/**"
  - "src/routes/**"
---

# UI component rules

**Reuse before creating.** Before writing any tooltip, pill, panel, bar, or overlay: search `src/lib/components/UI/` and `src/lib/components/util/` for an existing component that does it. Import it. Never re-implement an existing component's markup/behavior inline in another component — if the thing you need is currently baked into a specific panel, extract it into a shared component and import it in both places instead of copying.

**Never render internal identifiers in player-facing UI.** Entity ids, trait/condition keys, spec names, and data-file field names must be mapped to their display `name`/`label` before rendering. If a display name is missing for something the UI must show, flag it to the user rather than falling back to the raw id.
