package main

import (
	"ben/internal/config"
	"ben/internal/db"
	"ben/internal/library"
	"ben/internal/platform"
	"ben/internal/player"
	"ben/internal/queue"
	"ben/internal/scanner"
	"ben/internal/stats"
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
	playerDomain := player.NewService(sqliteDB, queueDomain)
	defer playerDomain.Close()
	statsDomain := stats.NewService(sqliteDB)
	scannerDomain := scanner.NewService(sqliteDB, watchedRoots, paths.CoverCacheDir)
	settingsService := NewSettingsService(watchedRoots, scannerDomain)
	libraryService := NewLibraryService(browseRepo)
	coverService := NewCoverService(paths.CoverCacheDir)
	queueService := NewQueueService(queueDomain)
	playerService := NewPlayerService(playerDomain)
	statsService := NewStatsService(statsDomain)
	scannerService := NewScannerService(scannerDomain)

	app := application.New(application.Options{
		Name:        "Ben",
		Description: "Desktop music player",
		Services: []application.Service{
			application.NewService(settingsService),
			application.NewService(libraryService),
			application.NewServiceWithOptions(coverService, application.ServiceOptions{Route: "/covers"}),
			application.NewService(queueService),
			application.NewService(playerService),
			application.NewService(statsService),
			application.NewService(scannerService),
		},
		Assets: application.AssetOptions{
			Handler: application.AssetFileServerFS(assets),
		},
		Mac: application.MacOptions{
			ApplicationShouldTerminateAfterLastWindowClosed: true,
		},
	})

	platformService := platform.NewService(app, playerDomain)
	if err := platformService.Start(); err != nil {
		log.Printf("platform integration disabled: %v", err)
	}
	defer func() {
		if err := platformService.Stop(); err != nil {
			log.Printf("platform integration shutdown failed: %v", err)
		}
	}()
	platformService.HandlePlayerState(playerDomain.GetState())

	scannerDomain.SetEmitter(func(eventName string, payload any) {
		app.Event.Emit(eventName, payload)
	})
	queueDomain.SetEmitter(func(eventName string, payload any) {
		app.Event.Emit(eventName, payload)
	})
	playerDomain.SetEmitter(func(eventName string, payload any) {
		app.Event.Emit(eventName, payload)
		if eventName == player.EventStateChanged {
			if state, ok := payload.(player.State); ok {
				platformService.HandlePlayerState(state)
				statsDomain.HandlePlayerState(state)
			}
		}
	})

	if err := scannerDomain.StartWatching(); err != nil {
		log.Printf("scanner watcher disabled: %v", err)
	}
	defer scannerDomain.StopWatching()

	app.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:     "Ben",
		Frameless: true,
		MinWidth:  1080,
		MinHeight: 720,
		Mac: application.MacWindow{
			InvisibleTitleBarHeight: 50,
			Backdrop:                application.MacBackdropTranslucent,
			TitleBar:                application.MacTitleBarHiddenInset,
		},
		Windows: application.WindowsWindow{
			DisableFramelessWindowDecorations: false,
		},
		BackgroundColour: application.NewRGB(10, 10, 10),
		URL:              "/",
	})

	err = app.Run()
	if err != nil {
		log.Fatal(err)
	}
}
