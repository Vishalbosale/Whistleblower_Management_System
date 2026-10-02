-- V1.0.0__init.down.sql
-- Undo of V1.0.0__init.sql: drops every table it created (children first). The database
-- and the migrations table are kept; rollback.js removes the tracking row.
-- DESTRUCTIVE: all data in these tables is lost.
-- Run:  npm run rollback -- --yes
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `wbc_meeting_members`;
DROP TABLE IF EXISTS `wbc_decisions`;
DROP TABLE IF EXISTS `wbc_meetings`;
DROP TABLE IF EXISTS `user_roles`;
DROP TABLE IF EXISTS `saml_settings`;
DROP TABLE IF EXISTS `role_permissions`;
DROP TABLE IF EXISTS `respondent_submissions`;
DROP TABLE IF EXISTS `show_cause_notices`;
DROP TABLE IF EXISTS `permissions`;
DROP TABLE IF EXISTS `notification_history`;
DROP TABLE IF EXISTS `notification_templates`;
DROP TABLE IF EXISTS `login_history`;
DROP TABLE IF EXISTS `investigation_clarifications`;
DROP TABLE IF EXISTS `evidence`;
DROP TABLE IF EXISTS `escalation_matrix`;
DROP TABLE IF EXISTS `roles`;
DROP TABLE IF EXISTS `entity_views`;
DROP TABLE IF EXISTS `document_versions`;
DROP TABLE IF EXISTS `dac_members`;
DROP TABLE IF EXISTS `dac_decisions`;
DROP TABLE IF EXISTS `dac_conflict_checks`;
DROP TABLE IF EXISTS `dac_cases`;
DROP TABLE IF EXISTS `complaint_status_history`;
DROP TABLE IF EXISTS `complaint_respondents`;
DROP TABLE IF EXISTS `complainants`;
DROP TABLE IF EXISTS `closure_checklists`;
DROP TABLE IF EXISTS `ceto_approvals`;
DROP TABLE IF EXISTS `case_status_history`;
DROP TABLE IF EXISTS `case_slas`;
DROP TABLE IF EXISTS `sla_configurations`;
DROP TABLE IF EXISTS `case_closures`;
DROP TABLE IF EXISTS `documents`;
DROP TABLE IF EXISTS `investigation_reports`;
DROP TABLE IF EXISTS `investigations`;
DROP TABLE IF EXISTS `case_assignments`;
DROP TABLE IF EXISTS `audit_logs`;
DROP TABLE IF EXISTS `anonymous_tracking`;
DROP TABLE IF EXISTS `anonymous_responses`;
DROP TABLE IF EXISTS `complaint_clarifications`;
DROP TABLE IF EXISTS `cases`;
DROP TABLE IF EXISTS `complaints`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `designations`;
DROP TABLE IF EXISTS `departments`;
DROP TABLE IF EXISTS `branches`;
DROP TABLE IF EXISTS `regions`;
DROP TABLE IF EXISTS `master_values`;
DROP TABLE IF EXISTS `master_types`;
SET FOREIGN_KEY_CHECKS = 1;
