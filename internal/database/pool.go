package database

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	_ "github.com/go-sql-driver/mysql"
)

var DB *sql.DB

type PoolStats struct {
	Active int `json:"active"`
	Total  int `json:"total"`
	Idle   int `json:"idle"`
}

func InitPool(dsn string) error {
	var err error
	DB, err = sql.Open("mysql", dsn)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	DB.SetMaxOpenConns(10)
	DB.SetMaxIdleConns(10)
	DB.SetConnMaxLifetime(5 * time.Minute)
	DB.SetConnMaxIdleTime(30 * time.Second)

	if err := DB.Ping(); err != nil {
		return fmt.Errorf("database ping failed: %w", err)
	}

	log.Println("Database connection pool initialized")
	return nil
}

func ClosePool() {
	if DB != nil {
		DB.Close()
	}
}

func GetPoolStats() PoolStats {
	stats := DB.Stats()
	return PoolStats{
		Active: stats.InUse,
		Total:  stats.OpenConnections,
		Idle:   stats.Idle,
	}
}
