package services

import (
	"fmt"
	"log"
	"sync"
	"time"

	"zerohost/dashboard/internal/database"
)

var (
	schedulerRunning bool
	schedulerMu      sync.Mutex
	stopChan         chan struct{}
)

func StartScheduler() {
	schedulerMu.Lock()
	if schedulerRunning {
		schedulerMu.Unlock()
		return
	}
	schedulerRunning = true
	stopChan = make(chan struct{})
	schedulerMu.Unlock()

	go func() {
		log.Println("Server lifetime scheduler started")
		suspendExpiredServers()

		for {
			next := msUntilMidnight()
			select {
			case <-time.After(next):
				suspendExpiredServers()
				cleanupOldNotifications()
				cleanupOldActivityLogs()
			case <-stopChan:
				return
			}
		}
	}()
}

func StopScheduler() {
	schedulerMu.Lock()
	defer schedulerMu.Unlock()
	if schedulerRunning {
		schedulerRunning = false
		close(stopChan)
	}
}

func msUntilMidnight() time.Duration {
	now := time.Now()
	midnight := time.Date(now.Year(), now.Month(), now.Day()+1, 0, 0, 0, 0, now.Location())
	return midnight.Sub(now)
}

func suspendExpiredServers() {
	rows, err := database.DB.Query(
		"SELECT * FROM server_meta WHERE expires_at <= NOW() AND status = 'active'",
	)
	if err != nil {
		log.Printf("Scheduler check error: %v", err)
		return
	}
	defer rows.Close()

	var expired []map[string]interface{}
	cols, _ := rows.Columns()
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		valPtrs := make([]interface{}, len(cols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		rows.Scan(valPtrs...)
		row := make(map[string]interface{})
		for i, col := range cols {
			row[col] = vals[i]
		}
		expired = append(expired, row)
	}

	for _, row := range expired {
		pteroID := toInt64(row["ptero_server_id"])
		id := toInt64(row["id"])
		userID := toInt64(row["user_id"])

		if err := SuspendPteroServer(pteroID); err != nil {
			log.Printf("Failed to suspend server %d: %v", pteroID, err)
			continue
		}

		database.DB.Exec("UPDATE server_meta SET status = 'suspended' WHERE id = ?", id)
		CreateNotification(userID, "Server Expired",
			fmt.Sprintf("Your server #%d has been suspended due to expiry. Renew it to reactivate.", pteroID),
			"warning", nil)
		log.Printf("Suspended server %d (expired)", pteroID)
	}

	if len(expired) > 0 {
		log.Printf("Suspended %d expired server(s)", len(expired))
	}
}

func cleanupOldNotifications() {
	res, err := database.DB.Exec(
		"DELETE FROM notifications WHERE created_at < NOW() - INTERVAL 90 DAY AND is_read = 1",
	)
	if err != nil {
		log.Printf("Notification cleanup error: %v", err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("Cleaned up %d old read notification(s)", n)
	}
}

func cleanupOldActivityLogs() {
	res, err := database.DB.Exec(
		"DELETE FROM activity_log WHERE created_at < NOW() - INTERVAL 90 DAY",
	)
	if err != nil {
		log.Printf("Activity log cleanup error: %v", err)
		return
	}
	if n, _ := res.RowsAffected(); n > 0 {
		log.Printf("Cleaned up %d old activity log(s)", n)
	}
}

func toInt64(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case int64:
		return val
	case float64:
		return int64(val)
	case []byte:
		n := int64(0)
		for _, b := range val {
			if b >= '0' && b <= '9' {
				n = n*10 + int64(b-'0')
			} else {
				break
			}
		}
		return n
	}
	return 0
}
