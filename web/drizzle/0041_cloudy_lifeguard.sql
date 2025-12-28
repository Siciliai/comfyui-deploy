ALTER TABLE "comfyui_deploy"."users" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "comfyui_deploy"."users" ADD COLUMN "password_hash" text;--> statement-breakpoint
ALTER TABLE "comfyui_deploy"."users" ADD COLUMN "org_id" text;--> statement-breakpoint
ALTER TABLE "comfyui_deploy"."users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");