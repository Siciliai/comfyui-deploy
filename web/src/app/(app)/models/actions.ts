"use server";

import { auth } from "@clerk/nextjs";
import { db } from "@/db/db";
import { volumeModelsTable } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { S3, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const s3Client = new S3({
  endpoint: process.env.SPACES_ENDPOINT,
  region: process.env.SPACES_REGION,
  credentials: {
    accessKeyId: process.env.SPACES_KEY!,
    secretAccessKey: process.env.SPACES_SECRET!,
  },
  forcePathStyle: process.env.SPACES_CDN_FORCE_PATH_STYLE === "true",
});

export async function getModels() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  const models = await db
    .select({
      id: volumeModelsTable.id,
      filename: volumeModelsTable.filename,
      folder_path: volumeModelsTable.folder_path,
      file_size: volumeModelsTable.file_size,
      created_at: volumeModelsTable.created_at,
      s3_object_key: volumeModelsTable.s3_object_key,
    })
    .from(volumeModelsTable)
    .where(eq(volumeModelsTable.user_id, userId))
    .orderBy(desc(volumeModelsTable.created_at));

  return models;
}

export async function deleteModel(modelId: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Get model to verify ownership and get S3 key
  const [model] = await db
    .select()
    .from(volumeModelsTable)
    .where(
      and(
        eq(volumeModelsTable.id, modelId),
        eq(volumeModelsTable.user_id, userId)
      )
    );

  if (!model) {
    throw new Error("Model not found");
  }

  // Delete from S3
  try {
    const command = new DeleteObjectCommand({
      Bucket: process.env.SPACES_BUCKET,
      Key: model.s3_object_key,
    });
    await s3Client.send(command);
  } catch (error) {
    console.error("Error deleting from S3:", error);
    // Continue with database deletion even if S3 delete fails
  }

  // Delete from database
  await db
    .delete(volumeModelsTable)
    .where(
      and(
        eq(volumeModelsTable.id, modelId),
        eq(volumeModelsTable.user_id, userId)
      )
    );

  return { success: true };
}

export async function generateDownloadUrl(s3ObjectKey: string) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  // Verify the model belongs to the user
  const [model] = await db
    .select()
    .from(volumeModelsTable)
    .where(
      and(
        eq(volumeModelsTable.s3_object_key, s3ObjectKey),
        eq(volumeModelsTable.user_id, userId)
      )
    );

  if (!model) {
    throw new Error("Model not found or access denied");
  }

  const command = new GetObjectCommand({
    Bucket: process.env.SPACES_BUCKET,
    Key: s3ObjectKey,
  });

  const downloadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: 60 * 60, // 1 hour
  });

  return { downloadUrl };
}

