package ui

import (
	"snail-installer/logic"
	"sort"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/dialog"
	"fyne.io/fyne/v2/widget"
)

func NewRestorePage(win fyne.Window) fyne.CanvasObject {

	backups := logic.GetBackupList()

	sort.Slice(backups, func(i, j int) bool {
		return backups[i].Time.After(backups[j].Time)
	})

	refreshBtn := widget.NewButton("Refresh", func() {
		backups = logic.GetBackupList()
	})

	scrollArea := container.NewScroll(widget.NewLabel("Loading..."))

	updateList := func() {
		if len(backups) == 0 {
			scrollArea.Content = widget.NewLabel("No backups found.")
			scrollArea.Refresh()
			return
		}

		backupList := container.NewVBox()
		for _, backup := range backups {
			backupTime := backup.Time.Format("2006-01-02 15:04:05")
			b := backup
			backupCard := widget.NewCard("Backup from "+backupTime, "", nil)
			restoreBtn := widget.NewButton("Restore", func() {
				confirm := dialog.NewConfirm("Confirm Restore",
					"Are you sure you want to restore this backup? This will overwrite your current installation.",
					func(confirmed bool) {
						if confirmed {
							err := logic.RestoreBackup("", "")
							if err != nil {
								dialog.ShowError(err, win)
							} else {
								dialog.ShowInformation("Success", "Backup restored successfully.", win)
							}
						}
					}, win)
				confirm.Show()
			})
			backupCard.SetContent(container.NewVBox(
				widget.NewLabel("File: "+b.Filepath),
				restoreBtn,
			))
			backupList.Add(backupCard)
		}

		scrollArea.Content = backupList
		scrollArea.Refresh()
	}

	updateList()

	refreshBtn.OnTapped = func() {
		backups = logic.GetBackupList()
		updateList()
	}

	return container.NewBorder(
		refreshBtn, nil, nil, nil,
		scrollArea,
	)
}
