-- =====================================================
-- 037: profiles.notifications_enabled sleduje zařízení
--
-- Příznak čtou alert joby jako hlavní vypínač a backend ho teď udržuje
-- v services/push.py: je true právě tehdy, když má uživatel aspoň jednu
-- push_subscriptions. Dřív ho frontend při odhlášení jednoho zařízení
-- nastavil na false a ostatní zařízení přestala dostávat upozornění.
--
-- Oprava účtů, které takto zůstaly vypnuté, i když mají platné zařízení.
-- Příznak nikdy nesnižuje. Idempotentní.
-- =====================================================

UPDATE profiles
SET notifications_enabled = TRUE
WHERE notifications_enabled = FALSE
  AND EXISTS (SELECT 1 FROM push_subscriptions s WHERE s.user_id = profiles.id);
