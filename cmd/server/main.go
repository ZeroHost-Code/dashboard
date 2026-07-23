package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"zerohost/dashboard/internal/config"
	"zerohost/dashboard/internal/database"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/routes"
	"zerohost/dashboard/internal/services"
)

func main() {
	cfg := config.Load()

	if err := database.InitPool(cfg.DatabaseDSN); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.ClosePool()

	database.RunMigrations()

	services.PteroURL = cfg.PteroURL
	services.PteroAPIKey = cfg.PteroAPIKey
	services.PanelDBName = cfg.PanelDBName

	if err := services.InitSecurity(cfg.IPQSKey, cfg.AbuseIPDBKey); err != nil {
		log.Printf("Warning: security service init failed: %v", err)
	}

	if err := services.InitFileLogger("log.txt"); err != nil {
		log.Printf("Warning: file logger init failed: %v", err)
	}

	services.StartScheduler()

	r := chi.NewRouter()

	r.Use(chimw.Logger)
	r.Use(chimw.Recoverer)
	r.Use(chimw.RealIP)
	r.Use(middleware.SecurityHeaders)
	r.Use(middleware.FileLogger)

	r.Route("/api", func(r chi.Router) {
		routes.RegisterAuthRoutes(r)
		routes.RegisterServerRoutes(r)
		routes.RegisterAdminRoutes(r)
		routes.RegisterNotificationRoutes(r)
		routes.RegisterPasskeyRoutes(r)
		routes.RegisterTOTPRoutes(r)
	})

	go func() {
		addr := ":" + cfg.Port
		log.Printf("ZeroHost Dashboard starting on %s", addr)
		if err := http.ListenAndServe(addr, r); err != nil {
			log.Fatalf("Server failed: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("Shutting down...")
}
