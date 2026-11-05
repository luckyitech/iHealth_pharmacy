-- "Masters View": see master data without changing it (the legacy system had no view-only permission).
-- Permissions added by the new system use ids from 900001 up, far below the legacy AUTO_INCREMENT
-- counter (424324347), so they never collide with rows the legacy system adds later.
-- Nobody gets it automatically: existing users keep exactly the access they have.
INSERT INTO pharma_access (PHARMA_ACCESS_ID, ACCESS_CD, ACCESS_NAME, ACTIVE_S, CREATION_USER_ID)
VALUES (900001, 'Master', 'Masters View', 'Y', 'ihealth-additive')
ON DUPLICATE KEY UPDATE ACCESS_NAME = ACCESS_NAME;
