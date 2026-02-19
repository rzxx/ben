import {
  GetAlbumDetail as getAlbumDetailBinding,
  GetArtistDetail as getArtistDetailBinding,
  GetArtistTopTracks as getArtistTopTracksBinding,
  ListAlbums as listAlbumsBinding,
  ListArtists as listArtistsBinding,
  ListTracks as listTracksBinding,
} from "../../../../bindings/ben/libraryservice";
import type {
  AlbumDetail,
  ArtistDetail,
  ArtistTopTrack,
  LibraryAlbum,
  LibraryArtist,
  LibraryTrack,
  PagedResult,
} from "../../../features/types";
import { executeGatewayRequest, type GatewayRequest, type GatewayRequestOptions } from "./gatewayUtils";

export function listAlbums(
  search: string,
  artist: string,
  limit: number,
  offset: number,
  options?: GatewayRequestOptions,
): GatewayRequest<PagedResult<LibraryAlbum>> {
  return executeGatewayRequest(
    () => listAlbumsBinding(search, artist, limit, offset),
    options,
  ) as GatewayRequest<PagedResult<LibraryAlbum>>;
}

export function listArtists(
  search: string,
  limit: number,
  offset: number,
  options?: GatewayRequestOptions,
): GatewayRequest<PagedResult<LibraryArtist>> {
  return executeGatewayRequest(() => listArtistsBinding(search, limit, offset), options) as GatewayRequest<
    PagedResult<LibraryArtist>
  >;
}

export function listTracks(
  search: string,
  artist: string,
  album: string,
  limit: number,
  offset: number,
  options?: GatewayRequestOptions,
): GatewayRequest<PagedResult<LibraryTrack>> {
  return executeGatewayRequest(
    () => listTracksBinding(search, artist, album, limit, offset),
    options,
  ) as GatewayRequest<PagedResult<LibraryTrack>>;
}

export function getAlbumDetail(
  title: string,
  albumArtist: string,
  limit: number,
  offset: number,
  options?: GatewayRequestOptions,
): GatewayRequest<AlbumDetail> {
  return executeGatewayRequest(
    () => getAlbumDetailBinding(title, albumArtist, limit, offset),
    options,
  ) as GatewayRequest<AlbumDetail>;
}

export function getArtistDetail(
  name: string,
  limit: number,
  offset: number,
  options?: GatewayRequestOptions,
): GatewayRequest<ArtistDetail> {
  return executeGatewayRequest(() => getArtistDetailBinding(name, limit, offset), options) as GatewayRequest<
    ArtistDetail
  >;
}

export function getArtistTopTracks(
  name: string,
  limit: number,
  options?: GatewayRequestOptions,
): GatewayRequest<ArtistTopTrack[]> {
  return executeGatewayRequest(() => getArtistTopTracksBinding(name, limit), options) as GatewayRequest<
    ArtistTopTrack[]
  >;
}
