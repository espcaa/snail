package ui

import (
	"snail-installer/logic"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

func NewSettingsPage(win fyne.Window) fyne.CanvasObject {
	serverURLEntry := widget.NewEntry()
	serverURLEntry.SetText(logic.AppSettings.ServerURL)
	serverURLEntry.SetPlaceHolder("Server URL")

	serverURLEntry.OnChanged = func(s string) {
		logic.AppSettings.ServerURL = s
		err := logic.SaveSettings()
		if err != nil {
			println("Could not save settings:", err)
		}
	}

	return container.NewVBox(
		widget.NewLabel("Settings Page"),
		container.NewPadded(
			container.NewVBox(
				widget.NewLabel("Server URL:"),
				serverURLEntry,
			),
		),
	)
}
