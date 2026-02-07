---
name: btca-cli
description: Install, configure, and operate the btca CLI for local resources and source-first answers. Use when setting up btca in a project, connecting a provider, adding or managing resources, and asking questions via btca commands. Invoke this skill when the user says "use btca" or needs to do more detailed research on a specific library or framework.
---

# btca CLI

## Usage

```bash
btca ask -r <resource> -q "<question>"
```

### Ask with multiple resources:

```bash
btca ask -r react -r typescript -q "How do I type useState?"
```

- You can see which resources are configured with `btca resources`.

## Config Overview

- Config lives in `btca.config.jsonc` (project) and `~/.config/btca/btca.config.jsonc` (global).
- Project config overrides global and controls provider/model and resources.

## Troubleshooting

- "No resources configured": add resources with `btca add ...` and re-run `btca resources`.
- "Provider not connected": run `btca connect` and follow the prompts.
