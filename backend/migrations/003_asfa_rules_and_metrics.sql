-- Migration 003: ASFA Rule Engine, Subject Scheduling Config, Faculty Preferences, and Generation Metrics

-- 1. ASFA Rules Table
CREATE TABLE IF NOT EXISTS `asfa_rule` (
    `rule_id` INT AUTO_INCREMENT PRIMARY KEY,
    `rule_code` VARCHAR(50) UNIQUE NULL,
    `rule_name` VARCHAR(150) NOT NULL,
    `description` TEXT NULL,
    `rule_type` ENUM('HARD', 'SOFT') NOT NULL DEFAULT 'HARD',
    `scope` ENUM('GLOBAL', 'DEPARTMENT', 'SCHEME', 'ACADEMIC_YEAR', 'SEMESTER', 'SUBJECT', 'FACULTY', 'SUBJECT_GROUP', 'ACTIVITY_TYPE') NOT NULL DEFAULT 'GLOBAL',
    `category` VARCHAR(50) NOT NULL DEFAULT 'CUSTOM',
    `condition_expr` VARCHAR(255) NULL,
    `rule_value` JSON NOT NULL,
    `priority` INT NOT NULL DEFAULT 50,
    `is_enabled` TINYINT(1) NOT NULL DEFAULT 1,
    `department_id` INT NULL,
    `scheme_id` INT NULL,
    `semester_id` INT NULL,
    `subject_id` INT NULL,
    `faculty_id` INT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_asfa_rule_scope` (`scope`, `is_enabled`),
    KEY `idx_asfa_rule_category` (`category`),
    KEY `idx_asfa_rule_dept` (`department_id`),
    KEY `idx_asfa_rule_sem` (`semester_id`),
    KEY `idx_asfa_rule_fac` (`faculty_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Subject Scheduling Configuration (Decouples Academic Credits from Timetable Periods)
CREATE TABLE IF NOT EXISTS `subject_scheduling_config` (
    `config_id` INT AUTO_INCREMENT PRIMARY KEY,
    `subject_id` INT NOT NULL UNIQUE,
    `classification` ENUM('CORE_THEORY', 'LAB', 'TUTORIAL', 'ELECTIVE', 'PROJECT', 'ACTIVITY', 'PLACEMENT', 'REMEDIAL', 'PROCTOR', 'INTERNSHIP', 'OTHER') NOT NULL DEFAULT 'CORE_THEORY',
    `scheduling_priority` ENUM('HIGH', 'NORMAL', 'LOW', 'VERY_LOW') NOT NULL DEFAULT 'NORMAL',
    `scheduling_weight` INT NOT NULL DEFAULT 50,
    `max_weekly_periods` INT NULL,
    `consecutive_periods` INT NOT NULL DEFAULT 1,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY `idx_ssc_classification` (`classification`),
    KEY `idx_ssc_priority` (`scheduling_priority`),
    CONSTRAINT `fk_ssc_subject` FOREIGN KEY (`subject_id`) REFERENCES `subject` (`subject_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Faculty Preferences (Soft Constraint: Morning/Evening with 0-100% priority)
CREATE TABLE IF NOT EXISTS `faculty_preference` (
    `preference_id` INT AUTO_INCREMENT PRIMARY KEY,
    `faculty_id` INT NOT NULL,
    `academic_year` VARCHAR(20) NOT NULL DEFAULT '2026-27',
    `preferred_time` ENUM('Morning', 'Evening', 'No_Preference') NOT NULL DEFAULT 'No_Preference',
    `priority_percentage` INT NOT NULL DEFAULT 75,
    `notes` VARCHAR(255) NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY `uq_fac_ay` (`faculty_id`, `academic_year`),
    CONSTRAINT `fk_fp_faculty` FOREIGN KEY (`faculty_id`) REFERENCES `faculty` (`faculty_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Generation Runs (Stores Real Performance Metrics & Quality Scores)
CREATE TABLE IF NOT EXISTS `generation_run` (
    `run_id` INT AUTO_INCREMENT PRIMARY KEY,
    `run_uuid` VARCHAR(64) UNIQUE NOT NULL,
    `department_id` INT NOT NULL,
    `scheme_id` INT NOT NULL,
    `academic_year` VARCHAR(20) NOT NULL,
    `semester_id` INT NOT NULL,
    `semester_type` VARCHAR(10) NOT NULL,
    `cycle` VARCHAR(10) NULL,
    `status` ENUM('SUCCESS', 'FAILED', 'REPAIRED', 'OPTIMIZED') NOT NULL,
    `generation_time_seconds` FLOAT NOT NULL DEFAULT 0.0,
    `asfa_engine_version` VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    `timetable_optimizer_version` VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    `conflict_detector_version` VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    `rule_set_version` VARCHAR(20) NOT NULL DEFAULT 'v1.0',
    `hard_constraint_count` INT NOT NULL DEFAULT 0,
    `hard_constraints_satisfied` INT NOT NULL DEFAULT 0,
    `hard_satisfaction_rate` FLOAT NOT NULL DEFAULT 100.0,
    `soft_constraint_count` INT NOT NULL DEFAULT 0,
    `soft_constraints_satisfied` INT NOT NULL DEFAULT 0,
    `soft_satisfaction_rate` FLOAT NOT NULL DEFAULT 100.0,
    `conflict_count` INT NOT NULL DEFAULT 0,
    `repaired_count` INT NOT NULL DEFAULT 0,
    `repair_iterations` INT NOT NULL DEFAULT 0,
    `faculty_workload_compliance_pct` FLOAT NOT NULL DEFAULT 100.0,
    `proctor_compliance_pct` FLOAT NOT NULL DEFAULT 100.0,
    `sem7_low_priority_compliance_pct` FLOAT NOT NULL DEFAULT 100.0,
    `preference_satisfaction_pct` FLOAT NOT NULL DEFAULT 100.0,
    `final_quality_score` FLOAT NOT NULL DEFAULT 100.0,
    `candidates_generated` INT NOT NULL DEFAULT 1,
    `candidates_rejected` INT NOT NULL DEFAULT 0,
    `failure_reason` TEXT NULL,
    `input_config_json` JSON NULL,
    `active_rules_json` JSON NULL,
    `result_summary_json` JSON NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_gr_dept_sem` (`department_id`, `semester_id`, `academic_year`),
    KEY `idx_gr_status` (`status`),
    KEY `idx_gr_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Generation Conflict Log
CREATE TABLE IF NOT EXISTS `generation_conflict_log` (
    `log_id` INT AUTO_INCREMENT PRIMARY KEY,
    `run_id` INT NOT NULL,
    `conflict_category` VARCHAR(50) NOT NULL,
    `conflict_type` VARCHAR(50) NOT NULL,
    `severity` ENUM('HARD', 'SOFT') NOT NULL,
    `description` TEXT NOT NULL,
    `details_json` JSON NULL,
    `was_repaired` TINYINT(1) NOT NULL DEFAULT 0,
    `repair_action` TEXT NULL,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_gcl_run` (`run_id`),
    CONSTRAINT `fk_gcl_run` FOREIGN KEY (`run_id`) REFERENCES `generation_run` (`run_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Training Samples (Historical Outcomes & Admin Modifications)
CREATE TABLE IF NOT EXISTS `training_sample` (
    `sample_id` INT AUTO_INCREMENT PRIMARY KEY,
    `run_id` INT NULL,
    `sample_type` ENUM('GENERATION_OUTCOME', 'ADMIN_MODIFICATION', 'CONFLICT_REPAIR') NOT NULL,
    `context_json` JSON NOT NULL,
    `schedule_input_json` JSON NOT NULL,
    `schedule_output_json` JSON NOT NULL,
    `modifications_json` JSON NULL,
    `quality_score` FLOAT NOT NULL DEFAULT 100.0,
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    KEY `idx_ts_type` (`sample_type`),
    CONSTRAINT `fk_ts_run` FOREIGN KEY (`run_id`) REFERENCES `generation_run` (`run_id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 7. Seed Initial Default Rules
INSERT IGNORE INTO `asfa_rule` (`rule_code`, `rule_name`, `description`, `rule_type`, `scope`, `category`, `condition_expr`, `rule_value`, `priority`, `is_enabled`) VALUES
('RULE_PROCTOR_MANDATORY', 'Mandatory Weekly Proctor Hour', 'Every semester must have exactly one Proctor hour scheduled per week.', 'HARD', 'GLOBAL', 'PROCTOR', NULL, '{"hours_per_week": 1}', 95, 1),
('RULE_SEM7_LOW_PRIORITY_CAP', 'Semester 7 Low-Priority Activity Cap', 'Maximum of 5 timetable class allocations for low-priority activities (Major Project, Placement, Remedial) in Semester 7.', 'HARD', 'SEMESTER', 'ACTIVITY_LIMIT', 'semester_no == 7', '{"max_periods": 5}', 90, 1),
('RULE_SEM7_ACTIVITY_REPLACEMENT', 'Semester 7 Activity Replacement', 'Physical Education, NCC, and Yoga are replaced by Project and Placement activities in Semester 7 curriculum.', 'HARD', 'SEMESTER', 'ACTIVITY_REPLACEMENT', 'semester_no >= 7', '{"replace": ["PE", "PHYSICAL EDUCATION", "NCC", "YOGA"], "with": ["PROJECT", "PLACEMENT"]}', 85, 1),
('RULE_FACULTY_DESIGNATION_WORKLOAD', 'Faculty Designation Workload Limits', 'Standard weekly teaching workload hours per designation: Assistant 16-18, Associate 14-16, Professor 14-16, HOD 8-12, Principal 2-6.', 'HARD', 'GLOBAL', 'WORKLOAD', NULL, '{"Assistant Professor": [16, 18], "Associate Professor": [14, 16], "Professor": [14, 16], "HOD": [8, 12], "Principal": [2, 6]}', 90, 1),
('RULE_REMEDIAL_PRIORITY', 'Remedial Activity Low Scheduling Priority', 'Remedial subjects must be treated with low scheduling priority and must not dominate academic subjects.', 'SOFT', 'GLOBAL', 'SCHEDULING_PRIORITY', 'classification == "REMEDIAL"', '{"priority": "LOW", "weight": 20}', 40, 1),
('RULE_PLACEMENT_PRIORITY', 'Placement Low Scheduling Priority', 'Placement activities must be treated with low scheduling priority.', 'SOFT', 'GLOBAL', 'SCHEDULING_PRIORITY', 'classification == "PLACEMENT"', '{"priority": "LOW", "weight": 25}', 40, 1),
('RULE_PROJECT_SPECIAL_HANDLING', 'Major Project Special Scheduling', 'Major project credits do not translate directly to normal classroom periods. Capped weekly slots.', 'HARD', 'GLOBAL', 'SCHEDULING_PRIORITY', 'classification == "PROJECT"', '{"max_days_per_week": 2, "consecutive_blocks": 2}', 80, 1),
('RULE_FACULTY_PREFERENCE_POLICY', 'Faculty Morning/Evening Preference Policy', 'Soft preference weighting for morning (periods 1-4) or evening (periods 5-7) classes.', 'SOFT', 'GLOBAL', 'PREFERENCE', NULL, '{"morning_periods": [1, 2, 3, 4], "evening_periods": [5, 6, 7]}', 50, 1);
