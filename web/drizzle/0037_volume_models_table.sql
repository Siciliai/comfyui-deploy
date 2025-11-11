CREATE TABLE IF NOT EXISTS "comfyui_deploy"."volume_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"org_id" text,
	"filename" text NOT NULL,
	"folder_path" text NOT NULL,
	"s3_object_key" text NOT NULL,
	"file_size" integer,
	"content_type" text,
	"source" text NOT NULL,
	"download_link" text,
	"is_temporary_upload" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comfyui_deploy"."volume_models" ADD CONSTRAINT "volume_models_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "comfyui_deploy"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;

