---
minWaitTimeMs: 5000
---

# AgentWatch Instructions

> Define project-specific validation rules below.
> Each rule is a list item. Optionally prefix with a severity tag: [high], [medium], or [low].
> Rules without a tag default to [medium].

## Security
- [high] Detect hardcoded secrets, API keys, or credentials

## Data and Code Integrity
- [high] Flag changes to database schema or migration files
- [medium] Watch for changes on important or public APIs

## Documentation
- [medium] Note if important changes are not documented in the existing documentation
- [low] Note if documentation is bloated or contains outdated or irrelevant information

## Custom Rules
- [low] Note changes to configuration files
