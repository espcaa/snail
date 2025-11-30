package utils

import (
	"fmt"
	"os"
	"path/filepath"

	"layeh.com/asar"
)

func PackFolderToAsar(srcDir string, asarPath string) error {
	outFile, err := os.Create(asarPath)
	if err != nil {
		return fmt.Errorf("failed to create ASAR file: %w", err)
	}
	defer outFile.Close()

	rootEntry := asar.New("root", nil, 0, 0, asar.FlagDir)

	currentEntryMap := map[string]*asar.Entry{
		srcDir: rootEntry,
	}

	err = filepath.Walk(srcDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		relPath, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}

		if relPath == "." {
			return nil
		}

		parentPath := filepath.Dir(path)
		parentEntry, ok := currentEntryMap[parentPath]
		if !ok {
			return fmt.Errorf("internal error: could not find parent entry for %s", path)
		}

		entryName := info.Name()
		var newEntry *asar.Entry

		if info.IsDir() {
			newEntry = asar.New(entryName, nil, 0, 0, asar.FlagDir)
			parentEntry.Children = append(parentEntry.Children, newEntry)
			currentEntryMap[path] = newEntry

		} else {
			file, err := os.Open(path)
			if err != nil {
				return fmt.Errorf("failed to open file %s: %w", path, err)
			}
			defer file.Close()

			newEntry = asar.New(
				entryName,
				file,
				info.Size(),
				0,
				asar.FlagNone,
			)

			parentEntry.Children = append(parentEntry.Children, newEntry)
		}

		return nil
	})

	if err != nil {
		return fmt.Errorf("error walking directory %s: %w", srcDir, err)
	}

	_, err = rootEntry.EncodeTo(outFile)
	if err != nil {
		return fmt.Errorf("failed to encode ASAR archive: %w", err)
	}

	return nil
}

func UnpackAsarToFolder(asarPath string, destDir string) error {
	f, err := os.Open(asarPath)
	if err != nil {
		return err
	}
	defer f.Close()

	root, err := asar.Decode(f)
	if err != nil {
		return err
	}

	return root.Walk(func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		fullPath := filepath.Join(destDir, path)

		if info.IsDir() {
			return os.MkdirAll(fullPath, info.Mode())
		} else {
			entry := root.Find(path)
			if entry == nil {
				return nil
			}

			data := entry.Bytes()
			if data == nil {
				return nil
			}

			return os.WriteFile(fullPath, data, info.Mode())
		}
	})
}
