//go:build windows

package thumbbar

import (
	"ben/internal/player"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"unsafe"

	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/zzl/go-win32api/v2/win32"
)

const (
	thumbButtonPrevID      uint32  = 1001
	thumbButtonPlayPauseID uint32  = 1002
	thumbButtonNextID      uint32  = 1003
	thumbbarSubclassID     uintptr = 1

	appThemeRegistrySubKey = `Software\Microsoft\Windows\CurrentVersion\Themes\Personalize`
	appThemeRegistryValue  = "AppsUseLightTheme"
)

var (
	clsidTaskbarList = syscall.GUID{0x56FDF344, 0xFD6D, 0x11D0, [8]byte{0x95, 0x8A, 0x00, 0x60, 0x97, 0xC9, 0xA0, 0x90}}

	thumbbarSubclassProc = win32.SUBCLASSPROC(syscall.NewCallback(thumbbarWindowProc))

	servicesByWindowMu sync.RWMutex
	servicesByWindow   = map[win32.HWND]*Service{}
)

type Service struct {
	mu sync.Mutex

	player *player.Service

	hwnd      win32.HWND
	taskbar   *win32.ITaskbarList3
	started   bool
	installed bool

	taskbarButtonCreatedMsg uint32
	useLightTheme           bool
	useCustomIcons          bool
	iconsDark               thumbbarIcons
	iconsLight              thumbbarIcons

	hasLastState bool
	lastState    player.State

	lastIsPlaying     bool
	lastHasQueue      bool
	lastHasTrack      bool
	lastUseLightTheme bool
}

type thumbbarIcons struct {
	previous win32.HICON
	play     win32.HICON
	pause    win32.HICON
	next     win32.HICON
}

func NewService(playerService *player.Service) *Service {
	return &Service{player: playerService}
}

func (s *Service) Start(hwnd win32.HWND) error {
	if hwnd == 0 {
		return fmt.Errorf("thumbnail toolbar requires a valid window handle")
	}

	return application.InvokeSyncWithError(func() error {
		s.mu.Lock()
		if s.started {
			s.mu.Unlock()
			return nil
		}
		s.mu.Unlock()

		var taskbar *win32.ITaskbarList3
		hr := win32.CoCreateInstance(
			&clsidTaskbarList,
			nil,
			win32.CLSCTX_INPROC_SERVER,
			&win32.IID_ITaskbarList3,
			unsafe.Pointer(&taskbar),
		)
		if win32.FAILED(hr) {
			return fmt.Errorf("create ITaskbarList3: %s", win32.HRESULT_ToString(hr))
		}
		if taskbar == nil {
			return fmt.Errorf("create ITaskbarList3: returned nil")
		}

		hr = taskbar.HrInit()
		if win32.FAILED(hr) {
			taskbar.Release()
			return fmt.Errorf("taskbar HrInit: %s", win32.HRESULT_ToString(hr))
		}

		taskbarButtonCreatedMsg, _ := win32.RegisterWindowMessage(win32.StrToPwstr("TaskbarButtonCreated"))

		servicesByWindowMu.Lock()
		servicesByWindow[hwnd] = s
		servicesByWindowMu.Unlock()

		if win32.SetWindowSubclass(hwnd, thumbbarSubclassProc, thumbbarSubclassID, 0) == 0 {
			servicesByWindowMu.Lock()
			delete(servicesByWindow, hwnd)
			servicesByWindowMu.Unlock()
			taskbar.Release()
			return fmt.Errorf("set window subclass for thumbnail toolbar")
		}

		useLightTheme := true
		if themeValue, ok := queryAppsUseLightTheme(); ok {
			useLightTheme = themeValue
		}

		iconsDark, iconsLight, iconErr := loadCustomIconSets()
		if iconErr != nil {
			log.Printf("thumbnail toolbar custom icons unavailable, falling back to system icons: %v", iconErr)
		}

		s.mu.Lock()
		s.hwnd = hwnd
		s.taskbar = taskbar
		s.installed = true
		s.started = true
		s.taskbarButtonCreatedMsg = taskbarButtonCreatedMsg
		s.useLightTheme = useLightTheme
		s.lastUseLightTheme = useLightTheme
		s.useCustomIcons = iconErr == nil
		s.iconsDark = iconsDark
		s.iconsLight = iconsLight
		hasState := s.hasLastState
		state := s.lastState
		s.mu.Unlock()

		if err := s.addButtons(); err != nil {
			log.Printf("thumbnail toolbar add buttons failed: %v", err)
		}

		if hasState {
			s.applyState(state)
		}

		return nil
	})
}

func (s *Service) Close() error {
	return application.InvokeSyncWithError(func() error {
		s.mu.Lock()
		hwnd := s.hwnd
		taskbar := s.taskbar
		installed := s.installed
		iconsDark := s.iconsDark
		iconsLight := s.iconsLight
		useCustomIcons := s.useCustomIcons
		s.started = false
		s.installed = false
		s.taskbar = nil
		s.hwnd = 0
		s.useCustomIcons = false
		s.iconsDark = thumbbarIcons{}
		s.iconsLight = thumbbarIcons{}
		s.mu.Unlock()

		if hwnd != 0 {
			servicesByWindowMu.Lock()
			delete(servicesByWindow, hwnd)
			servicesByWindowMu.Unlock()
		}

		if installed && hwnd != 0 {
			win32.RemoveWindowSubclass(hwnd, thumbbarSubclassProc, thumbbarSubclassID)
		}

		if taskbar != nil {
			taskbar.Release()
		}

		if useCustomIcons {
			destroyThumbbarIcons(iconsDark)
			destroyThumbbarIcons(iconsLight)
		}

		return nil
	})
}

func (s *Service) UpdatePlayerState(state player.State) {
	s.mu.Lock()
	s.lastState = state
	s.hasLastState = true
	started := s.started
	s.mu.Unlock()

	if !started {
		return
	}

	application.InvokeAsync(func() {
		s.applyState(state)
	})
}

func (s *Service) addButtons() error {
	s.mu.Lock()
	taskbar := s.taskbar
	hwnd := s.hwnd
	started := s.started
	s.mu.Unlock()

	if !started || taskbar == nil || hwnd == 0 {
		return nil
	}

	prevIcon, playIcon, nextIcon := s.resolveStaticButtonIcons()

	buttons := []win32.THUMBBUTTON{
		newThumbButton(thumbButtonPrevID, prevIcon, "Previous", true),
		newThumbButton(thumbButtonPlayPauseID, playIcon, "Play", true),
		newThumbButton(thumbButtonNextID, nextIcon, "Next", true),
	}

	hr := taskbar.ThumbBarAddButtons(hwnd, uint32(len(buttons)), &buttons[0])
	if win32.FAILED(hr) {
		return fmt.Errorf("ThumbBarAddButtons: %s", win32.HRESULT_ToString(hr))
	}

	return nil
}

func (s *Service) applyState(state player.State) {
	s.mu.Lock()
	taskbar := s.taskbar
	hwnd := s.hwnd
	started := s.started
	s.mu.Unlock()

	if !started || taskbar == nil || hwnd == 0 {
		return
	}

	hasQueue := state.QueueLength > 0
	hasTrack := state.CurrentTrack != nil
	isPlaying := strings.EqualFold(strings.TrimSpace(state.Status), player.StatusPlaying)

	s.mu.Lock()
	changed := isPlaying != s.lastIsPlaying || hasQueue != s.lastHasQueue || hasTrack != s.lastHasTrack || s.useLightTheme != s.lastUseLightTheme
	if changed {
		s.lastIsPlaying = isPlaying
		s.lastHasQueue = hasQueue
		s.lastHasTrack = hasTrack
		s.lastUseLightTheme = s.useLightTheme
	}
	s.mu.Unlock()

	if !changed {
		return
	}

	prevIcon, playPauseIcon, nextIcon, playPauseTip := s.resolveDynamicButtonIcons(isPlaying)

	buttons := []win32.THUMBBUTTON{
		newThumbButton(thumbButtonPrevID, prevIcon, "Previous", hasTrack),
		newThumbButton(thumbButtonPlayPauseID, playPauseIcon, playPauseTip, hasQueue),
		newThumbButton(thumbButtonNextID, nextIcon, "Next", hasQueue),
	}

	hr := taskbar.ThumbBarUpdateButtons(hwnd, uint32(len(buttons)), &buttons[0])
	if win32.FAILED(hr) {
		log.Printf("thumbnail toolbar update failed: %s", win32.HRESULT_ToString(hr))
	}
}

func (s *Service) handleWindowMessage(hwnd win32.HWND, msg uint32, wParam win32.WPARAM, lParam win32.LPARAM) win32.LRESULT {
	if msg == win32.WM_COMMAND {
		notifyCode := uint32(win32.HIWORD(uint32(wParam)))
		if notifyCode == win32.THBN_CLICKED {
			buttonID := uint32(win32.LOWORD(uint32(wParam)))
			s.handleThumbbarButton(buttonID)
			return 0
		}
	}

	if msg == win32.WM_SETTINGCHANGE {
		s.handleThemeChange()
	}

	s.mu.Lock()
	taskbarButtonCreatedMsg := s.taskbarButtonCreatedMsg
	hasState := s.hasLastState
	state := s.lastState
	s.mu.Unlock()

	if taskbarButtonCreatedMsg != 0 && msg == taskbarButtonCreatedMsg {
		if err := s.addButtons(); err != nil {
			log.Printf("thumbnail toolbar re-add buttons failed: %v", err)
		}
		if hasState {
			s.applyState(state)
		}
	}

	return win32.DefSubclassProc(hwnd, msg, wParam, lParam)
}

func (s *Service) handleThemeChange() {
	s.mu.Lock()
	if !s.started || !s.useCustomIcons {
		s.mu.Unlock()
		return
	}
	currentLightTheme := s.useLightTheme
	hasState := s.hasLastState
	state := s.lastState
	s.mu.Unlock()

	newLightTheme, ok := queryAppsUseLightTheme()
	if !ok || newLightTheme == currentLightTheme {
		return
	}

	s.mu.Lock()
	s.useLightTheme = newLightTheme
	s.mu.Unlock()

	if hasState {
		s.applyState(state)
	}
}

func (s *Service) handleThumbbarButton(buttonID uint32) {
	if s.player == nil {
		return
	}

	switch buttonID {
	case thumbButtonPrevID:
		go s.runAction("previous", s.player.Previous)
	case thumbButtonPlayPauseID:
		go s.runAction("toggle", s.player.TogglePlayback)
	case thumbButtonNextID:
		go s.runAction("next", s.player.Next)
	}
}

func (s *Service) runAction(name string, action func() (player.State, error)) {
	if _, err := action(); err != nil {
		log.Printf("thumbnail toolbar %s action failed: %v", name, err)
	}
}

func newThumbButton(id uint32, icon win32.HICON, tooltip string, enabled bool) win32.THUMBBUTTON {
	button := win32.THUMBBUTTON{
		DwMask: win32.THB_ICON | win32.THB_TOOLTIP | win32.THB_FLAGS,
		IId:    id,
		HIcon:  icon,
		DwFlags: func() win32.THUMBBUTTONFLAGS {
			if enabled {
				return win32.THBF_ENABLED
			}
			return win32.THBF_DISABLED
		}(),
	}
	copyTooltip(&button.SzTip, tooltip)
	return button
}

func (s *Service) resolveStaticButtonIcons() (win32.HICON, win32.HICON, win32.HICON) {
	s.mu.Lock()
	icons, hasCustom := s.currentIconSetLocked()
	s.mu.Unlock()

	if hasCustom {
		return icons.previous, icons.play, icons.next
	}

	prevIcon, _ := win32.LoadIcon(0, win32.IDI_HAND)
	playIcon, _ := win32.LoadIcon(0, win32.IDI_APPLICATION)
	nextIcon, _ := win32.LoadIcon(0, win32.IDI_INFORMATION)
	return prevIcon, playIcon, nextIcon
}

func (s *Service) resolveDynamicButtonIcons(isPlaying bool) (win32.HICON, win32.HICON, win32.HICON, string) {
	s.mu.Lock()
	icons, hasCustom := s.currentIconSetLocked()
	s.mu.Unlock()

	if hasCustom {
		if isPlaying {
			return icons.previous, icons.pause, icons.next, "Pause"
		}
		return icons.previous, icons.play, icons.next, "Play"
	}

	prevIcon, _ := win32.LoadIcon(0, win32.IDI_HAND)
	playIcon, _ := win32.LoadIcon(0, win32.IDI_APPLICATION)
	pauseIcon, _ := win32.LoadIcon(0, win32.IDI_ASTERISK)
	nextIcon, _ := win32.LoadIcon(0, win32.IDI_INFORMATION)

	if isPlaying {
		return prevIcon, pauseIcon, nextIcon, "Pause"
	}

	return prevIcon, playIcon, nextIcon, "Play"
}

func (s *Service) currentIconSetLocked() (thumbbarIcons, bool) {
	if !s.useCustomIcons {
		return thumbbarIcons{}, false
	}

	if s.useLightTheme {
		return s.iconsLight, true
	}

	return s.iconsDark, true
}

func queryAppsUseLightTheme() (bool, bool) {
	var value uint32
	valueSize := uint32(unsafe.Sizeof(value))
	var valueType win32.REG_VALUE_TYPE

	err := win32.RegGetValue(
		win32.HKEY_CURRENT_USER,
		win32.StrToPwstr(appThemeRegistrySubKey),
		win32.StrToPwstr(appThemeRegistryValue),
		win32.RRF_RT_REG_DWORD,
		&valueType,
		unsafe.Pointer(&value),
		&valueSize,
	)
	if err != 0 {
		return false, false
	}

	return value != 0, true
}

func loadCustomIconSets() (thumbbarIcons, thumbbarIcons, error) {
	root, err := resolveIconRoot()
	if err != nil {
		return thumbbarIcons{}, thumbbarIcons{}, err
	}

	darkIcons, err := loadIconVariant(root, "dark")
	if err != nil {
		return thumbbarIcons{}, thumbbarIcons{}, err
	}

	lightIcons, err := loadIconVariant(root, "light")
	if err != nil {
		destroyThumbbarIcons(darkIcons)
		return thumbbarIcons{}, thumbbarIcons{}, err
	}

	return darkIcons, lightIcons, nil
}

func resolveIconRoot() (string, error) {
	searchRoots := []string{
		filepath.Join("build", "windows", "thumbbar"),
		filepath.Join("scripts", "build", "windows", "thumbbar"),
	}

	if executablePath, err := os.Executable(); err == nil {
		executableDir := filepath.Dir(executablePath)
		searchRoots = append(searchRoots,
			filepath.Join(executableDir, "build", "windows", "thumbbar"),
			filepath.Join(executableDir, "scripts", "build", "windows", "thumbbar"),
		)
	}

	for _, root := range searchRoots {
		if iconSetExists(root, "dark") && iconSetExists(root, "light") {
			return root, nil
		}
	}

	return "", fmt.Errorf("thumbbar icon sets not found under %q or %q", searchRoots[0], searchRoots[1])
}

func iconSetExists(root string, variant string) bool {
	for _, name := range []string{"previous", "play", "pause", "next"} {
		iconPath := filepath.Join(root, variant, name+".ico")
		if _, err := os.Stat(iconPath); err != nil {
			return false
		}
	}

	return true
}

func loadIconVariant(root string, variant string) (thumbbarIcons, error) {
	previousPath := filepath.Join(root, variant, "previous.ico")
	playPath := filepath.Join(root, variant, "play.ico")
	pausePath := filepath.Join(root, variant, "pause.ico")
	nextPath := filepath.Join(root, variant, "next.ico")

	previous, err := loadIconFromFile(previousPath)
	if err != nil {
		return thumbbarIcons{}, err
	}

	play, err := loadIconFromFile(playPath)
	if err != nil {
		_, _ = win32.DestroyIcon(previous)
		return thumbbarIcons{}, err
	}

	pause, err := loadIconFromFile(pausePath)
	if err != nil {
		_, _ = win32.DestroyIcon(previous)
		_, _ = win32.DestroyIcon(play)
		return thumbbarIcons{}, err
	}

	next, err := loadIconFromFile(nextPath)
	if err != nil {
		_, _ = win32.DestroyIcon(previous)
		_, _ = win32.DestroyIcon(play)
		_, _ = win32.DestroyIcon(pause)
		return thumbbarIcons{}, err
	}

	return thumbbarIcons{previous: previous, play: play, pause: pause, next: next}, nil
}

func loadIconFromFile(path string) (win32.HICON, error) {
	resource, winErr := win32.LoadImage(
		0,
		win32.StrToPwstr(path),
		win32.IMAGE_ICON,
		16,
		16,
		win32.LR_LOADFROMFILE,
	)
	if resource == 0 {
		if winErr != 0 {
			return 0, fmt.Errorf("load icon %q: %d", path, winErr)
		}
		return 0, fmt.Errorf("load icon %q: returned null handle", path)
	}

	return win32.HICON(resource), nil
}

func destroyThumbbarIcons(icons thumbbarIcons) {
	if icons.previous != 0 {
		_, _ = win32.DestroyIcon(icons.previous)
	}
	if icons.play != 0 {
		_, _ = win32.DestroyIcon(icons.play)
	}
	if icons.pause != 0 {
		_, _ = win32.DestroyIcon(icons.pause)
	}
	if icons.next != 0 {
		_, _ = win32.DestroyIcon(icons.next)
	}
}

func copyTooltip(dst *[260]uint16, text string) {
	if dst == nil {
		return
	}

	utf16Data, err := syscall.UTF16FromString(text)
	if err != nil {
		utf16Data = nil
	}

	if len(utf16Data) > len(dst)-1 {
		utf16Data = utf16Data[:len(dst)-1]
	}

	copy(dst[:], utf16Data)
	if len(utf16Data) < len(dst) {
		dst[len(utf16Data)] = 0
	}
}

func thumbbarWindowProc(
	hwnd win32.HWND,
	msg uint32,
	wParam win32.WPARAM,
	lParam win32.LPARAM,
	uIdSubclass uintptr,
	dwRefData uintptr,
) win32.LRESULT {
	_ = uIdSubclass
	_ = dwRefData

	servicesByWindowMu.RLock()
	service := servicesByWindow[hwnd]
	servicesByWindowMu.RUnlock()

	if service == nil {
		return win32.DefSubclassProc(hwnd, msg, wParam, lParam)
	}

	return service.handleWindowMessage(hwnd, msg, wParam, lParam)
}
