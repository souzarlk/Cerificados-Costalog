-- AGENTE COSTALOG — esquema MariaDB 10.6+ (InnoDB / utf8mb4).
-- DDL de MariaDB efetua commits implícitos; cada CREATE TABLE é idempotente.
CREATE TABLE IF NOT EXISTS admin_users (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  email VARCHAR(254) NOT NULL UNIQUE,
  display_name VARCHAR(160) NOT NULL DEFAULT '',
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_admin_role CHECK (role IN ('admin','auditor'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_sites (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  name VARCHAR(70) NOT NULL,
  hostname VARCHAR(253) NOT NULL UNIQUE,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  created_by CHAR(36) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_sites_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  CONSTRAINT fk_sites_updated_by FOREIGN KEY (updated_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_devices (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  device_name VARCHAR(120) NOT NULL,
  windows_username VARCHAR(120) NOT NULL DEFAULT '',
  os_version VARCHAR(120) NOT NULL DEFAULT '',
  agent_version VARCHAR(40) NOT NULL DEFAULT '',
  install_mode VARCHAR(32) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  policy_revision INT UNSIGNED NOT NULL DEFAULT 0,
  last_seen_at DATETIME(3) NULL,
  enrolled_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_device_mode CHECK (install_mode IN ('certificate','certificate-and-web')),
  CONSTRAINT chk_device_status CHECK (status IN ('pending','active','disabled','revoked')),
  KEY idx_agent_devices_status (status),
  KEY idx_agent_devices_last_seen (last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS enrollment_tokens (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_by CHAR(36) NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_enrollment_created_by FOREIGN KEY (created_by) REFERENCES admin_users(id) ON DELETE SET NULL,
  KEY idx_enrollment_expiry (expires_at, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_policies (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  revision INT UNSIGNED NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL,
  payload JSON NOT NULL,
  published_by CHAR(36) NULL,
  published_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT chk_policy_status CHECK (status IN ('draft','published')),
  CONSTRAINT fk_policy_published_by FOREIGN KEY (published_by) REFERENCES admin_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS agent_events (
  id CHAR(36) NOT NULL PRIMARY KEY DEFAULT (UUID()),
  device_id CHAR(36) NULL,
  event_type VARCHAR(80) NOT NULL,
  title VARCHAR(120) NOT NULL DEFAULT '',
  message VARCHAR(1000) NOT NULL DEFAULT '',
  domain VARCHAR(253) NOT NULL DEFAULT '',
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_event_device FOREIGN KEY (device_id) REFERENCES agent_devices(id) ON DELETE SET NULL,
  KEY idx_agent_events_created_at (created_at),
  KEY idx_agent_events_device (device_id, created_at),
  KEY idx_agent_events_type (event_type, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Linha única bloqueada com SELECT ... FOR UPDATE para serializar revisões de política.
CREATE TABLE IF NOT EXISTS agent_policy_lock (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB;
INSERT IGNORE INTO agent_policy_lock(id) VALUES (1);
