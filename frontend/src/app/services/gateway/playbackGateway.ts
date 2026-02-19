import {
  GetAlbumQueueTrackIDs as getAlbumQueueTrackIDsBinding,
  GetAlbumQueueTrackIDsFromTrack as getAlbumQueueTrackIDsFromTrackBinding,
  GetArtistQueueTrackIDs as getArtistQueueTrackIDsBinding,
  GetArtistQueueTrackIDsFromTopTrack as getArtistQueueTrackIDsFromTopTrackBinding,
} from "../../../../bindings/ben/libraryservice";
import {
  Next as nextTrackBinding,
  Play as playBinding,
  Previous as previousTrackBinding,
  Seek as seekBinding,
  SetVolume as setVolumeBinding,
  TogglePlayback as togglePlaybackBinding,
} from "../../../../bindings/ben/playerservice";
import {
  AppendTracks as appendTracksBinding,
  Clear as clearQueueBinding,
  RemoveTrack as removeQueueTrackBinding,
  SetCurrentIndex as setCurrentQueueIndexBinding,
  SetQueue as setQueueBinding,
  SetRepeatMode as setQueueRepeatModeBinding,
  SetShuffle as setQueueShuffleBinding,
} from "../../../../bindings/ben/queueservice";
import type { PlayerState, QueueState } from "../../../features/types";
import { executeGatewayRequest, type GatewayRequest, type GatewayRequestOptions } from "./gatewayUtils";

export function setQueue(
  trackIDs: number[],
  startIndex: number,
  options?: GatewayRequestOptions,
): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => setQueueBinding(trackIDs, startIndex), options) as GatewayRequest<
    QueueState
  >;
}

export function appendTracks(
  trackIDs: number[],
  options?: GatewayRequestOptions,
): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => appendTracksBinding(trackIDs), options) as GatewayRequest<
    QueueState
  >;
}

export function removeQueueTrack(
  index: number,
  options?: GatewayRequestOptions,
): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => removeQueueTrackBinding(index), options) as GatewayRequest<
    QueueState
  >;
}

export function clearQueue(options?: GatewayRequestOptions): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => clearQueueBinding(), options) as GatewayRequest<QueueState>;
}

export function setCurrentQueueIndex(
  index: number,
  options?: GatewayRequestOptions,
): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => setCurrentQueueIndexBinding(index), options) as GatewayRequest<
    QueueState
  >;
}

export function setQueueRepeatMode(
  mode: string,
  options?: GatewayRequestOptions,
): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => setQueueRepeatModeBinding(mode), options) as GatewayRequest<
    QueueState
  >;
}

export function setQueueShuffle(
  enabled: boolean,
  options?: GatewayRequestOptions,
): GatewayRequest<QueueState> {
  return executeGatewayRequest(() => setQueueShuffleBinding(enabled), options) as GatewayRequest<
    QueueState
  >;
}

export function play(options?: GatewayRequestOptions): GatewayRequest<PlayerState> {
  return executeGatewayRequest(() => playBinding(), options) as GatewayRequest<PlayerState>;
}

export function togglePlayback(options?: GatewayRequestOptions): GatewayRequest<PlayerState> {
  return executeGatewayRequest(() => togglePlaybackBinding(), options) as GatewayRequest<PlayerState>;
}

export function nextTrack(options?: GatewayRequestOptions): GatewayRequest<PlayerState> {
  return executeGatewayRequest(() => nextTrackBinding(), options) as GatewayRequest<PlayerState>;
}

export function previousTrack(options?: GatewayRequestOptions): GatewayRequest<PlayerState> {
  return executeGatewayRequest(() => previousTrackBinding(), options) as GatewayRequest<PlayerState>;
}

export function seek(positionMS: number, options?: GatewayRequestOptions): GatewayRequest<PlayerState> {
  return executeGatewayRequest(() => seekBinding(positionMS), options) as GatewayRequest<PlayerState>;
}

export function setVolume(
  volume: number,
  options?: GatewayRequestOptions,
): GatewayRequest<PlayerState> {
  return executeGatewayRequest(() => setVolumeBinding(volume), options) as GatewayRequest<PlayerState>;
}

export function getAlbumQueueTrackIDs(
  title: string,
  albumArtist: string,
  options?: GatewayRequestOptions,
): GatewayRequest<number[]> {
  return executeGatewayRequest(() => getAlbumQueueTrackIDsBinding(title, albumArtist), options) as GatewayRequest<
    number[]
  >;
}

export function getAlbumQueueTrackIDsFromTrack(
  title: string,
  albumArtist: string,
  trackID: number,
  options?: GatewayRequestOptions,
): GatewayRequest<number[]> {
  return executeGatewayRequest(
    () => getAlbumQueueTrackIDsFromTrackBinding(title, albumArtist, trackID),
    options,
  ) as GatewayRequest<number[]>;
}

export function getArtistQueueTrackIDs(
  artistName: string,
  options?: GatewayRequestOptions,
): GatewayRequest<number[]> {
  return executeGatewayRequest(() => getArtistQueueTrackIDsBinding(artistName), options) as GatewayRequest<
    number[]
  >;
}

export function getArtistQueueTrackIDsFromTopTrack(
  artistName: string,
  trackID: number,
  options?: GatewayRequestOptions,
): GatewayRequest<number[]> {
  return executeGatewayRequest(
    () => getArtistQueueTrackIDsFromTopTrackBinding(artistName, trackID),
    options,
  ) as GatewayRequest<number[]>;
}
