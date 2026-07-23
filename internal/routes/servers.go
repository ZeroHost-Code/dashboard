package routes

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type ServerHandler struct{}

func RegisterServerRoutes(r chi.Router) {
	h := &ServerHandler{}

	r.Get("/servers/list", middleware.AuthenticateToken(http.HandlerFunc(h.ListServers)))
	r.Get("/servers/nests", middleware.AuthenticateToken(http.HandlerFunc(h.GetNests)))
	r.Get("/servers/eggs", middleware.AuthenticateToken(http.HandlerFunc(h.GetEggs)))
	r.Post("/servers/create", middleware.AuthenticateToken(middleware.RequireNotRestricted(http.HandlerFunc(h.CreateServer))))
	r.Get("/servers/details/{id}", middleware.AuthenticateToken(middleware.RequireOwnership("server_meta", "ptero_server_id", "id")(http.HandlerFunc(h.GetServerDetails))))
	r.Post("/servers/renew/{id}", middleware.AuthenticateToken(middleware.RequireNotRestricted(middleware.RequireOwnership("server_meta", "ptero_server_id", "id")(http.HandlerFunc(h.RenewServer)))))
	r.Patch("/servers/{id}", middleware.AuthenticateToken(middleware.RequireNotRestricted(middleware.RequireOwnership("server_meta", "ptero_server_id", "id")(http.HandlerFunc(h.RenameServer)))))
	r.Post("/servers/{id}/reinstall", middleware.AuthenticateToken(middleware.RequireNotRestricted(middleware.RequireOwnership("server_meta", "ptero_server_id", "id")(http.HandlerFunc(h.ReinstallServer)))))
	r.Delete("/servers/{id}", middleware.AuthenticateToken(middleware.RequireNotRestricted(middleware.RequireOwnership("server_meta", "ptero_server_id", "id")(http.HandlerFunc(h.DeleteServer)))))
	r.Get("/servers/overview", middleware.AuthenticateToken(http.HandlerFunc(h.Overview)))
	r.Post("/servers/power/{identifier}", middleware.AuthenticateToken(http.HandlerFunc(h.PowerServer)))
	r.Get("/servers/client-api-key", middleware.AuthenticateToken(http.HandlerFunc(h.GetClientAPIKey)))
	r.Put("/servers/client-api-key", middleware.AuthenticateToken(http.HandlerFunc(h.UpdateClientAPIKey)))
	r.Delete("/servers/client-api-key", middleware.AuthenticateToken(http.HandlerFunc(h.DeleteClientAPIKey)))
}

func (h *ServerHandler) ListServers(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user == nil || user.PteroID == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{"servers": []interface{}{}})
		return
	}

	servers, err := services.GetServersByUser(*user.PteroID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"servers":    []interface{}{},
			"pteroError": "Pyrodactyl panel is currently unreachable.",
		})
		return
	}

	for _, s := range servers {
		sid, _ := s["id"].(float64)
		var meta struct{ Exists bool }
		err := database.DB.QueryRow("SELECT 1 FROM server_meta WHERE ptero_server_id = ?", int64(sid)).Scan(&meta.Exists)
		if err == nil {
			var expiresAt string
			database.DB.QueryRow("SELECT expires_at FROM server_meta WHERE ptero_server_id = ?", int64(sid)).Scan(&expiresAt)
			s["serverMeta"] = map[string]interface{}{"expires_at": expiresAt}
		} else {
			s["serverMeta"] = nil
		}
	}

	rows, _ := database.DB.Query("SELECT ptero_nest_id, logo FROM nests")
	if rows != nil {
		defer rows.Close()
		nestLogoMap := make(map[int64]interface{})
		for rows.Next() {
			var nestID int64
			var logo *string
			rows.Scan(&nestID, &logo)
			nestLogoMap[nestID] = logo
		}
		for _, s := range servers {
			if nest, ok := s["nest"].(float64); ok {
				if logo, ok := nestLogoMap[int64(nest)]; ok {
					s["nestLogo"] = logo
				}
			}
		}
	}

	for _, s := range servers {
		s["currentState"] = nil
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"servers": servers})
}

func (h *ServerHandler) GetNests(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT ptero_nest_id, name, logo, description, unavailable FROM nests")
	if err != nil {
		jsonError(w, "Failed to fetch nests", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var dbNests []map[string]interface{}
	var nestIDs []int64
	for rows.Next() {
		var id int64
		var name string
		var logo, desc *string
		var unavail bool
		rows.Scan(&id, &name, &logo, &desc, &unavail)
		dbNests = append(dbNests, map[string]interface{}{
			"pteroNestId": id, "name": name, "logo": logo,
			"description": desc, "unavailable": unavail,
		})
		nestIDs = append(nestIDs, id)
	}

	eggs, err := services.GetAllEggs(nestIDs)
	if err != nil {
		eggs = nil
	}

	eggResMap := make(map[string]map[string]interface{})
	resRows, _ := database.DB.Query("SELECT ptero_nest_id, ptero_egg_id, logo, cpu_limit, memory_limit, disk_limit, unavailable FROM egg_resources")
	if resRows != nil {
		defer resRows.Close()
		for resRows.Next() {
			var nid, eid int64
			var logo *string
			var cpu, mem, disk *int64
			var unavail bool
			resRows.Scan(&nid, &eid, &logo, &cpu, &mem, &disk, &unavail)
			key := strconv.FormatInt(nid, 10) + "-" + strconv.FormatInt(eid, 10)
			eggResMap[key] = map[string]interface{}{
				"logo": logo, "cpu_limit": cpu, "memory_limit": mem, "disk_limit": disk, "unavailable": unavail,
			}
		}
	}

	nestEggs := make(map[int64][]map[string]interface{})
	for _, entry := range eggs {
		nest, _ := entry["nest"].(int64)
		egg, _ := entry["egg"].(map[string]interface{})
		if egg == nil {
			continue
		}
		eid, _ := egg["id"].(float64)
		key := strconv.FormatInt(nest, 10) + "-" + strconv.FormatInt(int64(eid), 10)
		res := eggResMap[key]
		eggEntry := map[string]interface{}{
			"eggId":        int64(eid),
			"name":         egg["name"],
			"description":  egg["description"],
			"dockerImages": egg["docker_images"],
		}
		if res != nil {
			eggEntry["logo"] = res["logo"]
			eggEntry["cpu_limit"] = res["cpu_limit"]
			eggEntry["memory_limit"] = res["memory_limit"]
			eggEntry["disk_limit"] = res["disk_limit"]
			eggEntry["unavailable"] = res["unavailable"]
		}
		nestEggs[nest] = append(nestEggs[nest], eggEntry)
	}

	var result []map[string]interface{}
	for _, n := range dbNests {
		nid, _ := n["pteroNestId"].(int64)
		n["eggs"] = nestEggs[nid]
		if n["eggs"] == nil {
			n["eggs"] = []interface{}{}
		}
		result = append(result, n)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"nests": result})
}

func (h *ServerHandler) GetEggs(w http.ResponseWriter, r *http.Request) {
	rows, err := database.DB.Query("SELECT ptero_nest_id, name FROM nests")
	if err != nil {
		jsonError(w, "Failed to fetch eggs", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	var nestIDs []int64
	nestMap := make(map[int64]string)
	for rows.Next() {
		var id int64
		var name string
		rows.Scan(&id, &name)
		nestIDs = append(nestIDs, id)
		nestMap[id] = name
	}

	eggs, err := services.GetAllEggs(nestIDs)
	if err != nil {
		jsonError(w, "Failed to fetch eggs", http.StatusInternalServerError)
		return
	}

	var simplified []map[string]interface{}
	for _, entry := range eggs {
		nest, _ := entry["nest"].(int64)
		egg, _ := entry["egg"].(map[string]interface{})
		if egg == nil {
			continue
		}
		simplified = append(simplified, map[string]interface{}{
			"nestId":       nest,
			"nestName":     nestMap[nest],
			"eggId":        egg["id"],
			"name":         egg["name"],
			"description":  egg["description"],
			"startup":      egg["startup"],
			"dockerImages": egg["docker_images"],
		})
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"eggs": simplified})
}

func (h *ServerHandler) CreateServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		Name        string            `json:"name"`
		NestID      int64             `json:"nestId"`
		EggID       int64             `json:"eggId"`
		Environment map[string]string `json:"environment"`
		CapToken    string            `json:"capToken"`
		DockerImage string            `json:"dockerImage"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Name == "" || body.NestID == 0 || body.EggID == 0 {
		jsonError(w, "Name, nest ID and egg ID are required", http.StatusBadRequest)
		return
	}

	if len(body.Name) > 255 {
		jsonError(w, "Server name must be 255 characters or less", http.StatusBadRequest)
		return
	}

	ip := getClientIP(r)
	ua := r.Header.Get("User-Agent")

	if services.IsBotUserAgent(ua) {
		jsonError(w, "Automated requests are not allowed.", http.StatusForbidden)
		return
	}

	vpnResult := services.DetectVPNProxy(ip)
	if isVpn, _ := vpnResult["isVpn"].(bool); isVpn {
		jsonError(w, "VPN, proxy, or Tor detected. Please disable them.", http.StatusForbidden)
		return
	}

	var emailVerified bool
	database.DB.QueryRow("SELECT email_verified FROM users WHERE id = ?", user.UserID).Scan(&emailVerified)
	if !emailVerified {
		jsonError(w, "Please verify your email before creating a server.", http.StatusForbidden)
		return
	}

	existingServers, err := services.GetServersByUser(*user.PteroID)
	if err == nil && len(existingServers) >= 3 {
		jsonError(w, "Server limit reached. You can only create up to 3 servers.", http.StatusForbidden)
		return
	}

	egg, err := services.GetEgg(body.NestID, body.EggID)
	if err != nil {
		jsonError(w, "Failed to get egg configuration", http.StatusInternalServerError)
		return
	}

	dockerImage := body.DockerImage
	if dockerImage == "" {
		if images, ok := egg["docker_images"].(map[string]interface{}); ok {
			for _, v := range images {
				dockerImage, _ = v.(string)
				break
			}
		}
	}

	env := make(map[string]interface{})
	if eggVars, ok := egg["environment"].(map[string]interface{}); ok {
		for k, v := range eggVars {
			env[k] = v
		}
	} else {
		panelDB := services.PanelDBName
		rowVars, err := database.DB.Query(fmt.Sprintf("SELECT env_variable, default_value FROM %s.egg_variables WHERE egg_id = ?", panelDB), body.EggID)
		if err != nil {
			log.Printf("Failed to query egg variables from %s.egg_variables: %v", panelDB, err)
		} else if rowVars != nil {
			defer rowVars.Close()
			for rowVars.Next() {
				var envVar, defaultVal string
				rowVars.Scan(&envVar, &defaultVal)
				env[envVar] = defaultVal
			}
		}
	}

	params := map[string]interface{}{
		"name":         body.Name,
		"userId":       *user.PteroID,
		"eggId":        body.EggID,
		"nestId":       body.NestID,
		"environment":  env,
		"startup":      egg["startup"],
		"dockerImage":  dockerImage,
	}

	server, err := services.CreatePteroServer(params)
	if err != nil {
		jsonError(w, "Failed to create server: "+err.Error(), http.StatusInternalServerError)
		return
	}

	serverID := int64(server["id"].(float64))
	database.DB.Exec(
		"INSERT INTO server_meta (ptero_server_id, user_id, created_at, expires_at, status) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 90 DAY), 'active')",
		serverID, user.UserID,
	)

	services.LogActivity(user.UserID, "server_created", "Created server \""+body.Name+"\"", &serverID)
	services.CreateNotification(user.UserID, "Server Created", "Your server \""+body.Name+"\" has been created and is now being set up.", "success", nil)

	writeJSON(w, http.StatusCreated, map[string]interface{}{"server": server})
}

func (h *ServerHandler) GetServerDetails(w http.ResponseWriter, r *http.Request) {
	idStr := r.PathValue("id")
	serverID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	server, err := services.GetServerByID(serverID)
	if err != nil {
		jsonError(w, "Failed to fetch server details", http.StatusInternalServerError)
		return
	}

	server["currentState"] = nil
	writeJSON(w, http.StatusOK, map[string]interface{}{"server": server})
}

func (h *ServerHandler) RenewServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	serverID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	var meta struct {
		ID          int64
		ExpiresAt   string
		Status      string
		SuspendedBy *string
	}
	err = database.DB.QueryRow("SELECT id, expires_at, status, suspended_by FROM server_meta WHERE ptero_server_id = ?", serverID).Scan(&meta.ID, &meta.ExpiresAt, &meta.Status, &meta.SuspendedBy)
	if err != nil {
		jsonError(w, "Server meta not found", http.StatusNotFound)
		return
	}

	expiresAt, _ := timeParse(meta.ExpiresAt)
	if meta.SuspendedBy != nil && *meta.SuspendedBy == "admin" {
		jsonError(w, "Suspended by an Administrator. Please contact support.", http.StatusForbidden)
		return
	}

	daysUntilExpiry := int(expiresAt.Sub(time.Now()).Hours() / 24)
	if daysUntilExpiry > 7 {
		jsonError(w, "Server can only be renewed within 7 days of expiration", http.StatusBadRequest)
		return
	}
	if daysUntilExpiry < -7 {
		jsonError(w, "Server has been expired for too long. Contact support.", http.StatusBadRequest)
		return
	}

	newStatus := meta.Status
	if meta.Status == "suspended" {
		newStatus = "active"
		services.UnsuspendPteroServer(serverID)
	}

	database.DB.Exec("UPDATE server_meta SET expires_at = DATE_ADD(expires_at, INTERVAL 90 DAY), status = ?, suspend_reason = NULL WHERE id = ?", newStatus, meta.ID)
	services.LogActivity(user.UserID, "server_renewed", "Renewed server #"+idStr, &serverID)
	services.CreateNotification(user.UserID, "Server Renewed", "Your server #"+idStr+" has been renewed for another 90 days.", "success", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *ServerHandler) RenameServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	serverID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if strings.TrimSpace(body.Name) == "" {
		jsonError(w, "Server name is required", http.StatusBadRequest)
		return
	}
	if len(body.Name) > 255 {
		jsonError(w, "Server name must be 255 characters or less", http.StatusBadRequest)
		return
	}

	if err := services.RenamePteroServer(serverID, strings.TrimSpace(body.Name)); err != nil {
		jsonError(w, "Failed to rename server", http.StatusInternalServerError)
		return
	}

	services.LogActivity(user.UserID, "server_renamed", "Renamed server #"+idStr+" to \""+body.Name+"\"", &serverID)
	services.CreateNotification(user.UserID, "Server Renamed", "Your server #"+idStr+" has been renamed.", "info", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *ServerHandler) ReinstallServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	serverID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	if err := services.ReinstallPteroServer(serverID); err != nil {
		jsonError(w, "Failed to reinstall server", http.StatusInternalServerError)
		return
	}

	services.LogActivity(user.UserID, "server_reinstalled", "Reinstalled server #"+idStr, &serverID)
	services.CreateNotification(user.UserID, "Server Reinstalled", "Your server #"+idStr+" is being reinstalled.", "warning", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *ServerHandler) DeleteServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	serverID, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid server ID", http.StatusBadRequest)
		return
	}

	var status string
	database.DB.QueryRow("SELECT status FROM server_meta WHERE ptero_server_id = ?", serverID).Scan(&status)
	if status == "suspended" {
		jsonError(w, "Cannot delete a suspended server", http.StatusForbidden)
		return
	}

	if err := services.DeletePteroServer(serverID); err != nil {
		log.Printf("Pterodactyl delete failed (proceeding with local cleanup): %v", err)
	}

	database.DB.Exec("DELETE FROM server_meta WHERE ptero_server_id = ?", serverID)
	services.LogActivity(user.UserID, "server_deleted", "Deleted server #"+idStr, &serverID)
	services.CreateNotification(user.UserID, "Server Deleted", "Your server #"+idStr+" has been permanently deleted.", "error", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *ServerHandler) Overview(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	if user.PteroID == nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"restricted":    user.Restricted,
			"totalServers":  0,
			"activeServers": 0,
			"serverLimit":   3,
			"servers":       []interface{}{},
		})
		return
	}

	servers, err := services.GetServersByUser(*user.PteroID)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"restricted": user.Restricted,
			"totalServers": 0,
			"activeServers": 0,
			"serverLimit": 3,
			"servers": []interface{}{},
			"pteroError": "Pyrodactyl panel is currently unreachable.",
		})
		return
	}

	activeCount := 0
	for _, s := range servers {
		if stat, ok := s["status"].(string); !ok || stat != "suspended" {
			activeCount++
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"restricted":    user.Restricted,
		"totalServers":  len(servers),
		"activeServers": activeCount,
		"serverLimit":   3,
		"servers":       servers,
	})
}

func (h *ServerHandler) PowerServer(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	identifier := r.PathValue("identifier")

	if identifier == "" {
		jsonError(w, "Invalid server identifier", http.StatusBadRequest)
		return
	}

	var body struct {
		Signal string `json:"signal"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	validSignals := map[string]bool{"start": true, "stop": true, "restart": true, "kill": true}
	if !validSignals[body.Signal] {
		jsonError(w, "Invalid power signal", http.StatusBadRequest)
		return
	}

	var apiKey *string
	database.DB.QueryRow("SELECT ptero_client_api_key FROM users WHERE id = ?", user.UserID).Scan(&apiKey)
	if apiKey == nil || *apiKey == "" {
		jsonError(w, "No Pyrodactyl API key configured", http.StatusBadRequest)
		return
	}

	if err := services.SendPowerSignal(identifier, *apiKey, body.Signal); err != nil {
		jsonError(w, "Failed to send power command", http.StatusBadGateway)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *ServerHandler) GetClientAPIKey(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	var apiKey *string
	database.DB.QueryRow("SELECT ptero_client_api_key FROM users WHERE id = ?", user.UserID).Scan(&apiKey)
	writeJSON(w, http.StatusOK, map[string]interface{}{"hasKey": apiKey != nil && *apiKey != ""})
}

func (h *ServerHandler) UpdateClientAPIKey(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	var body struct {
		APIKey string `json:"apiKey"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.APIKey == "" {
		jsonError(w, "API key is required", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE users SET ptero_client_api_key = ? WHERE id = ?", body.APIKey, user.UserID)
	services.LogActivity(user.UserID, "api_key_updated", "Updated Pyrodactyl API key", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *ServerHandler) DeleteClientAPIKey(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	database.DB.Exec("UPDATE users SET ptero_client_api_key = NULL WHERE id = ?", user.UserID)
	services.LogActivity(user.UserID, "api_key_deleted", "Deleted Pyrodactyl API key", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func timeParse(s string) (time.Time, error) {
	layouts := []string{
		"2006-01-02 15:04:05",
		"2006-01-02T15:04:05Z",
		"2006-01-02T15:04:05.000Z",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Now(), nil
}
