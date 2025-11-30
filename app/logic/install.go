package logic

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

type InstallOptions struct {
	TargetPath string
	TempDir    string
}

func InstallSomething(opts InstallOptions) error {

	if !verifySlackInstall(opts.TargetPath) {
		println("Invalid Slack installation path:", opts.TargetPath)
		return errors.New("invalid Slack installation path")
	}

	// create the tempdir

	tempDir, err := createTempDir()
	if err != nil {
		return err
	}
	println("Created temporary directory at:", tempDir)
	opts.TempDir = tempDir

	// now copy the .asar file to the temp dir

	var appAsarPath string
	if runtime.GOOS == "darwin" {
		// macOS: Slack.app/Contents/Resources/app.asar
		appAsarPath = filepath.Join(opts.TargetPath, "Contents", "Resources", "app.asar")
	} else if runtime.GOOS == "windows" {
		// Windows: <path>\<executable>.exe -> <path>\resources\app.asar
		parentDir := filepath.Dir(opts.TargetPath)
		appAsarPath = filepath.Join(parentDir, "resources", "app.asar")
	} else if runtime.GOOS == "linux" {
		// Linux: <path>/resources/app.asar
		appAsarPath = filepath.Join(opts.TargetPath, "resources", "app.asar")
	} else {
		return errors.New("unsupported operating system")
	}

	println("Using app.asar path:", appAsarPath)

	// now copy it to temp_dir + "~/.snail/backups/app-backup-<timestamp>.asar"

	backupAppAsar(appAsarPath)

	// unpack the asar file

	jsRuntimeInstalled, jsRuntimeName := getJsRuntimeInstalled()
	if !jsRuntimeInstalled {
		return errors.New("no JavaScript runtime (npm or bun) found in PATH")
	}
	println("Using JavaScript runtime at:", jsRuntimeName)

	err = unpackAsar(appAsarPath, filepath.Join(tempDir, "app-unpacked"), jsRuntimeName)
	if err != nil {
		return err
	}
	println("Unpacked app.asar to:", filepath.Join(tempDir, "app-unpacked"))

	// download the inject.js script to the temp dir

	injectJsURL := AppSettings.ServerURL + "assets/inject.js"
	injectJsPath := filepath.Join(tempDir, "inject.js")
	err = downloadFile(injectJsURL, injectJsPath)
	if err != nil {
		return fmt.Errorf("failed to download inject.js: %w", err)
	}
	println("Downloaded inject.js to:", injectJsPath)

	// copy inject.js to the unpacked app's directory

	destInjectJsPath := filepath.Join(tempDir, "app-unpacked", "inject.js")
	err = copyFile(injectJsPath, destInjectJsPath)
	if err != nil {
		return fmt.Errorf("failed to copy inject.js to unpacked app: %w", err)
	}
	println("Copied inject.js to unpacked app at:", destInjectJsPath)

	// add required code to index.js to load inject.js

	// if we find a index.js file in the unpacked app directory root (e.g., app-unpacked/index.js) then do that else, ...
	if _, err := os.Stat(filepath.Join(tempDir, "app-unpacked", "index.js")); err == nil {
		indexJsPath := filepath.Join(tempDir, "app-unpacked", "index.js")
		indexJsData, err := os.ReadFile(indexJsPath)
		if err != nil {
			return fmt.Errorf("failed to read index.js: %w", err)
		}

		injectCode := "\nrequire('./inject.js');\n"
		newIndexJsData := append([]byte(injectCode), indexJsData...)

		err = os.WriteFile(indexJsPath, newIndexJsData, 0644)
		if err != nil {
			return fmt.Errorf("failed to write modified index.js: %w", err)
		}
		println("Modified index.js to load inject.js")
	} else {
		// we need to inject in main.bundle.cjs, inside app-unpacked/dist/main.bundle.cjs
		mainBundlePath := filepath.Join(tempDir, "app-unpacked", "dist", "main.bundle.cjs")
		mainBundleData, err := os.ReadFile(mainBundlePath)
		if err != nil {
			return fmt.Errorf("failed to read main.bundle.cjs: %w", err)
		}

		// injecting the whole content of the inject.js at the start of main.bundle.cjs
		injectJsData, err := os.ReadFile(destInjectJsPath)
		if err != nil {
			return fmt.Errorf("failed to read inject.js for injection: %w", err)
		}

		injectCode := "\n" + string(injectJsData) + "\n"
		newMainBundleData := append([]byte(injectCode), mainBundleData...)

		err = os.WriteFile(mainBundlePath, newMainBundleData, 0644)
		if err != nil {
			return fmt.Errorf("failed to write modified main.bundle.cjs: %w", err)
		}
		println("Modified main.bundle.cjs to load inject.js")
	}

	// repack the asar file

	newAsarPath := filepath.Join(tempDir, "app-new.asar")
	err = packAsar(filepath.Join(tempDir, "app-unpacked"), newAsarPath, jsRuntimeName)
	if err != nil {
		return fmt.Errorf("failed to repack asar: %w", err)
	}
	println("Repacked new app.asar to:", newAsarPath)

	// replace the original asar file with the new one

	err = copyFile(newAsarPath, appAsarPath)
	if err != nil {
		return fmt.Errorf("failed to replace original app.asar: %w", err)
	}
	println("Replaced original app.asar with modified version.")

	// cleanup temp dir

	err = os.RemoveAll(tempDir)
	if err != nil {
		println("Warning: failed to remove temporary directory:", tempDir)
	} else {
		println("Removed temporary directory:", tempDir)
	}

	// macOS: code sign the app
	if runtime.GOOS == "darwin" {
		err = codeSignMacOS(opts.TargetPath)
		if err != nil {
			return fmt.Errorf("failed to code sign macOS app: %w", err)
		}
		println("Code signed macOS app at:", opts.TargetPath)
	}

	// remove electron fuses
	err = removeElectronFuses(opts.TargetPath, jsRuntimeName)
	if err != nil {
		return fmt.Errorf("failed to remove electron fuses: %w", err)
	}

	return nil
}

func verifySlackInstall(path string) bool {
	var appAsarPath string
	switch runtime.GOOS {
	case "darwin":
		appAsarPath = filepath.Join(path, "Contents", "Resources", "app.asar")
	case "windows":
		// remove the last /<executable>.exe + add /resources/app.asar
		parentDir := filepath.Dir(path)
		appAsarPath = filepath.Join(parentDir, "resources", "app.asar")
	case "linux":
		appAsarPath = filepath.Join(path, "resources", "app.asar")
	default:
		return false
	}

	if _, err := os.Stat(appAsarPath); err == nil {
		return true
	} else if os.IsNotExist(err) {
		return false
	} else {
		return false
	}
}

func createTempDir() (string, error) {
	tempDir, err := os.MkdirTemp("", "snail-install-")
	if err != nil {
		return "", err
	}
	return tempDir, nil
}

func backupAppAsar(appAsarPath string) error {

	// check if app.asar exists
	if _, err := os.Stat(appAsarPath); os.IsNotExist(err) {
		return fmt.Errorf("app.asar not found at %s", appAsarPath)
	}

	// create backup directory: ~/.snail/backups
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return fmt.Errorf("failed to get home directory: %w", err)
	}

	backupDir := filepath.Join(homeDir, ".snail", "backups")
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return fmt.Errorf("failed to create backup directory: %w", err)
	}

	timestamp := time.Now().Format("20060102-150405")
	backupPath := filepath.Join(backupDir, fmt.Sprintf("app-backup-%s.asar", timestamp))

	if err := copyFile(appAsarPath, backupPath); err != nil {
		return fmt.Errorf("failed to backup app.asar: %w", err)
	}

	fmt.Println("Backup created at:", backupPath)
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer func() {
		cerr := out.Close()
		if err == nil {
			err = cerr
		}
	}()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}

	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	return os.Chmod(dst, info.Mode())
}

func getJsRuntimeInstalled() (bool, string) {
	// check for npm or bun and prefer the latter

	if runtime.GOOS == "windows" {
		// Windows, return "bun" or "npm" with nothing else
		if _, err := exec.LookPath("bun.exe"); err == nil {
			return true, "bun"
		}
		if _, err := exec.LookPath("npm.cmd"); err == nil {
			return true, "npm"
		}
	} else {
		// macOS/Linux
		if _, err := exec.LookPath("bun"); err == nil {
			return true, "bun"
		}
		if _, err := exec.LookPath("npm"); err == nil {
			return true, "npm"
		}
	}

	return false, ""
}

func unpackAsar(asarPath, destDir string, jsRuntime string) error {
	var jsRuntimeX string
	if jsRuntime == "bun" {
		jsRuntimeX = "bunx"
	} else {
		jsRuntimeX = "npx"
	}

	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		asarPath = fmt.Sprintf(`"%s"`, asarPath)
		destDir = fmt.Sprintf(`"%s"`, destDir)
	}
	cmd = exec.Command(jsRuntimeX, "asar", "extract", asarPath, destDir)

	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to unpack asar: %s, %w", string(output), err)
	}

	return nil
}

func packAsar(srcDir, asarPath string, jsRuntime string) error {
	var jsRuntimeX string
	if jsRuntime == "bun" {
		jsRuntimeX = "bunx"
	} else {
		jsRuntimeX = "npx"
	}
	if runtime.GOOS == "windows" {
		asarPath = fmt.Sprintf(`"%s"`, asarPath)
		srcDir = fmt.Sprintf(`"%s"`, srcDir)
	}
	cmd := exec.Command(jsRuntimeX, "asar", "pack", srcDir, asarPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to pack asar: %s, %w", string(output), err)
	}

	return nil
}

func downloadFile(url, destPath string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download file: %s", resp.Status)
	}

	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()

	_, err = io.Copy(out, resp.Body)
	if err != nil {
		return err
	}

	return nil
}

func codeSignMacOS(appPath string) error {
	// codesign --force --sign - --deep --preserve-metadata=identifier,entitlements Slack.app
	cmd := exec.Command("codesign", "--force", "--sign", "-", "--deep", "--preserve-metadata=identifier,entitlements", appPath)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to code sign app: %s, %w", string(output), err)
	}

	return nil
}

func removeElectronFuses(asarPath string, jsRuntime string) error {

	var jsRuntimeX string
	if jsRuntime == "bun" {
		jsRuntimeX = "bunx"
	} else {
		jsRuntimeX = "npx"
	}

	cmd := exec.Command(jsRuntimeX, "@electron/fuses", "write", "--app", asarPath, "EnableEmbeddedAsarIntegrityValidation=off")
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to remove electron fuses: %s, %w", string(output), err)
	}
	return nil
}
