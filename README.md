# Durable workflows implemented on Edge.

Borrows heavily from [go-workflows](https://github.com/cschleiden/go-workflows).

Durable workflows is a workflow engine for building **workflows as a code** on top of Deno runtime. Durable workflows allows you to create long running persistent workflows using your preferred language with automatic recover from failures, retries, timers and signal handlers.

## How it works

Durable workflows leverages the [Event Sourcing pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) to provide a simple set of APIs for ensuring that your code will be executed in a at-east-once fashion model.

### Workflows made easy

Workflows are functions that generates `Commands`, a workflow may have an input or not.

TODO

### Testing

First thing you need to do is create your workflow executor, by using the following request:

```shell
curl --location --request PUT 'https://durable-workers.fly.dev/workflows/${workflowName}' \
--header 'Content-Type: application/json' \
--data-raw '{
    "url": "https://raw.githubusercontent.com/${organization}/${repository}/${branch or commit}/${path-to-workflow-file}.ts"
}'
```

ps: replace the placeholders before sending the request
ps2: do not use import maps otherwise the dynamic import will not work.

Start the workflow with the desired input by invoking the following request:

```shell
curl --location --request POST 'https://durable-workers.fly.dev/executions' \
--header 'Content-Type: application/json' \
--data-raw '{
    "alias":"${workflowName}",
    "input": [${workflow_param1}, ${workflow_param2}]
}'
```

**Do not forget to save the returned execution id**,

If you're using signals you can send it by using the following request:

```shell
curl --location --request POST 'https://durable-workers.fly.dev/executions/${execution_id}/signals/${signal_name}' \
--header 'Content-Type: application/json' \
--data-raw '${desired_payload}'
```


Get the workflow result:
```shell
curl --location --request GET 'https://durable-workers.fly.dev/executions/${execution_id}'
```