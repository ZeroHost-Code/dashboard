package routes

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type AdminHandler struct{}

func RegisterAdminRoutes(r chi.Router) {
	h := &AdminHandler{}

	r.Get("/admin/servers", middleware.RequireAdmin(http.HandlerFunc(h.ListAdminServers)))
	r.Get("/admin/servers/{id}", middleware.RequireAdmin(http.HandlerFunc(h.GetAdminServer)))
	r.Delete("/admin/servers/{id}", middleware.RequireAdmin(http.HandlerFunc(h.DeleteAdminServer)))
	r.Post("/admin/servers/{id}/suspend", middleware.RequireAdmin(http.HandlerFunc(h.SuspendServer)))
	r.Post("/admin/servers/{id}/unsuspend", middleware.RequireAdmin(http.HandlerFunc(h.UnsuspendServer)))
	r.Get("/admin/users", middleware.RequireAdmin(http.HandlerFunc(h.ListUsers)))
	r.Get("/admin/users/{id}", middleware.RequireAdmin(http.HandlerFunc(h.GetUser)))
	r.Patch("/admin/users/{id}", middleware.RequireAdmin(http.HandlerFunc(h.UpdateUser)))
	r.Delete("/admin/users/{id}", middleware.RequireAdmin(http.HandlerFunc(h.DeleteUser)))
	r.Post("/admin/users/{id}/restrict", middleware.RequireAdmin(http.HandlerFunc(h.RestrictUser)))
	r.Post("/admin/users/{id}/unrestrict", middleware.RequireAdmin(http.HandlerFunc(h.UnrestrictUser)))
	r.Post("/admin/users/{id}/unsuspend-all", middleware.RequireAdmin(http.HandlerFunc(h.UnsuspendAllUserServers)))
	r.Get("/admin/activity", middleware.RequireAdmin(http.HandlerFunc(h.AdminActivity)))
	r.Get("/admin/nests", middleware.RequireAdmin(http.HandlerFunc(h.ListAdminNests)))
	r.Post("/admin/nests", middleware.RequireAdmin(http.HandlerFunc(h.SaveNest)))
	r.Put("/admin/nests/{id}", middleware.RequireAdmin(http.HandlerFunc(h.UpdateNest)))
	r.Post("/admin/eggs", middleware.RequireAdmin(http.HandlerFunc(h.SaveEgg)))
	r.Put("/admin/eggs/{nestId}/{eggId}", middleware.RequireAdmin(http.HandlerFunc(h.UpdateEgg)))
	r.Get("/admin/health", middleware.RequireAdmin(http.HandlerFunc(h.HealthCheck)))
	r.Get("/admin/stats", middleware.RequireAdmin(http.HandlerFunc(h.AdminStats)))
	r.Post("/admin/users/{id}/reset-password", middleware.RequireAdmin(http.HandlerFunc(h.AdminResetPassword)))
	r.Post("/admin/servers/{id}/reinstall", middleware.RequireAdmin(http.HandlerFunc(h.AdminReinstallServer)))
	r.Get("/admin/logs", middleware.RequireAdmin(http.HandlerFunc(h.GetLogs)))
	r.Get("/admin/settings", middleware.RequireAdmin(http.HandlerFunc(h.GetSettings)))
	r.Put("/admin/settings", middleware.RequireAdmin(http.HandlerFunc(h.UpdateSettings)))
}

func (h *AdminHandler) ListAdminServers(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query(`
		SELECT sm.id, sm.ptero_server_id, sm.status, sm.created_at, sm.expires_at, sm.suspend_reason,
		       sm.suspended_by, u.id, u.username, u.email
		FROM server_meta sm
		JOIN users u ON u.id = sm.user_id
		ORDER BY sm.created_at DESC
	`)
	if err != nil {
		jsonError(w, "Failed to fetch servers", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type ServerEntry struct {
		ID             int64   `json:"id"`
		PteroServerID  int64   `json:"ptero_server_id"`
		Status         string  `json:"status"`
		CreatedAt      *string `json:"created_at"`
		ExpiresAt      *string `json:"expires_at"`
		SuspendReason  *string `json:"suspend_reason"`
		SuspendedBy    *string `json:"suspended_by"`
		UserID         int64   `json:"userId"`
		Username       string  `json:"username"`
		Email          string  `json:"email"`
	}

	var servers []ServerEntry
	for rows.Next() {
		var s ServerEntry
		rows.Scan(&s.ID, &s.PteroServerID, &s.Status, &s.CreatedAt, &s.ExpiresAt, &s.SuspendReason, &s.SuspendedBy, &s.UserID, &s.Username, &s.Email)
		servers = append(servers, s)
	}
	if servers == nil {
		servers = []ServerEntry{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"servers": servers})
}

func (h *AdminHandler) GetAdminServer(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	server, err := services.GetServerByID(id)
	if err != nil {
		jsonError(w, "Server not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"server": server})
}

func (h *AdminHandler) DeleteAdminServer(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	var userID int64
	database.DB.QueryRow("SELECT user_id FROM server_meta WHERE ptero_server_id = ?", id).Scan(&userID)

	services.DeletePteroServer(id)
	database.DB.Exec("DELETE FROM server_meta WHERE ptero_server_id = ?", id)

	services.LogActivity(admin.UserID, "admin_server_deleted", "Admin deleted server #"+idStr, &id)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) SuspendServer(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Reason string `json:"reason"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Reason == "" {
		jsonError(w, "Reason is required", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE server_meta SET status = 'suspended', suspend_reason = ?, suspended_by = 'admin' WHERE ptero_server_id = ?", body.Reason, id)
	services.SuspendPteroServer(id)

	var userID int64
	database.DB.QueryRow("SELECT user_id FROM server_meta WHERE ptero_server_id = ?", id).Scan(&userID)
	link := idStr
	services.LogActivity(admin.UserID, "admin_server_suspended", "Admin suspended server #"+idStr+" - Reason: "+body.Reason, &id)
	if userID > 0 {
		services.CreateNotification(userID, "Server Suspended", "Your server #"+idStr+" has been suspended by an administrator. Reason: "+body.Reason, "error", &link)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) UnsuspendServer(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE server_meta SET status = 'active', suspend_reason = NULL, suspended_by = NULL WHERE ptero_server_id = ?", id)
	services.UnsuspendPteroServer(id)

	var userID int64
	database.DB.QueryRow("SELECT user_id FROM server_meta WHERE ptero_server_id = ?", id).Scan(&userID)
	link := idStr
	services.LogActivity(admin.UserID, "admin_server_unsuspended", "Admin unsuspended server #"+idStr, &id)
	if userID > 0 {
		services.CreateNotification(userID, "Server Unsuspended", "Your server #"+idStr+" has been unsuspended by an administrator.", "success", &link)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	pageStr := r.URL.Query().Get("page")
	search := r.URL.Query().Get("search")
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit

	var rows *sql.Rows
	var err error
	var totalCount int

	if search != "" {
		database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE username LIKE ? OR email LIKE ?", "%"+search+"%", "%"+search+"%").Scan(&totalCount)
		rows, err = database.DB.Query("SELECT id, username, email, ptero_id, restricted, email_verified, created_at, last_login FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?", "%"+search+"%", "%"+search+"%", limit, offset)
	} else {
		database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalCount)
		rows, err = database.DB.Query("SELECT id, username, email, ptero_id, restricted, email_verified, created_at, last_login FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?", limit, offset)
	}

	if err != nil {
		jsonError(w, "Failed to fetch users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type UserEntry struct {
		ID            int64   `json:"id"`
		Username      string  `json:"username"`
		Email         string  `json:"email"`
		PteroID       *int64  `json:"ptero_id"`
		Restricted    bool    `json:"restricted"`
		EmailVerified bool    `json:"email_verified"`
		CreatedAt     *string `json:"created_at"`
		LastLogin     *string `json:"last_login"`
	}

	var users []UserEntry
	for rows.Next() {
		var u UserEntry
		rows.Scan(&u.ID, &u.Username, &u.Email, &u.PteroID, &u.Restricted, &u.EmailVerified, &u.CreatedAt, &u.LastLogin)
		users = append(users, u)
	}
	if users == nil {
		users = []UserEntry{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"users":       users,
		"total":       totalCount,
		"page":        page,
		"totalPages":  (totalCount + limit - 1) / limit,
	})
}

func (h *AdminHandler) GetUser(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var u struct {
		ID            int64   `json:"id"`
		Username      string  `json:"username"`
		Email         string  `json:"email"`
		PteroID       *int64  `json:"ptero_id"`
		Restricted    bool    `json:"restricted"`
		EmailVerified bool    `json:"email_verified"`
		CreatedAt     *string `json:"created_at"`
		LastLogin     *string `json:"last_login"`
	}
	err = database.DB.QueryRow("SELECT id, username, email, ptero_id, restricted, email_verified, created_at, last_login FROM users WHERE id = ?", id).Scan(&u.ID, &u.Username, &u.Email, &u.PteroID, &u.Restricted, &u.EmailVerified, &u.CreatedAt, &u.LastLogin)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	serverRows, err := database.DB.Query("SELECT id, ptero_server_id, status, created_at, expires_at FROM server_meta WHERE user_id = ?", id)
	var serverMetas []map[string]interface{}
	if err == nil {
		defer serverRows.Close()
		for serverRows.Next() {
			var smID, pteroID int64
			var status string
			var createdAt, expiresAt *string
			serverRows.Scan(&smID, &pteroID, &status, &createdAt, &expiresAt)
			serverMetas = append(serverMetas, map[string]interface{}{
				"id": smID, "ptero_server_id": pteroID, "status": status,
				"created_at": createdAt, "expires_at": expiresAt,
			})
		}
	}
	if serverMetas == nil {
		serverMetas = []map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user":    u,
		"servers": serverMetas,
	})
}

func (h *AdminHandler) UpdateUser(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Username *string `json:"username"`
		Email    *string `json:"email"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Username != nil {
		database.DB.Exec("UPDATE users SET username = ? WHERE id = ?", *body.Username, id)
	}
	if body.Email != nil {
		database.DB.Exec("UPDATE users SET email = ? WHERE id = ?", *body.Email, id)
	}

	services.LogActivity(admin.UserID, "admin_user_updated", "Admin updated user #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) DeleteUser(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	rows, _ := database.DB.Query("SELECT ptero_server_id FROM server_meta WHERE user_id = ?", id)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var sid int64
			rows.Scan(&sid)
			services.DeletePteroServer(sid)
		}
	}

	database.DB.Exec("DELETE FROM server_meta WHERE user_id = ?", id)
	database.DB.Exec("DELETE FROM activity_logs WHERE user_id = ?", id)
	database.DB.Exec("DELETE FROM notifications WHERE user_id = ?", id)
	database.DB.Exec("DELETE FROM user_ips WHERE user_id = ?", id)
	database.DB.Exec("DELETE FROM passkeys WHERE user_id = ?", id)
	database.DB.Exec("DELETE FROM users WHERE id = ?", id)

	services.LogActivity(admin.UserID, "admin_user_deleted", "Admin deleted user #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) RestrictUser(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE users SET restricted = TRUE WHERE id = ?", id)
	services.LogActivity(admin.UserID, "admin_user_restricted", "Admin restricted user #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) UnrestrictUser(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE users SET restricted = FALSE WHERE id = ?", id)
	services.LogActivity(admin.UserID, "admin_user_unrestricted", "Admin unrestricted user #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) UnsuspendAllUserServers(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	rows, _ := database.DB.Query("SELECT ptero_server_id FROM server_meta WHERE user_id = ? AND status = 'suspended'", id)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var sid int64
			rows.Scan(&sid)
			services.UnsuspendPteroServer(sid)
		}
	}
	database.DB.Exec("UPDATE server_meta SET status = 'active', suspend_reason = NULL, suspended_by = NULL WHERE user_id = ?", id)
	services.LogActivity(admin.UserID, "admin_user_unsuspended_all", "Admin unsuspended all servers for user #"+idStr, nil)
	services.CreateNotification(id, "Servers Unsuspended", "All your servers have been unsuspended by an administrator.", "success", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) AdminResetPassword(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var body struct {
		NewPassword string `json:"newPassword"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.NewPassword == "" {
		jsonError(w, "New password is required", http.StatusBadRequest)
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		jsonError(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	database.DB.Exec("UPDATE users SET password_hash = ? WHERE id = ?", string(hash), id)
	services.LogActivity(admin.UserID, "admin_password_reset", "Admin reset password for user #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) AdminReinstallServer(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	if err := services.ReinstallPteroServer(id); err != nil {
		jsonError(w, "Failed to reinstall server", http.StatusInternalServerError)
		return
	}

	var userID int64
	database.DB.QueryRow("SELECT user_id FROM server_meta WHERE ptero_server_id = ?", id).Scan(&userID)
	link := idStr
	services.LogActivity(admin.UserID, "admin_server_reinstalled", "Admin reinstalled server #"+idStr, &id)
	if userID > 0 {
		services.CreateNotification(userID, "Server Reinstalled", "Your server #"+idStr+" has been reinstalled by an administrator.", "warning", &link)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) AdminActivity(w http.ResponseWriter, r *http.Request) {
	pageStr := r.URL.Query().Get("page")
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit := 50
	offset := (page - 1) * limit

	var totalCount int
	database.DB.QueryRow("SELECT COUNT(*) FROM activity_logs").Scan(&totalCount)

	rows, err := database.DB.Query(`
		SELECT al.id, al.user_id, al.action, al.description, al.server_id, al.created_at, u.username
		FROM activity_logs al
		LEFT JOIN users u ON u.id = al.user_id
		ORDER BY al.created_at DESC LIMIT ? OFFSET ?
	`, limit, offset)
	if err != nil {
		jsonError(w, "Failed to fetch activity logs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var logs []map[string]interface{}
	for rows.Next() {
		var id, userID int64
		var action, desc, username string
		var serverID *int64
		var createdAt *string
		rows.Scan(&id, &userID, &action, &desc, &serverID, &createdAt, &username)
		logs = append(logs, map[string]interface{}{
			"id": id, "user_id": userID, "action": action,
			"description": desc, "server_id": serverID,
			"created_at": createdAt, "username": username,
		})
	}
	if logs == nil {
		logs = []map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"logs":       logs,
		"total":      totalCount,
		"page":       page,
		"totalPages": (totalCount + limit - 1) / limit,
	})
}

func (h *AdminHandler) ListAdminNests(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT ptero_nest_id, name, logo, description, unavailable FROM nests ORDER BY name")
	if err != nil {
		jsonError(w, "Failed to fetch nests", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var nests []map[string]interface{}
	for rows.Next() {
		var id int64
		var name string
		var logo, desc *string
		var unavail bool
		rows.Scan(&id, &name, &logo, &desc, &unavail)
		nests = append(nests, map[string]interface{}{
			"ptero_nest_id": id, "name": name, "logo": logo,
			"description": desc, "unavailable": unavail,
		})
	}
	if nests == nil {
		nests = []map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"nests": nests})
}

func (h *AdminHandler) SaveNest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PteroNestID int64   `json:"ptero_nest_id"`
		Name        string  `json:"name"`
		Logo        *string `json:"logo"`
		Description *string `json:"description"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.PteroNestID == 0 || body.Name == "" {
		jsonError(w, "Nest ID and name are required", http.StatusBadRequest)
		return
	}

	_, err := database.DB.Exec(
		"INSERT INTO nests (ptero_nest_id, name, logo, description) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name), logo = VALUES(logo), description = VALUES(description)",
		body.PteroNestID, body.Name, body.Logo, body.Description,
	)
	if err != nil {
		jsonError(w, "Failed to save nest", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *AdminHandler) UpdateNest(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid nest ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Unavailable *bool `json:"unavailable"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Unavailable != nil {
		database.DB.Exec("UPDATE nests SET unavailable = ? WHERE ptero_nest_id = ?", *body.Unavailable, id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) SaveEgg(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PteroNestID int64   `json:"ptero_nest_id"`
		PteroEggID  int64   `json:"ptero_egg_id"`
		Logo        *string `json:"logo"`
		CPULimit    *int64  `json:"cpu_limit"`
		MemoryLimit *int64  `json:"memory_limit"`
		DiskLimit   *int64  `json:"disk_limit"`
		Unavailable *bool   `json:"unavailable"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.PteroNestID == 0 || body.PteroEggID == 0 {
		jsonError(w, "Nest ID and egg ID are required", http.StatusBadRequest)
		return
	}

	_, err := database.DB.Exec(
		`INSERT INTO egg_resources (ptero_nest_id, ptero_egg_id, logo, cpu_limit, memory_limit, disk_limit, unavailable)
		 VALUES (?, ?, ?, ?, ?, ?, ?)
		 ON DUPLICATE KEY UPDATE logo = VALUES(logo), cpu_limit = VALUES(cpu_limit), memory_limit = VALUES(memory_limit), disk_limit = VALUES(disk_limit), unavailable = VALUES(unavailable)`,
		body.PteroNestID, body.PteroEggID, body.Logo, body.CPULimit, body.MemoryLimit, body.DiskLimit, boolVal(body.Unavailable, false),
	)
	if err != nil {
		jsonError(w, "Failed to save egg", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *AdminHandler) UpdateEgg(w http.ResponseWriter, r *http.Request) {
	nestIDStr := r.PathValue("nestId")
	eggIDStr := r.PathValue("eggId")
	nestID, _ := strconv.ParseInt(nestIDStr, 10, 64)
	eggID, _ := strconv.ParseInt(eggIDStr, 10, 64)

	var body struct {
		Unavailable *bool `json:"unavailable"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Unavailable != nil {
		database.DB.Exec("UPDATE egg_resources SET unavailable = ? WHERE ptero_nest_id = ? AND ptero_egg_id = ?", *body.Unavailable, nestID, eggID)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func boolVal(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func (h *AdminHandler) AdminStats(w http.ResponseWriter, r *http.Request) {
	var totalUsers, totalServers, activeServers, suspendedServers int64
	database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta").Scan(&totalServers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta WHERE status = 'active'").Scan(&activeServers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta WHERE status = 'suspended'").Scan(&suspendedServers)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"totalUsers":       totalUsers,
		"totalServers":     totalServers,
		"activeServers":    activeServers,
		"suspendedServers": suspendedServers,
	})
}

func (h *AdminHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	var dbOK bool
	err := database.DB.Ping()
	dbOK = err == nil

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":   "ok",
		"database": dbOK,
		"pterodactyl": services.TestPteroConnection() == nil,
	})
}

func (h *AdminHandler) GetLogs(w http.ResponseWriter, r *http.Request) {
	linesStr := r.URL.Query().Get("lines")
	lines, _ := strconv.Atoi(linesStr)
	if lines < 1 || lines > 1000 {
		lines = 100
	}

	logs, err := services.ReadLogLines(lines)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"logs": []interface{}{}})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"logs": logs})
}

func (h *AdminHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT `key`, `value` FROM node_settings")
	if err != nil {
		jsonError(w, "Failed to fetch settings", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	settings := make(map[string]interface{})
	for rows.Next() {
		var key, value string
		rows.Scan(&key, &value)
		settings[key] = value
	}
	if settings == nil {
		settings = map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"settings": settings})
}

func (h *AdminHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Settings map[string]string `json:"settings"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	for key, value := range body.Settings {
		database.DB.Exec("INSERT INTO node_settings (`key`, `value`) VALUES (?, ?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)", key, value)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
