-- Fix SECURITY DEFINER issue on watchlist_summary view
-- Views should use SECURITY INVOKER to respect RLS policies of the querying user

-- Recreate view with security_invoker = true
DROP VIEW IF EXISTS watchlist_summary;

CREATE VIEW watchlist_summary
WITH (security_invoker = true)
AS
SELECT 
    w.id,
    w.user_id,
    w.name,
    w.description,
    w.color,
    w.position,
    w.created_at,
    w.updated_at,
    COUNT(wi.id) AS item_count
FROM watchlists w
LEFT JOIN watchlist_items wi ON w.id = wi.watchlist_id
GROUP BY w.id, w.user_id, w.name, w.description, w.color, w.position, w.created_at, w.updated_at;

-- Grant access to authenticated users
GRANT SELECT ON watchlist_summary TO authenticated;

COMMENT ON VIEW watchlist_summary IS 'Aggregated watchlist view with item counts. Uses SECURITY INVOKER to respect RLS.';
