import { HistoryEvent } from "../../events.ts";
import { valueOrNull } from "./utils.ts";

const queryEvents = (table: string, instanceId: string) =>
  `SELECT id, type, timestamp, visible_at visibleAt, seq, attributes FROM ${table} WHERE instance_id='${instanceId}'`;

export const queryPendingEvents = (instanceId: string) =>
  `${queryEvents(
    "pending_events",
    instanceId
  )} AND (visible_at is NULL OR visible_at <= now()) ORDER BY visible_at ASC`;

export const queryHistory = (instanceId: string): string =>
  `${queryEvents("history", instanceId)} ORDER BY seq ASC`;

export const historyEventToValues =
  (instanceId: string) =>
  ({ id, type, timestamp, visibleAt, seq, ...rest }: HistoryEvent): string => {
    return `('${id}', '${instanceId}', '${type}', '${timestamp.toISOString()}', '${JSON.stringify(
      rest
    )}', ${valueOrNull(visibleAt?.toISOString())}, ${seq})`;
  };

export const insertEvents = (
  table: string,
  instanceId: string,
  events: HistoryEvent[]
): string => {
  return `INSERT INTO ${table} (id, instance_id, type, timestamp, attributes, visible_at, seq) VALUES ${events
    .map(historyEventToValues(instanceId))
    .join(",")}`;
};

export const deleteEvents = (
  table: string,
  instanceId: string,
  eventIds: HistoryEvent[]
) => {
  return `DELETE FROM ${table} WHERE instance_id='${instanceId}' AND id IN (${eventIds
    .map(({ id }) => `'${id}'`)
    .join(",")})`;
};

export interface PersistedEvent {
  id: string;
  type: HistoryEvent["type"];
  timestamp: Date;
  seq: number;
  visibleAt?: Date;
  // deno-lint-ignore no-explicit-any
  attributes: any;
}

export const toHistoryEvent = ({
  id,
  type,
  timestamp,
  visibleAt,
  seq,
  attributes,
}: PersistedEvent): HistoryEvent => {
  return {
    id,
    type,
    seq,
    timestamp,
    visibleAt,
    ...attributes,
  };
};
