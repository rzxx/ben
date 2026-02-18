package main

import "ben/internal/scanner"

type ScannerService struct {
	scanner *scanner.Service
}

func NewScannerService(scanService *scanner.Service) *ScannerService {
	return &ScannerService{scanner: scanService}
}

func (s *ScannerService) TriggerFullScan() error {
	return s.scanner.TriggerFullScan()
}

func (s *ScannerService) TriggerScan() error {
	return s.scanner.TriggerScan()
}

func (s *ScannerService) TriggerIncrementalScan() error {
	return s.scanner.TriggerIncrementalScan()
}

func (s *ScannerService) GetStatus() scanner.Status {
	return s.scanner.GetStatus()
}
