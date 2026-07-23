package routes

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"zerohost/dashboard/internal/middleware"
	"zerohost/dashboard/internal/services"
)

type NotificationHandler struct{}

func RegisterNotificationRoutes(r chi.Router) {
	h := &NotificationHandler{}

	r.Get("/notifications", middleware.AuthenticateToken(http.HandlerFunc(h.ListNotifications)))
	r.Get("/notifications/unread", middleware.AuthenticateToken(http.HandlerFunc(h.UnreadCount)))
	r.Get("/notifications/unread-count", middleware.AuthenticateToken(http.HandlerFunc(h.UnreadCount)))
	r.Post("/notifications/{id}/read", middleware.AuthenticateToken(http.HandlerFunc(h.MarkRead)))
	r.Post("/notifications/read-all", middleware.AuthenticateToken(http.HandlerFunc(h.MarkAllRead)))
	r.Get("/notifications/mock-create", middleware.AuthenticateToken(http.HandlerFunc(h.MockCreate)))
}

func (h *NotificationHandler) ListNotifications(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	pageStr := r.URL.Query().Get("page")
	page, _ := strconv.Atoi(pageStr)
	if page < 1 {
		page = 1
	}
	limit := 20
	offset := (page - 1) * limit

	result, err := services.GetNotifications(user.UserID, limit, offset)
	if err != nil {
		jsonError(w, "Failed to fetch notifications", http.StatusInternalServerError)
		return
	}
	notifs := result.Notifications
	total := result.Total

	writeJSON(w, http.StatusOK, map[string]interface{}{
		"notifications": notifs,
		"total":         total,
		"page":          page,
		"totalPages":    (total + limit - 1) / limit,
	})
}

func (h *NotificationHandler) UnreadCount(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	count, err := services.GetUnreadCount(user.UserID)
	if err != nil {
		jsonError(w, "Failed to fetch unread count", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"unread": count})
}

func (h *NotificationHandler) MarkRead(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	idStr := r.PathValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		jsonError(w, "Invalid notification ID", http.StatusBadRequest)
		return
	}

	if err := services.MarkAsRead(id, user.UserID); err != nil {
		jsonError(w, "Failed to mark as read", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *NotificationHandler) MarkAllRead(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	if err := services.MarkAllAsRead(user.UserID); err != nil {
		jsonError(w, "Failed to mark all as read", http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}

func (h *NotificationHandler) MockCreate(w http.ResponseWriter, r *http.Request) {
	user := middleware.GetUser(r)
	services.CreateNotification(user.UserID, "Test Notification", "This is a test notification from the server.", "info", nil)
	writeJSON(w, http.StatusOK, map[string]interface{}{"success": true})
}
