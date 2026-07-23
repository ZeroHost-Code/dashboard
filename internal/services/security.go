package services

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"
)

var (
	IPQSKey       string
	AbuseIPDBKey  string

	disposableDomains     map[string]bool
	disposableDomainsMu   sync.RWMutex
	disposableDomainsTS   time.Time
	domainsCacheTTL       = 1 * time.Hour

	localDisposableDomains = map[string]bool{
		"ztzt.net": true, "besteya.com": true,
	}

	disposableURL = "https://raw.githubusercontent.com/disposable-email-domains/disposable-email-domains/master/disposable_email_blocklist.conf"

	dnsblList = []string{
		"zen.spamhaus.org", "dnsbl.dronebl.org", "bl.spamcop.net",
		"bogons.cymru.com", "cbl.abuseat.org", "dnsbl.sorbs.net",
		"tor.dan.me.uk", "rbl.efnetrbl.org", "rbl.schulte.org",
		"dnsbl-1.uceprotect.net",
	}

	dnsblCache     = make(map[string]dnsblCacheEntry)
	dnsblCacheMu   sync.RWMutex
	dnsblCacheTTL  = 10 * time.Minute

	vpnCache     = make(map[string]vpnCacheEntry)
	vpnCacheMu   sync.RWMutex
	vpnCacheDur  = 15 * time.Minute

	asnCache     = make(map[string]asnCacheEntry)
	asnCacheMu   sync.RWMutex

	behaviorScores   = make(map[string]*behaviorEntry)
	behaviorMu       sync.RWMutex
	behaviorTTL      = 1 * time.Hour

	suspiciousIPs   = make(map[string]suspiciousEntry)
	suspiciousMu    sync.RWMutex
	suspiciousTTL   = 24 * time.Hour

	botUAPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)curl/`), regexp.MustCompile(`(?i)wget/`),
		regexp.MustCompile(`(?i)node-fetch`), regexp.MustCompile(`(?i)python-requests`),
		regexp.MustCompile(`(?i)python-httpx`), regexp.MustCompile(`(?i)urllib`),
		regexp.MustCompile(`(?i)aiohttp`), regexp.MustCompile(`(?i)go-http-client`),
		regexp.MustCompile(`(?i)java/\d+`), regexp.MustCompile(`(?i)libcurl`),
		regexp.MustCompile(`(?i)okhttp`), regexp.MustCompile(`(?i)httpie`),
		regexp.MustCompile(`(?i)postmanruntime`), regexp.MustCompile(`(?i)insomnia`),
		regexp.MustCompile(`(?i)axios/`), regexp.MustCompile(`(?i)scrapy`),
		regexp.MustCompile(`(?i)python-urllib`), regexp.MustCompile(`(?i)robot`),
		regexp.MustCompile(`(?i)spider`), regexp.MustCompile(`(?i)crawler`),
		regexp.MustCompile(`(?i)masscan`), regexp.MustCompile(`(?i)nmap`),
		regexp.MustCompile(`(?i)zgrab`), regexp.MustCompile(`(?i)fscan`),
		regexp.MustCompile(`(?i)fasthttp`), regexp.MustCompile(`(?i)selenium`),
		regexp.MustCompile(`(?i)puppeteer`), regexp.MustCompile(`(?i)playwright`),
		regexp.MustCompile(`(?i)cypress`), regexp.MustCompile(`(?i)headless`),
		regexp.MustCompile(`(?i)phantomjs`), regexp.MustCompile(`(?i)pure-native`),
		regexp.MustCompile(`(?i)datadog`), regexp.MustCompile(`(?i)newrelic`),
		regexp.MustCompile(`(?i)restsharp`),
	}

	cloudProviderASNs = map[string]bool{
		"AS16509": true, "AS39111": true, "AS45102": true, "AS16276": true,
		"AS36351": true, "AS13335": true, "AS14618": true, "AS20115": true,
		"AS8987": true, "AS26496": true, "AS30083": true, "AS40065": true,
		"AS46690": true, "AS29791": true, "AS36492": true, "AS55095": true,
		"AS55059": true, "AS13876": true, "AS20326": true, "AS21342": true,
		"AS22385": true, "AS36352": true, "AS20473": true, "AS62567": true,
		"AS32780": true, "AS394906": true, "AS54203": true, "AS53363": true,
		"AS11878": true, "AS14061": true, "AS46664": true, "AS147008": true,
		"AS199524": true, "AS396982": true, "AS63949": true, "AS60068": true,
		"AS55286": true, "AS20454": true, "AS53869": true, "AS19551": true,
		"AS8455": true, "AS29073": true, "AS16302": true, "AS21277": true,
		"AS49333": true, "AS58057": true, "AS59441": true, "AS206264": true,
		"AS61138": true,
	}

	countryBlocklist = map[string]bool{
		"CN": true, "RU": true, "KP": true, "IR": true, "SY": true, "CU": true, "VE": true,
	}

	honeypotFields = []string{"website", "url", "homepage", "message2", "confirm_email", "fax", "phone2"}

	suspiciousPatterns = []*regexp.Regexp{
		regexp.MustCompile(`(?i)<script[\s>]`), regexp.MustCompile(`(?i)javascript:`),
		regexp.MustCompile(`(?i)onerror\s*=`), regexp.MustCompile(`(?i)onload\s*=`),
		regexp.MustCompile(`(?i)onclick\s*=`), regexp.MustCompile(`(?i)onmouseover\s*=`),
		regexp.MustCompile(`(?i)vbscript:`), regexp.MustCompile(`(?i)data:\s*text/html`),
		regexp.MustCompile(`(?i)<\s*iframe`), regexp.MustCompile(`(?i)<\s*embed`),
		regexp.MustCompile(`(?i)<\s*object`), regexp.MustCompile(`(?i)alert\s*\(`),
		regexp.MustCompile(`(?i)prompt\s*\(`), regexp.MustCompile(`(?i)confirm\s*\(`),
		regexp.MustCompile(`(?i)document\.cookie`), regexp.MustCompile(`(?i)window\.location`),
		regexp.MustCompile(`(?i)base64,`), regexp.MustCompile(`(?i)fromCharCode`),
	}

	querySuspicious = []string{"debug", "test", "bypass", "admin", "sudo", "cmd", "exec",
		"command", "eval", "system", "shell", "sql", "union", "select", "from", "where",
		"drop", "alter", "create", "insert", "delete", "update", "../", "..\\", "%00",
		"<script", "<?php"}
)

type dnsblCacheEntry struct {
	result    map[string]interface{}
	timestamp time.Time
}

type vpnCacheEntry struct {
	result    map[string]interface{}
	timestamp time.Time
}

type asnCacheEntry struct {
	asn       string
	timestamp time.Time
}

type behaviorEntry struct {
	score              int
	failedLogins       int
	failedRegistrations int
	failedActions      int
	firstSeen          time.Time
	lastSeen           time.Time
}

type suspiciousEntry struct {
	timestamp time.Time
	reason    string
}

func StartSecurityCleanup() {
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			now := time.Now()

			dnsblCacheMu.Lock()
			for k, v := range dnsblCache {
				if now.Sub(v.timestamp) > dnsblCacheTTL {
					delete(dnsblCache, k)
				}
			}
			dnsblCacheMu.Unlock()

			vpnCacheMu.Lock()
			for k, v := range vpnCache {
				if now.Sub(v.timestamp) > vpnCacheDur {
					delete(vpnCache, k)
				}
			}
			vpnCacheMu.Unlock()

			asnCacheMu.Lock()
			for k, v := range asnCache {
				if now.Sub(v.timestamp) > vpnCacheDur {
					delete(asnCache, k)
				}
			}
			asnCacheMu.Unlock()

			behaviorMu.Lock()
			for k, v := range behaviorScores {
				if now.Sub(v.lastSeen) > behaviorTTL {
					delete(behaviorScores, k)
				}
			}
			behaviorMu.Unlock()

			suspiciousMu.Lock()
			for k, v := range suspiciousIPs {
				if now.Sub(v.timestamp) > suspiciousTTL {
					delete(suspiciousIPs, k)
				}
			}
			suspiciousMu.Unlock()
		}
	}()
}

func InitSecurity(ipqsKey, abuseipdbKey string) error {
	IPQSKey = ipqsKey
	AbuseIPDBKey = abuseipdbKey
	StartSecurityCleanup()
	return nil
}

func GetClientIP(r *http.Request) string {
	if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
		parts := strings.Split(fwd, ",")
		return strings.TrimSpace(parts[0])
	}
	if ip := r.RemoteAddr; ip != "" {
		if h, _, err := net.SplitHostPort(ip); err == nil {
			return h
		}
		return ip
	}
	return "0.0.0.0"
}

func NormalizeIP(ip string) string {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return ""
	}
	ip = strings.TrimPrefix(ip, "::ffff:")
	return ip
}

func IsPrivateIP(ip string) bool {
	clean := NormalizeIP(ip)
	if clean == "" {
		return false
	}
	parsed := net.ParseIP(clean)
	if parsed == nil {
		return false
	}
	if parsed.IsLoopback() || parsed.IsPrivate() || parsed.IsLinkLocalUnicast() {
		return true
	}
	if strings.HasPrefix(clean, "169.254.") {
		return true
	}
	return false
}

func IsBotUserAgent(ua string) bool {
	if ua == "" || len(ua) < 10 {
		return true
	}
	if ua == "Mozilla/5.0" || ua == "Mozilla/4.0" {
		return true
	}
	for _, pattern := range botUAPatterns {
		if pattern.MatchString(ua) {
			return true
		}
	}
	return false
}

func IsKnownBotIP(ip string) bool {
	clean := NormalizeIP(ip)
	if clean == "" {
		return false
	}
	knownBlocks := []string{"45.8.", "45.14.", "45.15.", "45.33.", "45.40.", "45.62.",
		"45.64.", "45.79.", "45.80.", "45.83.", "45.88.", "45.91.", "45.94.", "45.128.",
		"45.135.", "45.143.", "45.148.", "45.150.", "45.152.", "45.153.", "45.155."}
	for _, block := range knownBlocks {
		if strings.HasPrefix(clean, block) {
			return true
		}
	}
	return false
}

func IsIpSuspicious(ip string) bool {
	clean := NormalizeIP(ip)
	if clean == "" {
		return false
	}
	suspiciousMu.RLock()
	if _, ok := suspiciousIPs[clean]; ok {
		suspiciousMu.RUnlock()
		return true
	}
	suspiciousMu.RUnlock()

	behaviorMu.RLock()
	entry, ok := behaviorScores[clean]
	behaviorMu.RUnlock()
	if ok && entry.score >= 80 {
		return true
	}
	return false
}

func RecordFailedAction(ip, actionType string) {
	clean := NormalizeIP(ip)
	if clean == "" {
		return
	}
	behaviorMu.Lock()
	entry, ok := behaviorScores[clean]
	if !ok {
		entry = &behaviorEntry{firstSeen: time.Now()}
		behaviorScores[clean] = entry
	}
	entry.lastSeen = time.Now()
	entry.score += 15
	if entry.score > 100 {
		entry.score = 100
	}
	entry.failedActions++
	if actionType == "login" {
		entry.failedLogins++
	}
	if actionType == "register" {
		entry.failedRegistrations++
	}
	behaviorMu.Unlock()

	if entry.score >= 80 {
		suspiciousMu.Lock()
		suspiciousIPs[clean] = suspiciousEntry{timestamp: time.Now(), reason: "high_failure_rate"}
		suspiciousMu.Unlock()
	}
}

func RecordSuccessfulAction(ip string) {
	clean := NormalizeIP(ip)
	if clean == "" {
		return
	}
	behaviorMu.Lock()
	if entry, ok := behaviorScores[clean]; ok {
		entry.score -= 5
		if entry.score < 0 {
			entry.score = 0
		}
	}
	behaviorMu.Unlock()
}

func IsDisposableEmail(email string) bool {
	if email == "" || !strings.Contains(email, "@") {
		return false
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}
	domain := strings.ToLower(strings.TrimSpace(parts[1]))

	disposableDomainsMu.RLock()
	cached := disposableDomains
	ts := disposableDomainsTS
	disposableDomainsMu.RUnlock()

	if cached == nil || time.Since(ts) > domainsCacheTTL {
		loadDisposableDomains()
		disposableDomainsMu.RLock()
		cached = disposableDomains
		disposableDomainsMu.RUnlock()
	}

	if cached[domain] {
		return true
	}
	for d := range cached {
		if strings.HasSuffix(domain, "."+d) {
			return true
		}
	}
	return false
}

func loadDisposableDomains() {
	merged := make(map[string]bool)
	for d := range localDisposableDomains {
		merged[d] = true
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(disposableURL)
	if err == nil {
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		for _, line := range strings.Split(string(body), "\n") {
			domain := strings.ToLower(strings.TrimSpace(line))
			if domain != "" && !strings.HasPrefix(domain, "#") {
				merged[domain] = true
			}
		}
	}

	disposableDomainsMu.Lock()
	disposableDomains = merged
	disposableDomainsTS = time.Now()
	disposableDomainsMu.Unlock()
}

func CheckPasswordBreach(password string) (map[string]interface{}, error) {
	if len(password) < 6 {
		return map[string]interface{}{"breached": false}, nil
	}
	h := sha256.Sum256([]byte(password))
	hexHash := strings.ToUpper(hex.EncodeToString(h[:]))
	prefix := hexHash[:5]
	suffix := hexHash[5:]

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.pwnedpasswords.com/range/" + prefix)
	if err != nil {
		return map[string]interface{}{"breached": false}, nil
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	lines := strings.Split(string(body), "\n")
	for _, line := range lines {
		parts := strings.Split(strings.TrimSpace(line), ":")
		if len(parts) > 0 && parts[0] == suffix {
			return map[string]interface{}{"breached": true}, nil
		}
	}
	return map[string]interface{}{"breached": false}, nil
}

func CheckHeaders(r *http.Request) []string {
	var issues []string
	if r.Header.Get("Accept") == "" {
		issues = append(issues, "missing_accept")
	}
	if r.Header.Get("Accept-Language") == "" {
		issues = append(issues, "missing_accept_language")
	}
	ua := strings.ToLower(r.Header.Get("User-Agent"))
	if ua == "" {
		issues = append(issues, "missing_ua")
	} else if len(ua) < 20 {
		issues = append(issues, "short_ua")
	}
	if ua == "mozilla/5.0" {
		issues = append(issues, "generic_ua")
	}
	if r.Header.Get("Sec-CH-UA") == "" && r.Header.Get("Sec-CH-UA-Mobile") == "" {
		if !strings.Contains(ua, "headless") && !strings.Contains(ua, "bot") {
			issues = append(issues, "missing_sec_ch_ua")
		}
	}
	return issues
}

func ValidateBrowserSignature(r *http.Request) map[string]interface{} {
	total := 0
	var checks []string

	accept := r.Header.Get("Accept")
	if matched, _ := regexp.MatchString(`text/html|application/json|\*/\*`, accept); matched {
		total += 10
		checks = append(checks, "accept_pass")
	} else {
		checks = append(checks, "accept_suspicious")
	}

	lang := r.Header.Get("Accept-Language")
	if matched, _ := regexp.MatchString(`^[a-z]{2}(-[A-Z]{2})?(,[a-z]{2}(-[A-Z]{2})?)*$`, lang); matched {
		total += 10
		checks = append(checks, "lang_pass")
	} else {
		checks = append(checks, "lang_suspicious")
	}

	for _, header := range []string{"Sec-Fetch-Site", "Sec-Fetch-Mode", "Sec-Fetch-Dest"} {
		val := r.Header.Get(header)
		if val != "" {
			total += 15
			checks = append(checks, strings.ToLower(header)+"_pass")
		}
	}

	if r.Header.Get("Sec-CH-UA") != "" {
		total += 15
		checks = append(checks, "sec_ch_ua_pass")
	}

	if r.Header.Get("DNT") != "" || r.Header.Get("Sec-GPC") != "" {
		total += 5
		checks = append(checks, "dnt_pass")
	}

	ua := strings.ToLower(r.Header.Get("User-Agent"))
	if strings.Contains(ua, "windows") || strings.Contains(ua, "mac") || strings.Contains(ua, "linux") || strings.Contains(ua, "android") || strings.Contains(ua, "ios") || strings.Contains(ua, "iphone") || strings.Contains(ua, "like mac") {
		total += 15
		checks = append(checks, "os_pass")
	}

	return map[string]interface{}{
		"total":  total,
		"checks": checks,
		"passed": total >= 60,
	}
}

func CheckBodySuspicious(body interface{}) map[string]interface{} {
	if body == nil {
		return map[string]interface{}{"flagged": false}
	}
	str, ok := body.(string)
	if !ok {
		b, err := json.Marshal(body)
		if err != nil {
			return map[string]interface{}{"flagged": false}
		}
		str = string(b)
	}
	for _, pattern := range suspiciousPatterns {
		if pattern.MatchString(str) {
			return map[string]interface{}{"flagged": true, "pattern": pattern.String()}
		}
	}
	return map[string]interface{}{"flagged": false}
}

func CheckReferrer(r *http.Request) map[string]interface{} {
	referer := r.Header.Get("Referer")
	if referer == "" {
		return map[string]interface{}{"passed": false, "reason": "missing_referrer"}
	}
	validHosts := []string{"dashboard.zero-host.org", "zero-host.org", "localhost:3000", "127.0.0.1:3000"}
	for _, h := range validHosts {
		if strings.Contains(referer, h) {
			return map[string]interface{}{"passed": true, "host": referer}
		}
	}
	return map[string]interface{}{"passed": false, "reason": "invalid_referrer"}
}

func CheckHoneypot(body map[string]interface{}) map[string]interface{} {
	if body == nil {
		return map[string]interface{}{"triggered": false}
	}
	for _, field := range honeypotFields {
		if val, ok := body[field]; ok && val != "" && val != nil {
			return map[string]interface{}{"triggered": true, "field": field}
		}
	}
	return map[string]interface{}{"triggered": false}
}

func CheckSuspiciousQueryParams(r *http.Request) map[string]interface{} {
	query := r.URL.Query()
	for key := range query {
		val := strings.ToLower(query.Get(key))
		for _, s := range querySuspicious {
			if strings.Contains(val, s) {
				return map[string]interface{}{"flagged": true, "param": key, "pattern": s}
			}
		}
	}
	return map[string]interface{}{"flagged": false}
}

func DetectVPNProxy(ip string) map[string]interface{} {
	clean := NormalizeIP(ip)
	if clean == "" || IsPrivateIP(clean) {
		return map[string]interface{}{"isVpn": false, "isProxy": false, "source": "private"}
	}

	vpnCacheMu.RLock()
	if cached, ok := vpnCache[clean]; ok && time.Since(cached.timestamp) < vpnCacheDur {
		vpnCacheMu.RUnlock()
		return cached.result
	}
	vpnCacheMu.RUnlock()

	result := map[string]interface{}{"isVpn": false, "isProxy": false, "source": "none"}
	var asn string

	client := &http.Client{Timeout: 5 * time.Second}

	// Try ip-api.com
	if resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=proxy,hosting,isp,org,as,query", clean)); err == nil {
		var data map[string]interface{}
		json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if proxy, _ := data["proxy"].(bool); proxy {
			result = map[string]interface{}{"isVpn": true, "isProxy": true, "source": "ip-api"}
		}
		if hosting, _ := data["hosting"].(bool); hosting {
			result = map[string]interface{}{"isVpn": true, "isProxy": true, "source": "ip-api"}
		}
		if a, ok := data["as"].(string); ok {
			asn = a
			if cloudProviderASNs[asn] {
				result = map[string]interface{}{"isVpn": true, "isProxy": true, "source": "asn", "asn": asn}
			}
		}
	}

	// Try ipinfo.io
	if isVpn, _ := result["isVpn"].(bool); !isVpn {
		if resp, err := client.Get(fmt.Sprintf("https://ipinfo.io/%s/json", clean)); err == nil {
			var data map[string]interface{}
			json.NewDecoder(resp.Body).Decode(&data)
			resp.Body.Close()
			if org, ok := data["org"].(string); ok {
				orgLower := strings.ToLower(org)
				if strings.Contains(orgLower, "vpn") || strings.Contains(orgLower, "proxy") || strings.Contains(orgLower, "tor") || strings.Contains(orgLower, "datacenter") || strings.Contains(orgLower, "cloud") || strings.Contains(orgLower, "hosting") {
					result = map[string]interface{}{"isVpn": true, "isProxy": true, "source": "ipinfo"}
				}
			}
			if asn == "" {
				if asnStr, ok := data["asn"].(string); ok {
					parts := strings.Split(asnStr, " ")
					if len(parts) > 0 && cloudProviderASNs[parts[0]] {
						result = map[string]interface{}{"isVpn": true, "isProxy": true, "source": "asn", "asn": parts[0]}
					}
				}
			}
		}
	}

	vpnCacheMu.Lock()
	vpnCache[clean] = vpnCacheEntry{result: result, timestamp: time.Now()}
	vpnCacheMu.Unlock()

	return result
}

func CheckBlockedCountry(ip string) map[string]interface{} {
	clean := NormalizeIP(ip)
	if clean == "" || IsPrivateIP(clean) {
		return map[string]interface{}{"blocked": false}
	}

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://ip-api.com/json/%s?fields=countryCode", clean))
	if err != nil {
		return map[string]interface{}{"blocked": false}
	}
	defer resp.Body.Close()

	var data map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&data)
	cc, _ := data["countryCode"].(string)
	return map[string]interface{}{"blocked": countryBlocklist[cc], "countryCode": cc}
}

func CalculateOverallRisk(r *http.Request) map[string]interface{} {
	risk := 0
	var reasons []string
	ip := GetClientIP(r)
	ua := r.Header.Get("User-Agent")

	if IsBotUserAgent(ua) {
		risk += 30
		reasons = append(reasons, "bot_ua")
	}

	issues := CheckHeaders(r)
	if len(issues) >= 2 {
		risk += 15
		reasons = append(reasons, "bad_headers")
	}
	if len(issues) >= 4 {
		risk += 10
		reasons = append(reasons, "very_bad_headers")
	}

	clean := NormalizeIP(ip)
	if clean != "" && IsPrivateIP(clean) {
		risk += 5
		reasons = append(reasons, "private_ip")
	}
	if clean != "" && IsKnownBotIP(clean) {
		risk += 25
		reasons = append(reasons, "known_bot_ip")
	}
	if clean != "" && IsIpSuspicious(clean) {
		risk += 20
		reasons = append(reasons, "suspicious_ip")
	}

	accept := r.Header.Get("Accept")
	if accept == "" || accept == "*/*" {
		risk += 10
		reasons = append(reasons, "generic_accept")
	}
	if r.Header.Get("Accept-Encoding") == "" {
		risk += 5
		reasons = append(reasons, "no_encoding")
	}

	level := "low"
	if risk >= 60 {
		level = "high"
	} else if risk >= 30 {
		level = "medium"
	}

	return map[string]interface{}{
		"risk":    risk,
		"reasons": reasons,
		"level":   level,
	}
}

func CheckConcurrentRequests(ip string, maxConcurrent int) map[string]interface{} {
	return map[string]interface{}{"allowed": true}
}

func GenerateSubmitToken() string {
	b := make([]byte, 32)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func HashRecoveryCode(code string) string {
	h := sha256.Sum256([]byte(code))
	return hex.EncodeToString(h[:])
}

func GenerateRecoveryCodes(count int) []string {
	codes := make([]string, count)
	for i := 0; i < count; i++ {
		b := make([]byte, 4)
		rand.Read(b)
		h := hex.EncodeToString(b)
		codes[i] = strings.ToUpper(h[:4] + "-" + h[4:])
	}
	return codes
}

func HMACSHA256(message, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	return hex.EncodeToString(mac.Sum(nil))
}
