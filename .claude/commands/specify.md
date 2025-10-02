---
description: Create or update the feature specification from a natural language feature description.
---

The user input to you can be provided directly by the agent or as a command argument - you **MUST** consider it before proceeding with the prompt (if not empty).

User input:

$ARGUMENTS

The text the user typed after `/specify` in the triggering message **is** the feature description. Assume you always have it available in this conversation even if `$ARGUMENTS` appears literally below. Do not ask the user to repeat it unless they provided an empty command.

Given that feature description, do this:

1. Run the script `.specify/scripts/bash/create-new-feature.sh --json "$ARGUMENTS"` from repo root and parse its JSON output for BRANCH_NAME and SPEC_FILE. All file paths must be absolute.
  **IMPORTANT** You must only ever run this script once. The JSON is provided in the terminal as output - always refer to it to get the actual content you're looking for.
2. Load `.specify/templates/spec-template.md` to understand required sections.
3. Write the specification to SPEC_FILE using the template structure, replacing placeholders with concrete details derived from the feature description (arguments) while preserving section order and headings.
4. Check for enabled extensions:
   - Read `.specify/config.json` and parse the JSON
   - For each feature where `features[feature-name].specify === true`:
     - If the feature is enabled, read and execute the instructions from `.specify/extensions/[feature-name]/specify.md`
     - Include any outputs from extension execution in the final report
5. Report completion with branch name, spec file path, any generated extension outputs, and readiness for the next phase.

Note: The script creates and checks out the new branch and initializes the spec file before writing.
