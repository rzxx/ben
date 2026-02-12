package main

import "ben/internal/stats"

type StatsService struct {
	stats *stats.Service
}

func NewStatsService(statsDomain *stats.Service) *StatsService {
	return &StatsService{stats: statsDomain}
}

func (s *StatsService) GetOverview(limit int) (stats.Overview, error) {
	return s.stats.GetOverview(limit)
}

func (s *StatsService) GetDashboard(rangeKey string, limit int) (stats.Dashboard, error) {
	return s.stats.GetDashboard(rangeKey, limit)
}
