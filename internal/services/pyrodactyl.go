package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

var (
	PteroURL    string
	PteroAPIKey string
	ServerLimits = map[string]interface{}{
		"memory": 512,
		"swap":   0,
		"disk":   3072,
		"io":     500,
		"cpu":    50,
	}
	FeatureLimits = map[string]interface{}{
		"databases":    0,
		"allocations":  1,
		"backups":      1,
	}
	DeployLocations = []int64{1}
	PanelDBName     string
)

type cacheEntry struct {
	data      interface{}
	timestamp time.Time
}

var (
	nodeCache   = make(map[int64]cacheEntry)
	cacheMu     sync.RWMutex
	cacheTTL    = 5 * time.Minute
	cacheMax    = 50
	cleanupOnce sync.Once
)

func initCache() {
	cleanupOnce.Do(func() {
		go func() {
			for {
				time.Sleep(cacheTTL)
				cacheMu.Lock()
				cutoff := time.Now().Add(-cacheTTL)
				for k, v := range nodeCache {
					if v.timestamp.Before(cutoff) {
						delete(nodeCache, k)
					}
				}
				cacheMu.Unlock()
			}
		}()
	})
}

func pteroFetch(method, path string, body interface{}) ([]byte, error) {
	url := PteroURL + "/api/application" + path
	maxRetries := 3

	for attempt := 1; attempt <= maxRetries; attempt++ {
		var reqBody io.Reader
		if body != nil {
			b, err := json.Marshal(body)
			if err != nil {
				return nil, err
			}
			reqBody = bytes.NewReader(b)
		}

		req, err := http.NewRequest(method, url, reqBody)
		if err != nil {
			return nil, err
		}
		req.Header.Set("Authorization", "Bearer "+PteroAPIKey)
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{Timeout: 15 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			if attempt < maxRetries {
				wait := time.Duration(1000*(1<<(attempt-1))) * time.Millisecond
				if wait > 8*time.Second {
					wait = 8 * time.Second
				}
				time.Sleep(wait)
				continue
			}
			return nil, fmt.Errorf("pteroFetch error: %w", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode == 204 {
			return nil, nil
		}

		respBody, err := io.ReadAll(resp.Body)
		if err != nil {
			return nil, err
		}

		if resp.StatusCode == 429 && attempt < maxRetries {
			wait := time.Duration(1000*(1<<(attempt-1))) * time.Millisecond
			if wait > 8*time.Second {
				wait = 8 * time.Second
			}
			time.Sleep(wait)
			continue
		}

		if resp.StatusCode >= 400 {
			return nil, fmt.Errorf("Pterodactyl API error %d: %s", resp.StatusCode, string(respBody[:min(len(respBody), 200)]))
		}

		return respBody, nil
	}
	return nil, fmt.Errorf("pteroFetch failed after %d retries", maxRetries)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

type pteroResponse struct {
	Attributes json.RawMessage `json:"attributes"`
	Data       []pteroItem     `json:"data"`
	Meta       *pteroMeta      `json:"meta"`
}

type pteroItem struct {
	Attributes json.RawMessage `json:"attributes"`
}

type pteroMeta struct {
	Pagination *pteroPagination `json:"pagination"`
}

type pteroPagination struct {
	Total       int `json:"total"`
	Count       int `json:"count"`
	PerPage     int `json:"per_page"`
	CurrentPage int `json:"current_page"`
	TotalPages  int `json:"total_pages"`
}

func fetchPteroPage(path string) (*pteroResponse, error) {
	b, err := pteroFetch("GET", path, nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	return &resp, nil
}

func CreatePteroUser(email, username, firstName, lastName, password string) (map[string]interface{}, error) {
	body := map[string]interface{}{
		"email":      email,
		"username":   username,
		"first_name": firstName,
		"last_name":  lastName,
		"password":   password,
		"language":   "en",
		"root_admin": false,
	}
	b, err := pteroFetch("POST", "/users", body)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	var attrs map[string]interface{}
	json.Unmarshal(resp.Attributes, &attrs)
	return attrs, nil
}

func GetPteroUserByID(id int64) (map[string]interface{}, error) {
	b, err := pteroFetch("GET", fmt.Sprintf("/users/%d", id), nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	var attrs map[string]interface{}
	json.Unmarshal(resp.Attributes, &attrs)
	return attrs, nil
}

func getNode(nodeID int64) (map[string]interface{}, error) {
	cacheMu.RLock()
	entry, ok := nodeCache[nodeID]
	cacheMu.RUnlock()
	if ok && time.Since(entry.timestamp) < cacheTTL {
		return entry.data.(map[string]interface{}), nil
	}

	b, err := pteroFetch("GET", fmt.Sprintf("/nodes/%d", nodeID), nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	var attrs map[string]interface{}
	json.Unmarshal(resp.Attributes, &attrs)

	cacheMu.Lock()
	if len(nodeCache) >= cacheMax {
		for k := range nodeCache {
			delete(nodeCache, k)
			break
		}
	}
	nodeCache[nodeID] = cacheEntry{data: attrs, timestamp: time.Now()}
	cacheMu.Unlock()

	return attrs, nil
}

func GetEgg(nestID, eggID int64) (map[string]interface{}, error) {
	b, err := pteroFetch("GET", fmt.Sprintf("/nests/%d/eggs/%d?include=variables", nestID, eggID), nil)
	if err != nil {
		return nil, err
	}
	var raw map[string]interface{}
	if err := json.Unmarshal(b, &raw); err != nil {
		return nil, err
	}

	var attrs map[string]interface{}
	if a, ok := raw["attributes"].(map[string]interface{}); ok {
		attrs = a
	} else {
		return nil, fmt.Errorf("unexpected egg response format")
	}

	if rels, ok := raw["relationships"].(map[string]interface{}); ok {
		if vars, ok := rels["variables"].(map[string]interface{}); ok {
			if data, ok := vars["data"].([]interface{}); ok {
				envMap := make(map[string]interface{})
				for _, item := range data {
					if entry, ok := item.(map[string]interface{}); ok {
						if varAttrs, ok := entry["attributes"].(map[string]interface{}); ok {
							envVar, _ := varAttrs["env_variable"].(string)
							defaultVal, _ := varAttrs["default_value"].(string)
							if envVar != "" {
								envMap[envVar] = defaultVal
							}
						}
					}
				}
				attrs["environment"] = envMap
			}
		}
	}
	return attrs, nil
}

func GetPteroNests() ([]map[string]interface{}, error) {
	b, err := pteroFetch("GET", "/nests?per_page=100", nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	var nests []map[string]interface{}
	for _, item := range resp.Data {
		var attrs map[string]interface{}
		json.Unmarshal(item.Attributes, &attrs)
		nests = append(nests, attrs)
	}
	return nests, nil
}

func GetPteroNestEggs(nestID int64) ([]map[string]interface{}, error) {
	b, err := pteroFetch("GET", fmt.Sprintf("/nests/%d/eggs?per_page=100", nestID), nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	var eggs []map[string]interface{}
	for _, item := range resp.Data {
		var attrs map[string]interface{}
		json.Unmarshal(item.Attributes, &attrs)
		eggs = append(eggs, attrs)
	}
	return eggs, nil
}

func paginateAll(path string) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	page := 1
	maxPages := 20

	for page <= maxPages {
		resp, err := fetchPteroPage(fmt.Sprintf("%s?page=%d&per_page=50", path, page))
		if err != nil {
			return nil, err
		}
		for _, item := range resp.Data {
			var attrs map[string]interface{}
			json.Unmarshal(item.Attributes, &attrs)
			all = append(all, attrs)
		}
		if resp.Meta == nil || resp.Meta.Pagination == nil || page >= resp.Meta.Pagination.TotalPages {
			break
		}
		page++
	}
	return all, nil
}

func enrichServer(server map[string]interface{}) {
	if nodeID, ok := server["node"].(float64); ok {
		node, err := getNode(int64(nodeID))
		if err == nil {
			server["nodeFqdn"] = node["fqdn"]
		} else {
			server["nodeFqdn"] = nil
		}
	}
	if alloc, ok := server["allocation"].(float64); ok && alloc > 0 {
		if nodeID, ok := server["node"].(float64); ok {
			b, err := pteroFetch("GET", fmt.Sprintf("/nodes/%d/allocations/%d", int64(nodeID), int64(alloc)), nil)
			if err == nil {
				var resp pteroResponse
				json.Unmarshal(b, &resp)
				var allocAttrs map[string]interface{}
				json.Unmarshal(resp.Attributes, &allocAttrs)
				allocAttrs["nodeFqdn"] = server["nodeFqdn"]
				server["allocationDetails"] = allocAttrs
			} else {
				server["allocationDetails"] = nil
			}
		}
	}
	if nest, ok := server["nest"].(float64); ok {
		if egg, ok := server["egg"].(float64); ok {
			eggData, err := GetEgg(int64(nest), int64(egg))
			if err == nil {
				server["eggDetails"] = map[string]interface{}{"name": eggData["name"]}
			} else {
				server["eggDetails"] = nil
			}
		}
	}
}

func GetAllServers(limit, offset *int) (map[string]interface{}, error) {
	all, err := paginateAll("/servers")
	if err != nil {
		return nil, err
	}

	for i := 0; i < len(all)-1; i++ {
		for j := i + 1; j < len(all); j++ {
			ti, _ := all[i]["created_at"].(string)
			tj, _ := all[j]["created_at"].(string)
			if ti < tj {
				all[i], all[j] = all[j], all[i]
			}
		}
	}

	total := len(all)
	var toEnrich []map[string]interface{}
	if limit != nil && offset != nil {
		start := *offset
		end := start + *limit
		if start > len(all) {
			start = len(all)
		}
		if end > len(all) {
			end = len(all)
		}
		toEnrich = all[start:end]
	} else {
		toEnrich = all
	}

	for _, s := range toEnrich {
		enrichServer(s)
	}

	if limit != nil && offset != nil {
		return map[string]interface{}{"servers": toEnrich, "total": total}, nil
	}
	return map[string]interface{}{"servers": all, "total": total}, nil
}

func GetServersByUser(userID int64) ([]map[string]interface{}, error) {
	all, err := paginateAll("/servers")
	if err != nil {
		return nil, err
	}

	var userServers []map[string]interface{}
	for _, s := range all {
		if uid, ok := s["user"].(float64); ok && int64(uid) == userID {
			enrichServer(s)
			userServers = append(userServers, s)
		}
	}
	return userServers, nil
}

func GetServerByID(serverID int64) (map[string]interface{}, error) {
	b, err := pteroFetch("GET", fmt.Sprintf("/servers/%d", serverID), nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	if err := json.Unmarshal(b, &resp); err != nil {
		return nil, err
	}
	var server map[string]interface{}
	json.Unmarshal(resp.Attributes, &server)

	enrichServer(server)
	return server, nil
}

func CreatePteroServer(params map[string]interface{}) (map[string]interface{}, error) {
	limits := make(map[string]interface{})
	for k, v := range ServerLimits {
		limits[k] = v
	}
	if custom, ok := params["customLimits"].(map[string]interface{}); ok {
		for k, v := range custom {
			limits[k] = v
		}
	}

	env, _ := params["environment"].(map[string]interface{})
	if env == nil {
		env = make(map[string]interface{})
	}

	deployLocs := DeployLocations
	if dl, ok := params["deployLocations"].([]int64); ok && len(dl) > 0 {
		deployLocs = dl
	}

	body := map[string]interface{}{
		"name":            params["name"],
		"user":            params["userId"],
		"egg":             params["eggId"],
		"docker_image":    params["dockerImage"],
		"startup":         params["startup"],
		"environment":     env,
		"limits":          limits,
		"feature_limits":  FeatureLimits,
		"deploy": map[string]interface{}{
			"locations":   deployLocs,
			"dedicated_ip": false,
			"port_range":  []string{},
		},
		"start_on_completion": true,
		"skip_scripts":        false,
		"oom_disabled":        true,
	}

	b, err := pteroFetch("POST", "/servers", body)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	json.Unmarshal(b, &resp)
	var server map[string]interface{}
	json.Unmarshal(resp.Attributes, &server)
	return server, nil
}

func DeletePteroServer(serverID int64) error {
	_, err := pteroFetch("DELETE", fmt.Sprintf("/servers/%d", serverID), nil)
	return err
}

func SuspendPteroServer(serverID int64) error {
	_, err := pteroFetch("POST", fmt.Sprintf("/servers/%d/suspend", serverID), nil)
	return err
}

func UnsuspendPteroServer(serverID int64) error {
	_, err := pteroFetch("POST", fmt.Sprintf("/servers/%d/unsuspend", serverID), nil)
	return err
}

func ReinstallPteroServer(serverID int64) error {
	_, err := pteroFetch("POST", fmt.Sprintf("/servers/%d/reinstall", serverID), nil)
	return err
}

func UpdatePteroServerBuild(serverID int64, limits map[string]interface{}) error {
	server, err := GetServerByID(serverID)
	if err != nil {
		return err
	}
	currentLimits, _ := server["limits"].(map[string]interface{})
	for k, v := range limits {
		currentLimits[k] = v
	}
	featureLimits, _ := server["feature_limits"].(map[string]interface{})
	if featureLimits == nil {
		featureLimits = map[string]interface{}{"databases": 0, "allocations": 1, "backups": 1}
	}
	oomDisabled := true
	if od, ok := server["oom_disabled"].(bool); ok {
		oomDisabled = od
	}

	body := map[string]interface{}{
		"allocation":     server["allocation"],
		"memory":         currentLimits["memory"],
		"swap":           currentLimits["swap"],
		"disk":           currentLimits["disk"],
		"io":             currentLimits["io"],
		"cpu":            currentLimits["cpu"],
		"feature_limits": featureLimits,
		"oom_disabled":   oomDisabled,
	}
	_, err = pteroFetch("PATCH", fmt.Sprintf("/servers/%d/build", serverID), body)
	return err
}

func GetPergoServerIDsByEgg(nestID, eggID int64) ([]int64, error) {
	all, err := paginateAll("/servers")
	if err != nil {
		return nil, err
	}
	var ids []int64
	for _, s := range all {
		n, _ := s["nest"].(float64)
		e, _ := s["egg"].(float64)
		if int64(n) == nestID && int64(e) == eggID {
			if id, ok := s["id"].(float64); ok {
				ids = append(ids, int64(id))
			}
		}
	}
	return ids, nil
}

func RenamePteroServer(serverID int64, name string) error {
	server, err := GetServerByID(serverID)
	if err != nil {
		return err
	}
	user, _ := server["user"].(float64)
	body := map[string]interface{}{
		"name": name,
		"user": int64(user),
	}
	_, err = pteroFetch("PATCH", fmt.Sprintf("/servers/%d", serverID), body)
	return err
}

func UpdatePteroPassword(userID int64, password string) error {
	body := map[string]interface{}{"password": password}
	_, err := pteroFetch("PATCH", fmt.Sprintf("/users/%d", userID), body)
	return err
}

func UpdatePteroEmail(userID int64, email string) error {
	user, err := GetPteroUserByID(userID)
	if err != nil {
		return err
	}
	body := map[string]interface{}{
		"email":      email,
		"username":   user["username"],
		"first_name": user["first_name"],
		"last_name":  user["last_name"],
	}
	_, err = pteroFetch("PATCH", fmt.Sprintf("/users/%d", userID), body)
	return err
}

func DeletePteroUser(userID int64) error {
	_, err := pteroFetch("DELETE", fmt.Sprintf("/users/%d", userID), nil)
	return err
}

func GetAllNodes() ([]map[string]interface{}, error) {
	return paginateAll("/nodes")
}

func GetNodeDetail(nodeID int64) (map[string]interface{}, error) {
	b, err := pteroFetch("GET", fmt.Sprintf("/nodes/%d", nodeID), nil)
	if err != nil {
		return nil, err
	}
	var resp pteroResponse
	json.Unmarshal(b, &resp)
	var node map[string]interface{}
	json.Unmarshal(resp.Attributes, &node)
	return node, nil
}

func GetNodeAllocations(nodeID int64) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	page := 1
	maxPages := 20
	for page <= maxPages {
		resp, err := fetchPteroPage(fmt.Sprintf("/nodes/%d/allocations?page=%d&per_page=100", nodeID, page))
		if err != nil {
			return nil, err
		}
		for _, item := range resp.Data {
			var attrs map[string]interface{}
			json.Unmarshal(item.Attributes, &attrs)
			all = append(all, attrs)
		}
		if resp.Meta == nil || resp.Meta.Pagination == nil || page >= resp.Meta.Pagination.TotalPages {
			break
		}
		page++
	}
	return all, nil
}

func GetNodeServers(nodeID int64) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	page := 1
	maxPages := 20
	for page <= maxPages {
		resp, err := fetchPteroPage(fmt.Sprintf("/nodes/%d/servers?page=%d&per_page=50", nodeID, page))
		if err != nil {
			return nil, err
		}
		for _, item := range resp.Data {
			var attrs map[string]interface{}
			json.Unmarshal(item.Attributes, &attrs)
			all = append(all, attrs)
		}
		if resp.Meta == nil || resp.Meta.Pagination == nil || page >= resp.Meta.Pagination.TotalPages {
			break
		}
		page++
	}
	return all, nil
}

func GetAllEggs(nestIDs []int64) ([]map[string]interface{}, error) {
	var all []map[string]interface{}
	for _, nestID := range nestIDs {
		eggs, err := GetPteroNestEggs(nestID)
		if err != nil {
			continue
		}
		for _, egg := range eggs {
			full, err := GetEgg(nestID, int64(egg["id"].(float64)))
			if err != nil {
				continue
			}
			all = append(all, map[string]interface{}{
				"nest": nestID,
				"egg":  full,
			})
		}
	}
	return all, nil
}

func GetClientServerResources(identifier, apiKey string) (map[string]interface{}, error) {
	client := &http.Client{Timeout: 8 * time.Second}
	req, err := http.NewRequest("GET", PteroURL+"/api/client/servers/"+identifier+"/resources", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	b, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var result map[string]interface{}
	json.Unmarshal(b, &result)
	return result, nil
}

func SendPowerSignal(identifier, apiKey, signal string) error {
	body := map[string]string{"signal": signal}
	b, _ := json.Marshal(body)

	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest("POST", PteroURL+"/api/client/servers/"+identifier+"/power", bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		return fmt.Errorf("power signal failed with status %d", resp.StatusCode)
	}
	return nil
}

func TestPteroConnection() error {
	_, err := pteroFetch("GET", "/servers?per_page=1", nil)
	return err
}
