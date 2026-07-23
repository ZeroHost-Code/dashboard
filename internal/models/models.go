package models

import "time"

type User struct {
	ID                    int64      `json:"id"`
	Email                 string     `json:"email"`
	Username              string     `json:"username"`
	PasswordHash          string     `json:"-"`
	PteroUserID           *int64     `json:"ptero_user_id"`
	PteroUUID             *string    `json:"ptero_uuid"`
	FirstName             *string    `json:"first_name"`
	LastName              *string    `json:"last_name"`
	PasswordSet           bool       `json:"password_set"`
	IsAdmin               bool       `json:"is_admin"`
	Restricted            bool       `json:"restricted"`
	AuthRestricted        bool       `json:"auth_restricted"`
	TokenVersion          int        `json:"token_version"`
	Avatar                *string    `json:"avatar"`
	PteroClientAPIKey     *string    `json:"-"`
	EmailVerified         bool       `json:"email_verified"`
	VerificationToken     *string    `json:"-"`
	VerificationTokenExpires *time.Time `json:"-"`
	PendingEmail          *string    `json:"pending_email"`
	EmailChangeToken      *string    `json:"-"`
	EmailChangeCode       *string    `json:"-"`
	EmailChangeExpires    *time.Time `json:"-"`
	UserAgent             *string    `json:"user_agent"`
	OnboardingDone        bool       `json:"onboarding_done"`
	TOTPSecret            *string    `json:"-"`
	TOTPEnabled           bool       `json:"totp_enabled"`
	RecoveryCodes         *string    `json:"-"`
	CreatedAt             time.Time  `json:"created_at"`
}

type ServerMeta struct {
	ID            int64      `json:"id"`
	PteroServerID int64      `json:"ptero_server_id"`
	UserID        int64      `json:"user_id"`
	CreatedAt     time.Time  `json:"created_at"`
	ExpiresAt     time.Time  `json:"expires_at"`
	Status        string     `json:"status"`
	SuspendReason *string    `json:"suspend_reason"`
	SuspendedBy   *string    `json:"suspended_by"`
}

type UserIP struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	IPAddress string    `json:"ip_address"`
	UserAgent *string   `json:"user_agent"`
	CreatedAt time.Time `json:"created_at"`
}

type ActivityLog struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Action    string    `json:"action"`
	Details   string    `json:"details"`
	ServerID  *int64    `json:"server_id"`
	CreatedAt time.Time `json:"created_at"`
	Username  *string   `json:"username,omitempty"`
}

type Nest struct {
	ID          int64     `json:"id"`
	PteroNestID int64     `json:"ptero_nest_id"`
	Name        string    `json:"name"`
	Logo        *string   `json:"logo"`
	Description *string   `json:"description"`
	Unavailable bool      `json:"unavailable"`
	CreatedAt   time.Time `json:"created_at"`
}

type EggResource struct {
	ID          int64     `json:"id"`
	PteroNestID int64     `json:"ptero_nest_id"`
	PteroEggID  int64     `json:"ptero_egg_id"`
	Logo        *string   `json:"logo"`
	CPULimit    *int64    `json:"cpu_limit"`
	MemoryLimit *int64    `json:"memory_limit"`
	DiskLimit   *int64    `json:"disk_limit"`
	Unavailable bool      `json:"unavailable"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type Notification struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Type      string    `json:"type"`
	Link      *string   `json:"link"`
	IsRead    bool      `json:"is_read"`
	CreatedAt time.Time `json:"created_at"`
}

type Passkey struct {
	ID           int64     `json:"id"`
	UserID       int64     `json:"user_id"`
	CredentialID string    `json:"credential_id"`
	PublicKey    string    `json:"-"`
	Counter      int       `json:"counter"`
	Transports   *string   `json:"transports"`
	Name         *string   `json:"name"`
	CreatedAt    time.Time `json:"created_at"`
}

type NodeSetting struct {
	ID          int64     `json:"id"`
	PteroNodeID int64     `json:"ptero_node_id"`
	Unavailable bool      `json:"unavailable"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type PteroServer struct {
	ID               int64                  `json:"id"`
	UUID             string                 `json:"uuid"`
	Identifier       string                 `json:"identifier"`
	Name             string                 `json:"name"`
	User             int64                  `json:"user"`
	Nest             int64                  `json:"nest"`
	Egg              int64                  `json:"egg"`
	Node             int64                  `json:"node"`
	Allocation       int64                  `json:"allocation"`
	Status           *string                `json:"status"`
	CreatedAt        string                 `json:"created_at"`
	Limits           map[string]interface{} `json:"limits"`
	FeatureLimits    map[string]interface{} `json:"feature_limits"`
	DockerImage      string                 `json:"docker_image"`
	Startup          string                 `json:"startup"`
	Environment      map[string]interface{} `json:"environment"`
	ServerMeta       interface{}            `json:"serverMeta,omitempty"`
	NestLogo         interface{}            `json:"nestLogo,omitempty"`
	CurrentState     interface{}            `json:"currentState,omitempty"`
	NodeFqdn         interface{}            `json:"nodeFqdn,omitempty"`
	AllocationDetails interface{}           `json:"allocationDetails,omitempty"`
	EggDetails       interface{}            `json:"eggDetails,omitempty"`
	Owner            interface{}            `json:"owner,omitempty"`
}

type PteroServerResources struct {
	CurrentState string `json:"current_state"`
}

type PteroEgg struct {
	ID           int64                  `json:"id"`
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	DockerImages map[string]string      `json:"docker_images"`
	Startup      string                 `json:"startup"`
	Config       map[string]interface{} `json:"config"`
}

type PteroNest struct {
	ID          int64  `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type PteroAllocation struct {
	ID       int64  `json:"id"`
	IP       string `json:"ip"`
	Port     int    `json:"port"`
	Assigned bool   `json:"assigned"`
}

type PteroNode struct {
	ID         int64   `json:"id"`
	Name       string  `json:"name"`
	FQDN       string  `json:"fqdn"`
	LocationID *int64  `json:"location_id"`
	Memory     int64   `json:"memory"`
	Disk       int64   `json:"disk"`
}
