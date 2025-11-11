import type { App } from "@/routes/app";
import { authError } from "@/routes/authError";
import { z, createRoute } from "@hono/zod-openapi";
import {
    S3,
    CreateMultipartUploadCommand,
    UploadPartCommand,
    CompleteMultipartUploadCommand,
    AbortMultipartUploadCommand,
    PutObjectCommand,
    GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { db } from "@/db/db";
import { volumeModelsTable } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

const s3Client = new S3({
    endpoint: process.env.SPACES_ENDPOINT,
    region: process.env.SPACES_REGION,
    credentials: {
        accessKeyId: process.env.SPACES_KEY!,
        secretAccessKey: process.env.SPACES_SECRET!,
    },
    forcePathStyle: process.env.SPACES_CDN_FORCE_PATH_STYLE === "true",
});

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
};

// Initiate multipart upload
const initiateMultipartRoute = createRoute({
    method: "post",
    path: "/volume/file/initiate-multipart-upload",
    tags: ["volume"],
    summary: "Initiate multipart upload for large files",
    description: "Start a multipart upload session for files larger than 5MB",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        filename: z.string(),
                        contentType: z.string(),
                        size: z.number(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        uploadId: z.string(),
                        key: z.string(),
                    }),
                },
            },
            description: "Multipart upload initiated successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error initiating multipart upload",
        },
        ...authError,
    },
});

// Generate part upload URL
const generatePartUploadUrlRoute = createRoute({
    method: "post",
    path: "/volume/file/generate-part-upload-url",
    tags: ["volume"],
    summary: "Generate presigned URL for uploading a part",
    description: "Generate a presigned URL for uploading a specific part of a multipart upload",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        key: z.string(),
                        uploadId: z.string(),
                        partNumber: z.number(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        uploadUrl: z.string(),
                    }),
                },
            },
            description: "Upload URL generated successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error generating upload URL",
        },
        ...authError,
    },
});

// Complete multipart upload
const completeMultipartRoute = createRoute({
    method: "post",
    path: "/volume/file/complete-multipart-upload",
    tags: ["volume"],
    summary: "Complete multipart upload",
    description: "Finalize a multipart upload after all parts have been uploaded",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        key: z.string(),
                        uploadId: z.string(),
                        parts: z.array(
                            z.object({
                                // Support both formats: ETag/PartNumber (AWS) and eTag/partNumber (client)
                                ETag: z.string().optional(),
                                eTag: z.string().optional(),
                                PartNumber: z.number().optional(),
                                partNumber: z.number().optional(),
                            }).refine(
                                (data) => data.ETag || data.eTag,
                                { message: "Either ETag or eTag is required" }
                            ).refine(
                                (data) => data.PartNumber !== undefined || data.partNumber !== undefined,
                                { message: "Either PartNumber or partNumber is required" }
                            )
                        ),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        location: z.string(),
                    }),
                },
            },
            description: "Multipart upload completed successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error completing multipart upload",
        },
        ...authError,
    },
});

// Abort multipart upload
const abortMultipartRoute = createRoute({
    method: "post",
    path: "/volume/file/abort-multipart-upload",
    tags: ["volume"],
    summary: "Abort multipart upload",
    description: "Cancel a multipart upload and free up storage",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        key: z.string(),
                        uploadId: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                    }),
                },
            },
            description: "Multipart upload aborted successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error aborting multipart upload",
        },
        ...authError,
    },
});

// Generate single-part upload URL
const generateUploadUrlRoute = createRoute({
    method: "post",
    path: "/volume/file/generate-upload-url",
    tags: ["volume"],
    summary: "Generate presigned URL for single file upload",
    description: "Generate a presigned URL for uploading a file (for files < 5MB)",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        filename: z.string(),
                        contentType: z.string(),
                        size: z.number(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        uploadUrl: z.string(),
                        key: z.string(),
                    }),
                },
            },
            description: "Upload URL generated successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error generating upload URL",
        },
        ...authError,
    },
});

// Add model to volume
const addModelRoute = createRoute({
    method: "post",
    path: "/volume/model",
    tags: ["volume"],
    summary: "Register a model in the volume",
    description: "Register an uploaded model file to the user's volume",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        source: z.string(),
                        folderPath: z.string(),
                        filename: z.string(),
                        downloadLink: z.string(),
                        isTemporaryUpload: z.boolean().optional(),
                        s3ObjectKey: z.string().optional(),
                        fileSize: z.number().optional(), // Add file size
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                        modelPath: z.string().optional(),
                        modelId: z.string().optional(),
                    }),
                },
            },
            description: "Model registered successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error registering model",
        },
        ...authError,
    },
});

// Get models list
const getModelsRoute = createRoute({
    method: "get",
    path: "/volume/models",
    tags: ["volume"],
    summary: "Get user's models list",
    description: "Get all models uploaded by the user",
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        models: z.array(z.object({
                            id: z.string(),
                            filename: z.string(),
                            folder_path: z.string(),
                            file_size: z.number().nullable(),
                            created_at: z.string(),
                            s3_object_key: z.string(),
                        })),
                    }),
                },
            },
            description: "Models retrieved successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error retrieving models",
        },
        ...authError,
    },
});

// Delete model
const deleteModelRoute = createRoute({
    method: "delete",
    path: "/volume/model/{model_id}",
    tags: ["volume"],
    summary: "Delete a model",
    description: "Delete a model from the user's volume",
    request: {
        params: z.object({
            model_id: z.string().uuid(),
        }),
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        success: z.boolean(),
                    }),
                },
            },
            description: "Model deleted successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error deleting model",
        },
        ...authError,
    },
});

// Generate download URL
const generateDownloadUrlRoute = createRoute({
    method: "post",
    path: "/volume/model/download-url",
    tags: ["volume"],
    summary: "Generate download URL for a model",
    description: "Generate a presigned download URL for a model",
    request: {
        body: {
            content: {
                "application/json": {
                    schema: z.object({
                        s3_object_key: z.string(),
                    }),
                },
            },
        },
    },
    responses: {
        200: {
            content: {
                "application/json": {
                    schema: z.object({
                        downloadUrl: z.string(),
                    }),
                },
            },
            description: "Download URL generated successfully",
        },
        500: {
            content: {
                "application/json": {
                    schema: z.object({
                        error: z.string(),
                    }),
                },
            },
            description: "Error generating download URL",
        },
        ...authError,
    },
});

export const registerVolumeRoute = (app: App) => {
    // Initiate multipart upload
    app.openapi(initiateMultipartRoute, async (c) => {
        const { filename, contentType, size } = c.req.valid("json");
        const tokenData = c.get("apiKeyTokenData");

        if (!tokenData?.user_id) {
            return c.json(
                { error: "Invalid user_id" },
                { status: 500, headers: corsHeaders }
            );
        }

        try {
            const key = `models/${tokenData.user_id}/${Date.now()}_${filename}`;
            const bucket = process.env.SPACES_BUCKET;

            const command = new CreateMultipartUploadCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
            });

            const response = await s3Client.send(command);

            return c.json(
                {
                    uploadId: response.UploadId!,
                    key: key,
                },
                {
                    status: 200,
                    headers: corsHeaders,
                }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Generate part upload URL
    app.openapi(generatePartUploadUrlRoute, async (c) => {
        const { key, uploadId, partNumber } = c.req.valid("json");

        try {
            const bucket = process.env.SPACES_BUCKET;

            const command = new UploadPartCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                PartNumber: partNumber,
            });

            const uploadUrl = await getSignedUrl(s3Client, command, {
                expiresIn: 60 * 60, // 1 hour
            });

            return c.json(
                { uploadUrl },
                { status: 200, headers: corsHeaders }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Complete multipart upload
    app.openapi(completeMultipartRoute, async (c) => {
        const { key, uploadId, parts } = c.req.valid("json");

        try {
            const bucket = process.env.SPACES_BUCKET;

            // Normalize parts to AWS SDK format (ETag, PartNumber)
            const normalizedParts = parts.map((part: any) => ({
                ETag: part.ETag || part.eTag,
                PartNumber: part.PartNumber ?? part.partNumber,
            }));

            const command = new CompleteMultipartUploadCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
                MultipartUpload: {
                    Parts: normalizedParts,
                },
            });

            const response = await s3Client.send(command);

            return c.json(
                { location: response.Location! },
                { status: 200, headers: corsHeaders }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Abort multipart upload
    app.openapi(abortMultipartRoute, async (c) => {
        const { key, uploadId } = c.req.valid("json");

        try {
            const bucket = process.env.SPACES_BUCKET;

            const command = new AbortMultipartUploadCommand({
                Bucket: bucket,
                Key: key,
                UploadId: uploadId,
            });

            await s3Client.send(command);

            return c.json(
                { success: true },
                { status: 200, headers: corsHeaders }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Generate single-part upload URL
    app.openapi(generateUploadUrlRoute, async (c) => {
        const { filename, contentType, size } = c.req.valid("json");
        const tokenData = c.get("apiKeyTokenData");

        if (!tokenData?.user_id) {
            return c.json(
                { error: "Invalid user_id" },
                { status: 500, headers: corsHeaders }
            );
        }

        try {
            const key = `models/${tokenData.user_id}/${Date.now()}_${filename}`;
            const bucket = process.env.SPACES_BUCKET;

            const command = new PutObjectCommand({
                Bucket: bucket,
                Key: key,
                ContentType: contentType,
            });

            const uploadUrl = await getSignedUrl(s3Client, command, {
                expiresIn: 60 * 60, // 1 hour
            });

            return c.json(
                {
                    uploadUrl,
                    key,
                },
                {
                    status: 200,
                    headers: corsHeaders,
                }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Add model to volume
    app.openapi(addModelRoute, async (c) => {
        const { source, folderPath, filename, downloadLink, isTemporaryUpload, s3ObjectKey, fileSize } = c.req.valid("json");
        const tokenData = c.get("apiKeyTokenData");

        if (!tokenData?.user_id) {
            return c.json(
                { error: "Invalid user_id" },
                { status: 500, headers: corsHeaders }
            );
        }

        try {
            const modelPath = `${folderPath}/${filename}`;

            // Save model metadata to database
            const [model] = await db.insert(volumeModelsTable).values({
                user_id: tokenData.user_id,
                org_id: tokenData.org_id || null,
                filename: filename,
                folder_path: folderPath,
                s3_object_key: s3ObjectKey || "",
                file_size: fileSize || null,
                source: source,
                download_link: downloadLink || null,
                is_temporary_upload: isTemporaryUpload || false,
            }).returning();

            return c.json(
                {
                    success: true,
                    modelPath: modelPath,
                    modelId: model.id,
                },
                {
                    status: 200,
                    headers: corsHeaders,
                }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Get models list
    app.openapi(getModelsRoute, async (c) => {
        const tokenData = c.get("apiKeyTokenData");

        if (!tokenData?.user_id) {
            return c.json(
                { error: "Invalid user_id" },
                { status: 500, headers: corsHeaders }
            );
        }

        try {
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
                .where(eq(volumeModelsTable.user_id, tokenData.user_id))
                .orderBy(desc(volumeModelsTable.created_at));

            return c.json(
                { models },
                { status: 200, headers: corsHeaders }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Delete model
    app.openapi(deleteModelRoute, async (c) => {
        const { model_id } = c.req.valid("param");
        const tokenData = c.get("apiKeyTokenData");

        if (!tokenData?.user_id) {
            return c.json(
                { error: "Invalid user_id" },
                { status: 500, headers: corsHeaders }
            );
        }

        try {
            // Delete from database (only if it belongs to the user)
            await db
                .delete(volumeModelsTable)
                .where(
                    and(
                        eq(volumeModelsTable.id, model_id),
                        eq(volumeModelsTable.user_id, tokenData.user_id)
                    )
                );

            return c.json(
                { success: true },
                { status: 200, headers: corsHeaders }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Generate download URL
    app.openapi(generateDownloadUrlRoute, async (c) => {
        const { s3_object_key } = c.req.valid("json");
        const tokenData = c.get("apiKeyTokenData");

        if (!tokenData?.user_id) {
            return c.json(
                { error: "Invalid user_id" },
                { status: 500, headers: corsHeaders }
            );
        }

        try {
            const bucket = process.env.SPACES_BUCKET;

            const command = new GetObjectCommand({
                Bucket: bucket,
                Key: s3_object_key,
            });

            const downloadUrl = await getSignedUrl(s3Client, command, {
                expiresIn: 60 * 60, // 1 hour
            });

            return c.json(
                { downloadUrl },
                { status: 200, headers: corsHeaders }
            );
        } catch (error: unknown) {
            const errorMessage =
                error instanceof Error ? error.message : "Unknown error";
            return c.json(
                { error: errorMessage },
                { status: 500, headers: corsHeaders }
            );
        }
    });

    // Handle OPTIONS for CORS preflight
    app.options("/volume/file/initiate-multipart-upload", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/file/generate-part-upload-url", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/file/complete-multipart-upload", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/file/abort-multipart-upload", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/file/generate-upload-url", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/model", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/models", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/model/:model_id", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });

    app.options("/volume/model/download-url", async (c) => {
        return new Response(null, {
            status: 204,
            headers: corsHeaders,
        });
    });
};

