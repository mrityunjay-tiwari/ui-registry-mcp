---
name: New registry request
about: Suggest a component library to add
title: "Add registry: <name>"
labels: registry
---

**Library name & site**

**Registry base URL**
The base for its shadcn registry files, e.g. `https://example.com/r`
(so the index is `{base}/registry.json` and a component is `{base}/{name}.json`).

**License**
Are the components openly licensed (MIT, etc.)? Any premium/paid components?

**Quick checks (if you can)**
- [ ] `{base}/registry.json` returns JSON with an `items` array
- [ ] A component URL `{base}/{name}.json` returns real source

If it only serves per-component JSON with no index, or serves an HTML page for
those paths, it can't be enumerated yet — mention that and we'll note it.
