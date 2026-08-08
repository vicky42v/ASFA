-- Additive support schema. Run once against timetable_db; it never changes or deletes academic records.
CREATE TABLE IF NOT EXISTS app_user (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('Admin','Coordinator','HOD') NOT NULL DEFAULT 'Coordinator',
  department_id INT NULL,
  status ENUM('Active','Inactive') NOT NULL DEFAULT 'Active',
  last_login DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_app_user_department FOREIGN KEY (department_id) REFERENCES department(department_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notification (
  notification_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  level ENUM('info','success','warning','error') NOT NULL DEFAULT 'info',
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NULL,
  actor_name VARCHAR(100) NOT NULL,
  action VARCHAR(150) NOT NULL,
  module VARCHAR(80) NOT NULL,
  details TEXT NULL,
  ip_address VARCHAR(64) NULL,
  outcome VARCHAR(30) NOT NULL DEFAULT 'Success',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_created (created_at),
  CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES app_user(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backup_record (
  backup_id INT AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  checksum CHAR(64) NOT NULL,
  size_bytes BIGINT NOT NULL,
  created_by INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_backup_user FOREIGN KEY (created_by) REFERENCES app_user(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS system_setting (
  setting_key VARCHAR(100) PRIMARY KEY,
  setting_value TEXT NOT NULL,
  updated_by INT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_setting_user FOREIGN KEY (updated_by) REFERENCES app_user(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Adds reversible active/inactive state to schema entities whose source tables have no status column.
CREATE TABLE IF NOT EXISTS entity_status (
  entity_type ENUM('department','subject','scheme') NOT NULL,
  entity_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Generate a hash locally, then insert the first administrator; no plaintext passwords are stored.
-- Example: python -c "from werkzeug.security import generate_password_hash; print(generate_password_hash('choose-a-password'))"
-- INSERT INTO app_user (full_name,email,password_hash,role) VALUES ('Local Admin','admin@example.edu','<generated-hash>','Admin');
