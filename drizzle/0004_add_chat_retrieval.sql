ALTER TABLE "embedding_settings" ADD COLUMN "chat_provider" "embedding_provider_kind" DEFAULT 'ollama' NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "ollama_chat_model" text DEFAULT 'llama3.2:1b' NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "chat_api_provider" text;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "chat_api_model" text;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "chat_api_key_ciphertext" text;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "chat_api_key_iv" text;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "chat_api_key_auth_tag" text;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "retrieval_top_k" integer DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "temperature" real DEFAULT 0.4 NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "rate_limit_per_minute" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "embedding_settings" ADD COLUMN "output_moderation_enabled" boolean DEFAULT true NOT NULL;