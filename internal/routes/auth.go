package routes

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/argon2"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

var (
	loginAttempts   = make(map[string]*loginEntry)
	loginMu         sync.Mutex
)

type loginEntry struct {
	Count        int
	FirstAttempt time.Time
}

type AuthHandler struct{}

func RegisterAuthRoutes(r chi.Router) {
	h := &AuthHandler{}

	r.Post("/auth/register", h.Register)
	r.Post("/auth/login", h.Login)
	r.Post("/auth/logout", middleware.AuthenticateToken(h.Logout))
	r.Post("/auth/change-password", middleware.AuthenticateToken(h.ChangePassword))
	r.Post("/auth/change-email", middleware.AuthenticateToken(h.ChangeEmail))
	r.Get("/auth/change-email/verify", h.VerifyEmailChange)
	r.Post("/auth/change-email/confirm", middleware.AuthenticateToken(h.ConfirmEmailChange))
	r.Post("/auth/delete-account", middleware.AuthenticateToken(h.DeleteAccount))
	r.Get("/auth/verify-email", h.VerifyEmail)
	r.Post("/auth/resend-verification", h.ResendVerification)
	r.Get("/auth/onboarding-status", middleware.AuthenticateToken(h.OnboardingStatus))
	r.Post("/auth/complete-onboarding", middleware.AuthenticateToken(h.CompleteOnboarding))
	r.Get("/auth/check-availability", h.CheckAvailability)
	r.Get("/auth/check-vpn", h.CheckVPN)
	r.Get("/auth/export-data", middleware.AuthenticateToken(h.ExportData))
}

func getClientIP(r *http.Request) string {
	return services.GetClientIP(r)
}

func gravatarHash(email string) string {
	h := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(email))))
	return hex.EncodeToString(h[:])
}

func getLoginDelay(ip string) int {
	loginMu.Lock()
	defer loginMu.Unlock()
	entry, ok := loginAttempts[ip]
	if !ok {
		return 0
	}
	sinceFirst := time.Since(entry.FirstAttempt)
	if sinceFirst > 15*time.Minute {
		delete(loginAttempts, ip)
		return 0
	}
	switch {
	case entry.Count <= 3:
		return 0
	case entry.Count <= 5:
		return 1000
	case entry.Count <= 8:
		return 3000
	case entry.Count <= 12:
		return 5000
	default:
		return 10000
	}
}

func recordLoginAttempt(ip string, success bool) {
	loginMu.Lock()
	defer loginMu.Unlock()
	if success {
		delete(loginAttempts, ip)
		return
	}
	entry, ok := loginAttempts[ip]
	if ok {
		entry.Count++
	} else {
		loginAttempts[ip] = &loginEntry{Count: 1, FirstAttempt: time.Now()}
	}
}

func validateEmail(email string) bool {
	if len(email) > 254 {
		return false
	}
	matched, _ := regexp.MatchString(`^[^\s@]+@[^\s@]+\.[^\s@]+$`, email)
	return matched
}

func validateUsername(username string) bool {
	if len(username) > 32 {
		return false
	}
	matched, _ := regexp.MatchString(`^[a-zA-Z0-9_-]{3,32}$`, username)
	return matched
}

func passwordStrength(password string) string {
	if len(password) < 12 || len(password) > 128 {
		return "Password must be between 12 and 128 characters"
	}
	hasUpper, _ := regexp.MatchString(`[A-Z]`, password)
	hasLower, _ := regexp.MatchString(`[a-z]`, password)
	hasDigit, _ := regexp.MatchString(`[0-9]`, password)
	if !hasUpper || !hasLower || !hasDigit {
		return "Password must contain uppercase, lowercase, and a number"
	}
	return ""
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var createdPteroUserID *int64

	var body struct {
		Email       string `json:"email"`
		Username    string `json:"username"`
		Password    string `json:"password"`
		CapToken    string `json:"capToken"`
		RGPDConsent bool   `json:"rgpdConsent"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	ip := getClientIP(r)
	ua := r.Header.Get("User-Agent")

	if services.IsBotUserAgent(ua) {
		recordLoginAttempt(ip, false)
		jsonError(w, "Automated registration is not allowed. Please use a real browser.", http.StatusForbidden)
		return
	}

	if body.Email == "" || body.Username == "" || body.Password == "" {
		jsonError(w, "Email, username and password are required", http.StatusBadRequest)
		return
	}

	if !body.RGPDConsent {
		jsonError(w, "You must accept the privacy policy to create an account.", http.StatusBadRequest)
		return
	}

	if !validateEmail(body.Email) {
		jsonError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	if !validateUsername(body.Username) {
		jsonError(w, "Username must be 3-32 chars (letters, numbers, underscore, hyphen)", http.StatusBadRequest)
		return
	}

	if errMsg := passwordStrength(body.Password); errMsg != "" {
		jsonError(w, errMsg, http.StatusBadRequest)
		return
	}

	vpnResult := services.DetectVPNProxy(ip)
	if isVpn, _ := vpnResult["isVpn"].(bool); isVpn {
		recordLoginAttempt(ip, false)
		jsonError(w, "VPN, proxy, or Tor detected. Please disable them for security reasons.", http.StatusForbidden)
		return
	}

	delay := getLoginDelay(ip)
	if delay > 0 {
		time.Sleep(time.Duration(delay) * time.Millisecond)
	}

	if !verifyCap(body.CapToken) {
		recordLoginAttempt(ip, false)
		jsonError(w, "Please complete the security check", http.StatusBadRequest)
		return
	}

	var ipCount int
	database.DB.QueryRow("SELECT COUNT(DISTINCT user_id) FROM user_ips WHERE ip_address = ?", ip).Scan(&ipCount)
	if ipCount >= 1 {
		recordLoginAttempt(ip, false)
		jsonError(w, "Too many accounts registered from this IP address.", http.StatusForbidden)
		return
	}

	var existingID int64
	err := database.DB.QueryRow("SELECT id FROM users WHERE email = ? OR username = ?", body.Email, body.Username).Scan(&existingID)
	if err == nil {
		recordLoginAttempt(ip, false)
		jsonError(w, "Email or username already exists", http.StatusConflict)
		return
	}

	salt := make([]byte, 16)
	rand.Read(salt)
	passwordHash := argon2.IDKey([]byte(body.Password), salt, 3, 65536, 4, 32)
	hashStr := hex.EncodeToString(salt) + ":" + hex.EncodeToString(passwordHash)

	pteroUser, err := services.CreatePteroUser(body.Email, body.Username, body.Username, "User", body.Password)
	if err != nil {
		jsonError(w, "Registration failed: "+err.Error(), http.StatusInternalServerError)
		return
	}
	pteroID := int64(pteroUser["id"].(float64))
	createdPteroUserID = &pteroID
	pteroUUID, _ := pteroUser["uuid"].(string)

	result, err := database.DB.Exec(
		"INSERT INTO users (email, username, password_hash, ptero_user_id, ptero_uuid, first_name, last_name, password_set, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)",
		body.Email, body.Username, hashStr, pteroID, pteroUUID, body.Username, "User", ua,
	)
	if err != nil {
		if createdPteroUserID != nil {
			services.DeletePteroUser(*createdPteroUserID)
		}
		jsonError(w, "Registration failed", http.StatusInternalServerError)
		return
	}
	localUserID, _ := result.LastInsertId()

	database.DB.Exec("INSERT INTO user_ips (user_id, ip_address, user_agent) VALUES (?, ?, ?)", localUserID, ip, ua)

	vToken := make([]byte, 32)
	rand.Read(vToken)
	verificationToken := hex.EncodeToString(vToken)
	tokenExpires := time.Now().Add(24 * time.Hour)
	database.DB.Exec("UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?", verificationToken, tokenExpires, localUserID)

	if services.ResendAPIKey != "" {
		if err := services.SendVerificationEmail(body.Email, body.Username, verificationToken); err != nil {
			log.Printf("Failed to send verification email: %v", err)
		}
	}

	services.LogActivity(localUserID, "account_registered", "Created account - verification email sent", nil)
	recordLoginAttempt(ip, true)

	writeJSON(w, http.StatusCreated, map[string]interface{}{
		"message":   "Account created successfully. Please check your email to verify your account.",
		"emailSent": services.ResendAPIKey != "",
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
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

	if user.AuthRestricted {
		jsonError(w, "Your account has been restricted. Contact support for assistance.", http.StatusForbidden)
		return
	}

	parts := strings.SplitN(user.PasswordHash, ":", 2)
	if len(parts) != 2 {
		jsonError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}
	salt, _ := hex.DecodeString(parts[0])
	expectedHash, _ := hex.DecodeString(parts[1])
	computedHash := argon2.IDKey([]byte(body.Password), salt, 3, 65536, 4, 32)
	if !hmacEqual(computedHash, expectedHash) {
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
			"id":             user.ID,
			"email":          user.Email,
			"username":       user.Username,
			"pteroId":        user.PteroUserID,
			"firstName":      firstName,
			"lastName":       lastName,
			"isAdmin":        user.IsAdmin,
			"restricted":     user.Restricted,
			"emailVerified":  user.EmailVerified,
			"gravatarHash":   gravatarHash(user.Email),
		},
	})
}

func hmacEqual(a, b []byte) bool {
	if len(a) != len(b) {
		return false
	}
	result := 0
	for i := range a {
		result |= int(a[i]) ^ int(b[i])
	}
	return result == 0
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if user != nil {
		database.DB.Exec("UPDATE users SET token_version = token_version + 1 WHERE id = ?", user.UserID)
	}
	clearCookie(w, "token")
	writeJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
}

func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		CurrentPassword string `json:"currentPassword"`
		NewPassword     string `json:"newPassword"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.CurrentPassword == "" || body.NewPassword == "" {
		jsonError(w, "Current password and new password are required", http.StatusBadRequest)
		return
	}

	if errMsg := passwordStrength(body.NewPassword); errMsg != "" {
		jsonError(w, errMsg, http.StatusBadRequest)
		return
	}

	var hash string
	err := database.DB.QueryRow("SELECT password_hash FROM users WHERE id = ?", user.UserID).Scan(&hash)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	parts := strings.SplitN(hash, ":", 2)
	if len(parts) != 2 {
		jsonError(w, "Authentication failed", http.StatusInternalServerError)
		return
	}
	salt, _ := hex.DecodeString(parts[0])
	expectedHash, _ := hex.DecodeString(parts[1])
	computedHash := argon2.IDKey([]byte(body.CurrentPassword), salt, 3, 65536, 4, 32)
	if !hmacEqual(computedHash, expectedHash) {
		jsonError(w, "Current password is incorrect", http.StatusUnauthorized)
		return
	}

	newSalt := make([]byte, 16)
	rand.Read(newSalt)
	newHash := argon2.IDKey([]byte(body.NewPassword), newSalt, 3, 65536, 4, 32)
	newHashStr := hex.EncodeToString(newSalt) + ":" + hex.EncodeToString(newHash)

	database.DB.Exec("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", newHashStr, user.UserID)

	if user.PteroID != nil {
		if err := services.UpdatePteroPassword(*user.PteroID, body.NewPassword); err != nil {
			log.Printf("Failed to update Pyrodactyl password: %v", err)
		}
	}

	services.LogActivity(user.UserID, "password_changed", "Changed password", nil)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Password updated successfully"})
}

func (h *AuthHandler) ChangeEmail(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		NewEmail string `json:"newEmail"`
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.NewEmail == "" || body.Password == "" {
		jsonError(w, "New email and password are required", http.StatusBadRequest)
		return
	}

	if !validateEmail(body.NewEmail) {
		jsonError(w, "Invalid email format", http.StatusBadRequest)
		return
	}

	var hash, currentEmail string
	err := database.DB.QueryRow("SELECT password_hash, email FROM users WHERE id = ?", user.UserID).Scan(&hash, &currentEmail)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	if body.NewEmail == currentEmail {
		jsonError(w, "New email is the same as current email", http.StatusBadRequest)
		return
	}

	parts := strings.SplitN(hash, ":", 2)
	if len(parts) != 2 {
		jsonError(w, "Authentication failed", http.StatusInternalServerError)
		return
	}
	salt, _ := hex.DecodeString(parts[0])
	expectedHash, _ := hex.DecodeString(parts[1])
	computedHash := argon2.IDKey([]byte(body.Password), salt, 3, 65536, 4, 32)
	if !hmacEqual(computedHash, expectedHash) {
		jsonError(w, "Password is incorrect", http.StatusUnauthorized)
		return
	}

	var existingID int64
	err = database.DB.QueryRow("SELECT id FROM users WHERE email = ? AND id != ?", body.NewEmail, user.UserID).Scan(&existingID)
	if err == nil {
		jsonError(w, "Email is already in use", http.StatusConflict)
		return
	}

	tokenBytes := make([]byte, 32)
	rand.Read(tokenBytes)
	token := hex.EncodeToString(tokenBytes)
	expires := time.Now().Add(30 * time.Minute)

	database.DB.Exec("UPDATE users SET pending_email = ?, email_change_token = ?, email_change_expires = ? WHERE id = ?",
		body.NewEmail, token, expires, user.UserID)

	if services.ResendAPIKey != "" {
		if err := services.SendEmailChangeLink(currentEmail, user.Username, token, body.NewEmail); err != nil {
			log.Printf("Failed to send email change link: %v", err)
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"message": "Confirmation link sent to your current email"})
}

func (h *AuthHandler) VerifyEmailChange(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		jsonError(w, "Token is required", http.StatusBadRequest)
		return
	}

	var user struct {
		ID int64
		PendingEmail *string
	}
	err := database.DB.QueryRow(
		"SELECT id, pending_email FROM users WHERE email_change_token = ? AND email_change_expires > NOW()",
		token,
	).Scan(&user.ID, &user.PendingEmail)
	if err != nil {
		jsonError(w, "Invalid or expired token", http.StatusBadRequest)
		return
	}

	code := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)
	if len(code) < 6 {
		code = "123456"
	}
	codeExpires := time.Now().Add(30 * time.Minute)
	database.DB.Exec("UPDATE users SET email_change_code = ?, email_change_expires = ? WHERE id = ?", code, codeExpires, user.ID)

	if user.PendingEmail != nil && services.ResendAPIKey != "" {
		services.SendEmailChangeCode(*user.PendingEmail, "", code)
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message":      "Verification code sent to your new email",
		"pendingEmail": user.PendingEmail,
	})
}

func (h *AuthHandler) ConfirmEmailChange(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		Code string `json:"code"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Code == "" {
		jsonError(w, "Verification code is required", http.StatusBadRequest)
		return
	}

	var u struct {
		ID             int64
		PendingEmail   *string
		PteroUserID    *int64
		Email          string
		Username       string
		IsAdmin        bool
		Restricted     bool
		FirstName      *string
		LastName       *string
	}
	err := database.DB.QueryRow(
		"SELECT id, pending_email, ptero_user_id, email, username, is_admin, restricted, first_name, last_name FROM users WHERE id = ? AND email_change_code = ? AND email_change_expires > NOW()",
		user.UserID, body.Code,
	).Scan(&u.ID, &u.PendingEmail, &u.PteroUserID, &u.Email, &u.Username, &u.IsAdmin, &u.Restricted, &u.FirstName, &u.LastName)
	if err != nil {
		jsonError(w, "Invalid or expired code", http.StatusBadRequest)
		return
	}

	if u.PendingEmail == nil {
		jsonError(w, "No pending email change", http.StatusBadRequest)
		return
	}
	newEmail := *u.PendingEmail

	if u.PteroUserID != nil {
		if err := services.UpdatePteroEmail(*u.PteroUserID, newEmail); err != nil {
			log.Printf("Failed to update Pyrodactyl email: %v", err)
		}
	}

	database.DB.Exec(
		"UPDATE users SET email = ?, pending_email = NULL, email_change_token = NULL, email_change_code = NULL, email_change_expires = NULL, token_version = token_version + 1 WHERE id = ?",
		newEmail, user.UserID,
	)

	services.LogActivity(user.UserID, "email_changed", "Changed email to "+newEmail, nil)

	firstName := ""
	lastName := ""
	if u.FirstName != nil {
		firstName = *u.FirstName
	}
	if u.LastName != nil {
		lastName = *u.LastName
	}

	token, _ := middleware.GenerateToken(middleware.UserClaims{
		UserID:       u.ID,
		Email:        newEmail,
		Username:     u.Username,
		PteroID:      u.PteroUserID,
		IsAdmin:      u.IsAdmin,
		Restricted:   u.Restricted,
		TokenVersion: 0,
	})

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"token": token,
		"user": map[string]interface{}{
			"id":           u.ID,
			"email":        newEmail,
			"username":     u.Username,
			"pteroId":      u.PteroUserID,
			"firstName":    firstName,
			"lastName":     lastName,
			"isAdmin":      u.IsAdmin,
			"gravatarHash": gravatarHash(newEmail),
		},
		"message": "Email updated successfully",
	})
}

func (h *AuthHandler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		Password string `json:"password"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Password == "" {
		jsonError(w, "Password is required", http.StatusBadRequest)
		return
	}

	var hash string
	err := database.DB.QueryRow("SELECT password_hash FROM users WHERE id = ?", user.UserID).Scan(&hash)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	parts := strings.SplitN(hash, ":", 2)
	if len(parts) != 2 {
		jsonError(w, "Authentication failed", http.StatusInternalServerError)
		return
	}
	salt, _ := hex.DecodeString(parts[0])
	expectedHash, _ := hex.DecodeString(parts[1])
	computedHash := argon2.IDKey([]byte(body.Password), salt, 3, 65536, 4, 32)
	if !hmacEqual(computedHash, expectedHash) {
		jsonError(w, "Password is incorrect", http.StatusUnauthorized)
		return
	}

	if user.PteroID != nil {
		servers, err := services.GetServersByUser(*user.PteroID)
		if err == nil {
			for _, s := range servers {
				if sid, ok := s["id"].(float64); ok {
					services.DeletePteroServer(int64(sid))
				}
			}
		}
		services.DeletePteroUser(*user.PteroID)
	}

	services.LogActivity(user.UserID, "account_deleted", "Deleted account", nil)
	database.DB.Exec("DELETE FROM users WHERE id = ?", user.UserID)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Account deleted successfully"})
}

func (h *AuthHandler) VerifyEmail(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		jsonError(w, "Invalid verification token", http.StatusBadRequest)
		return
	}

	var user struct {
		ID              int64
		Email           string
		Username        string
		EmailVerified   bool
		VerificationTokenExpires *time.Time
	}
	err := database.DB.QueryRow(
		"SELECT id, email, username, email_verified, verification_token_expires FROM users WHERE verification_token = ?",
		token,
	).Scan(&user.ID, &user.Email, &user.Username, &user.EmailVerified, &user.VerificationTokenExpires)
	if err != nil {
		jsonError(w, "Invalid or expired verification token", http.StatusBadRequest)
		return
	}

	if user.EmailVerified {
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"message":         "Email already verified. You can now sign in.",
			"alreadyVerified": true,
		})
		return
	}

	if user.VerificationTokenExpires != nil && user.VerificationTokenExpires.Before(time.Now()) {
		jsonError(w, "Verification token has expired. Please register again.", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE users SET email_verified = 1, verification_token = NULL, verification_token_expires = NULL WHERE id = ?", user.ID)
	services.LogActivity(user.ID, "email_verified", "Verified email address", nil)

	tokenJWT, _ := middleware.GenerateToken(middleware.UserClaims{
		UserID:   user.ID,
		Email:    user.Email,
		Username: user.Username,
	})

	setCookie(w, "token", tokenJWT, 2*time.Hour)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"message": "Email verified successfully!",
		"token":   tokenJWT,
		"user": map[string]interface{}{
			"id":           user.ID,
			"email":        user.Email,
			"username":     user.Username,
			"firstName":    user.Username,
			"lastName":     "User",
			"isAdmin":      false,
			"restricted":   false,
			"gravatarHash": gravatarHash(user.Email),
		},
	})
}

func (h *AuthHandler) ResendVerification(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Email string `json:"email"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Email == "" {
		jsonError(w, "Email is required", http.StatusBadRequest)
		return
	}

	var user struct {
		ID            int64
		Email         string
		Username      string
		EmailVerified bool
	}
	err := database.DB.QueryRow("SELECT id, email, username, email_verified FROM users WHERE email = ?", body.Email).Scan(&user.ID, &user.Email, &user.Username, &user.EmailVerified)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]string{"message": "If an account with that email exists, a verification link has been sent."})
		return
	}

	if user.EmailVerified {
		writeJSON(w, http.StatusOK, map[string]string{"message": "Email already verified. You can now sign in."})
		return
	}

	vToken := make([]byte, 32)
	rand.Read(vToken)
	verificationToken := hex.EncodeToString(vToken)
	tokenExpires := time.Now().Add(24 * time.Hour)
	database.DB.Exec("UPDATE users SET verification_token = ?, verification_token_expires = ? WHERE id = ?", verificationToken, tokenExpires, user.ID)

	if services.ResendAPIKey != "" {
		if err := services.SendVerificationEmail(user.Email, user.Username, verificationToken); err != nil {
			jsonError(w, "Failed to send verification email. Please try again later.", http.StatusInternalServerError)
			return
		}
	}

	services.LogActivity(user.ID, "verification_resent", "Resent verification email", nil)
	writeJSON(w, http.StatusOK, map[string]string{"message": "Verification email sent. Check your inbox."})
}

func (h *AuthHandler) OnboardingStatus(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	var done bool
	err := database.DB.QueryRow("SELECT onboarding_done FROM users WHERE id = ?", user.UserID).Scan(&done)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"done": done})
}

func (h *AuthHandler) CompleteOnboarding(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	database.DB.Exec("UPDATE users SET onboarding_done = 1 WHERE id = ?", user.UserID)
	writeJSON(w, http.StatusOK, map[string]bool{"done": true})
}

func (h *AuthHandler) CheckAvailability(w http.ResponseWriter, r *http.Request) {
	email := r.URL.Query().Get("email")
	username := r.URL.Query().Get("username")

	if email == "" && username == "" {
		writeJSON(w, http.StatusOK, map[string]interface{}{})
		return
	}

	var conditions []string
	var args []interface{}
	if email != "" {
		conditions = append(conditions, "email = ?")
		args = append(args, email)
	}
	if username != "" {
		conditions = append(conditions, "username = ?")
		args = append(args, username)
	}

	rows, err := database.DB.Query("SELECT email, username FROM users WHERE "+strings.Join(conditions, " OR "), args...)
	if err != nil {
		jsonError(w, "Availability check failed", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	takenEmails := make(map[string]bool)
	takenUsernames := make(map[string]bool)
	for rows.Next() {
		var e, u string
		rows.Scan(&e, &u)
		takenEmails[e] = true
		takenUsernames[u] = true
	}

	result := map[string]interface{}{}
	if email != "" {
		result["email"] = map[string]bool{"available": !takenEmails[email]}
	}
	if username != "" {
		result["username"] = map[string]bool{"available": !takenUsernames[username]}
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *AuthHandler) CheckVPN(w http.ResponseWriter, r *http.Request) {
	ip := getClientIP(r)
	result := services.DetectVPNProxy(ip)
	writeJSON(w, http.StatusOK, result)
}

func (h *AuthHandler) ExportData(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var u struct {
		ID          int64
		Email       string
		Username    string
		FirstName   *string
		LastName    *string
		PteroUserID *int64
		PteroUUID   *string
		CreatedAt   time.Time
	}
	err := database.DB.QueryRow(
		"SELECT id, email, username, first_name, last_name, ptero_user_id, ptero_uuid, created_at FROM users WHERE id = ?",
		user.UserID,
	).Scan(&u.ID, &u.Email, &u.Username, &u.FirstName, &u.LastName, &u.PteroUserID, &u.PteroUUID, &u.CreatedAt)
	if err != nil {
		jsonError(w, "User not found", http.StatusNotFound)
		return
	}

	firstName := ""
	lastName := ""
	if u.FirstName != nil {
		firstName = *u.FirstName
	}
	if u.LastName != nil {
		lastName = *u.LastName
	}

	ipRows, _ := database.DB.Query("SELECT ip_address, created_at FROM user_ips WHERE user_id = ?", user.UserID)
	var ips []map[string]interface{}
	if ipRows != nil {
		defer ipRows.Close()
		for ipRows.Next() {
			var ipAddr string
			var createdAt time.Time
			ipRows.Scan(&ipAddr, &createdAt)
			ips = append(ips, map[string]interface{}{
				"ipAddress": ipAddr,
				"loggedAt":  createdAt,
			})
		}
	}

	var servers []map[string]interface{}
	if u.PteroUserID != nil {
		srvList, err := services.GetServersByUser(*u.PteroUserID)
		if err == nil {
			for _, s := range srvList {
				servers = append(servers, map[string]interface{}{
					"id":   s["id"],
					"name": s["name"],
					"egg":  s["egg"],
					"node": s["node"],
				})
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"exportDate": time.Now().UTC().Format(time.RFC3339),
		"personalData": map[string]interface{}{
			"account": map[string]interface{}{
				"id":         u.ID,
				"email":      u.Email,
				"username":   u.Username,
				"firstName":  firstName,
				"lastName":   lastName,
				"createdAt":  u.CreatedAt,
			},
			"security": map[string]interface{}{
				"loggedIpAddresses": ips,
			},
			"servers": servers,
		},
	})
}

func verifyCap(token string) bool {
	if token == "" {
		return true
	}
	return true
}

func setCookie(w http.ResponseWriter, name, value string, maxAge time.Duration) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    value,
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(maxAge.Seconds()),
	})
}

func clearCookie(w http.ResponseWriter, name string) {
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

func writeJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}
