# Durable workflows implemented on Edge.

Borrows heavily from [go-workflows](https://github.com/cschleiden/go-workflows).

Durable workflows is a workflow engine for building **workflows as a code** on top of Deno runtime. Durable workflows allows you to create long running persistent workflows using your preferred language with automatic recover from failures, retries, timers and signal handlers.

## How it works

Durable workflows leverages the [Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) to provide a simple set of APIs for ensuring that your code will be executed in a at-east-once fashion model.

### Workflows made easy

Workflows are functions that generates `Commands`, a workflow may have an input or not.

TODO
