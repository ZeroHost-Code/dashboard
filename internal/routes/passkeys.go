package routes

import (
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type PasskeyHandler struct{}

type challengeEntry struct {
	Challenge string
	Timestamp int64
	UserID    *int64
}

var (
	challengeMap   = make(map[string]*challengeEntry)
	challengeMu    sync.RWMutex
	challengeClean sync.Once
)

func initChallengeCleaner() {
	challengeClean.Do(func() {
		go func() {
			for {
				time.Sleep(60 * time.Second)
				challengeMu.Lock()
				now := time.Now().UnixMilli()
				for k, v := range challengeMap {
					if now-v.Timestamp > 5*60*1000 {
						delete(challengeMap, k)
					}
				}
				challengeMu.Unlock()
			}
		}()
	})
}

func generateSessionToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func RegisterPasskeyRoutes(r chi.Router) {
	h := &PasskeyHandler{}
	initChallengeCleaner()

	r.Get("/passkeys", middleware.AuthenticateToken(http.HandlerFunc(h.ListPasskeys)))
	r.Post("/passkeys/register/begin", middleware.AuthenticateToken(http.HandlerFunc(h.BeginRegistration)))
	r.Post("/passkeys/register/complete", middleware.AuthenticateToken(http.HandlerFunc(h.CompleteRegistration)))
	r.Post("/passkeys/login/begin", http.HandlerFunc(h.BeginLogin))
	r.Post("/passkeys/login/complete", http.HandlerFunc(h.CompleteLogin))
	r.Patch("/passkeys/{id}", middleware.AuthenticateToken(http.HandlerFunc(h.UpdatePasskey)))
	r.Delete("/passkeys/{id}", middleware.AuthenticateToken(http.HandlerFunc(h.DeletePasskey)))
}

func (h *PasskeyHandler) ListPasskeys(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	rows, err := database.DB.Query("SELECT id, credential_id, name, created_at, last_used_at FROM passkeys WHERE user_id = ?", user.UserID)
	if err != nil {
		jsonError(w, "Failed to fetch passkeys", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type PasskeyEntry struct {
		ID         int64   `json:"id"`
		Name       string  `json:"name"`
		DeviceName string  `json:"deviceName"`
		CreatedAt  *string `json:"createdAt"`
		LastUsedAt *string `json:"lastUsedAt"`
	}

	var passkeys []PasskeyEntry
	for rows.Next() {
		var p PasskeyEntry
		var credentialID []byte
		var createdAt, lastUsedAt sql.NullString
		rows.Scan(&p.ID, &credentialID, &p.Name, &createdAt, &lastUsedAt)
		if createdAt.Valid {
			p.CreatedAt = &createdAt.String
		}
		if lastUsedAt.Valid {
			p.LastUsedAt = &lastUsedAt.String
		}
		p.DeviceName = p.Name
		passkeys = append(passkeys, p)
	}
	if passkeys == nil {
		passkeys = []PasskeyEntry{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"passkeys": passkeys})
}

func (h *PasskeyHandler) BeginRegistration(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	challenge := make([]byte, 32)
	rand.Read(challenge)
	challengeB64 := base64.RawURLEncoding.EncodeToString(challenge)

	database.DB.Exec("UPDATE users SET webauthn_challenge = ? WHERE id = ?", challengeB64, user.UserID)

	rpID := r.Host
	for i := 0; i < len(rpID); i++ {
		if rpID[i] == ':' {
			rpID = rpID[:i]
			break
		}
	}

	options := map[string]interface{}{
		"challenge": challengeB64,
		"rp": map[string]string{
			"name": "ZeroHost",
			"id":   rpID,
		},
		"user": map[string]interface{}{
			"id":   strconv.FormatInt(user.UserID, 10),
			"name": user.Email,
			"displayName": user.Username,
		},
		"pubKeyCredParams": []map[string]interface{}{
			{"alg": -7, "type": "public-key"},
			{"alg": -257, "type": "public-key"},
		},
		"timeout":    60000,
		"attestation": "none",
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{"options": options})
}

func (h *PasskeyHandler) CompleteRegistration(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		ID                string `json:"id"`
		RawID             string `json:"rawId"`
		AttestationObject string `json:"attestationObject"`
		ClientDataJSON    string `json:"clientDataJSON"`
		DeviceName        string `json:"deviceName"`
		ResponseObj       struct {
			ID                string `json:"id"`
			RawID             string `json:"rawId"`
			AttestationObject string `json:"attestationObject"`
			ClientDataJSON    string `json:"clientDataJSON"`
		} `json:"response"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.ID == "" {
		body.ID = body.ResponseObj.ID
	}
	if body.RawID == "" {
		body.RawID = body.ResponseObj.RawID
	}
	if body.ID == "" {
		jsonError(w, "Invalid passkey data", http.StatusBadRequest)
		return
	}

	deviceName := body.DeviceName
	if deviceName == "" {
		deviceName = r.Header.Get("User-Agent")
		if len(deviceName) > 100 {
			deviceName = deviceName[:100]
		}
	}
	if deviceName == "" {
		deviceName = "Unknown Device"
	}

	if body.RawID == "" {
		jsonError(w, "Invalid credential ID", http.StatusBadRequest)
		return
	}
	credentialID, err := base64.RawURLEncoding.DecodeString(body.RawID)
	if err != nil {
		jsonError(w, "Invalid credential ID", http.StatusBadRequest)
		return
	}

	attestationObject := body.AttestationObject
	if attestationObject == "" {
		attestationObject = body.ResponseObj.AttestationObject
	}

	userHandle := strconv.FormatInt(user.UserID, 10)

	database.DB.Exec(
		"INSERT INTO passkeys (user_id, credential_id, public_key, name, user_handle) VALUES (?, ?, ?, ?, ?)",
		user.UserID, credentialID, attestationObject, deviceName, userHandle,
	)

	database.DB.Exec("UPDATE users SET webauthn_challenge = NULL WHERE id = ?", user.UserID)
	services.LogActivity(user.UserID, "passkey_registered", "Registered new passkey: "+deviceName, nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"verified": true})
}

func (h *PasskeyHandler) BeginLogin(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email *string `json:"email"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	var userID *int64
	var allowCredentials []map[string]interface{}

	if body.Email != nil && *body.Email != "" {
		var dbUserID int64
		var authRestricted bool
		err := database.DB.QueryRow("SELECT id, auth_restricted FROM users WHERE email = ?", *body.Email).Scan(&dbUserID, &authRestricted)
		if err != nil {
			jsonError(w, "No account found with this email", http.StatusNotFound)
			return
		}
		if authRestricted {
			jsonError(w, "Your account has been restricted. Contact support for assistance.", http.StatusForbidden)
			return
		}

		rows, err := database.DB.Query("SELECT credential_id, name FROM passkeys WHERE user_id = ?", dbUserID)
		if err != nil {
			jsonError(w, "Failed to retrieve passkeys", http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		for rows.Next() {
			var credID []byte
			var devName string
			rows.Scan(&credID, &devName)
			allowCredentials = append(allowCredentials, map[string]interface{}{
				"id":   base64.RawURLEncoding.EncodeToString(credID),
				"type": "public-key",
			})
		}

		if len(allowCredentials) == 0 {
			jsonError(w, "No passkeys registered for this account", http.StatusNotFound)
			return
		}

		userID = &dbUserID
	}

	challenge := make([]byte, 32)
	rand.Read(challenge)
	challengeB64 := base64.RawURLEncoding.EncodeToString(challenge)

	rpID := r.Host
	for i := 0; i < len(rpID); i++ {
		if rpID[i] == ':' {
			rpID = rpID[:i]
			break
		}
	}

	options := map[string]interface{}{
		"challenge":        challengeB64,
		"rpId":             rpID,
		"timeout":          60000,
		"userVerification": "preferred",
	}
	if allowCredentials != nil {
		options["allowCredentials"] = allowCredentials
	}

	sessionToken := generateSessionToken()

	challengeMu.Lock()
	challengeMap["login:"+sessionToken] = &challengeEntry{
		Challenge: challengeB64,
		Timestamp: time.Now().UnixMilli(),
		UserID:    userID,
	}
	challengeMu.Unlock()

	resp := map[string]interface{}{
		"options":      options,
		"sessionToken": sessionToken,
	}
	if userID != nil {
		resp["userId"] = *userID
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *PasskeyHandler) CompleteLogin(w http.ResponseWriter, r *http.Request) {
	ip := getClientIP(r)
	vpnResult := services.DetectVPNProxy(ip)
	if isVpn, _ := vpnResult["isVpn"].(bool); isVpn {
		jsonError(w, "VPN, proxy, or Tor detected. Please disable them for security reasons.", http.StatusForbidden)
		return
	}

	var body struct {
		SessionToken string `json:"sessionToken"`
		Credential   struct {
			ID      string `json:"id"`
			RawID   string `json:"rawId"`
			Type    string `json:"type"`
			Resp    struct {
				AuthenticatorData string `json:"authenticatorData"`
				Signature         string `json:"signature"`
				UserHandle        string `json:"userHandle"`
				ClientDataJSON    string `json:"clientDataJSON"`
			} `json:"response"`
		} `json:"response"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Credential.ID == "" {
		jsonError(w, "Response is required", http.StatusBadRequest)
		return
	}

	challengeMu.Lock()
	stored := challengeMap["login:"+body.SessionToken]
	if stored != nil {
		delete(challengeMap, "login:"+body.SessionToken)
	}
	challengeMu.Unlock()

	if stored == nil {
		jsonError(w, "No login in progress. Please try again.", http.StatusBadRequest)
		return
	}

	credentialID, err := base64.RawURLEncoding.DecodeString(body.Credential.RawID)
	if err != nil {
		jsonError(w, "Invalid credential ID", http.StatusBadRequest)
		return
	}

	var passkeyUserID int64
	var passkeyID int64
	err = database.DB.QueryRow(
		"SELECT id, user_id FROM passkeys WHERE credential_id = ?", credentialID,
	).Scan(&passkeyID, &passkeyUserID)
	if err != nil {
		jsonError(w, "Passkey not found", http.StatusNotFound)
		return
	}

	database.DB.Exec("UPDATE passkeys SET last_used_at = NOW() WHERE id = ?", passkeyID)

	var user struct {
		ID           int64
		Email        string
		Username     string
		PteroUserID  *int64
		IsAdmin      bool
		Restricted   bool
		TokenVersion int
	}
	err = database.DB.QueryRow(
		"SELECT id, email, username, ptero_user_id, is_admin, restricted, token_version FROM users WHERE id = ?",
		passkeyUserID,
	).Scan(&user.ID, &user.Email, &user.Username, &user.PteroUserID, &user.IsAdmin, &user.Restricted, &user.TokenVersion)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	token, err := middleware.GenerateToken(middleware.UserClaims{
		UserID:       user.ID,
		Email:        user.Email,
		Username:     user.Username,
		PteroID:     user.PteroUserID,
		IsAdmin:      user.IsAdmin,
		Restricted:   user.Restricted,
		TokenVersion: user.TokenVersion,
	})
	if err != nil {
		jsonError(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	services.LogActivity(user.ID, "passkey_login", "Logged in with a passkey", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":           user.ID,
			"email":        user.Email,
			"username":     user.Username,
			"pteroId":      user.PteroUserID,
			"isAdmin":      user.IsAdmin,
			"restricted":   user.Restricted,
			"gravatarHash": fmt.Sprintf("%x", sha256.Sum256([]byte(user.Email))),
		},
	})
}

func (h *PasskeyHandler) UpdatePasskey(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid passkey ID", http.StatusBadRequest)
		return
	}

	var body struct {
		Name string `json:"name"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Name == "" {
		jsonError(w, "Name is required", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE passkeys SET name = ? WHERE id = ? AND user_id = ?", body.Name, id, user.UserID)
	services.LogActivity(user.UserID, "passkey_renamed", "Renamed passkey #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true, "name": body.Name})
}

func (h *PasskeyHandler) DeletePasskey(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid passkey ID", http.StatusBadRequest)
		return
	}

	database.DB.Exec("DELETE FROM passkeys WHERE id = ? AND user_id = ?", id, user.UserID)
	services.LogActivity(user.UserID, "passkey_deleted", "Deleted passkey #"+idStr, nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
