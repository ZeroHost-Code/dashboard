package middleware

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"zerohost/dashboard/internal/database"
)

var JWTSecret string
var JWTExpiresIn string

type UserClaims struct {
	UserID       int64  `json:"userId"`
	Email        string `json:"email"`
	Username     string `json:"username"`
	PteroID      *int64 `json:"pteroId"`
	IsAdmin      bool   `json:"isAdmin"`
	Restricted   bool   `json:"restricted"`
	TokenVersion int    `json:"tokenVersion"`
	TOTPTemp     bool   `json:"totpTemp,omitempty"`
	jwt.RegisteredClaims
}

type contextKey string

const UserContextKey contextKey = "user"

func GetUser(r *http.Request) *UserClaims {
	if user, ok := r.Context().Value(UserContextKey).(*UserClaims); ok {
		return user
	}
	return nil
}

func AuthenticateToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var tokenStr string

		authHeader := r.Header.Get("Authorization")
		if strings.HasPrefix(authHeader, "Bearer ") {
			tokenStr = strings.TrimPrefix(authHeader, "Bearer ")
		} else if c, err := r.Cookie("token"); err == nil {
			tokenStr = c.Value
		}

		if tokenStr == "" {
			jsonError(w, "Access token required", http.StatusUnauthorized)
			return
		}

		claims := &UserClaims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(JWTSecret), nil
		})
		if err != nil || !token.Valid {
			jsonError(w, "Invalid or expired token", http.StatusForbidden)
			return
		}

		var user struct {
			ID             int64  `json:"id"`
			AuthRestricted bool   `json:"auth_restricted"`
			TokenVersion   int    `json:"token_version"`
			PteroUserID    *int64 `json:"ptero_user_id"`
		}
		err = database.DB.QueryRow(
			"SELECT id, auth_restricted, token_version, ptero_user_id FROM users WHERE id = ?",
			claims.UserID,
		).Scan(&user.ID, &user.AuthRestricted, &user.TokenVersion, &user.PteroUserID)
		if err != nil {
			jsonError(w, "User no longer exists", http.StatusForbidden)
			return
		}

		if user.AuthRestricted {
			jsonError(w, "Your account has been restricted. Contact support for assistance.", http.StatusForbidden)
			return
		}

		if user.TokenVersion != claims.TokenVersion {
			jsonError(w, "Session expired. Please log in again.", http.StatusForbidden)
			return
		}

		claims.PteroID = user.PteroUserID
		ctx := context.WithValue(r.Context(), UserContextKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func RequireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUser(r)
		if user == nil || !user.IsAdmin {
			jsonError(w, "Admin access required", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireNotRestricted(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user := GetUser(r)
		if user != nil && user.Restricted {
			jsonError(w, "Your account is restricted. This action is disabled.", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func RequireOwnership(table, column, paramName string) func(http.Handler) http.Handler {
	allowedTables := map[string]bool{"server_meta": true}
	allowedColumns := map[string]bool{"ptero_server_id": true, "user_id": true, "id": true}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !allowedTables[table] || !allowedColumns[column] {
				jsonError(w, "Ownership verification failed", http.StatusInternalServerError)
				return
			}

			idStr := r.PathValue(paramName)
			if idStr == "" {
				idStr = r.URL.Query().Get(paramName)
			}
			id, err := strconv.ParseInt(idStr, 10, 64)
			if err != nil {
				jsonError(w, "Invalid ID", http.StatusBadRequest)
				return
			}

			user := GetUser(r)
			if user == nil {
				jsonError(w, "Unauthorized", http.StatusUnauthorized)
				return
			}

			var ownerID int64
			err = database.DB.QueryRow(
				"SELECT user_id FROM "+table+" WHERE "+column+" = ?", id,
			).Scan(&ownerID)
			if err != nil {
				jsonError(w, "Resource not found", http.StatusNotFound)
				return
			}

			if ownerID != user.UserID {
				jsonError(w, "Access denied. Resource does not belong to you.", http.StatusForbidden)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func GenerateToken(claims UserClaims) (string, error) {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(JWTSecret))
}

func jsonError(w http.ResponseWriter, msg string, status int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
