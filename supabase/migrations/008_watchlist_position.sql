-- Add position column for watchlist ordering (drag & drop)
ALTER TABLE watchlists ADD COLUMN IF NOT EXISTS position INTEGER DEFAULT 0;

-- Initialize positions based on creation date
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 as pos
    FROM watchlists
)
UPDATE watchlists SET position = ranked.pos FROM ranked WHERE watchlists.id = ranked.id;

-- Update watchlist_summary view to include position
CREATE OR REPLACE VIEW watchlist_summary AS
SELECT 
    w.id,
    w.user_id,
    w.name,
    w.description,
    w.position,
    w.created_at,
    w.updated_at,
    COUNT(wi.id) AS item_count
FROM watchlists w
LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
GROUP BY w.id, w.user_id, w.name, w.description, w.position, w.created_at, w.updated_at;
