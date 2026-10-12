// Shared types for cover resolution (spec §11).
export type CoverKind = 'book' | 'movie' | 'video'
export type BookParams = { isbn?: string; title: string; author?: string }
export type MovieParams = { title: string; year?: number }
export type VideoParams = { url: string }
export type CoverParams = BookParams | MovieParams | VideoParams
export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>
