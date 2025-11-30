package logic

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type Settings struct {
	ServerURL string
}

var AppSettings Settings

var settings_path = filepath.Join(os.Getenv("HOME"), ".snail", "installer", "settings.json")

func SaveSettings() error {
	data, err := json.Marshal(AppSettings)
	if err != nil {
		return err
	}
	err = os.MkdirAll(filepath.Dir(settings_path), 0755)
	if err != nil {
		return err
	}
	return os.WriteFile(settings_path, data, 0644)
}

func LoadSettings() error {
	data, err := os.ReadFile(settings_path)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, &AppSettings)
}
