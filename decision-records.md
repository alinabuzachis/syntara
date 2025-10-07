# Architecture Decision Records

The following document details our architectural decisions made for the Nexus Platform.

| Question | Decision  | Decision Date | Details |
|---|---|---|---|
| What orchestration engine backend will we use? | [Temporal](https://github.com/temporalio/temporal) | 09/12/2025 | We have decided to leverage Temporal for our backend workflow engine due to its mature capabilities around reliable execution, scalability, visibility and more.
| Django or FastAPI? | [FastAPI](https://fastapi.tiangolo.com/) |  10/03/2025 | We have decided to use FastAPI for our Python backend, due to its mature async capabilities, speed benefits, and widespread adoption in the AI ecosystem |
| Soft Delete or Hard Deletes? | Soft Delete | 10/07/2025 | When considering deletion of resources, we should primarily support deletion via soft deletes if it is applicable |
| UUID or ID? | UUID | 10/07/2025 | For ID fields, we should primarily use UUIDs instead of auto-incrementing IDs where possible |
