export default `
CREATE TABLE IF NOT EXISTS instances (
    id TEXT,
    alias TEXT NOT NULL,
    completed_at TIMESTAMP NULL,
    result JSON NULL,
    PRIMARY KEY(id)
);

CREATE INDEX IF NOT EXISTS idx_instance_aliases ON instances (alias);

CREATE TABLE IF NOT EXISTS pending_events (
    id TEXT,
    instance_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    attributes JSON NOT NULL,
    visible_at TIMESTAMP NULL,
    PRIMARY KEY(id, instance_id),
    CONSTRAINT fk_instances_pending_events
        FOREIGN KEY(instance_id)
            REFERENCES instances(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_events_instance_id_visible_at ON pending_events (instance_id, visible_at);

CREATE TABLE IF NOT EXISTS history (
    id TEXT,
    instance_id TEXT NOT NULL,
    type TEXT NOT NULL,
    timestamp TIMESTAMP NOT NULL,
    attributes JSON NOT NULL,
    visible_at TIMESTAMP NULL,
    PRIMARY KEY(id, instance_id),
    CONSTRAINT fk_instances
        FOREIGN KEY(instance_id)
            REFERENCES instances(id)
);
CREATE INDEX IF NOT EXISTS idx_history_instance_id ON history (instance_id);
`;
