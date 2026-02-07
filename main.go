package main

import (
	"ben/internal/config"
	"ben/internal/db"
	"ben/internal/library"
	"ben/internal/player"
	"ben/internal/queue"
	"ben/internal/scanner"
	"embed"
	"log"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// Wails uses Go's `embed` package to embed the frontend files into the binary.
// Any files in the frontend/dist folder will be embedded into the binary and
// made available to the frontend.
// See https://pkg.go.dev/embed for more information.

//go:embed all:frontend/dist
var assets embed.FS

func init() {
	application.RegisterEvent[scanner.Progress](scanner.EventProgress)
	application.RegisterEvent[queue.State](queue.EventStateChanged)
	application.RegisterEvent[player.State](player.EventStateChanged)
}

func main() {
	paths, err := config.ResolvePaths("ben")
	if err != nil {
		log.Fatal(err)
	}

	sqliteDB, err := db.Bootstrap(paths.DBPath)
	if err != nil {
		log.Fatal(err)
	}
	defer sqliteDB.Close()

	watchedRoots := library.NewWatchedRootRepository(sqliteDB)
	browseRepo := library.NewBrowseRepository(sqliteDB)
	queueDomain := queue.NewService(sqliteDB)
	playerDomain := player.NewService(queueDomain)
	defer playerDomain.Close()
	scannerDomain := scanner.NewService(sqliteDB, watchedRoots)
	settingsService := NewSettingsService(watchedRoots, scannerDomain)
	libraryService := NewLibraryService(browseRepo)
	queueService := NewQueueService(queueDomain)
	playerService := NewPlayerService(playerDomain)
	scannerService := NewScannerService(scannerDomain)

	app := application.New(application.Options{
		Name:        "Ben",
		Description: "Desktop music player",
		Services: []application.Service{
			application.NewService(settingsService),
			application.NewService(libraryService),
			application.NewService(queueService),
			application.NewService(playerService),
			application.NewService(scannerService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	scannerDomain.SetEmitter(func(eventName string, payload any) {
		app.Event.Emit(eventName, payload)
	})
	queueDomain.SetEmitter(func(eventName string, payload any) {
		app.Event.Emit(eventName, payload)
	})
	playerDomain.SetEmitter(func(eventName string, payload any) {
		app.Event.Emit(eventName, payload)
	})

	if err := scannerDomain.StartWatching(); err != nil {
		log.Printf("scanner watcher disabled: %v", err)
	}
	defer scannerDomain.StopWatching()

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title: "Ben",
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		BackgroundColour: application.NewRGB(12, 18, 24),
		URL:              "/",
	})

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
