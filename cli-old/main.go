package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"reflect"
	"runtime"
	"strings"

	"github.com/charmbracelet/lipgloss"
	"github.com/joho/godotenv"
)

var snail = "  .----.   @   @\n" +
	" / .-\\\"-..  \\v/\n" +
	" | | '\\ \\ \\_/ )\n" +
	" ,-\\ -.' /.' /\n" +
	"'-------'----'"

var serverURL = "https://snail.hackclub.cc"
var infoStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("5"))
var successStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("6"))
var errorStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("2"))
var warningStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("10"))
var commandStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
var subtytleStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#808080")).Italic(true)
var headerStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#6A9955")).Border(lipgloss.NormalBorder()).Padding(1, 2).Margin(1, 2)

var snailStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("#6A9955")).
	Bold(true).
	Padding(1, 2).
	Margin(1, 2)

func printSnail() string {
	return snailStyle.Render(snail)
}

func getTempDir() string {
	tmp := os.TempDir()
	if runtime.GOOS == "windows" {
		tmp = strings.ReplaceAll(tmp, "\\", "/")
	}
	return tmp
}

type CliArgs struct {
	Os                string
	Arch              string
	SlackLocation     string
	DownloadSlack     string
	ServerUrlOverride string
}

type CliVars struct {
	PackageManager string
	SlackLocation  string
	ServerURL      string
}

func parseFlags(v any) {
	rv := reflect.ValueOf(v).Elem()
	rt := rv.Type()

	for i := 0; i < rv.NumField(); i++ {
		field := rv.Field(i)
		name := strings.ToLower(rt.Field(i).Name)

		switch field.Kind() {
		case reflect.String:
			flag.StringVar(field.Addr().Interface().(*string), name, "", "")
		case reflect.Bool:
			flag.BoolVar(field.Addr().Interface().(*bool), name, false, "")
		case reflect.Int:
			flag.IntVar(field.Addr().Interface().(*int), name, 0, "")
		}
	}
	flag.Parse()
}

func separatorLine() string {
	return "\n" + strings.Repeat("─", 50) + "\n"
}

func checkJSRuntime() (bool, string) {
	if _, err := exec.LookPath("bun"); err == nil {
		return true, "bun"
	} else if _, err := exec.LookPath("npm"); err == nil {
		return true, "npm"
	}
	return false, ""
}

func installBun(osName string) {
	var cmd *exec.Cmd
	if osName == "windows" {
		runCommand("powershell", "-Command", "Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://bun.sh/install.ps1'))")
	} else {
		runCommand("sh", "-c", "curl -fsSL https://bun.sh/install | bash")
	}
	output, err := cmd.CombinedOutput()
	if err != nil {
		fmt.Println(errorStyle.Render("failed to install bun "), string(output))
		return
	}
	fmt.Println(successStyle.Render("bun installed successfully "))
}

func disableElectronFuses(slackLocation, jsRuntime string) error {
	thingy := "npx"
	if jsRuntime == "bun" {
		thingy = "bunx"
	}
	err := runCommand(thingy, "@electron/fuses", "--write", slackLocation, "EnableEmbeddedAsarIntegrityValidation=off")
	if err != nil {
		return err
	}
	return nil
}

func reverifyApp(slackLocation, osName, jsRuntime string) error {
	if osName == "darwin" {
		// first sign it
		err := runCommand("codesign", "--force", "--deep", "--sign", "-", "--preserve-metadata=identifier,entitlements", slackLocation)
		if err != nil {
			return fmt.Errorf("failed to reverify app :/ \n%s", err)
		}
		// then remove quarantine attribute
		err = runCommand("xattr", "-d", "com.apple.quarantine", slackLocation)
		if err != nil {
			return fmt.Errorf("failed to reverify app :/ \n%s", err)
		}
	}
	if osName == "windows" {
		err := runCommand("powershell", "-Command", "Unblock-File -Path '"+slackLocation+"'")
		if err != nil {
			return fmt.Errorf("failed to reverify app :/ \n%s", err)
		}
	}
	return nil
}

func findSlack(operatingSystem string) (bool, string) {
	paths := map[string][]string{
		"windows": {"C:\\Program Files\\Slack", "C:\\Program Files (x86)\\Slack"},
		"darwin":  {"/Applications/Slack.app", "/Users/" + os.Getenv("USER") + "/Applications/Slack.app"},
		"linux":   {"/usr/lib/slack", "/usr/local/lib/slack", "/opt/slack", "/home/" + os.Getenv("USER") + "/.slack"},
	}

	for _, path := range paths[operatingSystem] {
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			return true, path
		}
	}
	return false, ""
}

func runCommand(name string, args ...string) error {
	cmd := exec.Command(name, args...)
	fmt.Println("\n" + subtytleStyle.Render("running command "+name+" "+strings.Join(args, " ")) + "\n")
	if output, err := cmd.CombinedOutput(); err != nil {
		return fmt.Errorf("command %s failed :/ \n%s", name, string(output))
	}
	return nil
}

func getAsarPath(slackLocation, osName string) string {
	switch osName {
	case "windows", "linux":
		return slackLocation + "/resources/app.asar"
	case "darwin":
		return slackLocation + "/Contents/Resources/app.asar"
	default:
		return ""
	}
}

func lineBreak() {
	fmt.Println("\n")
}

func downloadFile(url, dest string) error {
	resp, err := http.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("failed to download file :/ %s", resp.Status)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, resp.Body)
	return err
}

func extractAsar(asarPath, dest, jsRuntime string) error {
	thingy := "npx"
	if jsRuntime == "bun" {
		thingy = "bunx"
	}
	err := runCommand(thingy, "asar", "extract", asarPath, dest)
	if err != nil {
		return err
	}
	return nil
}

func packAsar(src, asarPath, jsRuntime string) error {
	thingy := "npx"
	if jsRuntime == "bun" {
		thingy = "bunx"
	}
	err := runCommand(thingy, "asar", "pack", src, asarPath)
	if err != nil {
		return err
	}
	return nil
}

func copyDir(src string, dst string) error {
	return runCommand("cp", "-a", src+"/.", dst)
}

func main() {
	vars := CliVars{}
	godotenv.Load()
	vars.ServerURL = serverURL
	if env := os.Getenv("SERVER_URL"); env != "" {
		vars.ServerURL = env
	}

	fmt.Println(headerStyle.Render(" Snail CLI "))

	fmt.Println(printSnail())
	var args CliArgs
	parseFlags(&args)

	if args.Os == "" {
		args.Os = runtime.GOOS
	}
	if args.Arch == "" {
		args.Arch = runtime.GOARCH
	}

	fmt.Println("os:", commandStyle.Render(args.Os))
	fmt.Println("arch:", commandStyle.Render(args.Arch))
	fmt.Println(separatorLine())

	installed, manager := checkJSRuntime()
	if installed {
		fmt.Println(successStyle.Render("found js runtime "), commandStyle.Render(manager))
		vars.PackageManager = manager
	} else {
		fmt.Println(errorStyle.Render("no js runtime found :/ installing bun..."))
		installBun(args.Os)
		vars.PackageManager = "bun"
	}

	fmt.Println(separatorLine())

	if args.SlackLocation != "" {
		vars.SlackLocation = args.SlackLocation
		fmt.Println(successStyle.Render("using provided slack location "), commandStyle.Render(vars.SlackLocation))
	} else {
		found, path := findSlack(args.Os)
		if found {
			vars.SlackLocation = path
			fmt.Println(successStyle.Render("found slack installation "), commandStyle.Render(path))
		} else {
			fmt.Println(warningStyle.Render("could not find slack automatically :/ please use --slacklocation"))
			return
		}
	}

	fmt.Println(separatorLine())

	asarPath := getAsarPath(vars.SlackLocation, args.Os)
	fmt.Println(infoStyle.Render("slack asar path "), commandStyle.Render(asarPath))

	tempDir := getTempDir() + "/snail"
	modDir := tempDir + "/slack-mod"
	os.MkdirAll(modDir, os.ModePerm)
	fmt.Println(infoStyle.Render("copying slack to temp dir "), commandStyle.Render(modDir))
	if err := copyDir(vars.SlackLocation, modDir); err != nil {
		fmt.Println(errorStyle.Render("failed to copy slack "), err)
		return
	}

	tempAsarDir := modDir + "/asar-extract"
	os.MkdirAll(tempAsarDir, os.ModePerm)
	fmt.Println(infoStyle.Render("extracting asar "))
	if err := extractAsar(asarPath, tempAsarDir, vars.PackageManager); err != nil {
		fmt.Println(errorStyle.Render("failed to extract asar "), err)
		return
	}
	fmt.Println(successStyle.Render("asar extracted "))

	injectURL := vars.ServerURL + "assets/inject.js"
	injectDest := tempAsarDir + "/inject.js"
	fmt.Println(infoStyle.Render("downloading inject.js "), commandStyle.Render(injectURL))
	if err := downloadFile(injectURL, injectDest); err != nil {
		fmt.Println(errorStyle.Render("failed to download inject.js "), err)
		return
	}
	fmt.Println(successStyle.Render("inject.js downloaded "))

	mainJSPath := tempAsarDir + "/index.js"
	mainJSContent, err := os.ReadFile(mainJSPath)
	if err != nil {
		fmt.Println(errorStyle.Render("failed to read main.js "), err)
		return
	}
	mainJSString := string(mainJSContent)
	injectionCode := "require('./inject.js');\n"
	if !strings.Contains(mainJSString, injectionCode) {
		mainJSString = injectionCode + mainJSString
		if err := os.WriteFile(mainJSPath, []byte(mainJSString), 0644); err != nil {
			fmt.Println(errorStyle.Render("failed to modify main.js "), err)
			return
		}
		fmt.Println(successStyle.Render("main.js modified "))
	} else {
		fmt.Println(infoStyle.Render("main.js already includes inject.js "))
	}

	fmt.Println(infoStyle.Render("repacking asar "))
	if err := packAsar(tempAsarDir, asarPath, vars.PackageManager); err != nil {
		fmt.Println(errorStyle.Render("failed to repack asar "), err)
		return
	}
	fmt.Println(successStyle.Render("asar repacked "))

	fmt.Println(infoStyle.Render("disabling electron fuses "))
	if err := disableElectronFuses(modDir, vars.PackageManager); err != nil {
		fmt.Println(errorStyle.Render("failed to disable electron fuses "), err)
		return
	}
	fmt.Println(successStyle.Render("electron fuses disabled "))
	reverifyApp(modDir, args.Os, vars.PackageManager)
	fmt.Println(successStyle.Render("slack reverified "))

	fmt.Println(infoStyle.Render("replacing original slack with patched version "))
	if err := os.RemoveAll(vars.SlackLocation); err != nil {
		fmt.Println(errorStyle.Render("failed to remove original slack "), err)
		return
	}
	if err := os.Rename(modDir, vars.SlackLocation); err != nil {
		fmt.Println(errorStyle.Render("failed to move patched slack "), err)
		return
	}
	fmt.Println(separatorLine())
	fmt.Println(successStyle.Render("snail installed :D"))
	lineBreak()
}
