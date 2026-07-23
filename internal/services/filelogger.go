package services

import (
	"fmt"
	"os"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	logFile     string
	logMu       sync.Mutex
	logCleanerOnce sync.Once
)

type logPattern struct {
	pattern *regexp.Regexp
	label   string
}

var actionLabels = []logPattern{
	{pattern: regexp.MustCompile(`^GET /api/auth/onboarding-status$`), label: "Statut d'onboarding"},
	{pattern: regexp.MustCompile(`^POST /api/auth/complete-onboarding$`), label: "Fin d'onboarding"},
	{pattern: regexp.MustCompile(`^POST /api/auth/register$`), label: "Inscription"},
	{pattern: regexp.MustCompile(`^POST /api/auth/login$`), label: "Connexion"},
	{pattern: regexp.MustCompile(`^POST /api/auth/logout$`), label: "Déconnexion"},
	{pattern: regexp.MustCompile(`^POST /api/auth/change-password$`), label: "Changement de mot de passe"},
	{pattern: regexp.MustCompile(`^POST /api/auth/change-email$`), label: "Demande de changement d'email"},
	{pattern: regexp.MustCompile(`^GET /api/auth/change-email/verify$`), label: "Vérification de changement d'email"},
	{pattern: regexp.MustCompile(`^POST /api/auth/change-email/confirm$`), label: "Confirmation de changement d'email"},
	{pattern: regexp.MustCompile(`^POST /api/auth/delete-account$`), label: "Suppression de compte"},
	{pattern: regexp.MustCompile(`^GET /api/auth/check-availability$`), label: "Vérification de disponibilité"},
	{pattern: regexp.MustCompile(`^POST /api/servers/create$`), label: "Création de serveur"},
	{pattern: regexp.MustCompile(`^POST /api/admin/login$`), label: "Connexion admin"},
	{pattern: regexp.MustCompile(`^POST /api/admin/servers/\d+/suspend$`), label: "Suspension de serveur (admin)"},
	{pattern: regexp.MustCompile(`^POST /api/admin/servers/\d+/unsuspend$`), label: "Réactivation de serveur (admin)"},
	{pattern: regexp.MustCompile(`^DELETE /api/admin/users/\d+$`), label: "Suppression d'utilisateur (admin)"},
	{pattern: regexp.MustCompile(`^DELETE /api/servers/\d+$`), label: "Suppression de serveur"},
	{pattern: regexp.MustCompile(`^POST /api/servers/\d+/reinstall$`), label: "Réinstallation de serveur"},
	{pattern: regexp.MustCompile(`^GET /api/auth/verify-email$`), label: "Vérification d'email"},
}

func InitFileLogger(logPath string) error {
	logFile = logPath
	f, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("failed to open log file: %w", err)
	}
	f.Close()

	logCleanerOnce.Do(func() {
		go func() {
			cleanOldLogs()
			for {
				time.Sleep(24 * time.Hour)
				cleanOldLogs()
			}
		}()
	})

	return nil
}

func WriteLog(method, path, ip string) {
	label := ""
	key := fmt.Sprintf("%s %s", method, path)
	for _, lp := range actionLabels {
		if lp.pattern.MatchString(key) {
			label = " (" + lp.label + ")"
			break
		}
	}

	now := time.Now().Format("2006-01-02 15:04:05")
	line := fmt.Sprintf("[%s] %s %s%s - %s\n", now, method, path, label, ip)

	logMu.Lock()
	defer logMu.Unlock()

	f, err := os.OpenFile(logFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return
	}
	defer f.Close()
	f.WriteString(line)
}

func cleanOldLogs() {
	if logFile == "" {
		return
	}
	data, err := os.ReadFile(logFile)
	if err != nil {
		return
	}
	content := string(data)
	if content == "" {
		return
	}
	cutoff := time.Now().AddDate(0, 0, -365)
	lines := strings.Split(content, "\n")
	var keep []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "[") && len(line) > 20 {
			ts := line[1:20]
			t, err := time.Parse("2006-01-02 15:04:05", ts)
			if err == nil && t.Before(cutoff) {
				continue
			}
		}
		keep = append(keep, line)
	}
	out := strings.Join(keep, "\n")
	if len(keep) > 0 {
		out += "\n"
	}
	os.WriteFile(logFile, []byte(out), 0644)
}

func ReadLogLines(n int) ([]string, error) {
	if logFile == "" {
		return nil, fmt.Errorf("log file not initialized")
	}
	data, err := os.ReadFile(logFile)
	if err != nil {
		return nil, err
	}
	lines := strings.Split(strings.TrimRight(string(data), "\n"), "\n")
	if len(lines) == 0 || (len(lines) == 1 && lines[0] == "") {
		return []string{}, nil
	}
	if n >= len(lines) {
		return lines, nil
	}
	return lines[len(lines)-n:], nil
}
