package routes

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type PasskeyHandler struct{}

func RegisterPasskeyRoutes(r chi.Router) {
	h := &PasskeyHandler{}

	r.Get("/passkeys", middleware.AuthenticateToken(h.ListPasskeys))
	r.Post("/passkeys/register/begin", middleware.AuthenticateToken(h.BeginRegistration))
	r.Post("/passkeys/register/complete", middleware.AuthenticateToken(h.CompleteRegistration))
	r.Post("/passkeys/authenticate/begin", middleware.AuthenticateToken(h.BeginAuthentication))
	r.Post("/passkeys/authenticate/complete", middleware.AuthenticateToken(h.CompleteAuthentication))
	r.Delete("/passkeys/{id}", middleware.AuthenticateToken(h.DeletePasskey))
}

func (h *PasskeyHandler) ListPasskeys(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	rows, err := database.DB.Query("SELECT id, credential_id, device_name, created_at, last_used_at FROM passkeys WHERE user_id = ?", user.UserID)
	if err != nil {
		jsonError(w, "Failed to fetch passkeys", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type PasskeyEntry struct {
		ID           int64   `json:"id"`
		CredentialID string  `json:"credentialId"`
		DeviceName   string  `json:"deviceName"`
		CreatedAt    *string `json:"createdAt"`
		LastUsedAt   *string `json:"lastUsedAt"`
	}

	var passkeys []PasskeyEntry
	for rows.Next() {
		var p PasskeyEntry
		var credentialID []byte
		rows.Scan(&p.ID, &credentialID, &p.DeviceName, &p.CreatedAt, &p.LastUsedAt)
		p.CredentialID = base64.RawURLEncoding.EncodeToString(credentialID)
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

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"challenge": challengeB64,
		"rp":        map[string]string{"name": "ZeroHost", "id": r.Host},
		"user": map[string]interface{}{
			"id":   strconv.FormatInt(user.UserID, 10),
			"name": user.Username,
		},
		"pubKeyCredParams": []map[string]interface{}{
			{"alg": -7, "type": "public-key"},
			{"alg": -257, "type": "public-key"},
		},
		"timeout": 60000,
	})
}

func (h *PasskeyHandler) CompleteRegistration(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		ID                   string `json:"id"`
		RawID                string `json:"rawId"`
		AttestationObject    string `json:"response"`
		ClientDataJSON       string `json:"clientDataJSON"`
		DeviceName           string `json:"deviceName"`
	}
	json.NewDecoder(r.Body).Decode(&body)

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

	credentialID, _ := base64.RawURLEncoding.DecodeString(body.RawID)
	if credentialID == nil {
		jsonError(w, "Invalid credential ID", http.StatusBadRequest)
		return
	}

	userHandle := strconv.FormatInt(user.UserID, 10)

	database.DB.Exec(
		"INSERT INTO passkeys (user_id, credential_id, public_key, device_name, user_handle) VALUES (?, ?, ?, ?, ?)",
		user.UserID, credentialID, body.AttestationObject, deviceName, userHandle,
	)

	database.DB.Exec("UPDATE users SET webauthn_challenge = NULL WHERE id = ?", user.UserID)
	services.LogActivity(user.UserID, "passkey_registered", "Registered new passkey: "+deviceName, nil)

	writeJSON(w, http.StatusCreated, map[string]interface{}{"success": true})
}

func (h *PasskeyHandler) BeginAuthentication(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	challenge := make([]byte, 32)
	rand.Read(challenge)
	challengeB64 := base64.RawURLEncoding.EncodeToString(challenge)

	database.DB.Exec("UPDATE users SET webauthn_challenge = ? WHERE id = ?", challengeB64, user.UserID)

	rows, _ := database.DB.Query("SELECT credential_id, public_key FROM passkeys WHERE user_id = ?", user.UserID)
	var allowCredentials []map[string]interface{}
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var credID []byte
			var pubKey string
			rows.Scan(&credID, &pubKey)
			allowCredentials = append(allowCredentials, map[string]interface{}{
				"id":   base64.RawURLEncoding.EncodeToString(credID),
				"type": "public-key",
			})
		}
	}
	if allowCredentials == nil {
		allowCredentials = []map[string]interface{}{}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"challenge":        challengeB64,
		"timeout":          60000,
		"allowCredentials": allowCredentials,
		"userVerification": "preferred",
	})
}

func (h *PasskeyHandler) CompleteAuthentication(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		ID              string `json:"id"`
		RawID           string `json:"rawId"`
		AuthenticatorData string `json:"authenticatorData"`
		Signature       string `json:"signature"`
		UserHandle      string `json:"userHandle"`
		ClientDataJSON  string `json:"clientDataJSON"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.ID == "" {
		jsonError(w, "Invalid authentication data", http.StatusBadRequest)
		return
	}

	var dbChallenge string
	database.DB.QueryRow("SELECT webauthn_challenge FROM users WHERE id = ?", user.UserID).Scan(&dbChallenge)

	if dbChallenge == "" {
		jsonError(w, "No challenge found. Start authentication again.", http.StatusBadRequest)
		return
	}

	credentialID, err := base64.RawURLEncoding.DecodeString(body.RawID)
	if err != nil {
		jsonError(w, "Invalid credential ID", http.StatusBadRequest)
		return
	}

	var passkeyID int64
	var storedPubKey string
	err = database.DB.QueryRow("SELECT id, public_key FROM passkeys WHERE user_id = ? AND credential_id = ?", user.UserID, credentialID).Scan(&passkeyID, &storedPubKey)
	if err != nil {
		jsonError(w, "Passkey not found", http.StatusNotFound)
		return
	}

	database.DB.Exec("UPDATE passkeys SET last_used_at = NOW() WHERE id = ?", passkeyID)
	database.DB.Exec("UPDATE users SET webauthn_challenge = NULL WHERE id = ?", user.UserID)

	services.LogActivity(user.UserID, "passkey_authenticated", "Authenticated with passkey", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
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
