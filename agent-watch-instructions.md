---
minWaitTimeMs: 30000
---

# AgentWatch Instructions

> Define project-specific validation rules below.
> Each rule is a list item. Optionally prefix with a severity tag: [high], [medium], or [low].
> Rules without a tag default to [medium].

## Security
- [high] Flag any changes to authentication or authorization logic
- [high] Detect hardcoded secrets, API keys, or credentials

## Data Integrity
- [high] Flag changes to database schema or migration files
- [medium] Watch for changes to data validation logic

## API Contracts
- [medium] Flag changes to public API endpoints, MCP tools arguments or response shapes
- [medium] Flag removed or changed error handling in API routes

## Documentation
- [low] Note questionable changes to README or documentation files

## Custom Rules
- [medium] Flag any removed error handlers
- [medium] Reason if uneeded mocks, or assertions are used in tests
- [low] Note changes to configuration files
- [low] Reason if code change might have performance implications or affect reliability
- [low] Check for if new code adds too much complexity

# Debug
- [low] unused consts

