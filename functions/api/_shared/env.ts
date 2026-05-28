/**
 * Cloudflare Pages environment bindings.
 *
 * These are set in the Cloudflare dashboard (Settings > Environment Variables)
 * or in wrangler.toml for local dev. R2 buckets are configured as bindings.
 */
export interface Env {
  // R2 bucket for map-data.json, thumbnails, etc.
  DATA_BUCKET: R2Bucket

  // Postgres connection (Neon)
  DATABASE_URL: string

  // Admin API key
  ADMIN_KEY: string

  // Anthropic API key (for LLM review + semantic search)
  ANTHROPIC_API_KEY?: string
  ANTHROPIC_SEMANTIC_SEARCH_KEY?: string

  // OpenAI API key (map voice commands via Realtime or Whisper)
  OPENAI_API_KEY?: string

  // Voice: "realtime" (default, gpt-realtime-2) or "whisper" (whisper-1 REST)
  VOICE_TRANSCRIBE_BACKEND?: string
  VOICE_REALTIME_MODEL?: string
  VOICE_REALTIME_TRANSCRIPTION_MODEL?: string

  // CloudFront domain for thumbnail URLs (legacy, replaced by R2 public URL)
  THUMBNAIL_PUBLIC_URL?: string

  // Salt for hashing voter IPs in field feedback dedup
  VOTER_SALT?: string
}
