# ZeroHost Dashboard

Game server management dashboard for the ZeroHost platform. Provides user-facing server lifecycle management (creation, renewal, suspension, deletion) backed by a panel API.

> [!NOTE]
> The dashboard is now in "cruise mode", instead of dozens of commits a day, expect around 2-3 commits per day going forward, as I'm juggling other projects on the side. That said, there will still be days with bigger pushes when needed.

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/403b7c93-1121-4f4c-b407-ed1235b73218" />

---

## Table of Contents

- [Panel Compatibility](#panel-compatibility)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Request Lifecycle](#request-lifecycle)
- [Routing](#routing)
- [Database Schema](#database-schema)
- [Authentication Flow](#authentication-flow)
- [Server Lifecycle](#server-lifecycle)
- [Scheduler](#scheduler)
- [Configuration](#configuration)
- [Deployment](#deployment)

---

## Panel Compatibility

| Panel | Status |
|---|---|
| Pterodactyl | ⚠️ Not fully tested |
| Pyrodactyl | ✅ Tested — working |
| Hydrodactyl | ✅ Tested — working |
| Pelican | ❓ Not tested |

## Architecture Overview

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        A["Browser (Vanilla JS SPA)"]
        B["Cap CAPTCHA Widget"]
    end

    subgraph CDN["CDN Layer"]
        C["jsDelivr\n(cap-widget)"]
        D["Google Fonts"]
    end

    subgraph App["Application Layer (Express)"]
        E["server.js\n(Entry Point)"]
        F["middleware/auth.js\n(JWT Auth)"]
        G["config/migrate.js\n(Schema Migration)"]
        H["services/scheduler.js\n(Expiry Cron)"]
    end

    subgraph Routes["Route Handlers"]
        I["routes/auth.js"]
        J["routes/servers.js"]
    end

    subgraph Services["Service Layer"]
        K["services/pyrodactyl.js\n(Panel API Wrapper)"]
        L["services/activity.js\n(Activity Logger)"]
    end

    subgraph Config["Configuration"]
        M["config/db.js\n(MariaDB Pool)"]
        N["config/pyrodactyl.js\n(Panel Config & Limits)"]
        O["config/cap.js\n(CAPTCHA Client)"]
    end

    subgraph External["External Systems"]
        P["Pyrodactyl Panel\n(panel.zero-host.org)"]
        Q["MariaDB"]
        R["ip-api.com\n(VPN/Proxy Detection)"]
    end

    A -- "HTTP(S)" --> E
    B -- "CAPTCHA Token" --> E
    C -- "Web Component" --> A
    D -- "Font Assets" --> A
    E --> F
    E --> G
    E --> H
    E --> I
    E --> J
    I --> K
    I --> L
    I --> O
    J --> K
    J --> L
    J --> O
    K --> P
    K --> Q
    L --> Q
    I --> R
    M --> Q
```

---

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js >= 18 (ES Modules) |
| HTTP Framework | Express 4.21 |
| Database | MariaDB via `mariadb` driver 3.4 |
| Authentication | JWT (HS256, `jsonwebtoken` 9) |
| Password Hashing | Argon2id (`argon2` 0.41) |
| Frontend | Vanilla JavaScript (SPA, no framework) |
| Styling | Custom CSS |
| CAPTCHA | Self-hosted Cap CAPTCHA |
| Panel API | Pterodactyl / Pyrodactyl Application API |
| Process Manager | PM2 |
| CI/CD | GitHub Actions (SSH deploy) |

---

## Project Structure

```mermaid
flowchart LR
    subgraph Root["/"]
        direction TB
        sv["server.js\n(Express entry)"]
        env[".env"]
        pkg["package.json"]
        pt["port.txt"]
    end

    subgraph Routes["routes/"]
        auth["auth.js\nAuth endpoints"]
        srv["servers.js\nServer CRUD"]
    end

    subgraph Middleware["middleware/"]
        mw["auth.js\nJWT verification"]
    end

    subgraph Services["services/"]
        p["pyrodactyl.js\nPanel API wrapper"]
        a["activity.js\nActivity log"]
        sc["scheduler.js\nExpiry cron"]
    end

    subgraph Config["config/"]
        db["db.js\nMariaDB pool"]
        mg["migrate.js\nSchema migrator"]
        cp["cap.js\nCAPTCHA client"]
        py["pyrodactyl.js\nPanel config"]
    end

    subgraph Public["public/"]
        html["index.html\nShell"]
        css["css/style.css\nStyles"]
        js["js/app.js\nSPA frontend"]
    end

    subgraph GH["github/workflows/"]
        beta["deploy-beta.yml"]
        main["deploy-main.yml"]
    end

    Root --> Routes
    Root --> Services
    Root --> Config
    Root --> Public
    Root --> GH
```

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant Browser
    participant Express
    participant Middleware
    participant Handler
    participant Service
    participant Database
    participant Pyrodactyl

    Browser->>Express: HTTP Request
    Express->>Express: helmet (security headers)
    Express->>Express: cors
    Express->>Express: rate-limit check
    Express->>Middleware: authenticateToken (if /api/* except auth routes)
    
    alt Valid Token
        Middleware->>Middleware: jwt.verify(token, JWT_SECRET)
        Middleware->>Express: req.user = { userId, email, username, pteroId }
        Express->>Handler: Route handler
        Handler->>Service: Business logic
        Service->>Database: Query / Mutation
        Service->>Pyrodactyl: Panel API call (if applicable)
        Pyrodactyl-->>Service: Response
        Database-->>Service: Result
        Service-->>Handler: Processed result
        Handler-->>Express: JSON Response
        Express-->>Browser: 200 JSON
    else Invalid / Expired Token
        Middleware-->>Express: 401 / 403
        Express-->>Browser: Error JSON
    end
```

---

## Routing

### Frontend SPA Routes

```mermaid
flowchart TD
    A["/ or /overview\nDashboard Home"] --> B["Stat Cards\n(Total/Active/Slots/To-Renew)"]
    A --> C["Resource Usage\n(RAM/CPU/Disk bars)"]
    A --> D["Recent Servers\n(List of last 5)"]
    A --> E["Recent Activity\n(Timeline)"]

    F["/servers\nServer List"] --> G["Table with search & filter"]
    G --> H["Settings Button"]
    G --> I["Open Panel Button"]
    G --> J["Renew Button"]

    K["/server/:id\nServer Detail"] --> L["Tab: Info\n(egg, allocation, lifetime)"]
    K --> M["Tab: Resources\n(live CPU/Memory/Disk gauges)"]
    K --> N["Tab: Actions\n(Open, Reinstall, Delete)"]

    O["/create\nCreate Server"] --> P["Name Input"]
    O --> Q["Egg Selector\n(grouped by nest)"]
    O --> R["Cap CAPTCHA"]
    O --> S["Default Limits\n(512MB/50%/3GB)"]

    T["/pyrodactyl\nPanel Redirect"] --> U["5-second auto-redirect\nto panel.zero-host.org"]

    V["/account\nAccount Hub"] --> W["/account/edit\n(Email, Password, API Key)"]
    V --> Y["/account/dangerous\n(Delete Account, RGPD Export)"]

    Z["/log\nActivity Log"] --> AA["Paginated list\n(50 per page)"]
```

### Backend API Endpoints

```mermaid
flowchart LR
    subgraph Auth["/api/auth"]
        direction TB
        r["POST /register"]
        l["POST /login"]
        o["POST /logout"]
        cp["POST /change-password"]
        ce["POST /change-email"]
        da["POST /delete-account"]
        ed["GET /export-data"]
    end

    subgraph Servers["/api/servers"]
        direction TB
        ls["GET /list"]
        ov["GET /overview"]
        eg["GET /eggs"]
        cr["POST /create"]
        dt["GET /details/:id"]
        rn["PATCH /:id\n(rename)"]
        rw["POST /renew/:id"]
        ri["POST /:id/reinstall"]
        dl["DELETE /:id"]
        rs["GET /resources/:identifier"]
        ak["PUT /client-api-key"]
    end

    subgraph Other["/api"]
        ac["GET /activity"]
        hl["GET /health"]
    end
```

---

## Database Schema

```mermaid
erDiagram
    users {
        int id PK "AUTO_INCREMENT"
        varchar email "NOT NULL"
        varchar username "NOT NULL"
        varchar password_hash "Argon2id hash"
        int ptero_user_id "Pyrodactyl user ID"
        varchar ptero_uuid "Pyrodactyl UUID"
        varchar first_name
        varchar last_name
        tinyint password_set "DEFAULT 0"
        varchar ptero_client_api_key "NULLABLE"
        timestamp created_at "DEFAULT CURRENT_TIMESTAMP"
    }

    server_meta {
        int id PK "AUTO_INCREMENT"
        int ptero_server_id "NOT NULL"
        int user_id "FK -> users"
        timestamp created_at "DEFAULT CURRENT_TIMESTAMP"
        timestamp expires_at "90d from creation/renewal"
        enum status "'active' | 'suspended' | 'expired'"
    }

    user_ips {
        int id PK "AUTO_INCREMENT"
        int user_id "FK -> users ON DELETE CASCADE"
        varchar ip_address "IPv4 or IPv6"
        timestamp created_at "DEFAULT CURRENT_TIMESTAMP"
    }

    activity_log {
        int id PK "AUTO_INCREMENT"
        int user_id "NOT NULL"
        varchar action "e.g. server_created"
        varchar details "DEFAULT ''"
        int server_id "NULLABLE"
        timestamp created_at "DEFAULT CURRENT_TIMESTAMP"
    }

    users ||--o{ server_meta : "has"
    users ||--o{ user_ips : "has"
    users ||--o{ activity_log : "performs"
```

### Indexes & Constraints

| Table | Index / Constraint | Type |
|---|---|---|
| `server_meta` | `idx_expires` (expires_at) | Index |
| `server_meta` | `idx_user` (user_id) | Index |
| `server_meta` | `idx_status` (status) | Index |
| `user_ips` | `idx_ip` (ip_address) | Index |
| `user_ips` | `idx_user` (user_id) | Index |
| `user_ips` | `fk_user_ips_user` (user_id -> users.id) | Foreign Key (CASCADE) |
| `activity_log` | `idx_activity_user` (user_id) | Index |
| `activity_log` | `idx_activity_created` (created_at) | Index |

### External Table (panel database, not migrated by this project)

| Table | Columns |
|---|---|
| `panel.egg_variables` | `egg_id`, `name`, `env_variable`, `default_value`, `rules`, `description`, `user_viewable`, `user_editable` |

---

## Authentication Flow

### Registration

```mermaid
sequenceDiagram
    participant Browser
    participant Express
    participant Cap as "Cap CAPTCHA"
    participant ipapi as "ip-api.com"
    participant DB as "MariaDB"
    participant Panel as "Pyrodactyl Panel"

    Browser->>Express: POST /api/auth/register
    Note over Browser,Express: Body: { email, username, password, capToken }
    Express->>Cap: POST /siteverify (capToken)
    Cap-->>Express: { success: boolean }

    alt CAPTCHA Failed
        Express-->>Browser: 400 { error: "CAPTCHA verification failed" }
    end

    Express->>ipapi: GET /json/{clientIP}
    ipapi-->>Express: { proxy: boolean, ... }

    alt Proxy / VPN Detected
        Express-->>Browser: 403 { error: "VPN/Proxy detected" }
    end

    Express->>DB: SELECT IP count for client IP
    DB-->>Express: count

    alt 2+ accounts from same IP
        Express-->>Browser: 403 { error: "Maximum 2 accounts per IP" }
    end

    Express->>Express: argon2.hash(password)
    Express->>Panel: POST /api/application/users
    Panel-->>Express: { attributes: { id, uuid } }

    Express->>DB: INSERT INTO users (...)
    DB-->>Express: OK

    Express->>DB: INSERT INTO user_ips (...)
    DB-->>Express: OK

    Express->>Express: jwt.sign({ userId, email, username, pteroId })
    Express->>DB: INSERT INTO activity_log (action='account_registered')
    Express-->>Browser: 201 { token, user } + Set-Cookie: token
```

### Login

```mermaid
sequenceDiagram
    participant Browser
    participant Express
    participant DB as "MariaDB"
    participant ipapi as "ip-api.com"

    Browser->>Express: POST /api/auth/login
    Express->>Express: CAPTCHA verification
    Express->>ipapi: VPN / Proxy check
    ipapi-->>Express: result

    alt Blocked
        Express-->>Browser: 403
    end

    Express->>DB: SELECT * FROM users WHERE email = ?
    DB-->>Express: user row
    Express->>Express: argon2.verify(hash, password)
    
    alt Invalid Password
        Express-->>Browser: 401 { error: "Invalid credentials" }
    end

    Express->>Express: jwt.sign({ userId, email, username, pteroId })
    Express-->>Browser: 200 { token, user } + Set-Cookie: token
```

---

## Server Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Creating: POST /api/servers/create
    Creating --> Active: Pyrodactyl API success
    Creating --> Failed: API error

    Active --> Suspended: Scheduler (expired)
    Active --> Suspended: Manual suspend (Pyrodactyl)
    Active --> Renewed: POST /api/servers/renew/:id
    Active --> Deleted: DELETE /api/servers/:id

    Suspended --> Active: Renew (within 7d window)
    Suspended --> Expired: 7 days past expiry
    Suspended --> Deleted: DELETE /api/servers/:id

    Renewed --> Active: expires_at += 90 days

    Expired --> [*]
    Failed --> [*]
    Deleted --> [*]
```

### Server Default Limits

| Resource | Value |
|---|---|
| RAM | 512 MB |
| CPU | 50% |
| Disk | 3 GB |
| Swap | 0 |
| Backups | 1 |
| Allocations | 1 |

### Renewal Policy

- Servers expire 90 days after creation or last renewal.
- Renewal is only permitted within a 7-day window before or after the expiration date.
- Renewing an expired server automatically unsuspends it.

---

## Scheduler

The scheduler (`services/scheduler.js`) runs daily at midnight via `setInterval`:

```mermaid
flowchart TD
    A["Scheduler Start"] --> B["Hourly check:\nis it midnight?"]
    B -->|Yes| C["SELECT * FROM server_meta\nWHERE expires_at < NOW()\nAND status = 'active'"]
    C --> D["For each expired server:"]
    D --> E["POST /api/application/servers/{id}/suspend"]
    E --> F["UPDATE server_meta\nSET status = 'suspended'"]
    F --> G["INSERT INTO activity_log\naction = 'server_suspended'"]
    B -->|No| B
```

---

## Configuration

### Environment Variables (.env)

| Variable | Description |
|---|---|
| `JWT_SECRET` | Secret key for JWT signing (HS256) |
| `JWT_EXPIRES_IN` | Token expiry duration (default: `2h`) |
| `COOKIE_SECRET` | Secret for signed cookies |
| `DB_HOST` | MariaDB host |
| `DB_USER` | MariaDB user |
| `DB_PASSWORD` | MariaDB password |
| `DB_NAME` | MariaDB database name |
| `DB_PORT` | MariaDB port (default: 3306) |
| `PTERO_URL` | Pyrodactyl panel base URL |
| `PTERO_API_KEY` | Pyrodactyl Application API key |
| `CAP_ENDPOINT` | Cap CAPTCHA endpoint URL |
| `CAP_SECRET` | Cap CAPTCHA secret key |
| `NODE_ENV` | `production` or `development` |

### Rate Limiting

| Scope | Window | Max Requests |
|---|---|---|
| Auth endpoints (login, register) | 15 minutes | 10 |
| General API | 60 seconds | 100 |

---

## Deployment

```mermaid
flowchart LR
    subgraph Dev["Development"]
        A["git push beta"]
    end

    subgraph CI["GitHub Actions"]
        B["Checkout"]
        C["Install deps\n(npm ci)"]
        D["SSH Deploy"]
        E["PM2 Restart"]
    end

    subgraph Prod["Production Server"]
        F["Pull from beta/main"]
        G["npm install --production"]
        H["PM2 reload"]
        I["DB migration\n(auto on startup)"]
    end

    A --> B --> C --> D --> E
    E --> F --> G --> H --> I
```

Two deployment workflows are configured:

- **deploy-beta.yml**: Triggered on push to `beta` branch.
- **deploy-main.yml**: Triggered on push to `main` branch.

Both use SSH credentials configured as GitHub repository secrets (`SSH_HOST`, `SSH_USER`, `SSH_PASSWORD`, `SSH_PORT`).

---

## GitHub Stats
![Alt](https://repobeats.axiom.co/api/embed/2f957f930d36f4a2913f8aeb07712cedbd4b38c5.svg "Repobeats analytics image")

