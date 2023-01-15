import { HistoryEvent } from "../../events.ts";
import { valueOrNull } from "./utils.ts";

export const queryEvents = (
  table: string,
  includeVisibleAt?: boolean
): ((instanceId: string) => string) => {
  const visibleAtClause = includeVisibleAt
    ? " AND (visible_at is NULL OR visible_at < now())"
    : "";
  return (instanceId: string) =>
    `SELECT id, type, timestamp, visible_at visibleAt, attributes FROM ${table} WHERE instance_id='${instanceId}'${visibleAtClause}`;
};

export const historyEventToValues =
  (instanceId: string) =>
  ({ id, type, timestamp, visibleAt, ...rest }: HistoryEvent): string => {
    return `('${id}', '${instanceId}', '${type}', '${timestamp.toISOString()}', '${JSON.stringify(
      rest
    )}', ${valueOrNull(visibleAt?.toISOString())})`;
  };

export const insertEvents =
  (table: string) =>
  (instanceId: string, events: HistoryEvent[]): string => {
    return `INSERT INTO ${table} (id, instance_id, type, timestamp, attributes, visible_at) VALUES ${events
      .map(historyEventToValues(instanceId))
      .join(",")}`;
  };

export const deleteEvents =
  (table: string) => (instanceId: string, eventIds: HistoryEvent[]) => {
    return `DELETE FROM ${table} WHERE instance_id='${instanceId}' AND id IN (${eventIds
      .map(({ id }) => `'${id}'`)
      .join(",")})`;
  };

export interface PersistedEvent {
  id: string;
  type: HistoryEvent["type"];
  timestamp: Date;
  visibleAt?: Date;
  // deno-lint-ignore no-explicit-any
  attributes: any;
}

export const toHistoryEvent = ({
  id,
  type,
  timestamp,
  visibleAt,
  attributes,
}: PersistedEvent): HistoryEvent => {
  return {
    id,
    type,
    timestamp,
    visibleAt,
    ...attributes,
  };
};
