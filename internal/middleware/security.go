package middleware

import (
	"encoding/json"
	"net/http"
	"strings"

	"zerohost/dashboard/internal/services"
)

var (
	NodeEnv      string
	CSRFExemptPaths []string
	CookieSecret string
)

func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.Header().Set("X-Robots-Tag", "noindex, nofollow")
		w.Header().Set("X-DNS-Prefetch-Control", "off")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' https://img.zero-host.org data:; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://cap.zero-host.org https://cdn.jsdelivr.net; frame-src 'self' blob:; worker-src 'self' blob:; base-uri 'self'")
		next.ServeHTTP(w, r)
	})
}

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Request-Id", services.GenerateSubmitToken())
		next.ServeHTTP(w, r)
	})
}

func FileLogger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			ip := services.GetClientIP(r)
			services.WriteLog(r.Method, r.URL.Path, ip)
		}
		next.ServeHTTP(w, r)
	})
}

func AdvancedBotProtection(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		ip := services.GetClientIP(r)
		ua := r.Header.Get("User-Agent")
		isPost := r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" || r.Method == "DELETE"

		if services.IsIpSuspicious(ip) && isPost {
			jsonError(w, "Access denied due to suspicious activity.", http.StatusForbidden)
			return
		}

		if services.IsBotUserAgent(ua) && isPost {
			services.RecordFailedAction(ip, "action")
			jsonError(w, "Automated requests are not allowed.", http.StatusForbidden)
			return
		}

		if services.IsKnownBotIP(ip) && isPost {
			jsonError(w, "Access denied", http.StatusForbidden)
			return
		}

		queryCheck := services.CheckSuspiciousQueryParams(r)
		if flagged, _ := queryCheck["flagged"].(bool); flagged && isPost {
			services.RecordFailedAction(ip, "action")
			jsonError(w, "Invalid request parameters", http.StatusBadRequest)
			return
		}

		if isPost {
			var bodyMap map[string]interface{}
			if r.Body != nil {
				json.NewDecoder(r.Body).Decode(&bodyMap)
			}
			honeypot := services.CheckHoneypot(bodyMap)
			if triggered, _ := honeypot["triggered"].(bool); triggered && isPost {
				services.RecordFailedAction(ip, "action")
				jsonError(w, "Invalid form submission", http.StatusBadRequest)
				return
			}

			bodyCheck := services.CheckBodySuspicious(bodyMap)
			if flagged, _ := bodyCheck["flagged"].(bool); flagged && isPost {
				services.RecordFailedAction(ip, "action")
				jsonError(w, "Request contains invalid content", http.StatusBadRequest)
				return
			}

			sensitivePaths := []string{
				"/api/auth/register", "/api/auth/login", "/api/auth/change-password",
				"/api/auth/change-email", "/api/auth/delete-account",
				"/api/servers/create", "/api/admin/login",
			}
			for _, sp := range sensitivePaths {
				if r.URL.Path == sp {
					ref := services.CheckReferrer(r)
					if passed, _ := ref["passed"].(bool); !passed {
						services.RecordFailedAction(ip, "action")
						jsonError(w, "Invalid request origin", http.StatusForbidden)
						return
					}
					break
				}
			}

			risk := services.CalculateOverallRisk(r)
			if level, _ := risk["level"].(string); level == "high" {
				services.RecordFailedAction(ip, "action")
				jsonError(w, "Request blocked for security reasons", http.StatusForbidden)
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

func BrowserIntegrityCheck(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			isPost := r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" || r.Method == "DELETE"
			if isPost {
				issues := services.CheckHeaders(r)
				if len(issues) >= 3 {
					services.RecordFailedAction(services.GetClientIP(r), "action")
					jsonError(w, "Invalid request headers. Please use a real browser.", http.StatusForbidden)
					return
				}
				sig := services.ValidateBrowserSignature(r)
				total, _ := sig["total"].(int)
				if total < 30 && len(issues) > 0 {
					services.RecordFailedAction(services.GetClientIP(r), "action")
					jsonError(w, "Browser verification failed. Please use a modern browser.", http.StatusForbidden)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}

func VPNProxyProtection(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		vpnExempt := map[string]bool{
			"/api/config": true, "/api/health": true, "/api/activity": true,
		}
		if vpnExempt[r.URL.Path] {
			next.ServeHTTP(w, r)
			return
		}

		ip := services.GetClientIP(r)
		clean := services.NormalizeIP(ip)
		if clean == "" || services.IsPrivateIP(clean) {
			next.ServeHTTP(w, r)
			return
		}

		isPost := r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" || r.Method == "DELETE"
		if !isPost {
			next.ServeHTTP(w, r)
			return
		}

		vpnResult := services.DetectVPNProxy(clean)
		if isVpn, _ := vpnResult["isVpn"].(bool); isVpn {
			services.RecordFailedAction(ip, "action")
			jsonError(w, "VPN or proxy detected. Please disable your VPN for security reasons.", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func CountryBlock(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		isPost := r.Method == "POST" || r.Method == "PUT" || r.Method == "PATCH" || r.Method == "DELETE"
		if !isPost {
			next.ServeHTTP(w, r)
			return
		}

		if r.URL.Path == "/api/auth/login" {
			next.ServeHTTP(w, r)
			return
		}

		ip := services.GetClientIP(r)
		countryCheck := services.CheckBlockedCountry(ip)
		if blocked, _ := countryCheck["blocked"].(bool); blocked {
			jsonError(w, "Service not available in your region.", http.StatusForbidden)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func DisposableEmailCheck(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" && r.URL.Path == "/api/auth/register" {
			var body struct {
				Email string `json:"email"`
			}
			json.NewDecoder(r.Body).Decode(&body)
			if body.Email != "" && services.IsDisposableEmail(body.Email) {
				jsonError(w, "Temporary email addresses are not allowed.", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func PasswordBreachCheck(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, "/api/") {
			next.ServeHTTP(w, r)
			return
		}

		if r.Method == "POST" && (r.URL.Path == "/api/auth/register" || r.URL.Path == "/api/auth/change-password") {
			var body struct {
				Password    string `json:"password"`
				NewPassword string `json:"newPassword"`
			}
			json.NewDecoder(r.Body).Decode(&body)
			password := body.Password
			if password == "" {
				password = body.NewPassword
			}
			if password != "" && len(password) >= 6 {
				result, _ := services.CheckPasswordBreach(password)
				if breached, _ := result["breached"].(bool); breached {
					jsonError(w, "This password has been exposed in a data breach. Please choose a different password.", http.StatusBadRequest)
					return
				}
			}
		}
		next.ServeHTTP(w, r)
	})
}
