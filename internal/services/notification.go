package services

import (
	"log"

	"zerohost/dashboard/internal/database"
)

func CreateNotification(userID int64, title, message, notifType string, link *string) {
	_, err := database.DB.Exec(
		"INSERT INTO notifications (user_id, title, message, type, link) VALUES (?, ?, ?, ?, ?)",
		userID, title, message, notifType, link,
	)
	if err != nil {
		log.Printf("Failed to create notification: %v", err)
	}
}

type NotificationResult struct {
	Notifications []map[string]interface{} `json:"notifications"`
	Total         int                      `json:"total"`
}

func GetNotifications(userID int64, limit, offset int) (*NotificationResult, error) {
	rows, err := database.DB.Query(
		`SELECT n.*, (SELECT COUNT(*) FROM notifications WHERE user_id = ?) as _total
		 FROM notifications n WHERE n.user_id = ?
		 ORDER BY n.created_at DESC LIMIT ? OFFSET ?`,
		userID, userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var notifications []map[string]interface{}
	total := 0

	cols, _ := rows.Columns()
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		valPtrs := make([]interface{}, len(cols))
		for i := range vals {
			valPtrs[i] = &vals[i]
		}
		if err := rows.Scan(valPtrs...); err != nil {
			return nil, err
		}
		row := make(map[string]interface{})
		for i, col := range cols {
			if col == "_total" {
				total = toInt(vals[i])
				continue
			}
			row[col] = vals[i]
		}
		notifications = append(notifications, row)
	}

	return &NotificationResult{Notifications: notifications, Total: total}, nil
}

func GetUnreadCount(userID int64) (int, error) {
	var count int
	err := database.DB.QueryRow(
		"SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = 0", userID,
	).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func MarkAsRead(notificationID, userID int64) error {
	_, err := database.DB.Exec(
		"UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
		notificationID, userID,
	)
	return err
}

func MarkAllAsRead(userID int64) error {
	_, err := database.DB.Exec(
		"UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
		userID,
	)
	return err
}


