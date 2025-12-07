package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/exec"
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
	fetchLatestContent()
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
		if file == "config.json" {
			// change INJECT_LOADER_VERSION to the latest tag from github
			tag, err := getLatestGitHubTag()
			if err != nil {
				tag = "unknown"
			}
			// use regexp to replace INJECT_LOADER_VERSION in config.json
			// load config.json
			configFile, err := os.ReadFile("./assets/config.json")
			if err != nil {
				http.Error(w, "Could not read config.json", http.StatusInternalServerError)
				return
			}
			var config map[string]any
			err = json.Unmarshal(configFile, &config)
			if err != nil {
				http.Error(w, "Could not parse config.json", http.StatusInternalServerError)
				return
			}
			config["loaderVersion"] = tag
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(config)
			return
		}
		http.ServeFile(w, r, "./assets/"+file)
	})

	r.Get("/info.json", func(w http.ResponseWriter, r *http.Request) {
		tag, err := getLatestGitHubTag()
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

func getLatestGitHubTag() (string, error) {
	cmd := "git describe --tags --abbrev=0"
	out, err := exec.Command("bash", "-c", cmd).Output()
	if err != nil {
		return "", err
	}
	if len(out) == 0 {
		return "unknown", nil
	}
	tag := string(out)
	return tag, nil
}

func fetchLatestContent() {
	// builds the latest version of prealod.js and main.js if the release tag changed

	latestTag, err := getLatestGitHubTag()
	if err != nil {
		log.Println("No tag found!")
		latestTag = "none"
	}

	currentTag, err := loadCurrentTag()
	if err != nil || currentTag != latestTag {
		log.Println("New version detected:", latestTag)
		err := buildLoader()
		if err != nil {
			log.Println("Error building loader:", err)
			return
		}
		err = saveCurrentTag(latestTag)
		if err != nil {
			log.Println("Error saving current tag:", err)
			return
		}
		log.Println("Loader built successfully for version:", latestTag)
	} else {
		log.Println("No new version detected. Current version is up to date:", currentTag)
	}
}

func buildLoader() error {
	cmd := exec.Command("bash", "-c", "cd ../core/ && sh temp.sh && mv dist/* ../webserver/assets/")
	return cmd.Run()
}

func saveCurrentTag(tag string) error {
	return os.WriteFile(".current_tag", []byte(tag), 0644)
}

func loadCurrentTag() (string, error) {
	data, err := os.ReadFile(".current_tag")
	if err != nil {
		return "", err
	}
	return string(data), nil
}
