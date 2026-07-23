package config

import (
	"log"
	"os"
	"regexp"
	"strings"

	"github.com/joho/godotenv"
)

type Config struct {
	Port         string
	NodeEnv      string
	JWTSecret    string
	JWTExpiresIn string
	DBHost       string
	DBPort       string
	DBUser       string
	DBPassword   string
	DBName       string
	DatabaseDSN  string
	PanelDBName  string
	PteroURL     string
	PteroAPIKey  string
	IPQSKey      string
	AbuseIPDBKey string
	CapEndpoint  string
	CapSecret    string
	CookieSecret string
	ResendAPIKey string
	ResendFrom   string
	BaseURL      string
	WebauthnOrigin string
	WebauthnRPID  string
}

func Load() *Config {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using system environment variables")
	}

	requiredVars := []string{"JWT_SECRET", "DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME", "CAP_SECRET", "CAP_ENDPOINT", "COOKIE_SECRET"}
	var missing []string
	for _, v := range requiredVars {
		if os.Getenv(v) == "" {
			missing = append(missing, v)
		}
	}
	if len(missing) > 0 {
		panic("Missing required environment variables: " + strings.Join(missing, ", "))
	}

	secret := os.Getenv("JWT_SECRET")
	if matched, _ := regexp.MatchString("[$()]", secret); matched {
		panic("JWT_SECRET contains unresolved shell expansion characters")
	}

	panelDB := os.Getenv("PANEL_DB_NAME")
	if panelDB == "" {
		panelDB = "panel"
	}
	re := regexp.MustCompile(`[^a-zA-Z0-9_]`)
	panelDBSafe := re.ReplaceAllString(panelDB, "")

	nodeEnv := os.Getenv("NODE_ENV")
	if nodeEnv == "" {
		nodeEnv = "development"
	}

	baseURL := os.Getenv("BASE_URL")
	if baseURL == "" {
		if nodeEnv == "production" {
			baseURL = "https://dashboard.zero-host.org"
		} else {
			baseURL = "http://localhost:" + os.Getenv("PORT")
			if baseURL == "http://localhost:" {
				baseURL = "http://localhost:3000"
			}
		}
	}

	dbUser := os.Getenv("DB_USER")
	dbPass := os.Getenv("DB_PASSWORD")
	dbHost := os.Getenv("DB_HOST")
	dbPort := getEnv("DB_PORT", "3306")
	dbName := os.Getenv("DB_NAME")
	dsn := dbUser + ":" + dbPass + "@tcp(" + dbHost + ":" + dbPort + ")/" + dbName + "?charset=utf8mb4&parseTime=True&loc=Local"

	return &Config{
		Port:         getEnv("PORT", "3000"),
		NodeEnv:      nodeEnv,
		JWTSecret:    secret,
		JWTExpiresIn: getEnv("JWT_EXPIRES_IN", "2h"),
		DBHost:       dbHost,
		DBPort:       dbPort,
		DBUser:       dbUser,
		DBPassword:   dbPass,
		DBName:       dbName,
		DatabaseDSN:  dsn,
		PanelDBName:  panelDBSafe,
		PteroURL:     getEnv("PTERO_URL", "https://panel.zero-host.org"),
		PteroAPIKey:  os.Getenv("PTERO_API_KEY"),
		IPQSKey:      os.Getenv("IPQS_API_KEY"),
		AbuseIPDBKey: os.Getenv("ABUSEIPDB_API_KEY"),
		CapEndpoint:  os.Getenv("CAP_ENDPOINT"),
		CapSecret:    os.Getenv("CAP_SECRET"),
		CookieSecret: os.Getenv("COOKIE_SECRET"),
		ResendAPIKey: os.Getenv("RESEND_API_KEY"),
		ResendFrom:   getEnv("RESEND_FROM_EMAIL", "noreply@zero-host.org"),
		BaseURL:      baseURL,
		WebauthnOrigin: os.Getenv("WEBAUTHN_ORIGIN"),
		WebauthnRPID:  os.Getenv("WEBAUTHN_RP_ID"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
