package main

import "ben/internal/queue"

type QueueService struct {
	queue *queue.Service
}

func NewQueueService(queueService *queue.Service) *QueueService {
	return &QueueService{queue: queueService}
}

func (s *QueueService) GetState() queue.State {
	return s.queue.GetState()
}

func (s *QueueService) SetQueue(trackIDs []int64, startIndex int) (queue.State, error) {
	return s.queue.SetQueue(trackIDs, startIndex)
}

func (s *QueueService) AppendTracks(trackIDs []int64) (queue.State, error) {
	return s.queue.AppendTracks(trackIDs)
}

func (s *QueueService) RemoveTrack(index int) (queue.State, error) {
	return s.queue.RemoveTrack(index)
}

func (s *QueueService) SetCurrentIndex(index int) (queue.State, error) {
	return s.queue.SetCurrentIndex(index)
}

func (s *QueueService) Clear() queue.State {
	return s.queue.Clear()
}

func (s *QueueService) SetRepeatMode(mode string) (queue.State, error) {
	return s.queue.SetRepeatMode(mode)
}

func (s *QueueService) SetShuffle(enabled bool) queue.State {
	return s.queue.SetShuffle(enabled)
}
