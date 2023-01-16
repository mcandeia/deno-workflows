import { Event, Queue } from "https://deno.land/x/async@v1.2.0/mod.ts";

function isWorkItem<T, TResult>(
  v: T | WorkItem<T, TResult>
): v is WorkItem<T, TResult> {
  return (v as WorkItem<T, TResult>).item !== "undefined";
}
const noop = () => {};

const consumerFor = async <T, TResult>(
  q: Queue<WorkItem<T, TResult>>,
  closed: Event,
  handler: (s: T) => Promise<TResult>
) => {
  while (!closed.is_set()) {
    const recv = await Promise.race([q.get(), closed.wait()]);
    if (recv === true) {
      break;
    }
    await handler(recv.item).then(recv.onSuccess).catch(recv.onError);
  }
};

const producerFor = async <T, TResult>(
  q: Queue<WorkItem<T, TResult>>,
  closed: Event,
  generator: AsyncGenerator<T | WorkItem<T, TResult>, unknown, unknown>
) => {
  let next = await generator.next();
  while (!next.done) {
    const value = next.value;
    await q.put(
      isWorkItem(value)
        ? value
        : { item: value, onSuccess: noop, onError: noop }
    );
    next = await generator.next();
  }
  closed.set();
};

export interface WorkItem<T, TResult = unknown> {
  item: T;
  onSuccess: (r: TResult) => void;
  onError: (err: unknown) => void;
}
/**
 * Start workers based on the specified count or defaults to 1.
 * The workers are responsible for producing and consuming the data based on the generator function.
 * At least two async routines are started when this function gets invoked.
 * `count` routines for consuming the messages and one routine for producing messages.
 * the cancellation will be called as soon as the generator function returns.
 */
export const startWorkers = <T, TResult>(
  handler: (s: T) => Promise<TResult>,
  generator: AsyncGenerator<T | WorkItem<T, TResult>, unknown, TResult>,
  count?: number
) => {
  const q = new Queue<WorkItem<T, TResult>>(count ?? 1);
  const closed = new Event();
  const workers = new Array<() => Promise<void>>(count ?? 1)
    .fill(() => consumerFor(q, closed, handler))
    .map((f) => f());
  const producer = producerFor(q, closed, generator);
  Promise.all([...workers, producer]);
};
