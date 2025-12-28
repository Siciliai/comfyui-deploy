-- 为用户表添加认证相关字段
ALTER TABLE "comfyui_deploy"."users" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "comfyui_deploy"."users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "comfyui_deploy"."users" ADD COLUMN IF NOT EXISTS "org_id" text;

-- 为 username 添加唯一约束（如果不存在）
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_username_unique'
  ) THEN
    ALTER TABLE "comfyui_deploy"."users" ADD CONSTRAINT "users_username_unique" UNIQUE ("username");
  END IF;
END $$;

