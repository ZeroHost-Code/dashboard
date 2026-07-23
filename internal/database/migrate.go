package database

import (
	"fmt"
	"log"
	"strings"
)

type columnDef struct {
	Name string
	Def  string
}

var tables = map[string][]columnDef{
	"users": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "email", Def: "VARCHAR(255) NOT NULL"},
		{Name: "username", Def: "VARCHAR(255) NOT NULL"},
		{Name: "password_hash", Def: "VARCHAR(255) NOT NULL"},
		{Name: "ptero_user_id", Def: "INT"},
		{Name: "ptero_uuid", Def: "VARCHAR(255)"},
		{Name: "first_name", Def: "VARCHAR(255)"},
		{Name: "last_name", Def: "VARCHAR(255)"},
		{Name: "password_set", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "is_admin", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "restricted", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "auth_restricted", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "token_version", Def: "INT NOT NULL DEFAULT 0"},
		{Name: "avatar", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "ptero_client_api_key", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "email_verified", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "verification_token", Def: "VARCHAR(64) DEFAULT NULL"},
		{Name: "verification_token_expires", Def: "DATETIME DEFAULT NULL"},
		{Name: "pending_email", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "email_change_token", Def: "VARCHAR(64) DEFAULT NULL"},
		{Name: "email_change_code", Def: "VARCHAR(10) DEFAULT NULL"},
		{Name: "email_change_expires", Def: "DATETIME DEFAULT NULL"},
		{Name: "user_agent", Def: "VARCHAR(512) DEFAULT NULL"},
		{Name: "onboarding_done", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "totp_secret", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "totp_enabled", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "recovery_codes", Def: "TEXT DEFAULT NULL"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
	},
	"server_meta": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "ptero_server_id", Def: "INT NOT NULL"},
		{Name: "user_id", Def: "INT NOT NULL"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
		{Name: "expires_at", Def: "TIMESTAMP NOT NULL"},
		{Name: "status", Def: "ENUM('active','suspended','expired') DEFAULT 'active'"},
		{Name: "suspend_reason", Def: "TEXT DEFAULT NULL"},
		{Name: "suspended_by", Def: "VARCHAR(20) DEFAULT NULL"},
	},
	"user_ips": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "user_id", Def: "INT NOT NULL"},
		{Name: "ip_address", Def: "VARCHAR(45) NOT NULL"},
		{Name: "user_agent", Def: "VARCHAR(512) DEFAULT NULL"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
	},
	"activity_log": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "user_id", Def: "INT NOT NULL"},
		{Name: "action", Def: "VARCHAR(50) NOT NULL"},
		{Name: "details", Def: "VARCHAR(255) DEFAULT ''"},
		{Name: "server_id", Def: "INT DEFAULT NULL"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
	},
	"nests": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "ptero_nest_id", Def: "INT NOT NULL UNIQUE"},
		{Name: "name", Def: "VARCHAR(255) NOT NULL"},
		{Name: "logo", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "description", Def: "TEXT DEFAULT NULL"},
		{Name: "unavailable", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
	},
	"egg_resources": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "ptero_nest_id", Def: "INT NOT NULL"},
		{Name: "ptero_egg_id", Def: "INT NOT NULL"},
		{Name: "logo", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "cpu_limit", Def: "INT DEFAULT NULL"},
		{Name: "memory_limit", Def: "INT DEFAULT NULL"},
		{Name: "disk_limit", Def: "INT DEFAULT NULL"},
		{Name: "unavailable", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
		{Name: "updated_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"},
	},
	"notifications": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "user_id", Def: "INT NOT NULL"},
		{Name: "title", Def: "VARCHAR(255) NOT NULL"},
		{Name: "message", Def: "TEXT NOT NULL"},
		{Name: "type", Def: "VARCHAR(20) NOT NULL DEFAULT 'info'"},
		{Name: "link", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "is_read", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
	},
	"passkeys": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "user_id", Def: "INT NOT NULL"},
		{Name: "credential_id", Def: "VARCHAR(512) NOT NULL"},
		{Name: "public_key", Def: "TEXT NOT NULL"},
		{Name: "counter", Def: "INT NOT NULL DEFAULT 0"},
		{Name: "transports", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "name", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "last_used_at", Def: "TIMESTAMP NULL DEFAULT NULL"},
		{Name: "user_handle", Def: "VARCHAR(255) DEFAULT NULL"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
	},
	"node_settings": {
		{Name: "id", Def: "INT AUTO_INCREMENT PRIMARY KEY"},
		{Name: "ptero_node_id", Def: "INT NOT NULL UNIQUE"},
		{Name: "unavailable", Def: "TINYINT(1) NOT NULL DEFAULT 0"},
		{Name: "created_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP"},
		{Name: "updated_at", Def: "TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP"},
	},
}

var constraints = []string{
	"ALTER TABLE server_meta ADD INDEX idx_expires (expires_at)",
	"ALTER TABLE server_meta ADD INDEX idx_user (user_id)",
	"ALTER TABLE server_meta ADD INDEX idx_status (status)",
	"ALTER TABLE server_meta ADD INDEX idx_ptero_server (ptero_server_id)",
	"ALTER TABLE server_meta ADD CONSTRAINT fk_server_meta_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
	"ALTER TABLE user_ips ADD INDEX idx_ip (ip_address)",
	"ALTER TABLE user_ips ADD INDEX idx_user (user_id)",
	"ALTER TABLE user_ips ADD CONSTRAINT fk_user_ips_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
	"ALTER TABLE activity_log ADD INDEX idx_activity_user (user_id)",
	"ALTER TABLE activity_log ADD INDEX idx_activity_created (created_at)",
	"ALTER TABLE activity_log ADD INDEX idx_action (action)",
	"ALTER TABLE activity_log ADD CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
	"ALTER TABLE egg_resources ADD UNIQUE INDEX idx_egg_resources_nest_egg (ptero_nest_id, ptero_egg_id)",
	"ALTER TABLE notifications ADD INDEX idx_notif_user (user_id)",
	"ALTER TABLE notifications ADD INDEX idx_notif_user_read (user_id, is_read)",
	"ALTER TABLE notifications ADD INDEX idx_notif_created (created_at)",
	"ALTER TABLE notifications ADD CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
	"ALTER TABLE users ADD INDEX idx_email (email)",
	"ALTER TABLE users ADD INDEX idx_username (username)",
	"ALTER TABLE passkeys ADD INDEX idx_passkey_user (user_id)",
	"ALTER TABLE passkeys ADD INDEX idx_passkey_credential (credential_id(255))",
	"ALTER TABLE passkeys ADD CONSTRAINT fk_passkey_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE",
	"ALTER TABLE node_settings ADD INDEX idx_node_settings_node (ptero_node_id)",
}

func escapeID(id string) string {
	return "`" + strings.ReplaceAll(id, "`", "``") + "`"
}

func RunMigrations() {
	for table, cols := range tables {
		safeTable := escapeID(table)
		var exists int
		err := DB.QueryRow("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?", table).Scan(&exists)
		if err != nil {
			log.Printf("Migration check error for %s: %v", table, err)
			continue
		}
		if exists == 0 {
			var colDefs []string
			for _, c := range cols {
				colDefs = append(colDefs, escapeID(c.Name)+" "+c.Def)
			}
			_, err := DB.Exec(fmt.Sprintf("CREATE TABLE %s (%s)", safeTable, strings.Join(colDefs, ", ")))
			if err != nil {
				log.Printf("Failed to create table %s: %v", table, err)
			} else {
				log.Printf("Created table: %s", table)
			}
			continue
		}
		for _, col := range cols {
			var colExists int
			err := DB.QueryRow("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?", table, col.Name).Scan(&colExists)
			if err != nil {
				continue
			}
			if colExists == 0 {
				_, err := DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", safeTable, escapeID(col.Name), col.Def))
				if err != nil {
					log.Printf("Migration error %s.%s: %v", table, col.Name, err)
				} else {
					log.Printf("Added column %s.%s", table, col.Name)
				}
			}
		}
	}

	for _, sql := range constraints {
		if _, err := DB.Exec(sql); err != nil {
			log.Printf("Skipped constraint: %v", err)
		}
	}
}
