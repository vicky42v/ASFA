-- Migration 004: Add batch column for labs and proctor, plus timetable period timings.

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'timetable' AND column_name = 'batch') = 0,
  'ALTER TABLE timetable ADD COLUMN batch VARCHAR(10) NULL DEFAULT NULL AFTER component',
  'SELECT 1'
);
PREPARE timetable_batch_ddl FROM @ddl;
EXECUTE timetable_batch_ddl;
DEALLOCATE PREPARE timetable_batch_ddl;

SET @ddl := IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'faculty_subject_assignment_detail' AND column_name = 'batch') = 0,
  'ALTER TABLE faculty_subject_assignment_detail ADD COLUMN batch VARCHAR(10) NULL DEFAULT NULL AFTER component',
  'SELECT 1'
);
PREPARE detail_batch_ddl FROM @ddl;
EXECUTE detail_batch_ddl;
DEALLOCATE PREPARE detail_batch_ddl;

-- Standard system settings for timetable timings if not already set
INSERT INTO system_setting (setting_key, setting_value, updated_by)
VALUES
  ('college_start_time', '09:00', 1),
  ('period_duration', '55', 1),
  ('short_break_after_period', '2', 1),
  ('short_break_duration', '15', 1),
  ('lunch_after_period', '4', 1),
  ('lunch_duration', '45', 1),
  ('periods_per_day', '7', 1),
  ('placement_max_periods', '3', 1)
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);
