package ui

import (
	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
)

func NewRestorePage(win fyne.Window) fyne.CanvasObject {

	return container.NewVBox(
		widget.NewLabel("No backup found..."),
		container.NewPadded(
			container.NewVBox(
				widget.NewLabel("Restore Backup Page - To be implemented"),
			),
		),
	)
}
