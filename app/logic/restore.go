package logic

import (
	"os"
	"time"
)

type Backup struct {
	Filepath string
	Time     time.Time
}

func RestoreBackup(src, dest string) error {
	// nothing for now
	return nil
}

func GetBackupList() []Backup {
	var home_dir, err = os.UserHomeDir()
	if err != nil {
		return []Backup{}
	}
	var backup_base_path = home_dir + "/.snail/backups/"
	var backups []Backup

	files, err := os.ReadDir(backup_base_path)
	if err != nil {
		return []Backup{}
	}

	for _, file := range files {
		info, err := file.Info()
		if err != nil {
			continue
		}
		backups = append(backups, Backup{
			Filepath: backup_base_path + file.Name(),
			Time:     info.ModTime(),
		})
	}
	return backups
}
