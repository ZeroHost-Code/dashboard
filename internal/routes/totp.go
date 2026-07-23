package routes

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp/totp"
	"github.com/skip2/go-qrcode"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type TOTPHandler struct{}

func RegisterTOTPRoutes(r chi.Router) {
	h := &TOTPHandler{}

	r.Post("/totp/setup", middleware.AuthenticateToken(h.SetupTOTP))
	r.Post("/totp/verify", middleware.AuthenticateToken(h.VerifyTOTP))
	r.Post("/totp/disable", middleware.AuthenticateToken(h.DisableTOTP))
	r.Get("/totp/status", middleware.AuthenticateToken(h.TOTPStatus))
}

func (h *TOTPHandler) SetupTOTP(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var hasTOTP bool
	database.DB.QueryRow("SELECT totp_enabled FROM users WHERE id = ?", user.UserID).Scan(&hasTOTP)
	if hasTOTP {
		jsonError(w, "TOTP is already enabled", http.StatusBadRequest)
		return
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "ZeroHost",
		AccountName: user.Username,
	})
	if err != nil {
		jsonError(w, "Failed to generate TOTP secret", http.StatusInternalServerError)
		return
	}

	secret := key.Secret()
	database.DB.Exec("UPDATE users SET totp_secret = ? WHERE id = ?", secret, user.UserID)

	qrBytes, err := qrcode.Encode(key.URL(), qrcode.Medium, 256)
	if err != nil {
		jsonError(w, "Failed to generate QR code", http.StatusInternalServerError)
		return
	}

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"secret":    secret,
		"qrCode":    "data:image/png;base64," + base64Encode(qrBytes),
		"manualKey": key.Secret(),
	})
}

func (h *TOTPHandler) VerifyTOTP(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var body struct {
		Code string `json:"code"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if body.Code == "" {
		jsonError(w, "Verification code is required", http.StatusBadRequest)
		return
	}

	var secret string
	database.DB.QueryRow("SELECT totp_secret FROM users WHERE id = ?", user.UserID).Scan(&secret)

	if secret == "" {
		jsonError(w, "TOTP is not set up", http.StatusBadRequest)
		return
	}

	valid := totp.Validate(body.Code, secret)
	if !valid {
		jsonError(w, "Invalid verification code", http.StatusBadRequest)
		return
	}

	database.DB.Exec("UPDATE users SET totp_enabled = TRUE, totp_verified = TRUE, totp_secret = ? WHERE id = ?", secret, user.UserID)
	services.LogActivity(user.UserID, "totp_verified", "TOTP two-factor authentication verified", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *TOTPHandler) DisableTOTP(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	database.DB.Exec("UPDATE users SET totp_enabled = FALSE, totp_verified = FALSE, totp_secret = NULL WHERE id = ?", user.UserID)
	services.LogActivity(user.UserID, "totp_disabled", "TOTP two-factor authentication disabled", nil)

	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *TOTPHandler) TOTPStatus(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)

	var totpEnabled bool
	database.DB.QueryRow("SELECT totp_enabled FROM users WHERE id = ?", user.UserID).Scan(&totpEnabled)

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"totpEnabled": totpEnabled,
	})
}

func base64Encode(data []byte) string {
	const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	result := make([]byte, 0, (len(data)+2)/3*4)
	for i := 0; i < len(data); i += 3 {
		var b3 [3]byte
		copy(b3[:], data[i:])
		result = append(result, charset[b3[0]>>2])
		result = append(result, charset[(b3[0]<<4|b3[1]>>4)&0x3f])
		if i+1 < len(data) {
			result = append(result, charset[(b3[1]<<2|b3[2]>>6)&0x3f])
		} else {
			result = append(result, '=')
		}
		if i+2 < len(data) {
			result = append(result, charset[b3[2]&0x3f])
		} else {
			result = append(result, '=')
		}
	}
	return string(result)
}
