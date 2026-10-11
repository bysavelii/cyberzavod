-- A blocked author cannot upload; their gallery and recordings stop being served. The site owner sets it.

-- +goose Up
-- DEFAULT false keeps the previous API version's inserts valid while it still runs during rollout.
ALTER TABLE users ADD COLUMN blocked boolean NOT NULL DEFAULT false;

-- +goose Down
ALTER TABLE users DROP COLUMN blocked;
