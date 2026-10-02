-- V1.0.0__init.sql
-- Baseline schema + reference seed data for the Whistleblower Management System
-- (MySQL 8 / AWS RDS). Generated from the live wms_db schema on 2026-10-02.
--
-- Standards: InnoDB, utf8mb4 / utf8mb4_unicode_ci, created_at + updated_at on every table.
-- Idempotent: CREATEs use IF NOT EXISTS, columns and foreign keys are added only
-- when missing, seed rows use INSERT IGNORE (admin edits are never overwritten)
-- and the tracking row is written once.
--
-- NOTE: MySQL commits DDL implicitly, so the TRANSACTION protects the seed and
-- tracking inserts (Steps 4-5). A failure in Steps 1-3 is recovered by re-running,
-- because every statement there is idempotent.
--
-- Run:  mysql -h <rds-endpoint> -u <user> -p < migrations/V1.0.0__init.sql
--  or:  npm run migrate

-- ===== Step 1: Create database =====
CREATE DATABASE IF NOT EXISTS `wms_db` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `wms_db`;

-- ===== Step 2: Create tables (parents before children) =====
-- Migration tracking table
CREATE TABLE IF NOT EXISTS migrations (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  version      VARCHAR(20)  NOT NULL,
  script_name  VARCHAR(255) NOT NULL,
  executed_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  status       ENUM('success','failed'),
  notes        TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `master_types` (
  `master_type_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `master_code` varchar(50) NOT NULL,
  `master_name` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`master_type_id`),
  UNIQUE KEY `master_code` (`master_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `master_values` (
  `master_value_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `master_type_id` bigint unsigned NOT NULL,
  `parent_value_id` bigint unsigned DEFAULT NULL,
  `value_code` varchar(80) NOT NULL,
  `value_name` varchar(200) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `display_order` int NOT NULL DEFAULT '0',
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`master_value_id`),
  UNIQUE KEY `uk_master_value` (`master_type_id`,`value_code`),
  KEY `idx_master_parent` (`parent_value_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `regions` (
  `region_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `region_code` varchar(30) NOT NULL,
  `region_name` varchar(150) NOT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`region_id`),
  UNIQUE KEY `region_code` (`region_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `branches` (
  `branch_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `branch_code` varchar(30) NOT NULL,
  `branch_name` varchar(200) NOT NULL,
  `region_id` bigint unsigned DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`branch_id`),
  UNIQUE KEY `branch_code` (`branch_code`),
  KEY `fk_branches_region` (`region_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `departments` (
  `department_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `department_code` varchar(30) NOT NULL,
  `department_name` varchar(200) NOT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`department_id`),
  UNIQUE KEY `department_code` (`department_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `designations` (
  `designation_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `designation_code` varchar(30) NOT NULL,
  `designation_name` varchar(200) NOT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`designation_id`),
  UNIQUE KEY `designation_code` (`designation_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `users` (
  `user_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `employee_id` varchar(50) DEFAULT NULL,
  `username` varchar(150) NOT NULL,
  `full_name` varchar(200) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `mobile` varchar(30) DEFAULT NULL,
  `ad_user_id` varchar(255) DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `region_id` bigint unsigned DEFAULT NULL,
  `department_id` bigint unsigned DEFAULT NULL,
  `designation_id` bigint unsigned DEFAULT NULL,
  `status_code` varchar(30) NOT NULL DEFAULT 'ACTIVE',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `employee_id` (`employee_id`),
  UNIQUE KEY `ad_user_id` (`ad_user_id`),
  KEY `fk_users_branch` (`branch_id`),
  KEY `fk_users_region` (`region_id`),
  KEY `fk_users_department` (`department_id`),
  KEY `fk_users_designation` (`designation_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complaints` (
  `complaint_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_no` varchar(50) DEFAULT NULL,
  `date_of_receipt` date NOT NULL,
  `registration_datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ack_to_wb_date` date DEFAULT NULL,
  `forwarded_to_iu_date` date DEFAULT NULL,
  `complaint_reference_id` varchar(150) NOT NULL,
  `addressed_to_master_value_id` bigint unsigned DEFAULT NULL,
  `complaint_language_id` bigint unsigned DEFAULT NULL,
  `channel_reference` varchar(200) DEFAULT NULL,
  `channel_id` bigint unsigned DEFAULT NULL,
  `complaint_nature_id` bigint unsigned DEFAULT NULL,
  `complaint_classification_id` bigint unsigned DEFAULT NULL,
  `complaint_sub_classification_id` bigint unsigned DEFAULT NULL,
  `complainant_type_id` bigint unsigned DEFAULT NULL,
  `anonymity_type_id` bigint unsigned DEFAULT NULL,
  `complainant_reference_id` varchar(100) DEFAULT NULL,
  `complaint_description` longtext NOT NULL,
  `severity_id` bigint unsigned DEFAULT NULL,
  `good_faith_confirmed` tinyint(1) NOT NULL DEFAULT '0',
  `current_status_id` bigint unsigned DEFAULT NULL,
  `wbc_owner_id` bigint unsigned DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`complaint_id`),
  UNIQUE KEY `complaint_no` (`complaint_no`),
  KEY `idx_complaints_receipt_date` (`date_of_receipt`),
  KEY `idx_complaints_status` (`current_status_id`),
  KEY `idx_complaints_reference` (`complaint_reference_id`),
  KEY `idx_complaints_channel` (`channel_id`),
  KEY `idx_complaints_nature` (`complaint_nature_id`),
  KEY `fk_complaints_addressed_to` (`addressed_to_master_value_id`),
  KEY `fk_complaints_language` (`complaint_language_id`),
  KEY `fk_complaints_classification` (`complaint_classification_id`),
  KEY `fk_complaints_subclassification` (`complaint_sub_classification_id`),
  KEY `fk_complaints_complainant_type` (`complainant_type_id`),
  KEY `fk_complaints_anonymity` (`anonymity_type_id`),
  KEY `fk_complaints_severity` (`severity_id`),
  KEY `fk_complaints_created_by` (`created_by`),
  KEY `fk_complaints_updated_by` (`updated_by`),
  KEY `fk_complaints_wbc_owner` (`wbc_owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cases` (
  `case_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_no` varchar(50) DEFAULT NULL,
  `complaint_id` bigint unsigned NOT NULL,
  `case_type_id` bigint unsigned DEFAULT NULL,
  `priority_id` bigint unsigned DEFAULT NULL,
  `risk_category_id` bigint unsigned DEFAULT NULL,
  `investigation_unit_id` bigint unsigned DEFAULT NULL,
  `investigation_officer_id` bigint unsigned DEFAULT NULL,
  `case_open_date` date DEFAULT NULL,
  `due_date` date DEFAULT NULL,
  `status_id` bigint unsigned DEFAULT NULL,
  `remarks` varchar(2000) DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `updated_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `iu_sla_due_date` date DEFAULT NULL,
  `iu_reminder_count` int NOT NULL DEFAULT '0',
  PRIMARY KEY (`case_id`),
  UNIQUE KEY `complaint_id` (`complaint_id`),
  UNIQUE KEY `case_no` (`case_no`),
  KEY `idx_cases_status` (`status_id`),
  KEY `idx_cases_officer` (`investigation_officer_id`),
  KEY `idx_cases_due_date` (`due_date`),
  KEY `fk_cases_type` (`case_type_id`),
  KEY `fk_cases_priority` (`priority_id`),
  KEY `fk_cases_risk` (`risk_category_id`),
  KEY `fk_cases_unit` (`investigation_unit_id`),
  KEY `fk_cases_created_by` (`created_by`),
  KEY `fk_cases_updated_by` (`updated_by`),
  KEY `idx_cases_case_open_date` (`case_open_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complaint_clarifications` (
  `clarification_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned NOT NULL,
  `case_id` bigint unsigned DEFAULT NULL,
  `clarification_question` longtext NOT NULL,
  `raised_by` bigint unsigned DEFAULT NULL,
  `raised_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `response_due_date` date DEFAULT NULL,
  `response_text` longtext,
  `responded_at` datetime DEFAULT NULL,
  `responded_by` bigint unsigned DEFAULT NULL,
  `status_code` varchar(30) NOT NULL DEFAULT 'OPEN',
  `reminder_count` int NOT NULL DEFAULT '0',
  `last_reminder_at` datetime DEFAULT NULL,
  `closed_reason` varchar(255) DEFAULT NULL,
  `prior_complaint_status` varchar(80) DEFAULT NULL,
  `prior_case_status` varchar(80) DEFAULT NULL,
  `origin` varchar(20) NOT NULL DEFAULT 'WBC',
  `forwarded_by` bigint unsigned DEFAULT NULL,
  `shared_with_iu_text` longtext,
  `response_forwarded_at` datetime DEFAULT NULL,
  `response_forwarded_by` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`clarification_id`),
  KEY `idx_clarifications_complaint` (`complaint_id`),
  KEY `fk_clarifications_raised_by` (`raised_by`),
  KEY `fk_clarifications_responded_by` (`responded_by`),
  KEY `fk_clarifications_case` (`case_id`),
  KEY `fk_clarifications_forwarded_by` (`forwarded_by`),
  KEY `fk_clarifications_response_forwarded_by` (`response_forwarded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anonymous_responses` (
  `response_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned NOT NULL,
  `clarification_id` bigint unsigned DEFAULT NULL,
  `response_text` longtext NOT NULL,
  `submitted_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`response_id`),
  KEY `fk_anonymous_responses_complaint` (`complaint_id`),
  KEY `fk_anonymous_responses_clarification` (`clarification_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `anonymous_tracking` (
  `tracking_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned NOT NULL,
  `tracking_token` varchar(255) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `failed_attempts` int unsigned NOT NULL DEFAULT '0',
  `locked_until` datetime DEFAULT NULL,
  `last_login_at` datetime DEFAULT NULL,
  `status_code` varchar(30) NOT NULL DEFAULT 'ACTIVE',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tracking_id`),
  UNIQUE KEY `complaint_id` (`complaint_id`),
  UNIQUE KEY `tracking_token` (`tracking_token`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `audit_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `module_name` varchar(100) NOT NULL,
  `table_name` varchar(150) DEFAULT NULL,
  `record_id` varchar(100) DEFAULT NULL,
  `old_value` json DEFAULT NULL,
  `new_value` json DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `device_info` varchar(1000) DEFAULT NULL,
  `screen_name` varchar(200) DEFAULT NULL,
  `action_datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `success_flag` tinyint(1) NOT NULL DEFAULT '1',
  `remarks` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`audit_id`),
  KEY `idx_audit_user_date` (`user_id`,`action_datetime`),
  KEY `idx_audit_record` (`table_name`,`record_id`),
  KEY `idx_audit_module_date` (`module_name`,`action_datetime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `case_assignments` (
  `assignment_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `investigation_officer_id` bigint unsigned DEFAULT NULL,
  `reviewer_id` bigint unsigned DEFAULT NULL,
  `escalation_owner_id` bigint unsigned DEFAULT NULL,
  `assignment_date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `investigation_due_date` date DEFAULT NULL,
  `assignment_remarks` varchar(2000) DEFAULT NULL,
  `assigned_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`assignment_id`),
  KEY `idx_case_assignments_case` (`case_id`),
  KEY `fk_case_assignments_officer` (`investigation_officer_id`),
  KEY `fk_case_assignments_reviewer` (`reviewer_id`),
  KEY `fk_case_assignments_escalation_owner` (`escalation_owner_id`),
  KEY `fk_case_assignments_assigned_by` (`assigned_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `investigations` (
  `investigation_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `investigation_number` varchar(80) DEFAULT NULL,
  `investigation_start_date` date DEFAULT NULL,
  `investigation_completion_date` date DEFAULT NULL,
  `investigation_department_id` bigint unsigned DEFAULT NULL,
  `investigation_officer_id` bigint unsigned DEFAULT NULL,
  `status_id` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`investigation_id`),
  UNIQUE KEY `case_id` (`case_id`),
  UNIQUE KEY `investigation_number` (`investigation_number`),
  KEY `fk_investigations_department` (`investigation_department_id`),
  KEY `fk_investigations_officer` (`investigation_officer_id`),
  KEY `fk_investigations_status` (`status_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `investigation_reports` (
  `report_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `investigation_id` bigint unsigned NOT NULL,
  `report_number` varchar(80) DEFAULT NULL,
  `submission_date` date DEFAULT NULL,
  `findings` longtext,
  `root_cause` longtext,
  `evidence_summary` longtext,
  `recommendation` longtext,
  `conclusion` longtext,
  `classification_id` bigint unsigned DEFAULT NULL,
  `sub_classification_id` bigint unsigned DEFAULT NULL,
  `report_status_id` bigint unsigned DEFAULT NULL,
  `submitted_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `version_no` int NOT NULL DEFAULT '1',
  `clarification_response` longtext,
  PRIMARY KEY (`report_id`),
  UNIQUE KEY `report_number` (`report_number`),
  KEY `idx_investigation_reports_case` (`case_id`),
  KEY `fk_investigation_reports_investigation` (`investigation_id`),
  KEY `fk_investigation_reports_classification` (`classification_id`),
  KEY `fk_investigation_reports_subclassification` (`sub_classification_id`),
  KEY `fk_investigation_reports_status` (`report_status_id`),
  KEY `fk_investigation_reports_submitted_by` (`submitted_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `documents` (
  `document_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned DEFAULT NULL,
  `case_id` bigint unsigned DEFAULT NULL,
  `investigation_report_id` bigint unsigned DEFAULT NULL,
  `document_category_id` bigint unsigned DEFAULT NULL,
  `document_name` varchar(255) NOT NULL,
  `file_name` varchar(255) NOT NULL,
  `file_type` varchar(100) DEFAULT NULL,
  `mime_type` varchar(150) DEFAULT NULL,
  `file_size_bytes` bigint unsigned DEFAULT NULL,
  `storage_provider` varchar(50) NOT NULL DEFAULT 'FILE_SERVER',
  `storage_path` varchar(1000) DEFAULT NULL,
  `storage_reference` varchar(500) DEFAULT NULL,
  `version_no` int unsigned NOT NULL DEFAULT '1',
  `hash_value` char(64) DEFAULT NULL,
  `confidentiality_level` varchar(30) NOT NULL DEFAULT 'RESTRICTED',
  `encryption_status` varchar(30) NOT NULL DEFAULT 'ENCRYPTED',
  `uploaded_by` bigint unsigned DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `retention_expiry_date` date DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `shared_with_iu` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`document_id`),
  KEY `idx_documents_complaint` (`complaint_id`),
  KEY `idx_documents_case` (`case_id`),
  KEY `idx_documents_category` (`document_category_id`),
  KEY `fk_documents_uploaded_by` (`uploaded_by`),
  KEY `idx_documents_hash` (`hash_value`),
  KEY `fk_documents_investigation_report` (`investigation_report_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `case_closures` (
  `closure_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `status_code` varchar(30) NOT NULL,
  `closure_date` date NOT NULL,
  `closure_sent_to_wb_date` date DEFAULT NULL,
  `closed_wbc_meeting_no` varchar(100) DEFAULT NULL,
  `closed_wbc_meeting_date` date DEFAULT NULL,
  `closure_reason` longtext,
  `closure_remarks` longtext,
  `closure_communication_sent` tinyint(1) NOT NULL DEFAULT '0',
  `closure_document_id` bigint unsigned DEFAULT NULL,
  `closed_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`closure_id`),
  UNIQUE KEY `case_id` (`case_id`),
  KEY `fk_case_closures_document` (`closure_document_id`),
  KEY `fk_case_closures_closed_by` (`closed_by`),
  KEY `idx_closure_date` (`closure_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sla_configurations` (
  `sla_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sla_code` varchar(60) NOT NULL,
  `sla_name` varchar(150) NOT NULL,
  `sla_type` varchar(50) NOT NULL,
  `target_days` int unsigned DEFAULT NULL,
  `target_hours` int unsigned DEFAULT NULL,
  `start_event` varchar(100) NOT NULL,
  `escalation_enabled` tinyint(1) NOT NULL DEFAULT '1',
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`sla_id`),
  UNIQUE KEY `sla_code` (`sla_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `case_slas` (
  `case_sla_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `sla_id` bigint unsigned NOT NULL,
  `start_datetime` datetime NOT NULL,
  `due_datetime` datetime NOT NULL,
  `completed_datetime` datetime DEFAULT NULL,
  `current_status` varchar(30) NOT NULL DEFAULT 'OPEN',
  `breach_flag` tinyint(1) NOT NULL DEFAULT '0',
  `breach_datetime` datetime DEFAULT NULL,
  `breach_reason` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`case_sla_id`),
  UNIQUE KEY `uk_case_sla` (`case_id`,`sla_id`),
  KEY `fk_case_slas_sla` (`sla_id`),
  KEY `idx_sla_due_datetime` (`due_datetime`,`breach_flag`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `case_status_history` (
  `history_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `from_status_id` bigint unsigned DEFAULT NULL,
  `to_status_id` bigint unsigned NOT NULL,
  `action_code` varchar(80) NOT NULL,
  `remarks` varchar(2000) DEFAULT NULL,
  `performed_by` bigint unsigned DEFAULT NULL,
  `performed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_case_status_history_case` (`case_id`,`performed_at`),
  KEY `fk_case_status_history_from` (`from_status_id`),
  KEY `fk_case_status_history_to` (`to_status_id`),
  KEY `fk_case_status_history_user` (`performed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `ceto_approvals` (
  `approval_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `approval_status` varchar(30) NOT NULL,
  `approval_date` date DEFAULT NULL,
  `approval_comments` longtext,
  `approved_by` bigint unsigned DEFAULT NULL,
  `next_action` varchar(500) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`approval_id`),
  KEY `idx_ceto_case` (`case_id`),
  KEY `fk_ceto_approved_by` (`approved_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `closure_checklists` (
  `checklist_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `investigation_completed` tinyint(1) NOT NULL DEFAULT '0',
  `wbc_approval_completed` tinyint(1) NOT NULL DEFAULT '0',
  `dac_completed` tinyint(1) NOT NULL DEFAULT '0',
  `documentation_completed` tinyint(1) NOT NULL DEFAULT '0',
  `closure_communication_prepared` tinyint(1) NOT NULL DEFAULT '0',
  `completed_by` bigint unsigned DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `remarks` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`checklist_id`),
  UNIQUE KEY `case_id` (`case_id`),
  KEY `fk_closure_checklist_user` (`completed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complainants` (
  `complainant_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned NOT NULL,
  `employee_name` varchar(200) DEFAULT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `region_id` bigint unsigned DEFAULT NULL,
  `department_id` bigint unsigned DEFAULT NULL,
  `designation_id` bigint unsigned DEFAULT NULL,
  `email_id` varchar(255) DEFAULT NULL,
  `mobile_number` varchar(30) DEFAULT NULL,
  `is_anonymous` tinyint(1) NOT NULL DEFAULT '0',
  `identity_visibility_code` varchar(30) NOT NULL DEFAULT 'RESTRICTED',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`complainant_id`),
  UNIQUE KEY `complaint_id` (`complaint_id`),
  KEY `fk_complainants_branch` (`branch_id`),
  KEY `fk_complainants_region` (`region_id`),
  KEY `fk_complainants_department` (`department_id`),
  KEY `fk_complainants_designation` (`designation_id`),
  KEY `idx_complainants_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complaint_respondents` (
  `respondent_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned NOT NULL,
  `employee_id` varchar(50) DEFAULT NULL,
  `employee_name` varchar(200) DEFAULT NULL,
  `branch_id` bigint unsigned DEFAULT NULL,
  `region_id` bigint unsigned DEFAULT NULL,
  `department_id` bigint unsigned DEFAULT NULL,
  `designation_id` bigint unsigned DEFAULT NULL,
  `remarks` varchar(1000) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`respondent_id`),
  KEY `idx_respondents_complaint` (`complaint_id`),
  KEY `fk_respondents_branch` (`branch_id`),
  KEY `fk_respondents_region` (`region_id`),
  KEY `fk_respondents_department` (`department_id`),
  KEY `fk_respondents_designation` (`designation_id`),
  KEY `idx_respondents_employee` (`employee_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `complaint_status_history` (
  `history_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned NOT NULL,
  `from_status_id` bigint unsigned DEFAULT NULL,
  `to_status_id` bigint unsigned NOT NULL,
  `action_code` varchar(80) NOT NULL,
  `remarks` varchar(2000) DEFAULT NULL,
  `performed_by` bigint unsigned DEFAULT NULL,
  `performed_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`history_id`),
  KEY `idx_complaint_status_history_complaint` (`complaint_id`,`performed_at`),
  KEY `fk_complaint_status_history_from` (`from_status_id`),
  KEY `fk_complaint_status_history_to` (`to_status_id`),
  KEY `fk_complaint_status_history_user` (`performed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dac_cases` (
  `dac_case_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dac_reference_no` varchar(100) NOT NULL,
  `complaint_id` bigint unsigned NOT NULL,
  `case_id` bigint unsigned NOT NULL,
  `chairperson_id` bigint unsigned DEFAULT NULL,
  `dac_owner_id` bigint unsigned DEFAULT NULL,
  `status_id` bigint unsigned DEFAULT NULL,
  `created_date` date NOT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dac_case_id`),
  UNIQUE KEY `dac_reference_no` (`dac_reference_no`),
  KEY `idx_dac_case` (`case_id`),
  KEY `fk_dac_case_complaint` (`complaint_id`),
  KEY `fk_dac_case_chairperson` (`chairperson_id`),
  KEY `fk_dac_case_owner` (`dac_owner_id`),
  KEY `fk_dac_case_status` (`status_id`),
  KEY `fk_dac_case_created_by` (`created_by`),
  KEY `idx_dac_created_date` (`created_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dac_conflict_checks` (
  `conflict_check_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dac_case_id` bigint unsigned NOT NULL,
  `member_id` bigint unsigned NOT NULL,
  `conflict_identified` tinyint(1) NOT NULL DEFAULT '0',
  `declaration_confirmed` tinyint(1) NOT NULL DEFAULT '0',
  `remarks` varchar(2000) DEFAULT NULL,
  `replacement_member_id` bigint unsigned DEFAULT NULL,
  `checked_date` date NOT NULL,
  `checked_by` bigint unsigned DEFAULT NULL,
  PRIMARY KEY (`conflict_check_id`),
  KEY `fk_dac_conflict_case` (`dac_case_id`),
  KEY `fk_dac_conflict_member` (`member_id`),
  KEY `fk_dac_conflict_replacement` (`replacement_member_id`),
  KEY `fk_dac_conflict_checked_by` (`checked_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dac_decisions` (
  `dac_decision_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dac_case_id` bigint unsigned NOT NULL,
  `hearing_date` date DEFAULT NULL,
  `decision_date` date NOT NULL,
  `outcome_id` bigint unsigned DEFAULT NULL,
  `recommended_action` longtext,
  `penalty_details` longtext,
  `decision_notes` longtext,
  `decision_document_id` bigint unsigned DEFAULT NULL,
  `next_action` varchar(500) DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`dac_decision_id`),
  KEY `fk_dac_decision_case` (`dac_case_id`),
  KEY `fk_dac_decision_outcome` (`outcome_id`),
  KEY `fk_dac_decision_document` (`decision_document_id`),
  KEY `fk_dac_decision_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `dac_members` (
  `dac_member_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dac_case_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `member_role` varchar(100) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`dac_member_id`),
  UNIQUE KEY `uk_dac_member` (`dac_case_id`,`user_id`),
  KEY `fk_dac_members_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `document_versions` (
  `version_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `document_id` bigint unsigned NOT NULL,
  `version_no` int unsigned NOT NULL,
  `storage_path` varchar(1000) DEFAULT NULL,
  `storage_reference` varchar(500) DEFAULT NULL,
  `file_size_bytes` bigint unsigned DEFAULT NULL,
  `hash_value` char(64) DEFAULT NULL,
  `uploaded_by` bigint unsigned DEFAULT NULL,
  `uploaded_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `remarks` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`version_id`),
  UNIQUE KEY `uk_document_version` (`document_id`,`version_no`),
  KEY `fk_document_versions_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `entity_views` (
  `user_id` bigint unsigned NOT NULL,
  `entity_type` enum('COMPLAINT','CASE') NOT NULL,
  `entity_id` bigint unsigned NOT NULL,
  `last_viewed_at` datetime NOT NULL,
  PRIMARY KEY (`user_id`,`entity_type`,`entity_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `roles` (
  `role_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_code` varchar(50) NOT NULL,
  `role_name` varchar(150) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_id`),
  UNIQUE KEY `role_code` (`role_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `escalation_matrix` (
  `escalation_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `sla_id` bigint unsigned NOT NULL,
  `escalation_level` int unsigned NOT NULL,
  `escalation_role_id` bigint unsigned DEFAULT NULL,
  `escalation_user_id` bigint unsigned DEFAULT NULL,
  `trigger_before_hours` int DEFAULT NULL,
  `notification_template_id` bigint unsigned DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  PRIMARY KEY (`escalation_id`),
  UNIQUE KEY `uk_escalation_level` (`sla_id`,`escalation_level`),
  KEY `fk_escalation_role` (`escalation_role_id`),
  KEY `fk_escalation_user` (`escalation_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `evidence` (
  `evidence_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `case_id` bigint unsigned NOT NULL,
  `document_id` bigint unsigned DEFAULT NULL,
  `evidence_type_id` bigint unsigned DEFAULT NULL,
  `evidence_category_id` bigint unsigned DEFAULT NULL,
  `description` longtext,
  `collected_date` date DEFAULT NULL,
  `collected_by` bigint unsigned DEFAULT NULL,
  `uploaded_by` bigint unsigned DEFAULT NULL,
  `upload_datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `confidentiality_level` varchar(30) NOT NULL DEFAULT 'RESTRICTED',
  `remarks` varchar(2000) DEFAULT NULL,
  PRIMARY KEY (`evidence_id`),
  KEY `idx_evidence_case` (`case_id`),
  KEY `fk_evidence_document` (`document_id`),
  KEY `fk_evidence_type` (`evidence_type_id`),
  KEY `fk_evidence_category` (`evidence_category_id`),
  KEY `fk_evidence_collected_by` (`collected_by`),
  KEY `fk_evidence_uploaded_by` (`uploaded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `investigation_clarifications` (
  `investigation_clarification_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `investigation_report_id` bigint unsigned NOT NULL,
  `clarification_required` tinyint(1) NOT NULL DEFAULT '0',
  `clarification_details` longtext,
  `raised_date` date DEFAULT NULL,
  `response_due_date` date DEFAULT NULL,
  `investigator_response` longtext,
  `response_date` date DEFAULT NULL,
  `raised_by` bigint unsigned DEFAULT NULL,
  `responded_by` bigint unsigned DEFAULT NULL,
  `status_code` varchar(30) NOT NULL DEFAULT 'OPEN',
  PRIMARY KEY (`investigation_clarification_id`),
  KEY `fk_inv_clarification_report` (`investigation_report_id`),
  KEY `fk_inv_clarification_raised_by` (`raised_by`),
  KEY `fk_inv_clarification_responded_by` (`responded_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `login_history` (
  `login_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned DEFAULT NULL,
  `login_type` varchar(50) NOT NULL,
  `login_datetime` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `logout_datetime` datetime DEFAULT NULL,
  `ip_address` varchar(45) DEFAULT NULL,
  `device_info` varchar(1000) DEFAULT NULL,
  `login_status` varchar(30) NOT NULL,
  `failure_reason` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`login_id`),
  KEY `idx_login_user_date` (`user_id`,`login_datetime`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_templates` (
  `template_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `template_code` varchar(80) NOT NULL,
  `template_type` varchar(50) NOT NULL,
  `template_name` varchar(150) NOT NULL,
  `subject` varchar(500) DEFAULT NULL,
  `template_body` longtext NOT NULL,
  `merge_fields` json DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`template_id`),
  UNIQUE KEY `template_code` (`template_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notification_history` (
  `notification_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `complaint_id` bigint unsigned DEFAULT NULL,
  `case_id` bigint unsigned DEFAULT NULL,
  `template_id` bigint unsigned DEFAULT NULL,
  `notification_type` varchar(50) NOT NULL,
  `recipient` varchar(500) NOT NULL,
  `cc_recipient` varchar(1000) DEFAULT NULL,
  `bcc_recipient` varchar(1000) DEFAULT NULL,
  `subject` varchar(500) DEFAULT NULL,
  `sent_datetime` datetime DEFAULT NULL,
  `delivery_status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `failure_reason` varchar(2000) DEFAULT NULL,
  `message` text,
  `read_at` datetime DEFAULT NULL,
  PRIMARY KEY (`notification_id`),
  KEY `idx_notification_case` (`case_id`),
  KEY `idx_notification_complaint` (`complaint_id`),
  KEY `fk_notification_template` (`template_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `permission_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `module_name` varchar(100) NOT NULL,
  `permission_code` varchar(100) NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`permission_id`),
  UNIQUE KEY `permission_code` (`permission_code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `show_cause_notices` (
  `scn_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `dac_case_id` bigint unsigned NOT NULL,
  `notice_number` varchar(100) NOT NULL,
  `notice_date` date NOT NULL,
  `respondent_id` bigint unsigned DEFAULT NULL,
  `notice_content` longtext,
  `template_id` bigint unsigned DEFAULT NULL,
  `submission_due_date` date DEFAULT NULL,
  `document_id` bigint unsigned DEFAULT NULL,
  `dispatch_status` varchar(30) NOT NULL DEFAULT 'PENDING',
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`scn_id`),
  UNIQUE KEY `notice_number` (`notice_number`),
  KEY `fk_scn_dac_case` (`dac_case_id`),
  KEY `fk_scn_respondent` (`respondent_id`),
  KEY `fk_scn_document` (`document_id`),
  KEY `fk_scn_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `respondent_submissions` (
  `submission_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `scn_id` bigint unsigned NOT NULL,
  `respondent_id` bigint unsigned DEFAULT NULL,
  `submission_date` date NOT NULL,
  `response_text` longtext,
  `response_document_id` bigint unsigned DEFAULT NULL,
  `received_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`submission_id`),
  KEY `fk_respondent_submission_scn` (`scn_id`),
  KEY `fk_respondent_submission_respondent` (`respondent_id`),
  KEY `fk_respondent_submission_document` (`response_document_id`),
  KEY `fk_respondent_submission_received_by` (`received_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_permission_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `role_id` bigint unsigned NOT NULL,
  `permission_id` bigint unsigned NOT NULL,
  `can_create` tinyint(1) NOT NULL DEFAULT '0',
  `can_view` tinyint(1) NOT NULL DEFAULT '0',
  `can_edit` tinyint(1) NOT NULL DEFAULT '0',
  `can_delete` tinyint(1) NOT NULL DEFAULT '0',
  `can_approve` tinyint(1) NOT NULL DEFAULT '0',
  `can_export` tinyint(1) NOT NULL DEFAULT '0',
  `can_download` tinyint(1) NOT NULL DEFAULT '0',
  `can_view_identity` tinyint(1) NOT NULL DEFAULT '0',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`role_permission_id`),
  UNIQUE KEY `uk_role_permission` (`role_id`,`permission_id`),
  KEY `fk_role_permissions_permission` (`permission_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `saml_settings` (
  `id` tinyint unsigned NOT NULL DEFAULT '1',
  `is_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `idp_metadata_url` varchar(1000) DEFAULT NULL,
  `idp_sign_on_url` varchar(1000) DEFAULT NULL,
  `idp_entity_id` varchar(500) DEFAULT NULL,
  `idp_signing_certs` json DEFAULT NULL,
  `mappings` json DEFAULT NULL,
  `allowed_email_domains` varchar(1000) DEFAULT NULL,
  `saml_binding` enum('POST','REDIRECT') NOT NULL DEFAULT 'POST',
  `allow_unsolicited` tinyint(1) NOT NULL DEFAULT '1',
  `sign_authn_request` tinyint(1) NOT NULL DEFAULT '0',
  `want_assertion_signed` tinyint(1) NOT NULL DEFAULT '1',
  `want_response_signed` tinyint(1) NOT NULL DEFAULT '0',
  `force_authn` tinyint(1) NOT NULL DEFAULT '0',
  `keep_local_password_login` tinyint(1) NOT NULL DEFAULT '1',
  `sp_certificate` text,
  `sp_private_key_encrypted` text,
  `updated_by` bigint unsigned DEFAULT NULL,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `fk_saml_settings_updated_by` (`updated_by`),
  CONSTRAINT `chk_saml_settings_singleton` CHECK ((`id` = 1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_roles` (
  `user_role_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `user_id` bigint unsigned NOT NULL,
  `role_id` bigint unsigned NOT NULL,
  `effective_from` date DEFAULT NULL,
  `effective_to` date DEFAULT NULL,
  `active_flag` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_role_id`),
  UNIQUE KEY `uk_user_role` (`user_id`,`role_id`),
  KEY `fk_user_roles_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wbc_meetings` (
  `meeting_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `meeting_no` varchar(80) NOT NULL,
  `case_id` bigint unsigned NOT NULL,
  `meeting_date` date NOT NULL,
  `agenda` longtext,
  `decision_summary` longtext,
  `minutes_document_id` bigint unsigned DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`meeting_id`),
  UNIQUE KEY `meeting_no` (`meeting_no`),
  KEY `idx_wbc_meeting_case` (`case_id`),
  KEY `fk_wbc_meeting_minutes_document` (`minutes_document_id`),
  KEY `fk_wbc_meeting_created_by` (`created_by`),
  KEY `idx_wbc_meetings_date` (`meeting_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wbc_decisions` (
  `wbc_decision_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `meeting_id` bigint unsigned NOT NULL,
  `case_id` bigint unsigned NOT NULL,
  `action_taken` longtext,
  `dac_reference_no` varchar(100) DEFAULT NULL,
  `recommendation_type_id` bigint unsigned DEFAULT NULL,
  `decision_date` date NOT NULL,
  `decision_remarks` longtext,
  `next_workflow_owner_id` bigint unsigned DEFAULT NULL,
  `decision_document_id` bigint unsigned DEFAULT NULL,
  `created_by` bigint unsigned DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`wbc_decision_id`),
  KEY `fk_wbc_decision_meeting` (`meeting_id`),
  KEY `fk_wbc_decision_case` (`case_id`),
  KEY `fk_wbc_decision_recommendation` (`recommendation_type_id`),
  KEY `fk_wbc_decision_owner` (`next_workflow_owner_id`),
  KEY `fk_wbc_decision_document` (`decision_document_id`),
  KEY `fk_wbc_decision_created_by` (`created_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `wbc_meeting_members` (
  `meeting_member_id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `meeting_id` bigint unsigned NOT NULL,
  `user_id` bigint unsigned NOT NULL,
  `member_role` varchar(100) DEFAULT NULL,
  `attendance_status` varchar(30) NOT NULL DEFAULT 'PRESENT',
  `remarks` varchar(1000) DEFAULT NULL,
  PRIMARY KEY (`meeting_member_id`),
  UNIQUE KEY `uk_wbc_member` (`meeting_id`,`user_id`),
  KEY `fk_wbc_members_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ===== Step 3: Indexes, audit columns, foreign keys =====
-- Indexes / unique keys are declared inline in each CREATE TABLE above.
-- 3a. created_at / updated_at on every table that lacks them
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND column_name = 'created_at') = 0, 'ALTER TABLE `complaint_clarifications` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND column_name = 'updated_at') = 0, 'ALTER TABLE `complaint_clarifications` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'anonymous_responses' AND column_name = 'created_at') = 0, 'ALTER TABLE `anonymous_responses` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'anonymous_responses' AND column_name = 'updated_at') = 0, 'ALTER TABLE `anonymous_responses` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_logs' AND column_name = 'created_at') = 0, 'ALTER TABLE `audit_logs` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'audit_logs' AND column_name = 'updated_at') = 0, 'ALTER TABLE `audit_logs` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'case_assignments' AND column_name = 'updated_at') = 0, 'ALTER TABLE `case_assignments` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documents' AND column_name = 'created_at') = 0, 'ALTER TABLE `documents` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'documents' AND column_name = 'updated_at') = 0, 'ALTER TABLE `documents` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'case_closures' AND column_name = 'updated_at') = 0, 'ALTER TABLE `case_closures` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'sla_configurations' AND column_name = 'updated_at') = 0, 'ALTER TABLE `sla_configurations` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'case_slas' AND column_name = 'created_at') = 0, 'ALTER TABLE `case_slas` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'case_slas' AND column_name = 'updated_at') = 0, 'ALTER TABLE `case_slas` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'case_status_history' AND column_name = 'created_at') = 0, 'ALTER TABLE `case_status_history` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'case_status_history' AND column_name = 'updated_at') = 0, 'ALTER TABLE `case_status_history` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'ceto_approvals' AND column_name = 'updated_at') = 0, 'ALTER TABLE `ceto_approvals` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'closure_checklists' AND column_name = 'created_at') = 0, 'ALTER TABLE `closure_checklists` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'closure_checklists' AND column_name = 'updated_at') = 0, 'ALTER TABLE `closure_checklists` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'complaint_status_history' AND column_name = 'created_at') = 0, 'ALTER TABLE `complaint_status_history` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'complaint_status_history' AND column_name = 'updated_at') = 0, 'ALTER TABLE `complaint_status_history` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND column_name = 'updated_at') = 0, 'ALTER TABLE `dac_cases` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'dac_conflict_checks' AND column_name = 'created_at') = 0, 'ALTER TABLE `dac_conflict_checks` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'dac_conflict_checks' AND column_name = 'updated_at') = 0, 'ALTER TABLE `dac_conflict_checks` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'dac_decisions' AND column_name = 'updated_at') = 0, 'ALTER TABLE `dac_decisions` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'dac_members' AND column_name = 'created_at') = 0, 'ALTER TABLE `dac_members` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'dac_members' AND column_name = 'updated_at') = 0, 'ALTER TABLE `dac_members` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'document_versions' AND column_name = 'created_at') = 0, 'ALTER TABLE `document_versions` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'document_versions' AND column_name = 'updated_at') = 0, 'ALTER TABLE `document_versions` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'entity_views' AND column_name = 'created_at') = 0, 'ALTER TABLE `entity_views` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'entity_views' AND column_name = 'updated_at') = 0, 'ALTER TABLE `entity_views` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'escalation_matrix' AND column_name = 'created_at') = 0, 'ALTER TABLE `escalation_matrix` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'escalation_matrix' AND column_name = 'updated_at') = 0, 'ALTER TABLE `escalation_matrix` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'evidence' AND column_name = 'created_at') = 0, 'ALTER TABLE `evidence` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'evidence' AND column_name = 'updated_at') = 0, 'ALTER TABLE `evidence` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'investigation_clarifications' AND column_name = 'created_at') = 0, 'ALTER TABLE `investigation_clarifications` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'investigation_clarifications' AND column_name = 'updated_at') = 0, 'ALTER TABLE `investigation_clarifications` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'login_history' AND column_name = 'created_at') = 0, 'ALTER TABLE `login_history` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'login_history' AND column_name = 'updated_at') = 0, 'ALTER TABLE `login_history` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_history' AND column_name = 'created_at') = 0, 'ALTER TABLE `notification_history` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notification_history' AND column_name = 'updated_at') = 0, 'ALTER TABLE `notification_history` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'permissions' AND column_name = 'updated_at') = 0, 'ALTER TABLE `permissions` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'show_cause_notices' AND column_name = 'updated_at') = 0, 'ALTER TABLE `show_cause_notices` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'respondent_submissions' AND column_name = 'updated_at') = 0, 'ALTER TABLE `respondent_submissions` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'role_permissions' AND column_name = 'updated_at') = 0, 'ALTER TABLE `role_permissions` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'user_roles' AND column_name = 'updated_at') = 0, 'ALTER TABLE `user_roles` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'wbc_meetings' AND column_name = 'updated_at') = 0, 'ALTER TABLE `wbc_meetings` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND column_name = 'updated_at') = 0, 'ALTER TABLE `wbc_decisions` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'wbc_meeting_members' AND column_name = 'created_at') = 0, 'ALTER TABLE `wbc_meeting_members` ADD COLUMN `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'wbc_meeting_members' AND column_name = 'updated_at') = 0, 'ALTER TABLE `wbc_meeting_members` ADD COLUMN `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- 3b. Foreign keys (added only when missing)
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'master_values' AND constraint_name = 'fk_master_values_parent') = 0, 'ALTER TABLE `master_values` ADD CONSTRAINT `fk_master_values_parent` FOREIGN KEY (`parent_value_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'master_values' AND constraint_name = 'fk_master_values_type') = 0, 'ALTER TABLE `master_values` ADD CONSTRAINT `fk_master_values_type` FOREIGN KEY (`master_type_id`) REFERENCES `master_types` (`master_type_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'branches' AND constraint_name = 'fk_branches_region') = 0, 'ALTER TABLE `branches` ADD CONSTRAINT `fk_branches_region` FOREIGN KEY (`region_id`) REFERENCES `regions` (`region_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_branch') = 0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_department') = 0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_designation') = 0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_designation` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`designation_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'users' AND constraint_name = 'fk_users_region') = 0, 'ALTER TABLE `users` ADD CONSTRAINT `fk_users_region` FOREIGN KEY (`region_id`) REFERENCES `regions` (`region_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_addressed_to') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_addressed_to` FOREIGN KEY (`addressed_to_master_value_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_anonymity') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_anonymity` FOREIGN KEY (`anonymity_type_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_channel') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_channel` FOREIGN KEY (`channel_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_classification') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_classification` FOREIGN KEY (`complaint_classification_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_complainant_type') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_complainant_type` FOREIGN KEY (`complainant_type_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_created_by') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_language') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_language` FOREIGN KEY (`complaint_language_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_nature') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_nature` FOREIGN KEY (`complaint_nature_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_severity') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_severity` FOREIGN KEY (`severity_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_status') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_status` FOREIGN KEY (`current_status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_subclassification') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_subclassification` FOREIGN KEY (`complaint_sub_classification_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_updated_by') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaints' AND constraint_name = 'fk_complaints_wbc_owner') = 0, 'ALTER TABLE `complaints` ADD CONSTRAINT `fk_complaints_wbc_owner` FOREIGN KEY (`wbc_owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_complaint') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_created_by') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_officer') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_officer` FOREIGN KEY (`investigation_officer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_priority') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_priority` FOREIGN KEY (`priority_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_risk') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_risk` FOREIGN KEY (`risk_category_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_status') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_status` FOREIGN KEY (`status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_type') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_type` FOREIGN KEY (`case_type_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_unit') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_unit` FOREIGN KEY (`investigation_unit_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'cases' AND constraint_name = 'fk_cases_updated_by') = 0, 'ALTER TABLE `cases` ADD CONSTRAINT `fk_cases_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND constraint_name = 'fk_clarifications_case') = 0, 'ALTER TABLE `complaint_clarifications` ADD CONSTRAINT `fk_clarifications_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND constraint_name = 'fk_clarifications_complaint') = 0, 'ALTER TABLE `complaint_clarifications` ADD CONSTRAINT `fk_clarifications_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND constraint_name = 'fk_clarifications_forwarded_by') = 0, 'ALTER TABLE `complaint_clarifications` ADD CONSTRAINT `fk_clarifications_forwarded_by` FOREIGN KEY (`forwarded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND constraint_name = 'fk_clarifications_raised_by') = 0, 'ALTER TABLE `complaint_clarifications` ADD CONSTRAINT `fk_clarifications_raised_by` FOREIGN KEY (`raised_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND constraint_name = 'fk_clarifications_responded_by') = 0, 'ALTER TABLE `complaint_clarifications` ADD CONSTRAINT `fk_clarifications_responded_by` FOREIGN KEY (`responded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_clarifications' AND constraint_name = 'fk_clarifications_response_forwarded_by') = 0, 'ALTER TABLE `complaint_clarifications` ADD CONSTRAINT `fk_clarifications_response_forwarded_by` FOREIGN KEY (`response_forwarded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'anonymous_responses' AND constraint_name = 'fk_anonymous_responses_clarification') = 0, 'ALTER TABLE `anonymous_responses` ADD CONSTRAINT `fk_anonymous_responses_clarification` FOREIGN KEY (`clarification_id`) REFERENCES `complaint_clarifications` (`clarification_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'anonymous_responses' AND constraint_name = 'fk_anonymous_responses_complaint') = 0, 'ALTER TABLE `anonymous_responses` ADD CONSTRAINT `fk_anonymous_responses_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'anonymous_tracking' AND constraint_name = 'fk_anonymous_tracking_complaint') = 0, 'ALTER TABLE `anonymous_tracking` ADD CONSTRAINT `fk_anonymous_tracking_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'audit_logs' AND constraint_name = 'fk_audit_user') = 0, 'ALTER TABLE `audit_logs` ADD CONSTRAINT `fk_audit_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_assignments' AND constraint_name = 'fk_case_assignments_assigned_by') = 0, 'ALTER TABLE `case_assignments` ADD CONSTRAINT `fk_case_assignments_assigned_by` FOREIGN KEY (`assigned_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_assignments' AND constraint_name = 'fk_case_assignments_case') = 0, 'ALTER TABLE `case_assignments` ADD CONSTRAINT `fk_case_assignments_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_assignments' AND constraint_name = 'fk_case_assignments_escalation_owner') = 0, 'ALTER TABLE `case_assignments` ADD CONSTRAINT `fk_case_assignments_escalation_owner` FOREIGN KEY (`escalation_owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_assignments' AND constraint_name = 'fk_case_assignments_officer') = 0, 'ALTER TABLE `case_assignments` ADD CONSTRAINT `fk_case_assignments_officer` FOREIGN KEY (`investigation_officer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_assignments' AND constraint_name = 'fk_case_assignments_reviewer') = 0, 'ALTER TABLE `case_assignments` ADD CONSTRAINT `fk_case_assignments_reviewer` FOREIGN KEY (`reviewer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigations' AND constraint_name = 'fk_investigations_case') = 0, 'ALTER TABLE `investigations` ADD CONSTRAINT `fk_investigations_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigations' AND constraint_name = 'fk_investigations_department') = 0, 'ALTER TABLE `investigations` ADD CONSTRAINT `fk_investigations_department` FOREIGN KEY (`investigation_department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigations' AND constraint_name = 'fk_investigations_officer') = 0, 'ALTER TABLE `investigations` ADD CONSTRAINT `fk_investigations_officer` FOREIGN KEY (`investigation_officer_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigations' AND constraint_name = 'fk_investigations_status') = 0, 'ALTER TABLE `investigations` ADD CONSTRAINT `fk_investigations_status` FOREIGN KEY (`status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_reports' AND constraint_name = 'fk_investigation_reports_case') = 0, 'ALTER TABLE `investigation_reports` ADD CONSTRAINT `fk_investigation_reports_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_reports' AND constraint_name = 'fk_investigation_reports_classification') = 0, 'ALTER TABLE `investigation_reports` ADD CONSTRAINT `fk_investigation_reports_classification` FOREIGN KEY (`classification_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_reports' AND constraint_name = 'fk_investigation_reports_investigation') = 0, 'ALTER TABLE `investigation_reports` ADD CONSTRAINT `fk_investigation_reports_investigation` FOREIGN KEY (`investigation_id`) REFERENCES `investigations` (`investigation_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_reports' AND constraint_name = 'fk_investigation_reports_status') = 0, 'ALTER TABLE `investigation_reports` ADD CONSTRAINT `fk_investigation_reports_status` FOREIGN KEY (`report_status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_reports' AND constraint_name = 'fk_investigation_reports_subclassification') = 0, 'ALTER TABLE `investigation_reports` ADD CONSTRAINT `fk_investigation_reports_subclassification` FOREIGN KEY (`sub_classification_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_reports' AND constraint_name = 'fk_investigation_reports_submitted_by') = 0, 'ALTER TABLE `investigation_reports` ADD CONSTRAINT `fk_investigation_reports_submitted_by` FOREIGN KEY (`submitted_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documents' AND constraint_name = 'fk_documents_case') = 0, 'ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documents' AND constraint_name = 'fk_documents_category') = 0, 'ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_category` FOREIGN KEY (`document_category_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documents' AND constraint_name = 'fk_documents_complaint') = 0, 'ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documents' AND constraint_name = 'fk_documents_investigation_report') = 0, 'ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_investigation_report` FOREIGN KEY (`investigation_report_id`) REFERENCES `investigation_reports` (`report_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'documents' AND constraint_name = 'fk_documents_uploaded_by') = 0, 'ALTER TABLE `documents` ADD CONSTRAINT `fk_documents_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_closures' AND constraint_name = 'fk_case_closures_case') = 0, 'ALTER TABLE `case_closures` ADD CONSTRAINT `fk_case_closures_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_closures' AND constraint_name = 'fk_case_closures_closed_by') = 0, 'ALTER TABLE `case_closures` ADD CONSTRAINT `fk_case_closures_closed_by` FOREIGN KEY (`closed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_closures' AND constraint_name = 'fk_case_closures_document') = 0, 'ALTER TABLE `case_closures` ADD CONSTRAINT `fk_case_closures_document` FOREIGN KEY (`closure_document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_slas' AND constraint_name = 'fk_case_slas_case') = 0, 'ALTER TABLE `case_slas` ADD CONSTRAINT `fk_case_slas_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_slas' AND constraint_name = 'fk_case_slas_sla') = 0, 'ALTER TABLE `case_slas` ADD CONSTRAINT `fk_case_slas_sla` FOREIGN KEY (`sla_id`) REFERENCES `sla_configurations` (`sla_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_status_history' AND constraint_name = 'fk_case_status_history_case') = 0, 'ALTER TABLE `case_status_history` ADD CONSTRAINT `fk_case_status_history_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_status_history' AND constraint_name = 'fk_case_status_history_from') = 0, 'ALTER TABLE `case_status_history` ADD CONSTRAINT `fk_case_status_history_from` FOREIGN KEY (`from_status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_status_history' AND constraint_name = 'fk_case_status_history_to') = 0, 'ALTER TABLE `case_status_history` ADD CONSTRAINT `fk_case_status_history_to` FOREIGN KEY (`to_status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'case_status_history' AND constraint_name = 'fk_case_status_history_user') = 0, 'ALTER TABLE `case_status_history` ADD CONSTRAINT `fk_case_status_history_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ceto_approvals' AND constraint_name = 'fk_ceto_approved_by') = 0, 'ALTER TABLE `ceto_approvals` ADD CONSTRAINT `fk_ceto_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'ceto_approvals' AND constraint_name = 'fk_ceto_case') = 0, 'ALTER TABLE `ceto_approvals` ADD CONSTRAINT `fk_ceto_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'closure_checklists' AND constraint_name = 'fk_closure_checklist_case') = 0, 'ALTER TABLE `closure_checklists` ADD CONSTRAINT `fk_closure_checklist_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'closure_checklists' AND constraint_name = 'fk_closure_checklist_user') = 0, 'ALTER TABLE `closure_checklists` ADD CONSTRAINT `fk_closure_checklist_user` FOREIGN KEY (`completed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complainants' AND constraint_name = 'fk_complainants_branch') = 0, 'ALTER TABLE `complainants` ADD CONSTRAINT `fk_complainants_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complainants' AND constraint_name = 'fk_complainants_complaint') = 0, 'ALTER TABLE `complainants` ADD CONSTRAINT `fk_complainants_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complainants' AND constraint_name = 'fk_complainants_department') = 0, 'ALTER TABLE `complainants` ADD CONSTRAINT `fk_complainants_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complainants' AND constraint_name = 'fk_complainants_designation') = 0, 'ALTER TABLE `complainants` ADD CONSTRAINT `fk_complainants_designation` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`designation_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complainants' AND constraint_name = 'fk_complainants_region') = 0, 'ALTER TABLE `complainants` ADD CONSTRAINT `fk_complainants_region` FOREIGN KEY (`region_id`) REFERENCES `regions` (`region_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_respondents' AND constraint_name = 'fk_respondents_branch') = 0, 'ALTER TABLE `complaint_respondents` ADD CONSTRAINT `fk_respondents_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`branch_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_respondents' AND constraint_name = 'fk_respondents_complaint') = 0, 'ALTER TABLE `complaint_respondents` ADD CONSTRAINT `fk_respondents_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_respondents' AND constraint_name = 'fk_respondents_department') = 0, 'ALTER TABLE `complaint_respondents` ADD CONSTRAINT `fk_respondents_department` FOREIGN KEY (`department_id`) REFERENCES `departments` (`department_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_respondents' AND constraint_name = 'fk_respondents_designation') = 0, 'ALTER TABLE `complaint_respondents` ADD CONSTRAINT `fk_respondents_designation` FOREIGN KEY (`designation_id`) REFERENCES `designations` (`designation_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_respondents' AND constraint_name = 'fk_respondents_region') = 0, 'ALTER TABLE `complaint_respondents` ADD CONSTRAINT `fk_respondents_region` FOREIGN KEY (`region_id`) REFERENCES `regions` (`region_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_status_history' AND constraint_name = 'fk_complaint_status_history_complaint') = 0, 'ALTER TABLE `complaint_status_history` ADD CONSTRAINT `fk_complaint_status_history_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_status_history' AND constraint_name = 'fk_complaint_status_history_from') = 0, 'ALTER TABLE `complaint_status_history` ADD CONSTRAINT `fk_complaint_status_history_from` FOREIGN KEY (`from_status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_status_history' AND constraint_name = 'fk_complaint_status_history_to') = 0, 'ALTER TABLE `complaint_status_history` ADD CONSTRAINT `fk_complaint_status_history_to` FOREIGN KEY (`to_status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'complaint_status_history' AND constraint_name = 'fk_complaint_status_history_user') = 0, 'ALTER TABLE `complaint_status_history` ADD CONSTRAINT `fk_complaint_status_history_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND constraint_name = 'fk_dac_case_case') = 0, 'ALTER TABLE `dac_cases` ADD CONSTRAINT `fk_dac_case_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND constraint_name = 'fk_dac_case_chairperson') = 0, 'ALTER TABLE `dac_cases` ADD CONSTRAINT `fk_dac_case_chairperson` FOREIGN KEY (`chairperson_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND constraint_name = 'fk_dac_case_complaint') = 0, 'ALTER TABLE `dac_cases` ADD CONSTRAINT `fk_dac_case_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND constraint_name = 'fk_dac_case_created_by') = 0, 'ALTER TABLE `dac_cases` ADD CONSTRAINT `fk_dac_case_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND constraint_name = 'fk_dac_case_owner') = 0, 'ALTER TABLE `dac_cases` ADD CONSTRAINT `fk_dac_case_owner` FOREIGN KEY (`dac_owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_cases' AND constraint_name = 'fk_dac_case_status') = 0, 'ALTER TABLE `dac_cases` ADD CONSTRAINT `fk_dac_case_status` FOREIGN KEY (`status_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_conflict_checks' AND constraint_name = 'fk_dac_conflict_case') = 0, 'ALTER TABLE `dac_conflict_checks` ADD CONSTRAINT `fk_dac_conflict_case` FOREIGN KEY (`dac_case_id`) REFERENCES `dac_cases` (`dac_case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_conflict_checks' AND constraint_name = 'fk_dac_conflict_checked_by') = 0, 'ALTER TABLE `dac_conflict_checks` ADD CONSTRAINT `fk_dac_conflict_checked_by` FOREIGN KEY (`checked_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_conflict_checks' AND constraint_name = 'fk_dac_conflict_member') = 0, 'ALTER TABLE `dac_conflict_checks` ADD CONSTRAINT `fk_dac_conflict_member` FOREIGN KEY (`member_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_conflict_checks' AND constraint_name = 'fk_dac_conflict_replacement') = 0, 'ALTER TABLE `dac_conflict_checks` ADD CONSTRAINT `fk_dac_conflict_replacement` FOREIGN KEY (`replacement_member_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_decisions' AND constraint_name = 'fk_dac_decision_case') = 0, 'ALTER TABLE `dac_decisions` ADD CONSTRAINT `fk_dac_decision_case` FOREIGN KEY (`dac_case_id`) REFERENCES `dac_cases` (`dac_case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_decisions' AND constraint_name = 'fk_dac_decision_created_by') = 0, 'ALTER TABLE `dac_decisions` ADD CONSTRAINT `fk_dac_decision_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_decisions' AND constraint_name = 'fk_dac_decision_document') = 0, 'ALTER TABLE `dac_decisions` ADD CONSTRAINT `fk_dac_decision_document` FOREIGN KEY (`decision_document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_decisions' AND constraint_name = 'fk_dac_decision_outcome') = 0, 'ALTER TABLE `dac_decisions` ADD CONSTRAINT `fk_dac_decision_outcome` FOREIGN KEY (`outcome_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_members' AND constraint_name = 'fk_dac_members_case') = 0, 'ALTER TABLE `dac_members` ADD CONSTRAINT `fk_dac_members_case` FOREIGN KEY (`dac_case_id`) REFERENCES `dac_cases` (`dac_case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'dac_members' AND constraint_name = 'fk_dac_members_user') = 0, 'ALTER TABLE `dac_members` ADD CONSTRAINT `fk_dac_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'document_versions' AND constraint_name = 'fk_document_versions_document') = 0, 'ALTER TABLE `document_versions` ADD CONSTRAINT `fk_document_versions_document` FOREIGN KEY (`document_id`) REFERENCES `documents` (`document_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'document_versions' AND constraint_name = 'fk_document_versions_uploaded_by') = 0, 'ALTER TABLE `document_versions` ADD CONSTRAINT `fk_document_versions_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'entity_views' AND constraint_name = 'fk_entity_views_user') = 0, 'ALTER TABLE `entity_views` ADD CONSTRAINT `fk_entity_views_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'escalation_matrix' AND constraint_name = 'fk_escalation_role') = 0, 'ALTER TABLE `escalation_matrix` ADD CONSTRAINT `fk_escalation_role` FOREIGN KEY (`escalation_role_id`) REFERENCES `roles` (`role_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'escalation_matrix' AND constraint_name = 'fk_escalation_sla') = 0, 'ALTER TABLE `escalation_matrix` ADD CONSTRAINT `fk_escalation_sla` FOREIGN KEY (`sla_id`) REFERENCES `sla_configurations` (`sla_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'escalation_matrix' AND constraint_name = 'fk_escalation_user') = 0, 'ALTER TABLE `escalation_matrix` ADD CONSTRAINT `fk_escalation_user` FOREIGN KEY (`escalation_user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'evidence' AND constraint_name = 'fk_evidence_case') = 0, 'ALTER TABLE `evidence` ADD CONSTRAINT `fk_evidence_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'evidence' AND constraint_name = 'fk_evidence_category') = 0, 'ALTER TABLE `evidence` ADD CONSTRAINT `fk_evidence_category` FOREIGN KEY (`evidence_category_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'evidence' AND constraint_name = 'fk_evidence_collected_by') = 0, 'ALTER TABLE `evidence` ADD CONSTRAINT `fk_evidence_collected_by` FOREIGN KEY (`collected_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'evidence' AND constraint_name = 'fk_evidence_document') = 0, 'ALTER TABLE `evidence` ADD CONSTRAINT `fk_evidence_document` FOREIGN KEY (`document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'evidence' AND constraint_name = 'fk_evidence_type') = 0, 'ALTER TABLE `evidence` ADD CONSTRAINT `fk_evidence_type` FOREIGN KEY (`evidence_type_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'evidence' AND constraint_name = 'fk_evidence_uploaded_by') = 0, 'ALTER TABLE `evidence` ADD CONSTRAINT `fk_evidence_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_clarifications' AND constraint_name = 'fk_inv_clarification_raised_by') = 0, 'ALTER TABLE `investigation_clarifications` ADD CONSTRAINT `fk_inv_clarification_raised_by` FOREIGN KEY (`raised_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_clarifications' AND constraint_name = 'fk_inv_clarification_report') = 0, 'ALTER TABLE `investigation_clarifications` ADD CONSTRAINT `fk_inv_clarification_report` FOREIGN KEY (`investigation_report_id`) REFERENCES `investigation_reports` (`report_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'investigation_clarifications' AND constraint_name = 'fk_inv_clarification_responded_by') = 0, 'ALTER TABLE `investigation_clarifications` ADD CONSTRAINT `fk_inv_clarification_responded_by` FOREIGN KEY (`responded_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'login_history' AND constraint_name = 'fk_login_history_user') = 0, 'ALTER TABLE `login_history` ADD CONSTRAINT `fk_login_history_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'notification_history' AND constraint_name = 'fk_notification_case') = 0, 'ALTER TABLE `notification_history` ADD CONSTRAINT `fk_notification_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'notification_history' AND constraint_name = 'fk_notification_complaint') = 0, 'ALTER TABLE `notification_history` ADD CONSTRAINT `fk_notification_complaint` FOREIGN KEY (`complaint_id`) REFERENCES `complaints` (`complaint_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'notification_history' AND constraint_name = 'fk_notification_template') = 0, 'ALTER TABLE `notification_history` ADD CONSTRAINT `fk_notification_template` FOREIGN KEY (`template_id`) REFERENCES `notification_templates` (`template_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'show_cause_notices' AND constraint_name = 'fk_scn_created_by') = 0, 'ALTER TABLE `show_cause_notices` ADD CONSTRAINT `fk_scn_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'show_cause_notices' AND constraint_name = 'fk_scn_dac_case') = 0, 'ALTER TABLE `show_cause_notices` ADD CONSTRAINT `fk_scn_dac_case` FOREIGN KEY (`dac_case_id`) REFERENCES `dac_cases` (`dac_case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'show_cause_notices' AND constraint_name = 'fk_scn_document') = 0, 'ALTER TABLE `show_cause_notices` ADD CONSTRAINT `fk_scn_document` FOREIGN KEY (`document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'show_cause_notices' AND constraint_name = 'fk_scn_respondent') = 0, 'ALTER TABLE `show_cause_notices` ADD CONSTRAINT `fk_scn_respondent` FOREIGN KEY (`respondent_id`) REFERENCES `complaint_respondents` (`respondent_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'respondent_submissions' AND constraint_name = 'fk_respondent_submission_document') = 0, 'ALTER TABLE `respondent_submissions` ADD CONSTRAINT `fk_respondent_submission_document` FOREIGN KEY (`response_document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'respondent_submissions' AND constraint_name = 'fk_respondent_submission_received_by') = 0, 'ALTER TABLE `respondent_submissions` ADD CONSTRAINT `fk_respondent_submission_received_by` FOREIGN KEY (`received_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'respondent_submissions' AND constraint_name = 'fk_respondent_submission_respondent') = 0, 'ALTER TABLE `respondent_submissions` ADD CONSTRAINT `fk_respondent_submission_respondent` FOREIGN KEY (`respondent_id`) REFERENCES `complaint_respondents` (`respondent_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'respondent_submissions' AND constraint_name = 'fk_respondent_submission_scn') = 0, 'ALTER TABLE `respondent_submissions` ADD CONSTRAINT `fk_respondent_submission_scn` FOREIGN KEY (`scn_id`) REFERENCES `show_cause_notices` (`scn_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'role_permissions' AND constraint_name = 'fk_role_permissions_permission') = 0, 'ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`permission_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'role_permissions' AND constraint_name = 'fk_role_permissions_role') = 0, 'ALTER TABLE `role_permissions` ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'saml_settings' AND constraint_name = 'fk_saml_settings_updated_by') = 0, 'ALTER TABLE `saml_settings` ADD CONSTRAINT `fk_saml_settings_updated_by` FOREIGN KEY (`updated_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'user_roles' AND constraint_name = 'fk_user_roles_role') = 0, 'ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`role_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'user_roles' AND constraint_name = 'fk_user_roles_user') = 0, 'ALTER TABLE `user_roles` ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_meetings' AND constraint_name = 'fk_wbc_meeting_case') = 0, 'ALTER TABLE `wbc_meetings` ADD CONSTRAINT `fk_wbc_meeting_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_meetings' AND constraint_name = 'fk_wbc_meeting_created_by') = 0, 'ALTER TABLE `wbc_meetings` ADD CONSTRAINT `fk_wbc_meeting_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_meetings' AND constraint_name = 'fk_wbc_meeting_minutes_document') = 0, 'ALTER TABLE `wbc_meetings` ADD CONSTRAINT `fk_wbc_meeting_minutes_document` FOREIGN KEY (`minutes_document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND constraint_name = 'fk_wbc_decision_case') = 0, 'ALTER TABLE `wbc_decisions` ADD CONSTRAINT `fk_wbc_decision_case` FOREIGN KEY (`case_id`) REFERENCES `cases` (`case_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND constraint_name = 'fk_wbc_decision_created_by') = 0, 'ALTER TABLE `wbc_decisions` ADD CONSTRAINT `fk_wbc_decision_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND constraint_name = 'fk_wbc_decision_document') = 0, 'ALTER TABLE `wbc_decisions` ADD CONSTRAINT `fk_wbc_decision_document` FOREIGN KEY (`decision_document_id`) REFERENCES `documents` (`document_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND constraint_name = 'fk_wbc_decision_meeting') = 0, 'ALTER TABLE `wbc_decisions` ADD CONSTRAINT `fk_wbc_decision_meeting` FOREIGN KEY (`meeting_id`) REFERENCES `wbc_meetings` (`meeting_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND constraint_name = 'fk_wbc_decision_owner') = 0, 'ALTER TABLE `wbc_decisions` ADD CONSTRAINT `fk_wbc_decision_owner` FOREIGN KEY (`next_workflow_owner_id`) REFERENCES `users` (`user_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_decisions' AND constraint_name = 'fk_wbc_decision_recommendation') = 0, 'ALTER TABLE `wbc_decisions` ADD CONSTRAINT `fk_wbc_decision_recommendation` FOREIGN KEY (`recommendation_type_id`) REFERENCES `master_values` (`master_value_id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_meeting_members' AND constraint_name = 'fk_wbc_members_meeting') = 0, 'ALTER TABLE `wbc_meeting_members` ADD CONSTRAINT `fk_wbc_members_meeting` FOREIGN KEY (`meeting_id`) REFERENCES `wbc_meetings` (`meeting_id`) ON DELETE CASCADE ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;
SET @s = IF((SELECT COUNT(*) FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = 'wbc_meeting_members' AND constraint_name = 'fk_wbc_members_user') = 0, 'ALTER TABLE `wbc_meeting_members` ADD CONSTRAINT `fk_wbc_members_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`) ON DELETE RESTRICT ON UPDATE CASCADE', 'SELECT 1');
PREPARE st FROM @s; EXECUTE st; DEALLOCATE PREPARE st;

-- ===== Step 4: Seed data (reference data only; no users or passwords) =====
START TRANSACTION;

-- master_types (24 rows)
INSERT IGNORE INTO `master_types` (`master_type_id`, `master_code`, `master_name`, `description`, `active_flag`, `created_at`, `updated_at`) VALUES
(1, 'ADDRESSED_TO', 'Addressed To', 'MD & CEO / Whistleblower / Other Authority', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(2, 'LANGUAGE', 'Complaint Language', 'Language in which complaint is received', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(3, 'CHANNEL', 'Complaint Channel', 'Complaint receipt channel', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(4, 'COMPLAINT_NATURE', 'Complaint Nature', 'Nature of whistleblower complaint', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(5, 'COMPLAINT_CLASSIFICATION', 'Complaint Classification', 'Primary complaint classification', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(6, 'COMPLAINT_SUB_CLASSIFICATION', 'Complaint Sub Classification', 'Secondary classification', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(7, 'COMPLAINANT_TYPE', 'Complainant Type', 'Type of complainant', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(8, 'ANONYMITY_TYPE', 'Anonymous / Named', 'Whether complainant is anonymous or named', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(9, 'SEVERITY', 'Severity', 'Complaint severity', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(10, 'COMPLAINT_STATUS', 'Complaint Status', 'Complaint lifecycle status', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(11, 'CASE_TYPE', 'Case Type', 'Formal case type', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(12, 'PRIORITY', 'Priority', 'Case priority', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(13, 'RISK_CATEGORY', 'Risk Category', 'Risk category', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(14, 'CASE_STATUS', 'Case Status', 'Case lifecycle status', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(15, 'INVESTIGATION_STATUS', 'Investigation Status', 'Investigation lifecycle status', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(16, 'REPORT_STATUS', 'Investigation Report Status', 'Investigation report status', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(17, 'EVIDENCE_TYPE', 'Evidence Type', 'Evidence type', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(18, 'EVIDENCE_CATEGORY', 'Evidence Category', 'Evidence category', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(19, 'RECOMMENDATION_TYPE', 'WBC Recommendation Type', 'WBC recommendation', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(20, 'DAC_STATUS', 'DAC Status', 'DAC lifecycle status', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(21, 'DAC_OUTCOME', 'DAC Outcome', 'DAC decision outcome', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(22, 'DOCUMENT_CATEGORY', 'Document Category', 'Document classification', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(23, 'ESCALATION_STATUS', 'Escalation Status', 'Escalation status', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(24, 'SLA_EVENT', 'SLA Event', 'Events that start SLA timers', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26');

-- master_values (95 rows)
INSERT IGNORE INTO `master_values` (`master_value_id`, `master_type_id`, `parent_value_id`, `value_code`, `value_name`, `description`, `display_order`, `active_flag`, `effective_from`, `effective_to`, `created_at`, `updated_at`) VALUES
(1, 1, NULL, 'MD_CEO', 'MD & CEO', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(2, 1, NULL, 'WHISTLEBLOWER', 'Whistleblower', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(3, 1, NULL, 'OTHER_AUTHORITY', 'Other Authority', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(4, 2, NULL, 'ENGLISH', 'English', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(5, 2, NULL, 'HINDI', 'Hindi', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(6, 2, NULL, 'OTHER', 'Other', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(7, 3, NULL, 'PORTAL', 'Portal', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(8, 3, NULL, 'EMAIL', 'Email', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(9, 3, NULL, 'POST', 'Post', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(10, 3, NULL, 'REGULATOR', 'Regulator', NULL, 4, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(11, 3, NULL, 'MD_OFFICE', 'MD Office', NULL, 5, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(12, 3, NULL, 'MANUAL_ENTRY', 'Manual Entry', NULL, 6, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(13, 3, NULL, 'OTHER', 'Other', NULL, 7, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(14, 4, NULL, 'FRAUD', 'Fraud', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(15, 4, NULL, 'CORRUPTION', 'Corruption', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(16, 4, NULL, 'MISCONDUCT', 'Misconduct', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(17, 4, NULL, 'POLICY_BREACH', 'Policy Breach', NULL, 4, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(18, 4, NULL, 'ETHICAL_VIOLATION', 'Ethical Violation', NULL, 5, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(19, 7, NULL, 'EMPLOYEE', 'Employee', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(20, 7, NULL, 'DIRECTOR', 'Director', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(21, 7, NULL, 'VENDOR', 'Vendor', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(22, 7, NULL, 'CUSTOMER', 'Customer', NULL, 4, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(23, 7, NULL, 'THIRD_PARTY', 'Third Party', NULL, 5, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(24, 7, NULL, 'ANONYMOUS', 'Anonymous', NULL, 6, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(25, 8, NULL, 'ANONYMOUS', 'Anonymous', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(26, 8, NULL, 'NAMED', 'Named Complainant', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-20 13:23:55'),
(27, 9, NULL, 'LOW', 'Low', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(28, 9, NULL, 'MEDIUM', 'Medium', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(29, 9, NULL, 'HIGH', 'High', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(30, 9, NULL, 'CRITICAL', 'Critical', NULL, 4, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(31, 10, NULL, 'RECEIVED', 'Received', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(32, 10, NULL, 'UNDER_REVIEW', 'Acknowledged / Under Review', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(33, 10, NULL, 'ACCEPTED', 'Accepted', NULL, 4, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(34, 10, NULL, 'REJECTED', 'Rejected', NULL, 6, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(35, 10, NULL, 'CONVERTED_TO_CASE', 'Forwarded to Investigation Unit', NULL, 5, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(36, 10, NULL, 'CLOSED', 'Closed', NULL, 7, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(37, 14, NULL, 'OPEN', 'Open', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(38, 14, NULL, 'ASSIGNED', 'Assigned to Investigation Unit', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(39, 14, NULL, 'UNDER_INVESTIGATION', 'Under Investigation', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(40, 14, NULL, 'WBC_REVIEW', 'Before the WB Committee', NULL, 7, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(41, 14, NULL, 'DAC_REVIEW', 'DAC Proceedings', NULL, 8, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(42, 14, NULL, 'CETO_APPROVAL', 'CEtO Approval', NULL, 10, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(43, 14, NULL, 'CLOSED', 'Closed', NULL, 11, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-26 14:15:23'),
(44, 24, NULL, 'ACKNOWLEDGEMENT', 'Acknowledgement', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(45, 22, NULL, 'COMPLAINT_ATTACHMENT', 'Complaint Attachment', NULL, 1, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(46, 22, NULL, 'EVIDENCE', 'Evidence', NULL, 2, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(47, 22, NULL, 'INVESTIGATION_REPORT', 'Investigation Report', NULL, 3, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(48, 22, NULL, 'WBC_MINUTES', 'WBC Minutes', NULL, 4, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(49, 22, NULL, 'SCN', 'Show Cause Notice', NULL, 5, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(50, 22, NULL, 'RESPONDENT_RESPONSE', 'Respondent Response', NULL, 6, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(51, 22, NULL, 'DAC_DECISION', 'DAC Decision', NULL, 7, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(52, 22, NULL, 'CLOSURE', 'Closure Document', NULL, 8, 1, NULL, NULL, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(53, 22, NULL, 'CLARIFICATION_RESPONSE', 'Clarification Response', NULL, 9, 1, NULL, NULL, '2026-08-18 16:21:34', '2026-08-18 16:21:34'),
(55, 11, NULL, 'CHANNEL_A', 'Channel A', NULL, 1, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(56, 11, NULL, 'CHANNEL_B', 'Channel B', NULL, 2, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(57, 11, NULL, 'REGULATOR', 'Regulator', NULL, 3, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(58, 11, NULL, 'MD_ESCALATION', 'MD Escalation', NULL, 4, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(59, 11, NULL, 'MANUAL', 'Manual', NULL, 5, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(60, 12, NULL, 'LOW', 'Low', NULL, 1, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(61, 12, NULL, 'MEDIUM', 'Medium', NULL, 2, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(62, 12, NULL, 'HIGH', 'High', NULL, 3, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(63, 12, NULL, 'CRITICAL', 'Critical', NULL, 4, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(64, 13, NULL, 'OPERATIONAL', 'Operational', NULL, 1, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(65, 13, NULL, 'FRAUD', 'Fraud', NULL, 2, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(66, 13, NULL, 'COMPLIANCE', 'Compliance', NULL, 3, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(67, 13, NULL, 'CONDUCT', 'Conduct', NULL, 4, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(68, 13, NULL, 'GOVERNANCE', 'Governance', NULL, 5, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(69, 5, NULL, 'FINANCIAL', 'Financial', NULL, 1, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(70, 5, NULL, 'NON_FINANCIAL', 'Non-Financial', NULL, 2, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(71, 5, NULL, 'HR_CONDUCT', 'HR / Conduct', NULL, 3, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(72, 5, NULL, 'OPERATIONAL', 'Operational', NULL, 4, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(73, 5, NULL, 'REGULATORY', 'Regulatory', NULL, 5, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(74, 5, NULL, 'OTHER', 'Other', NULL, 6, 1, NULL, NULL, '2026-08-18 16:38:28', '2026-08-18 16:38:28'),
(244, 10, NULL, 'INFO_REQUESTED', 'Additional Details Requested', NULL, 3, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(252, 14, NULL, 'INFO_REQUESTED', 'Awaiting Details from Whistle-blower', NULL, 4, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(253, 14, NULL, 'IVR_SUBMITTED', 'Investigation Report Submitted', NULL, 5, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(254, 14, NULL, 'IVR_CLARIFICATION', 'Clarification Sought from Investigation Unit', NULL, 6, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(257, 14, NULL, 'IMPLEMENTATION', 'Implementing Recommendations', NULL, 9, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(260, 19, NULL, 'DAC', 'Refer to Disciplinary Action Committee', NULL, 1, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(261, 19, NULL, 'OTHER_ACTION', 'Other Proceedings / Corrective Action', NULL, 2, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(262, 19, NULL, 'IMPLEMENT', 'Implement Committee Recommendations', NULL, 3, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(263, 19, NULL, 'NO_ACTION', 'No Further Action', NULL, 4, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(264, 16, NULL, 'SUBMITTED', 'Submitted', NULL, 1, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(265, 16, NULL, 'CLARIFICATION_SOUGHT', 'Clarification Sought', NULL, 2, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(266, 16, NULL, 'ACCEPTED', 'Accepted', NULL, 3, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(267, 15, NULL, 'IN_PROGRESS', 'In Progress', NULL, 1, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(268, 15, NULL, 'COMPLETED', 'Completed', NULL, 2, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(269, 20, NULL, 'INITIATED', 'Initiated', NULL, 1, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(270, 20, NULL, 'IN_PROGRESS', 'In Progress', NULL, 2, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(271, 20, NULL, 'CONCLUDED', 'Concluded', NULL, 3, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(272, 21, NULL, 'DISCIPLINARY_ACTION', 'Disciplinary Action', NULL, 1, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(273, 21, NULL, 'WARNING', 'Warning / Counselling', NULL, 2, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(274, 21, NULL, 'RECOVERY', 'Recovery / Restitution', NULL, 3, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(275, 21, NULL, 'TERMINATION', 'Termination', NULL, 4, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(276, 21, NULL, 'NO_ACTION', 'No Action', NULL, 5, 1, NULL, NULL, '2026-08-26 14:15:23', '2026-08-26 14:15:23');

-- roles (12 rows)
INSERT IGNORE INTO `roles` (`role_id`, `role_code`, `role_name`, `description`, `active_flag`, `created_at`, `updated_at`) VALUES
(2, 'ETHICS_OFFICER', 'Ethics Officer', 'Complaint and ethics case management', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(3, 'INVESTIGATOR', 'Investigator', 'Investigation activities', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(4, 'INVESTIGATION_HEAD', 'Investigation Head', 'Investigation review and oversight', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(5, 'WBC_MEMBER', 'WBC Member', 'WBC review and decision', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(6, 'WBC_OWNER', 'WBC Owner', 'WBC workflow owner', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(7, 'DAC_MEMBER', 'DAC Member', 'DAC activities', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(8, 'DAC_CHAIRPERSON', 'DAC Chairperson', 'DAC chairperson', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(9, 'DAC_OWNER', 'DAC Owner', 'DAC workflow owner', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(10, 'CETO', 'CEtO', 'CEtO approval', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(11, 'MD', 'MD', 'Management approval', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(12, 'AUDITOR', 'Auditor', 'Read-only audit access', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26'),
(13, 'REPORT_VIEWER', 'Report Viewer', 'Reporting access', 1, '2026-08-18 14:31:26', '2026-08-18 14:31:26');

-- permissions (24 rows)
INSERT IGNORE INTO `permissions` (`permission_id`, `module_name`, `permission_code`, `description`, `active_flag`, `created_at`) VALUES
(1, 'COMPLAINT', 'COMPLAINT_CREATE', 'Create complaint', 1, '2026-08-18 14:31:26'),
(2, 'COMPLAINT', 'COMPLAINT_VIEW', 'View complaint', 1, '2026-08-18 14:31:26'),
(3, 'COMPLAINT', 'COMPLAINT_EDIT', 'Edit complaint', 1, '2026-08-18 14:31:26'),
(4, 'COMPLAINT', 'COMPLAINT_ASSIGN', 'Assign complaint/case', 1, '2026-08-18 14:31:26'),
(5, 'COMPLAINT', 'COMPLAINT_CLOSE', 'Close complaint', 1, '2026-08-18 14:31:26'),
(6, 'CASE', 'CASE_VIEW', 'View case', 1, '2026-08-18 14:31:26'),
(7, 'CASE', 'CASE_EDIT', 'Edit case', 1, '2026-08-18 14:31:26'),
(8, 'CASE', 'CASE_ASSIGN', 'Assign case', 1, '2026-08-18 14:31:26'),
(9, 'INVESTIGATION', 'INVESTIGATION_VIEW', 'View investigation', 1, '2026-08-18 14:31:26'),
(10, 'INVESTIGATION', 'INVESTIGATION_EDIT', 'Edit investigation', 1, '2026-08-18 14:31:26'),
(11, 'INVESTIGATION', 'INVESTIGATION_SUBMIT', 'Submit investigation report', 1, '2026-08-18 14:31:26'),
(12, 'WBC', 'WBC_VIEW', 'View WBC records', 1, '2026-08-18 14:31:26'),
(13, 'WBC', 'WBC_DECISION', 'Record WBC decision', 1, '2026-08-18 14:31:26'),
(14, 'DAC', 'DAC_VIEW', 'View DAC records', 1, '2026-08-18 14:31:26'),
(15, 'DAC', 'DAC_DECISION', 'Record DAC decision', 1, '2026-08-18 14:31:26'),
(16, 'DOCUMENT', 'DOCUMENT_VIEW', 'View documents', 1, '2026-08-18 14:31:26'),
(17, 'DOCUMENT', 'DOCUMENT_UPLOAD', 'Upload documents', 1, '2026-08-18 14:31:26'),
(18, 'DOCUMENT', 'DOCUMENT_DOWNLOAD', 'Download documents', 1, '2026-08-18 14:31:26'),
(19, 'DOCUMENT', 'DOCUMENT_DELETE', 'Delete documents', 1, '2026-08-18 14:31:26'),
(20, 'REPORT', 'REPORT_VIEW', 'View reports', 1, '2026-08-18 14:31:26'),
(21, 'REPORT', 'REPORT_EXPORT', 'Export reports', 1, '2026-08-18 14:31:26'),
(22, 'AUDIT', 'AUDIT_VIEW', 'View audit logs', 1, '2026-08-18 14:31:26'),
(23, 'ADMIN', 'USER_ADMIN', 'Manage users', 1, '2026-08-18 14:31:26'),
(24, 'ADMIN', 'ROLE_ADMIN', 'Manage roles', 1, '2026-08-18 14:31:26');

-- notification_templates (18 rows)
INSERT IGNORE INTO `notification_templates` (`template_id`, `template_code`, `template_type`, `template_name`, `subject`, `template_body`, `merge_fields`, `active_flag`, `created_at`, `updated_at`) VALUES
(1, 'COMPLAINT_REGISTERED', 'IN_APP', 'Complaint Registered', 'Your complaint {{complaintNo}} has been registered', 'Your complaint has been received and assigned reference {{complaintNo}}.', NULL, 1, '2026-08-18 16:21:34', '2026-08-18 16:21:34'),
(2, 'ACK_SENT', 'IN_APP', 'Acknowledgement Sent', 'Complaint {{complaintNo}} acknowledged', 'Your complaint {{complaintNo}} has been acknowledged and is under review.', NULL, 1, '2026-08-18 16:21:34', '2026-08-18 16:21:34'),
(3, 'CASE_ASSIGNED', 'IN_APP', 'Case Assigned', 'Case {{caseNo}} assigned to you by {{assignedByRole}} ({{dueDate}})', 'You have been assigned as investigation officer for case {{caseNo}} by the {{assignedByRole}}. Investigation due date: {{dueDate}}.', NULL, 1, '2026-08-18 16:21:34', '2026-09-10 18:15:25'),
(4, 'CLARIFICATION_REQUESTED', 'IN_APP', 'Clarification Requested', '{{requestedByRole}} requested more details on {{complaintNo}} — respond by {{dueDate}}', 'The {{requestedByRole}} has asked: \"{{question}}\". Please log in to your post box and respond on complaint {{complaintNo}} by {{dueDate}}.', NULL, 1, '2026-08-18 16:21:34', '2026-09-10 18:07:15'),
(17, 'COMPLAINT_CLOSED', 'IN_APP', 'Complaint Closed', 'Complaint {{complaintNo}} closed', 'Your complaint {{complaintNo}} has been closed.', NULL, 1, '2026-08-19 18:47:55', '2026-08-19 18:47:55'),
(23, 'CLARIFICATION_REMINDER', 'IN_APP', 'Additional Details Reminder', 'Reminder {{reminderNo}} of {{totalReminders}} — details needed for {{complaintNo}} by {{dueDate}}', 'This is reminder {{reminderNo}} of {{totalReminders}}. Please log in to your post box and provide the additional details requested on complaint {{complaintNo}} by {{dueDate}}. If we do not hear from you by then, the complaint will be closed.', NULL, 1, '2026-08-26 14:15:23', '2026-09-10 18:07:15'),
(24, 'DETAILS_RECEIVED', 'IN_APP', 'Additional Details Received', 'Additional details received for {{complaintNo}}', 'The whistle-blower has responded to the request for additional details on {{complaintNo}}.', NULL, 1, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(25, 'COMPLAINT_CLOSED_NO_RESPONSE', 'IN_APP', 'Closed — No Response', 'Complaint {{complaintNo}} closed', 'Complaint {{complaintNo}} has been closed by the Whistle-blower Committee because the additional details requested were not received within the time allowed.', NULL, 1, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(26, 'CASE_TRANSFERRED', 'IN_APP', 'Case Transferred', 'Complaint {{complaintNo}} transferred to you', '{{newOwner}} is now the WB Committee owner of complaint {{complaintNo}}.', NULL, 1, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(27, 'IVR_SUBMITTED', 'IN_APP', 'Investigation Report Submitted', 'Investigation report v{{versionNo}} submitted for {{caseNo}} by {{submittedByRole}}', 'The {{submittedByRole}} has submitted version {{versionNo}} of the investigation report for {{caseNo}}.', NULL, 1, '2026-08-26 14:15:23', '2026-09-10 18:07:15'),
(28, 'IVR_CLARIFICATION_SOUGHT', 'IN_APP', 'Clarification Sought on IVR', 'Clarification sought on the investigation report for {{caseNo}}', 'The WB Committee has asked for clarification on the investigation report for case {{caseNo}}.', NULL, 1, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(29, 'CASE_CLOSED_RESPONSE', 'IN_APP', 'Case Closed — Response to Whistle-blower', 'Complaint {{complaintNo}} — closure', '{{response}}', NULL, 1, '2026-08-26 14:15:23', '2026-08-26 14:15:23'),
(42, 'DETAILS_REQUEST_PROPOSED', 'IN_APP', 'IU Requests Details via Committee', '{{requestedByRole}} asked for further details on {{caseNo}}', 'The {{requestedByRole}} has asked: \"{{question}}\". Review it on case {{caseNo}} and forward or decline the request to the whistle-blower.', NULL, 1, '2026-08-26 15:48:29', '2026-09-10 18:07:15'),
(43, 'DETAILS_REQUEST_FORWARDED', 'IN_APP', 'Details Request Forwarded', 'Your request on {{caseNo}} has been sent to the whistle-blower', 'The WB Committee has put your request to the whistle-blower. A response is due by {{dueDate}}.', NULL, 1, '2026-08-26 15:48:29', '2026-08-26 15:48:29'),
(44, 'DETAILS_REQUEST_DECLINED', 'IN_APP', 'Details Request Declined', 'Your request on {{caseNo}} was not forwarded', 'The WB Committee decided not to put your request to the whistle-blower. See the case timeline.', NULL, 1, '2026-08-26 15:48:29', '2026-08-26 15:48:29'),
(60, 'DETAILS_SHARED_WITH_IU', 'IN_APP', 'Whistle-blower Response Shared', 'Additional details available on {{caseNo}}', 'The WB Committee has reviewed the whistle-blower\'s response and shared it on case {{caseNo}}.', NULL, 1, '2026-08-26 18:51:58', '2026-08-26 18:51:58'),
(72, 'IU_SLA_REMINDER', 'IN_APP', 'Investigation SLA Reminder', 'Reminder {{reminderNo}} — investigation report due for {{caseNo}} by {{dueDate}}', 'This is reminder {{reminderNo}} of the 90-day investigation SLA for case {{caseNo}}. The final report is due by {{dueDate}}.', NULL, 1, '2026-09-10 12:05:27', '2026-09-10 18:07:15'),
(198, 'NEW_COMPLAINT_RECEIVED', 'IN_APP', 'New Complaint Received', 'New complaint {{complaintNo}} received', 'A new complaint has been received and is ready for WB Committee review.', NULL, 1, '2026-09-11 11:38:40', '2026-09-11 11:38:40');

-- sla_configurations (7 rows)
INSERT IGNORE INTO `sla_configurations` (`sla_id`, `sla_code`, `sla_name`, `sla_type`, `target_days`, `target_hours`, `start_event`, `escalation_enabled`, `active_flag`, `effective_from`, `effective_to`, `created_at`) VALUES
(1, 'ACKNOWLEDGEMENT', 'Acknowledgement to complainant by WB Committee', 'ACK', 4, NULL, 'COMPLAINT_REGISTERED', 1, 1, NULL, NULL, '2026-08-18 14:31:26'),
(2, 'INVESTIGATION', 'Investigation Completion', 'INVESTIGATION', NULL, NULL, 'INVESTIGATION_ASSIGNED', 1, 1, NULL, NULL, '2026-08-18 14:31:26'),
(3, 'WBC', 'WBC Review', 'WBC', NULL, NULL, 'IVR_SUBMITTED', 1, 1, NULL, NULL, '2026-08-18 14:31:26'),
(4, 'DAC', 'DAC Completion', 'DAC', NULL, NULL, 'DAC_INITIATED', 1, 1, NULL, NULL, '2026-08-18 14:31:26'),
(5, 'OVERALL_CLOSURE', 'Overall Case Closure', 'CLOSURE', NULL, NULL, 'COMPLAINT_REGISTERED', 1, 1, NULL, NULL, '2026-08-18 14:31:26'),
(9, 'FORWARD_TO_IU', 'Forward complaint to Investigation Unit', 'CALENDAR_DAYS', 5, NULL, 'COMPLAINT_REGISTERED', 1, 1, NULL, NULL, '2026-08-26 14:15:23'),
(10, 'WB_ADDITIONAL_DETAILS', 'Whistle-blower to provide additional details', 'CALENDAR_DAYS', 6, NULL, 'DETAILS_REQUESTED', 1, 1, NULL, NULL, '2026-08-26 14:15:23');

-- ===== Step 5: Log to migrations tracking table =====
INSERT INTO migrations (version, script_name, status, notes)
SELECT 'V1.0.0', 'V1.0.0__init.sql', 'success', 'Baseline schema (48 tables) + reference seed'
WHERE NOT EXISTS (SELECT 1 FROM migrations WHERE script_name = 'V1.0.0__init.sql' AND status = 'success');

COMMIT;
