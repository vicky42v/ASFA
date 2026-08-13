-- Additive migration for component-aware faculty assignment and cycle-aware timetables.
-- Run once, after 001_admin_support.sql. It is additive and preserves records.

CREATE TABLE IF NOT EXISTS faculty_subject_assignment_detail (
  detail_id INT NOT NULL AUTO_INCREMENT,
  subject_id INT NOT NULL,
  faculty_id INT NOT NULL,
  academic_year VARCHAR(20) NOT NULL,
  component ENUM('Theory','Lab') NOT NULL,
  assignment_role ENUM('Main','Co') NOT NULL DEFAULT 'Main',
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL,
  PRIMARY KEY (detail_id),
  UNIQUE KEY uq_assignment_component_role (subject_id, academic_year, component, assignment_role),
  KEY idx_assignment_detail_lookup (academic_year, subject_id, component, status),
  KEY idx_assignment_detail_faculty (faculty_id, academic_year, status),
  CONSTRAINT fk_assignment_detail_subject FOREIGN KEY (subject_id) REFERENCES subject(subject_id),
  CONSTRAINT fk_assignment_detail_faculty FOREIGN KEY (faculty_id) REFERENCES faculty(faculty_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The project may already have the timetable columns from an earlier local
-- iteration.  These guarded dynamic statements support both layouts.
SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND column_name = 'cycle') = 0,
  'ALTER TABLE timetable ADD COLUMN cycle ENUM(''P'',''C'') NULL AFTER semester_id',
  'SELECT 1'
);
PREPARE timetable_ddl FROM @ddl;
EXECUTE timetable_ddl;
DEALLOCATE PREPARE timetable_ddl;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND column_name = 'co_faculty_id') = 0,
  'ALTER TABLE timetable ADD COLUMN co_faculty_id INT NULL AFTER faculty_id',
  'SELECT 1'
);
PREPARE timetable_ddl FROM @ddl;
EXECUTE timetable_ddl;
DEALLOCATE PREPARE timetable_ddl;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND column_name = 'component') = 0,
  'ALTER TABLE timetable ADD COLUMN component ENUM(''Theory'',''Lab'') NOT NULL DEFAULT ''Theory'' AFTER co_faculty_id',
  'SELECT 1'
);
PREPARE timetable_ddl FROM @ddl;
EXECUTE timetable_ddl;
DEALLOCATE PREPARE timetable_ddl;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND index_name = 'idx_timetable_context_cycle') = 0,
  'ALTER TABLE timetable ADD KEY idx_timetable_context_cycle (department_id, scheme_id, academic_year, semester_type, semester_id, cycle)',
  'SELECT 1'
);
PREPARE timetable_ddl FROM @ddl;
EXECUTE timetable_ddl;
DEALLOCATE PREPARE timetable_ddl;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND index_name = 'idx_timetable_faculty_slot') = 0,
  'ALTER TABLE timetable ADD KEY idx_timetable_faculty_slot (academic_year, semester_type, faculty_id, day, period)',
  'SELECT 1'
);
PREPARE timetable_ddl FROM @ddl;
EXECUTE timetable_ddl;
DEALLOCATE PREPARE timetable_ddl;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.statistics
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND index_name = 'idx_timetable_co_faculty_slot') = 0,
  'ALTER TABLE timetable ADD KEY idx_timetable_co_faculty_slot (academic_year, semester_type, co_faculty_id, day, period)',
  'SELECT 1'
);
PREPARE timetable_ddl FROM @ddl;
EXECUTE timetable_ddl;
DEALLOCATE PREPARE timetable_ddl;

-- Existing assignments remain usable as Theory assignments.  Component assignments
-- added through the application take precedence for new timetable generation.
INSERT IGNORE INTO faculty_subject_assignment_detail
  (subject_id, faculty_id, academic_year, component, assignment_role, status)
SELECT subject_id, faculty_id, academic_year, 'Theory', 'Main', status
FROM faculty_subject_assignment;
