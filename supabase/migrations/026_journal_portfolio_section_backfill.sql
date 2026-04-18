-- =====================================================
-- Journal — repair user-scoped "Portfolia" system section
-- after initial portfolio-channel rollout
-- =====================================================

-- 1. If a legacy system section "Portfolia" exists without user_id,
--    assign it to portfolio owners. Single-user app => safe fan-out by portfolios.user_id.
UPDATE journal_sections js
SET user_id = p.user_id
FROM portfolios p
WHERE js.name = 'Portfolia'
  AND js.is_system = TRUE
  AND js.user_id IS NULL;

-- 2. Ensure every user with at least one portfolio has the system section.
INSERT INTO journal_sections (name, is_system, sort_order, user_id)
SELECT
    'Portfolia',
    TRUE,
    0,
    p.user_id
FROM portfolios p
WHERE NOT EXISTS (
    SELECT 1
    FROM journal_sections js
    WHERE js.name = 'Portfolia'
      AND js.is_system = TRUE
      AND js.user_id = p.user_id
)
GROUP BY p.user_id;

-- 3. Backfill missing portfolio channels in case the previous migration stopped early
--    or the app had existing portfolios before the channel lifecycle logic landed.
INSERT INTO journal_channels (type, name, portfolio_id, sort_order, user_id)
SELECT
    'portfolio',
    p.name,
    p.id,
    0,
    p.user_id
FROM portfolios p
WHERE NOT EXISTS (
    SELECT 1
    FROM journal_channels jc
    WHERE jc.portfolio_id = p.id
);
