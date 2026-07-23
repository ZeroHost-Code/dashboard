package routes

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type AdminHandler struct{}

func RegisterAdminRoutes(r chi.Router) {
	h := &AdminHandler{}

	r.Post("/admin/login", http.HandlerFunc(h.AdminLogin))
	r.Get("/admin/check", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.AdminCheck))))
	r.Get("/admin/servers", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ListAdminServers))))
	r.Get("/admin/servers/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetAdminServer))))
	r.Delete("/admin/servers/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.DeleteAdminServer))))
	r.Post("/admin/servers/{id}/suspend", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.SuspendServer))))
	r.Post("/admin/servers/{id}/unsuspend", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UnsuspendServer))))
	r.Post("/admin/servers/{id}/stop", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.StopServer))))
	r.Post("/admin/servers/{id}/renew-now", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.RenewNowServer))))
	r.Post("/admin/servers/{id}/reinstall", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.AdminReinstallServer))))
	r.Get("/admin/users", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ListUsers))))
	r.Get("/admin/users/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetUser))))
	r.Patch("/admin/users/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UpdateUser))))
	r.Delete("/admin/users/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.DeleteUser))))
	r.Post("/admin/users/{id}/restrict", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.RestrictUser))))
	r.Post("/admin/users/{id}/unrestrict", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UnrestrictUser))))
	r.Post("/admin/users/{id}/toggle-admin", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ToggleAdmin))))
	r.Post("/admin/users/{id}/toggle-restriction", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ToggleRestriction))))
	r.Post("/admin/users/{id}/toggle-auth-restriction", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ToggleAuthRestriction))))
	r.Post("/admin/users/{id}/notify", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.NotifyUser))))
	r.Post("/admin/users/{id}/reset-password", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.AdminResetPassword))))
	r.Post("/admin/users/{id}/unsuspend-all", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UnsuspendAllUserServers))))
	r.Post("/admin/notify-all", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.NotifyAll))))
	r.Get("/admin/nodes", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ListNodes))))
	r.Get("/admin/nodes/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetNode))))
	r.Get("/admin/nodes/{id}/allocations", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetNodeAllocations))))
	r.Get("/admin/nodes/{id}/servers", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetNodeServers))))
	r.Get("/admin/nodes/{id}/settings", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetNodeSettings))))
	r.Put("/admin/nodes/{id}/settings", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UpdateNodeSettings))))
	r.Get("/admin/settings/nests", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ListAdminNests))))
	r.Get("/admin/settings/nests/available", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ListAvailableNests))))
	r.Post("/admin/settings/nests", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.SaveNest))))
	r.Put("/admin/settings/nests/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UpdateNest))))
	r.Delete("/admin/settings/nests/{id}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.DeleteNest))))
	r.Get("/admin/settings/nests/{nestId}/eggs", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ListNestEggs))))
	r.Get("/admin/settings/eggs/{nestId}/{eggId}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetEggSettings))))
	r.Put("/admin/settings/eggs/{nestId}/{eggId}", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UpdateEgg))))
	r.Post("/admin/settings/eggs/{nestId}/{eggId}/apply-all", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.ApplyEggAll))))
	r.Get("/admin/activity", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.AdminActivity))))
	r.Get("/admin/health", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.HealthCheck))))
	r.Get("/admin/stats", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.AdminStats))))
	r.Get("/admin/logs", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetLogs))))
	r.Get("/admin/settings", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.GetSettings))))
	r.Put("/admin/settings", middleware.AuthenticateToken(middleware.RequireAdmin(http.HandlerFunc(h.UpdateSettings))))
}

func (h *AdminHandler) AdminLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		CapToken string `json:"capToken"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Email == "" || body.Password == "" {
		jsonError(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	ip := getClientIP(r)
	ua := r.Header.Get("User-Agent")

	vpnResult := services.DetectVPNProxy(ip)
	if isVpn, _ := vpnResult["isVpn"].(bool); isVpn {
		recordLoginAttempt(ip, false)
		jsonError(w, "VPN, proxy, or Tor detected. Please disable them for security reasons.", http.StatusForbidden)
		return
	}

	if !verifyCap(body.CapToken) {
		recordLoginAttempt(ip, false)
		jsonError(w, "Please complete the security check", http.StatusBadRequest)
		return
	}

	delay := getLoginDelay(ip)
	if delay > 0 {
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}

	var user struct {
		ID             int64
		Email          string
		Username       string
		PasswordHash   string
		PteroUserID    *int64
		FirstName      *string
		LastName       *string
		IsAdmin        bool
		Restricted     bool
		EmailVerified  bool
		AuthRestricted bool
		TOTPEnabled    bool
		TokenVersion   int
	}
	err := database.DB.QueryRow(
		"SELECT id, email, username, password_hash, ptero_user_id, first_name, last_name, is_admin, restricted, email_verified, auth_restricted, totp_enabled, token_version FROM users WHERE email = ?",
		body.Email,
	).Scan(&user.ID, &user.Email, &user.Username, &user.PasswordHash, &user.PteroUserID, &user.FirstName, &user.LastName, &user.IsAdmin, &user.Restricted, &user.EmailVerified, &user.AuthRestricted, &user.TOTPEnabled, &user.TokenVersion)
	if err != nil {
		recordLoginAttempt(ip, false)
		jsonError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if !user.IsAdmin {
		recordLoginAttempt(ip, false)
		jsonError(w, "Admin access required", http.StatusForbidden)
		return
	}

	if user.AuthRestricted {
		jsonError(w, "Your account has been restricted. Contact support for assistance.", http.StatusForbidden)
		return
	}

	if !verifyPassword(body.Password, user.PasswordHash) {
		recordLoginAttempt(ip, false)
		jsonError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	if !user.EmailVerified {
		recordLoginAttempt(ip, false)
		jsonError(w, "Please verify your email before signing in.", http.StatusForbidden)
		return
	}

	if user.TOTPEnabled {
		tempToken, _ := middleware.GenerateToken(middleware.UserClaims{
			UserID:   user.ID,
			TOTPTemp: true,
		})
		recordLoginAttempt(ip, true)
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"needsTotp": true,
			"tempToken": tempToken,
		})
		return
	}

	recordLoginAttempt(ip, true)
	database.DB.Exec("UPDATE users SET user_agent = ? WHERE id = ?", ua, user.ID)
	database.DB.Exec("INSERT INTO user_ips (user_id, ip_address, user_agent) VALUES (?, ?, ?)", user.ID, ip, ua)

	firstName := ""
	lastName := ""
	if user.FirstName != nil {
		firstName = *user.FirstName
	}
	if user.LastName != nil {
		lastName = *user.LastName
	}

	token, _ := middleware.GenerateToken(middleware.UserClaims{
		UserID:       user.ID,
		Email:        user.Email,
		Username:     user.Username,
		PteroID:      user.PteroUserID,
		IsAdmin:      user.IsAdmin,
		Restricted:   user.Restricted,
		TokenVersion: user.TokenVersion,
	})

	setCookie(w, "token", token, 2*time.Hour)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":            user.ID,
			"email":         user.Email,
			"username":      user.Username,
			"pteroId":       user.PteroUserID,
			"firstName":     firstName,
			"lastName":      lastName,
			"isAdmin":       user.IsAdmin,
			"restricted":    user.Restricted,
			"emailVerified": user.EmailVerified,
			"gravatarHash":  gravatarHash(user.Email),
		},
	})
}

func (h *AdminHandler) AdminCheck(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user": map[string]interface{}{
			"id":       user.UserID,
			"email":    user.Email,
			"username": user.Username,
			"isAdmin":  user.IsAdmin,
		},
	})
}

func (h *AdminHandler) ListAdminServers(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	offsetStr := r.URL.Query().Get("offset")
	search := r.URL.Query().Get("search")

	var limit, offset int
	if l, err := strconv.Atoi(limitStr); err == nil {
		limit = l
	}
	if o, err := strconv.Atoi(offsetStr); err == nil {
		offset = o
	}

	pteroResult, err := services.GetAllServers(&limit, &offset)
	if err != nil {
		jsonError(w, "Failed to fetch servers", http.StatusInternalServerError)
		return
	}

	pteroServers, _ := pteroResult["servers"].([]map[string]interface{})
	total, _ := pteroResult["total"].(int)

	type serverEntry struct {
		ID        float64                `json:"id"`
		Name      string                 `json:"name"`
		Identifier string                `json:"identifier"`
		Status    string                 `json:"status"`
		Installed interface{}            `json:"installed"`
		Egg       float64                `json:"egg"`
		EggDetails map[string]interface{} `json:"eggDetails"`
		Owner     map[string]interface{} `json:"owner"`
		Node      float64                `json:"node"`
		NodeFqdn  interface{}            `json:"nodeFqdn"`
		Limits    map[string]interface{} `json:"limits"`
	}

	var entries []serverEntry
	for _, s := range pteroServers {
		id, _ := s["id"].(float64)
		name, _ := s["name"].(string)
		identifier, _ := s["identifier"].(string)
		status := "active"
		if suspended, ok := s["suspended"].(bool); ok && suspended {
			status = "suspended"
		}
		installed, _ := s["installed"].(float64)
		if installed == 0 {
			status = "installing"
		}
		egg, _ := s["egg"].(float64)
		eggDetails, _ := s["eggDetails"].(map[string]interface{})
		node, _ := s["node"].(float64)
		nodeFqdn := s["nodeFqdn"]
		limits, _ := s["limits"].(map[string]interface{})

		var owner map[string]interface{}
		if userID, ok := s["user"].(float64); ok {
			pteroUser, err := services.GetPteroUserByID(int64(userID))
			if err == nil {
				owner = map[string]interface{}{
					"username": pteroUser["username"],
					"email":    pteroUser["email"],
				}
			}
		}
		if owner == nil {
			owner = map[string]interface{}{"username": "Unknown"}
		}

		entries = append(entries, serverEntry{
			ID:         id,
			Name:       name,
			Identifier: identifier,
			Status:     status,
			Installed:  installed,
			Egg:        egg,
			EggDetails: eggDetails,
			Owner:      owner,
			Node:       node,
			NodeFqdn:   nodeFqdn,
			Limits:     limits,
		})
	}

	totalPages := 1
	if limit > 0 {
		totalPages = (total + limit - 1) / limit
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"servers":    entries,
		"total":      total,
		"page":       (offset/limit)+1,
		"totalPages": totalPages,
	})
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

	var owner map[string]interface{}
	if userID, ok := server["user"].(float64); ok {
		pteroUser, err := services.GetPteroUserByID(int64(userID))
		if err == nil {
			owner = map[string]interface{}{
				"username": pteroUser["username"],
				"email":    pteroUser["email"],
			}
		}
	}
	if owner == nil {
		owner = map[string]interface{}{"username": "Unknown"}
	}
	server["owner"] = owner

	var serverMeta map[string]interface{}
	var smCreatedAt, smExpiresAt, smStatus, smReason *string
	database.DB.QueryRow(
		"SELECT created_at, expires_at, status, suspend_reason FROM server_meta WHERE ptero_server_id = ?", id,
	).Scan(&smCreatedAt, &smExpiresAt, &smStatus, &smReason)
	if smStatus != nil {
		serverMeta = map[string]interface{}{
			"created_at":     smCreatedAt,
			"expires_at":     smExpiresAt,
			"status":         *smStatus,
			"suspend_reason": smReason,
		}
	} else {
		suspended, _ := server["suspended"].(bool)
		panelStatus := "active"
		if suspended {
			panelStatus = "suspended"
		}
		if inst, ok := server["installed"].(float64); ok && inst == 0 {
			panelStatus = "installing"
		}
		serverMeta = map[string]interface{}{
			"status": panelStatus,
		}
	}
	server["serverMeta"] = serverMeta

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

func (h *AdminHandler) StopServer(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}
	if err := services.SuspendPteroServer(id); err != nil {
		jsonError(w, "Failed to stop server", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) RenewNowServer(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}
	database.DB.Exec("UPDATE server_meta SET expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY) WHERE ptero_server_id = ?", id)
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
		rows, err = database.DB.Query("SELECT id, username, email, ptero_id, restricted, is_admin, email_verified, created_at FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?", "%"+search+"%", "%"+search+"%", limit, offset)
	} else {
		database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalCount)
		rows, err = database.DB.Query("SELECT id, username, email, ptero_id, restricted, is_admin, email_verified, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?", limit, offset)
	}

	if err != nil {
		jsonError(w, "Failed to fetch users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type userEntry struct {
		ID           int64   `json:"id"`
		Username     string  `json:"username"`
		Email        string  `json:"email"`
		IsAdmin      bool    `json:"is_admin"`
		Restricted   bool    `json:"restricted"`
		ServerCount  int     `json:"server_count"`
		CreatedAt    *string `json:"created_at"`
	}

	var users []userEntry
	for rows.Next() {
		var u userEntry
		var pteroID *int64
		var emailVerified bool
		rows.Scan(&u.ID, &u.Username, &u.Email, &pteroID, &u.Restricted, &u.IsAdmin, &emailVerified, &u.CreatedAt)

		database.DB.QueryRow("SELECT COUNT(*) FROM server_meta WHERE user_id = ?", u.ID).Scan(&u.ServerCount)

		users = append(users, u)
	}
	if users == nil {
		users = []userEntry{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"users":      users,
		"total":      totalCount,
		"page":       page,
		"totalPages": (totalCount + limit - 1) / limit,
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
		IsAdmin       bool    `json:"is_admin"`
		Restricted    bool    `json:"restricted"`
		AuthRestricted bool   `json:"auth_restricted"`
		PteroUserID   *int64  `json:"ptero_user_id"`
		EmailVerified bool    `json:"email_verified"`
		CreatedAt     *string `json:"created_at"`
		PasswordHash  string  `json:"password_hash"`
		UserAgent     *string `json:"user_agent"`
	}
	err = database.DB.QueryRow(
		"SELECT id, username, email, is_admin, restricted, auth_restricted, ptero_user_id, email_verified, created_at, password_hash, user_agent FROM users WHERE id = ?", id,
	).Scan(&u.ID, &u.Username, &u.Email, &u.IsAdmin, &u.Restricted, &u.AuthRestricted, &u.PteroUserID, &u.EmailVerified, &u.CreatedAt, &u.PasswordHash, &u.UserAgent)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	serverRows, err := database.DB.Query(
		"SELECT sm.ptero_server_id, sm.status, sm.created_at, sm.expires_at, COALESCE(s.name, '') as server_name, COALESCE(s.identifier, '') as identifier FROM server_meta sm LEFT JOIN ptero_servers s ON s.id = sm.ptero_server_id WHERE sm.user_id = ?", id,
	)
	var serverMetas []map[string]interface{}
	if err == nil {
		defer serverRows.Close()
		for serverRows.Next() {
			var pteroID int64
			var status, serverName, identifier string
			var createdAt, expiresAt *string
			serverRows.Scan(&pteroID, &status, &createdAt, &expiresAt, &serverName, &identifier)
			serverMetas = append(serverMetas, map[string]interface{}{
				"server_name":    serverName,
				"status":         status,
				"created_at":     createdAt,
				"expires_at":     expiresAt,
				"ptero_server_id": pteroID,
				"identifier":     identifier,
			})
		}
	}
	if serverMetas == nil {
		serverMetas = []map[string]interface{}{}
	}

	ipRows, err := database.DB.Query("SELECT ip_address, created_at, user_agent FROM user_ips WHERE user_id = ? ORDER BY created_at DESC LIMIT 50", id)
	var ips []map[string]interface{}
	if err == nil {
		defer ipRows.Close()
		for ipRows.Next() {
			var ipAddr string
			var createdAt *string
			var ua *string
			ipRows.Scan(&ipAddr, &createdAt, &ua)
			ips = append(ips, map[string]interface{}{
				"ip_address": ipAddr,
				"created_at": createdAt,
				"user_agent": ua,
			})
		}
	}
	if ips == nil {
		ips = []map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"user":    u,
		"servers": serverMetas,
		"ips":     ips,
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

func (h *AdminHandler) ToggleAdmin(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var current bool
	database.DB.QueryRow("SELECT is_admin FROM users WHERE id = ?", id).Scan(&current)
	database.DB.Exec("UPDATE users SET is_admin = ? WHERE id = ?", !current, id)
	services.LogActivity(admin.UserID, "admin_toggle_admin", fmt.Sprintf("Toggled admin for user #%d: %v->%v", id, current, !current), nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"is_admin": !current})
}

func (h *AdminHandler) ToggleRestriction(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var current bool
	database.DB.QueryRow("SELECT restricted FROM users WHERE id = ?", id).Scan(&current)
	database.DB.Exec("UPDATE users SET restricted = ? WHERE id = ?", !current, id)
	services.LogActivity(admin.UserID, "admin_toggle_restriction", fmt.Sprintf("Toggled restriction for user #%d: %v->%v", id, current, !current), nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"restricted": !current})
}

func (h *AdminHandler) ToggleAuthRestriction(w http.ResponseWriter, r *http.Request) {
	admin := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var current bool
	database.DB.QueryRow("SELECT auth_restricted FROM users WHERE id = ?", id).Scan(&current)
	database.DB.Exec("UPDATE users SET auth_restricted = ? WHERE id = ?", !current, id)
	services.LogActivity(admin.UserID, "admin_toggle_auth_restriction", fmt.Sprintf("Toggled auth restriction for user #%d: %v->%v", id, current, !current), nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"auth_restricted": !current})
}

func (h *AdminHandler) NotifyUser(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Title   string `json:"title"`
		Message string `json:"message"`
		Type    string `json:"type"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Title == "" || body.Message == "" {
		jsonError(w, "Title and message are required", http.StatusBadRequest)
		return
	}

	services.CreateNotification(id, body.Title, body.Message, body.Type, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) NotifyAll(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title   string `json:"title"`
		Message string `json:"message"`
		Type    string `json:"type"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Title == "" || body.Message == "" {
		jsonError(w, "Title and message are required", http.StatusBadRequest)
		return
	}

	rows, err := database.DB.Query("SELECT id FROM users")
	if err != nil {
		jsonError(w, "Failed to fetch users", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var count int
	for rows.Next() {
		var userID int64
		rows.Scan(&userID)
		services.CreateNotification(userID, body.Title, body.Message, body.Type, nil)
		count++
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"count": count})
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

func (h *AdminHandler) ListNodes(w http.ResponseWriter, r *http.Request) {
	nodes, err := services.GetAllNodes()
	if err != nil {
		jsonError(w, "Failed to fetch nodes", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"nodes": nodes})
}

func (h *AdminHandler) GetNode(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid node ID", http.StatusBadRequest)
		return
	}

	node, err := services.GetNodeDetail(id)
	if err != nil {
		jsonError(w, "Node not found", http.StatusNotFound)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"node": node})
}

func (h *AdminHandler) GetNodeAllocations(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid node ID", http.StatusBadRequest)
		return
	}

	allocations, err := services.GetNodeAllocations(id)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"allocations": []interface{}{}})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"allocations": allocations})
}

func (h *AdminHandler) GetNodeServers(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid node ID", http.StatusBadRequest)
		return
	}

	servers, err := services.GetNodeServers(id)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"servers": []interface{}{}})
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"servers": servers})
}

func (h *AdminHandler) GetNodeSettings(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid node ID", http.StatusBadRequest)
		return
	}

	var unavailable bool
	database.DB.QueryRow("SELECT unavailable FROM nodes_settings WHERE node_id = ?", id).Scan(&unavailable)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"settings": map[string]interface{}{
			"unavailable": unavailable,
		},
	})
}

func (h *AdminHandler) UpdateNodeSettings(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid node ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Unavailable bool `json:"unavailable"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	database.DB.Exec(
		"INSERT INTO nodes_settings (node_id, unavailable) VALUES (?, ?) ON DUPLICATE KEY UPDATE unavailable = VALUES(unavailable)",
		id, body.Unavailable,
	)

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
	pteroNests, err := services.GetPteroNests()
	if err != nil {
		jsonError(w, "Failed to fetch nests", http.StatusInternalServerError)
		return
	}

	type nestEntry struct {
		ID          int64       `json:"id"`
		PteroNestID int64       `json:"ptero_nest_id"`
		Name        string      `json:"name"`
		Description interface{} `json:"description"`
		Logo        interface{} `json:"logo"`
		Unavailable bool        `json:"unavailable"`
	}

	nestMap := make(map[int64]bool)
	var nests []nestEntry
	for _, n := range pteroNests {
		id, _ := n["id"].(float64)
		name, _ := n["name"].(string)
		desc := n["description"]
		logo := n["logo"]

		var unavailable bool
		database.DB.QueryRow("SELECT unavailable FROM nests WHERE ptero_nest_id = ?", int64(id)).Scan(&unavailable)

		nests = append(nests, nestEntry{
			ID:          int64(id),
			PteroNestID: int64(id),
			Name:        name,
			Description: desc,
			Logo:        logo,
			Unavailable: unavailable,
		})
		nestMap[int64(id)] = true
	}

	rows, err := database.DB.Query("SELECT ptero_nest_id, name, logo, description, unavailable FROM nests")
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var dbNestID int64
			var name string
			var logo, desc *string
			var unavail bool
			rows.Scan(&dbNestID, &name, &logo, &desc, &unavail)
			if !nestMap[dbNestID] {
				var logoVal, descVal interface{}
				if logo != nil {
					logoVal = *logo
				}
				if desc != nil {
					descVal = *desc
				}
				nests = append(nests, nestEntry{
					ID:          dbNestID,
					PteroNestID: dbNestID,
					Name:        name,
					Description: descVal,
					Logo:        logoVal,
					Unavailable: unavail,
				})
			}
		}
	}

	if nests == nil {
		nests = []nestEntry{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"nests": nests})
}

func (h *AdminHandler) ListAvailableNests(w http.ResponseWriter, r *http.Request) {
	pteroNests, err := services.GetPteroNests()
	if err != nil {
		jsonError(w, "Failed to fetch nests", http.StatusInternalServerError)
		return
	}

	var existing map[int64]bool
	rows, err := database.DB.Query("SELECT ptero_nest_id FROM nests")
	if err == nil {
		defer rows.Close()
		existing = make(map[int64]bool)
		for rows.Next() {
			var id int64
			rows.Scan(&id)
			existing[id] = true
		}
	}

	var nests []map[string]interface{}
	for _, n := range pteroNests {
		id, _ := n["id"].(float64)
		if existing != nil && existing[int64(id)] {
			continue
		}
		name, _ := n["name"].(string)
		nests = append(nests, map[string]interface{}{
			"id":   int64(id),
			"name": name,
		})
	}
	if nests == nil {
		nests = []map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"nests": nests})
}

func (h *AdminHandler) SaveNest(w http.ResponseWriter, r *http.Request) {
	var body struct {
		PteroNestID int64  `json:"pteroNestId"`
		Name        string `json:"name"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.PteroNestID == 0 || body.Name == "" {
		jsonError(w, "Nest ID and name are required", http.StatusBadRequest)
		return
	}

	_, err := database.DB.Exec(
		"INSERT INTO nests (ptero_nest_id, name) VALUES (?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)",
		body.PteroNestID, body.Name,
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
		Name        *string `json:"name"`
		Logo        *string `json:"logo"`
		Description *string `json:"description"`
		Unavailable *bool   `json:"unavailable"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Name != nil || body.Logo != nil || body.Description != nil {
		database.DB.Exec(
			"UPDATE nests SET name = COALESCE(?, name), logo = COALESCE(?, logo), description = COALESCE(?, description) WHERE ptero_nest_id = ?",
			body.Name, body.Logo, body.Description, id,
		)
	}
	if body.Unavailable != nil {
		database.DB.Exec("UPDATE nests SET unavailable = ? WHERE ptero_nest_id = ?", *body.Unavailable, id)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) DeleteNest(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid nest ID", http.StatusBadRequest)
		return
	}

	database.DB.Exec("DELETE FROM nests WHERE ptero_nest_id = ?", id)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) ListNestEggs(w http.ResponseWriter, r *http.Request) {
	nestIDStr := r.PathValue("nestId")
	nestID, err := strconv.ParseInt(nestIDStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid nest ID", http.StatusBadRequest)
		return
	}

	pteroEggs, err := services.GetPteroNestEggs(nestID)
	if err != nil {
		jsonError(w, "Failed to fetch eggs", http.StatusInternalServerError)
		return
	}

	type eggEntry struct {
		ID             int64                  `json:"id"`
		Name           string                 `json:"name"`
		Description    interface{}            `json:"description"`
		CustomResources map[string]interface{} `json:"customResources"`
	}

	var eggs []eggEntry
	for _, e := range pteroEggs {
		id, _ := e["id"].(float64)
		name, _ := e["name"].(string)
		desc := e["description"]

		var cpuLimit, memLimit, diskLimit *int64
		var logo *string
		var unavail bool
		database.DB.QueryRow(
			"SELECT cpu_limit, memory_limit, disk_limit, logo, unavailable FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?",
			nestID, int64(id),
		).Scan(&cpuLimit, &memLimit, &diskLimit, &logo, &unavail)

		resources := make(map[string]interface{})
		if cpuLimit != nil {
			resources["cpu_limit"] = *cpuLimit
		}
		if memLimit != nil {
			resources["memory_limit"] = *memLimit
		}
		if diskLimit != nil {
			resources["disk_limit"] = *diskLimit
		}
		resources["unavailable"] = unavail
		if logo != nil {
			resources["logo"] = *logo
		}

		eggs = append(eggs, eggEntry{
			ID:              int64(id),
			Name:            name,
			Description:     desc,
			CustomResources: resources,
		})
	}
	if eggs == nil {
		eggs = []eggEntry{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"eggs": eggs})
}

func (h *AdminHandler) GetEggSettings(w http.ResponseWriter, r *http.Request) {
	nestIDStr := r.PathValue("nestId")
	eggIDStr := r.PathValue("eggId")
	nestID, _ := strconv.ParseInt(nestIDStr, 10, 64)
	eggID, _ := strconv.ParseInt(eggIDStr, 10, 64)

	var eggInfo map[string]interface{}
	pteroEgg, err := services.GetEgg(nestID, eggID)
	if err == nil {
		eggInfo = map[string]interface{}{"name": pteroEgg["name"]}
	}

	var cpuLimit, memLimit, diskLimit *int64
	var logo *string
	database.DB.QueryRow(
		"SELECT cpu_limit, memory_limit, disk_limit, logo FROM egg_resources WHERE ptero_nest_id = ? AND ptero_egg_id = ?",
		nestID, eggID,
	).Scan(&cpuLimit, &memLimit, &diskLimit, &logo)

	resources := make(map[string]interface{})
	if cpuLimit != nil {
		resources["cpu_limit"] = *cpuLimit
	}
	if memLimit != nil {
		resources["memory_limit"] = *memLimit
	}
	if diskLimit != nil {
		resources["disk_limit"] = *diskLimit
	}
	if logo != nil {
		resources["logo"] = *logo
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"egg":       eggInfo,
		"resources": resources,
	})
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
		Logo        *string `json:"logo"`
		CPULimit    *int64  `json:"cpu_limit"`
		MemoryLimit *int64  `json:"memory_limit"`
		DiskLimit   *int64  `json:"disk_limit"`
		Unavailable *bool   `json:"unavailable"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Logo != nil || body.CPULimit != nil || body.MemoryLimit != nil || body.DiskLimit != nil {
		database.DB.Exec(
			`INSERT INTO egg_resources (ptero_nest_id, ptero_egg_id, logo, cpu_limit, memory_limit, disk_limit)
			 VALUES (?, ?, ?, ?, ?, ?)
			 ON DUPLICATE KEY UPDATE logo = VALUES(logo), cpu_limit = VALUES(cpu_limit), memory_limit = VALUES(memory_limit), disk_limit = VALUES(disk_limit)`,
			nestID, eggID, body.Logo, body.CPULimit, body.MemoryLimit, body.DiskLimit,
		)
	}
	if body.Unavailable != nil {
		database.DB.Exec(
			"UPDATE egg_resources SET unavailable = ? WHERE ptero_nest_id = ? AND ptero_egg_id = ?",
			*body.Unavailable, nestID, eggID,
		)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *AdminHandler) ApplyEggAll(w http.ResponseWriter, r *http.Request) {
	nestIDStr := r.PathValue("nestId")
	eggIDStr := r.PathValue("eggId")
	nestID, _ := strconv.ParseInt(nestIDStr, 10, 64)
	eggID, _ := strconv.ParseInt(eggIDStr, 10, 64)

	var body struct {
		CPULimit    *int64 `json:"cpu_limit"`
		MemoryLimit *int64 `json:"memory_limit"`
		DiskLimit   *int64 `json:"disk_limit"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	serverIDs, err := services.GetPergoServerIDsByEgg(nestID, eggID)
	if err != nil {
		jsonError(w, "Failed to fetch servers", http.StatusInternalServerError)
		return
	}

	total := len(serverIDs)
	updated := 0
	for _, sid := range serverIDs {
		limits := make(map[string]interface{})
		if body.CPULimit != nil {
			limits["cpu"] = *body.CPULimit
		}
		if body.MemoryLimit != nil {
			limits["memory"] = *body.MemoryLimit
		}
		if body.DiskLimit != nil {
			limits["disk"] = *body.DiskLimit
		}
		if err := services.UpdatePteroServerBuild(sid, limits); err == nil {
			updated++
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"updated": updated,
		"total":   total,
	})
}

func boolVal(p *bool, def bool) bool {
	if p == nil {
		return def
	}
	return *p
}

func (h *AdminHandler) AdminStats(w http.ResponseWriter, r *http.Request) {
	var totalUsers, totalServers, activeServers, suspendedServers, expiredServers, newUsers24h int64
	database.DB.QueryRow("SELECT COUNT(*) FROM users").Scan(&totalUsers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta").Scan(&totalServers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta WHERE status = 'active'").Scan(&activeServers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta WHERE status = 'suspended'").Scan(&suspendedServers)
	database.DB.QueryRow("SELECT COUNT(*) FROM server_meta WHERE status = 'expired'").Scan(&expiredServers)
	database.DB.QueryRow("SELECT COUNT(*) FROM users WHERE created_at >= NOW() - INTERVAL 24 HOUR").Scan(&newUsers24h)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"stats": map[string]interface{}{
			"total_users":       totalUsers,
			"total_servers":     totalServers,
			"active_servers":    activeServers,
			"suspended_servers": suspendedServers,
			"expired_servers":   expiredServers,
			"new_users_24h":     newUsers24h,
		},
	})
}

func (h *AdminHandler) HealthCheck(w http.ResponseWriter, r *http.Request) {
	var dbOK bool
	err := database.DB.Ping()
	dbOK = err == nil

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"status":      "ok",
		"database":    dbOK,
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
