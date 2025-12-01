package ui

import (
	"snail-installer/logic"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
	"github.com/ncruces/zenity"
)

func NewInstallPage(win fyne.Window) fyne.CanvasObject {

	pathEntry := widget.NewEntry()
	pathEntry.SetPlaceHolder("/Applications/Slack.app/")

	installBtn := widget.NewButton("Install", func() {
		// if nothing, ask to select the app

		if pathEntry.Text == "" {
			dialog.ShowInformation("Info", "Please select the slack app \\o/", win)
			return
		}

		opts := logic.InstallOptions{
			TargetPath: pathEntry.Text,
		}

		err := logic.InstallSomething(opts)
		if err != nil {
			dialog.ShowError(err, win)
			return
		}

		dialog.ShowInformation("Success", "Installation completed!", win)
	})

	selectFileBtn := widget.NewButton("Select File", func() {
		path, err := zenity.SelectFile()
		if err == nil {
			pathEntry.SetText(path)
		}
	})

	// Row: entry expands, button stays fixed
	row := container.NewBorder(
		nil,           // top
		nil,           // bottom
		nil,           // left
		selectFileBtn, // right
		pathEntry,     // center expands
	)

	return container.NewVBox(
		container.NewPadded(
			container.NewVBox(
				widget.NewLabel("Slack app path:"),
				row,
				installBtn,
			),
		),
	)
}
