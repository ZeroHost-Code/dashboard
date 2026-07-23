package services

import (
	"log"
	"regexp"
	"strings"

	"zerohost/dashboard/internal/database"
)

func LogActivity(userID int64, action, details string, serverID *int64) {
	re := regexp.MustCompile(`[<>"']`)
	safeDetails := re.ReplaceAllString(details, "")
	if len(safeDetails) > 255 {
		safeDetails = safeDetails[:255]
	}

	_, err := database.DB.Exec(
		"INSERT INTO activity_log (user_id, action, details, server_id) VALUES (?, ?, ?, ?)",
		userID, action, safeDetails, serverID,
	)
	if err != nil {
		log.Printf("Failed to log activity: %v", err)
	}
}

type ActivityResult struct {
	Activities []map[string]interface{} `json:"activities"`
	Total      int                      `json:"total"`
}

func GetRecentActivity(userID int64, limit, offset int) (*ActivityResult, error) {
	rows, err := database.DB.Query(
		`SELECT al.*, (SELECT COUNT(*) FROM activity_log WHERE user_id = ? AND action NOT LIKE 'admin_%') as _total
		 FROM activity_log al WHERE al.user_id = ? AND al.action NOT LIKE 'admin_%'
		 ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
		userID, userID, limit, offset,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var activities []map[string]interface{}
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
		activities = append(activities, row)
	}

	return &ActivityResult{Activities: activities, Total: total}, nil
}

func toInt(v interface{}) int {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case int64:
		return int(val)
	case float64:
		return int(val)
	case int:
		return val
	case []byte:
		n := 0
		for _, b := range val {
			if b >= '0' && b <= '9' {
				n = n*10 + int(b-'0')
			} else {
				break
			}
		}
		return n
	}
	return 0
}

func toString(v interface{}) string {
	if v == nil {
		return ""
	}
	switch val := v.(type) {
	case string:
		return val
	case []byte:
		return string(val)
	case int64:
		return fmt.Sprintf("%d", val)
	}
	return fmt.Sprintf("%v", v)
}

func toBool(v interface{}) bool {
	if v == nil {
		return false
	}
	switch val := v.(type) {
	case bool:
		return val
	case int64:
		return val != 0
	case []byte:
		return string(val) == "1" || strings.ToLower(string(val)) == "true"
	case float64:
		return val != 0
	}
	return false
}

func toFloat64(v interface{}) float64 {
	if v == nil {
		return 0
	}
	switch val := v.(type) {
	case float64:
		return val
	case int64:
		return float64(val)
	case []byte:
		f := 0.0
		fmt.Sscanf(string(val), "%f", &f)
		return f
	case string:
		f := 0.0
		fmt.Sscanf(val, "%f", &f)
		return f
	}
	return 0
}
