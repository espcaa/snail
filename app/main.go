package main

import (
	"snail-installer/logic"
	"snail-installer/ui"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
)

var baseServerUrl = "https://assets.snail.hackclub.cc"

func main() {

	err := logic.LoadSettings()
	if err != nil {
		println("Could not load settings:", err)
	}

	if logic.AppSettings.ServerURL == "" {
		logic.AppSettings.ServerURL = baseServerUrl
	}
	a := app.New()
	w := a.NewWindow("snail installer")
	w.Resize(fyne.NewSize(500, 350))

	installPage := ui.NewInstallPage(w)
	// restorePage := ui.NewRestorePage(w)
	settingsPage := ui.NewSettingsPage(w)

	tabs := container.NewAppTabs(
		container.NewTabItem("Install", installPage),
		// container.NewTabItem("Restore", restorePage),
		container.NewTabItem("Settings", settingsPage),
	)

	w.SetContent(tabs)
	w.ShowAndRun()
}
