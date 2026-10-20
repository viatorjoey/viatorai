declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    OPENAI_API_KEY?: string;
    OPENAI_MODEL?: string;
    OPENAI_SERVICE_NOTICE?: string;
    GEMINI_API_KEY?: string;
    GEMINI_MODEL?: string;
    HF_API_KEY?: string;
    XAI_API_KEY?: string;
    XAI_MODEL?: string;
    ANTHROPIC_API_KEY?: string;
    ANTHROPIC_MODEL?: string;
    SITES_SERVICE_TOKEN?: string;
  }
}
