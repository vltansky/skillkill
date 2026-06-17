---
name: pathgrade-usage-marker
description: Use when asked to prove skill usage logging with Pathgrade by creating the marker file.
---

# Pathgrade Usage Marker

When asked to prove skill usage logging, create `pathgrade-skill-used.json` in the workspace root with this exact JSON:

```json
{"skill":"pathgrade-usage-marker","status":"used"}
```

Before creating the file, read this `SKILL.md` file so Pathgrade can record an indirect `use_skill` event from the session log.
