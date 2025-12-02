package ui

import (
	"snail-installer/logic"
	"sync"
	"time"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

// debouncer provides a way to debounce function calls
type debouncer struct {
	mu      sync.Mutex
	timer   *time.Timer
	pending bool
}

func (d *debouncer) debounce(duration time.Duration, fn func()) {
	d.mu.Lock()
	defer d.mu.Unlock()

	if d.timer != nil {
		d.timer.Stop()
	}

	d.timer = time.AfterFunc(duration, fn)
}

func NewSettingsPage(win fyne.Window) fyne.CanvasObject {
	serverURLEntry := widget.NewEntry()
	serverURLEntry.SetText(logic.AppSettings.ServerURL)
	serverURLEntry.SetPlaceHolder("Server URL")

	saveDebouncer := &debouncer{}

	serverURLEntry.OnChanged = func(s string) {
		logic.AppSettings.ServerURL = s
		saveDebouncer.debounce(500*time.Millisecond, func() {
			err := logic.SaveSettings()
			if err != nil {
				println("Could not save settings:", err)
			}
		})
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
