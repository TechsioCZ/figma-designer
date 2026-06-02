# Runbooks

Runbooks describe how an operator clones the template, connects a Figma customer project, runs bootstrap and discovery, creates customer screens, validates output, captures screenshots, reports gaps, and iterates.

Use these docs in order:

1. [Operator Setup](./operator-setup.md): clone workflow, prerequisites, Figma Assets setup, environment preparation, and the Brief to Iterate loop.
2. [Full Run](./full-run.md): bootstrap, discovery, nesting, generation plan, validation, screenshot/report, gap log, iteration planning, and closeout.

## Command Sequence

The current package scripts expose this stable sequence:

```bash
npm run figma:bootstrap
npm run figma:discover
npm run figma:nesting
# Create and apply a Strict Composition generation plan from the approved brief.
npm run figma:validate
npm run figma:report
npm run figma:iterate
```

Equivalent generic form:

```bash
npm run figma -- bootstrap
npm run figma -- discover
npm run figma -- nesting
npm run figma -- validate
npm run figma -- report
npm run figma -- iterate
```

Bootstrap, discovery, nesting, validation, reporting, and iteration use the stable command harness. The landed modules also provide generation planning, screenshot/report assembly, Design System Gap logging, and iteration planning for fixture-backed local runs and live-adapter workflows.
