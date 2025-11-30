package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/joho/godotenv"
)

type SnailWebserver struct {
	Port int
}

type Info struct {
	Version string `json:"version"`
}

func main() {
	godotenv.Load()

	port := 8080
	if envPort := os.Getenv("PORT"); envPort != "" {
		if p, err := strconv.Atoi(envPort); err == nil {
			port = p
		}
	}

	server := SnailWebserver{Port: port}

	r := chi.NewRouter()
	r.Use(loggingMiddleware)

	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("🐌"))
	})

	r.Get("/assets/*", func(w http.ResponseWriter, r *http.Request) {
		file := r.URL.Path[len("/assets/"):]
		http.ServeFile(w, r, "./assets/"+file)
	})

	r.Get("/info.json", func(w http.ResponseWriter, r *http.Request) {
		tag, err := getLatestGitHubTag("espcaa", "snail")
		if err != nil {
			// send a version: unknown
			info := Info{Version: "unknown"}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(info)
			return
		}

		info := Info{Version: tag}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(info)
	})

	log.Printf("Starting Snail Webserver on port %d\n", server.Port)
	if err := http.ListenAndServe(":"+strconv.Itoa(server.Port), r); err != nil {
		log.Fatal(err)
	}
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		log.Printf("%s %s\n", r.Method, r.URL.Path)
		next.ServeHTTP(w, r)
	})
}

func getLatestGitHubTag(owner, repo string) (string, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/releases/latest", owner, repo)
	resp, err := http.Get(url)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}

	var data struct {
		TagName string `json:"tag_name"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}

	return data.TagName, nil
}
