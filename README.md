# Durable workflows implemented on Edge.

Borrows heavily from [go-workflows](https://github.com/cschleiden/go-workflows).

Deno workflows is a workflow engine for building **workflows as a code** on top of Deno runtime. Deno workflows allows you to create long running persistent workflows using typescript with automatic recover from failures, retries, timers and signal handlers.

## How it works

Deno workflows leverages the [Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) to provide a simple set of APIs for ensuring that your code will be executed in a at-east-once fashion model.

### Workflows made easy

Workflows are functions that generates `Commands`, a workflow may have an input or not.

TODO

## Running samples

In your terminal, run:

```shell
ENABLE_DEBUG=true WORKERS_COUNT=[num_of_workers] WORKERS_LOCK_MINUTES=[workers_minutes] PG_INTERVAL_EMPTY_EVENTS=[interval_in_ms] PGPOOLSIZE=[pgpoolSize] PGUSER=[pguser] PGPASSWORD=[password] PGHOST=[pghost] PGPORT=[pgport] PGDATABASE=[postgres] deno run --allow-net --allow-env --allow-sys workers.ts
```

You'll see workers sql-like logs

Open another terminal tab and run:

```shell
ENABLE_DEBUG=true PGPOOLSIZE=[pgpoolSize] PGUSER=[pguser] PGPASSWORD=[password] PGHOST=[pghost] PGPORT=[pgport] PGDATABASE=[postgres] deno run --allow-net --allow-env --allow-sys simple.ts
```

This last command will start a bunch of workflows that will be executed until it reaches the wait for signal command, at this point we should be able to proceed the execution by sending the expected signal to the given workflow instances.

After a while ~1 minute, dispatch the signals

```shell
ENABLE_DEBUG=true PGPOOLSIZE=[pgpoolSize] PGUSER=[pguser] PGPASSWORD=[password] PGHOST=[pghost] PGPORT=[pgport] PGDATABASE=[postgres] deno run --allow-net --allow-env --allow-sys signal.ts
```
