import { HttpEvent, HttpResult, errorResponse, jsonResponse } from "./http";
import { PrefixListService } from "../core/prefix-list-service";
import { PrefixConfig } from "@bucket-pulse/shared";
import { bucketRepo, prefixConfigRepo, prefixStatusRepo, s3Client, env } from "../core/bootstrap";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { GetBucketMetadataConfigurationCommand } from "@aws-sdk/client-s3";

const prefixListService = new PrefixListService(bucketRepo, prefixConfigRepo, prefixStatusRepo);

type HttpMethod = "GET" | "POST";

function httpMethod(event: HttpEvent): HttpMethod {
  return event.requestContext.http.method as HttpMethod;
}

function path(event: HttpEvent): string {
  return event.rawPath;
}

export const handler = async (event: HttpEvent): Promise<HttpResult> => {
  try {
    const method = httpMethod(event);
    const p = path(event);

    if (method === "GET" && p === "/buckets") {
      const buckets = await bucketRepo.listBuckets();
      return jsonResponse(200, { buckets });
    }

    if (method === "POST" && p === "/buckets") {
      const body = event.body ? JSON.parse(event.body) : undefined;
      const validationError = validateBucket(body);
      if (validationError) {
        return errorResponse(400, "ValidationError", validationError, event.requestContext.requestId);
      }

      const probeResult = await probeBucketAccess(body.bucketName, body.region);
      if (probeResult.error) {
        return errorResponse(400, "ValidationError", probeResult.error, event.requestContext.requestId);
      }

      const summary = await bucketRepo.upsertBucket({
        bucketName: body.bucketName,
        displayName: body.displayName,
        region: body.region,
        inventoryTableName: probeResult.inventoryTableName,
        journalTableName: probeResult.journalTableName,
        metadataTablesArn: probeResult.metadataTablesArn,
      });
      return jsonResponse(201, summary);
    }

    const bucketName = event.pathParameters?.bucket;
    if (bucketName && method === "GET" && p === `/buckets/${bucketName}`) {
      const bucket = await bucketRepo.getBucket(bucketName);
      if (!bucket) {
        return errorResponse(404, "NotFound", `Bucket ${bucketName} not found`, event.requestContext.requestId);
      }
      return jsonResponse(200, bucket);
    }

    if (bucketName && p === `/buckets/${bucketName}/prefixes`) {
      if (method === "GET") {
        const resp = await prefixListService.getBucketPrefixes(bucketName);
        if (!resp) {
          return errorResponse(404, "NotFound", `Bucket ${bucketName} not found`, event.requestContext.requestId);
        }
        return jsonResponse(200, resp);
      }
      if (method === "POST") {
        const body = event.body ? JSON.parse(event.body) : undefined;
        const validationError = validatePrefixConfig(body);
        if (validationError) {
          return errorResponse(400, "ValidationError", validationError, event.requestContext.requestId);
        }
        const created = await prefixConfigRepo.upsert({
          bucketName,
          prefix: body.prefix,
          freshnessExpectedIntervalMinutes: body.freshnessExpectedIntervalMinutes,
          freshnessWarningThresholdMinutes: body.freshnessWarningThresholdMinutes,
          freshnessCriticalThresholdMinutes: body.freshnessCriticalThresholdMinutes,
          stalenessAgeDays: body.stalenessAgeDays,
          stalenessMaxPctOld: body.stalenessMaxPctOld,
          partitionPattern: body.partitionPattern,
        });
        return jsonResponse(200, created);
      }
    }

    return errorResponse(404, "NotFound", `Route ${method} ${p} not found`, event.requestContext.requestId);
  } catch (err) {
    console.error("Error in config handler", err);
    return errorResponse(500, "InternalError", "Unexpected error", event.requestContext.requestId);
  }
};

function validatePrefixConfig(body: any): string | undefined {
  if (!body?.prefix) return "prefix is required";
  const requiredNumeric: Array<keyof PrefixConfig> = [
    "freshnessExpectedIntervalMinutes",
    "freshnessWarningThresholdMinutes",
    "freshnessCriticalThresholdMinutes",
    "stalenessAgeDays",
    "stalenessMaxPctOld",
  ];
  for (const field of requiredNumeric) {
    if (typeof body[field] !== "number") {
      return `${String(field)} must be a number`;
    }
  }
  return undefined;
}

function validateBucket(body: any): string | undefined {
  if (!body?.bucketName || typeof body.bucketName !== "string") {
    return "bucketName is required";
  }
  if (!body?.region || typeof body.region !== "string") {
    return "region is required";
  }
  const s3NameRegex = /^[a-z0-9.-]{3,63}$/;
  if (!s3NameRegex.test(body.bucketName)) {
    return "bucketName must be a valid S3 bucket name (lowercase letters, numbers, dots, hyphens)";
  }
  const regionRegex = /^[a-z]{2}-[a-z]+-\\d$/;
  if (!regionRegex.test(body.region)) {
    return "region must be a valid AWS region (e.g., us-east-1)";
  }
  return undefined;
}

async function probeBucketAccess(
  bucketName: string,
  region?: string,
): Promise<{ error?: string; inventoryTableName?: string; journalTableName?: string; metadataTablesArn?: string }> {
  try {
    const client = region ? new (s3Client.constructor as any)({ region }) : s3Client;
    await client.send(new HeadBucketCommand({ Bucket: bucketName }));
    const meta = await client.send(
      new GetBucketMetadataConfigurationCommand({
        Bucket: bucketName,
      }),
    );
    const tables = meta.Tables || [];
    let inventoryTableName: string | undefined;
    let journalTableName: string | undefined;
    for (const t of tables) {
      const tbl = t.MetadataTableConfiguration;
      if (!tbl) continue;
      const name = tbl.TableName?.toLowerCase() ?? "";
      if (!inventoryTableName && name.includes("inventory")) {
        inventoryTableName = tbl.TableName;
      }
      if (!journalTableName && name.includes("journal")) {
        journalTableName = tbl.TableName;
      }
    }
    if (!inventoryTableName || !journalTableName) {
      return {
        error: "Required inventory/journal tables not found; ensure S3 metadata tables are enabled for this bucket.",
      };
    }
    return {
      inventoryTableName,
      journalTableName,
      metadataTablesArn: meta.MetadataTableConfigurationArn,
    };
  } catch (err: any) {
    const code = err?.$metadata?.httpStatusCode;
    if (err?.name === "MetadataConfigurationNotFoundException") {
      return { error: "S3 metadata tables not enabled for this bucket." };
    }
    if (err?.name === "EntityNotFoundException") {
      return { error: "Required inventory/journal tables not found; ensure S3 inventory/journal is enabled for this bucket." };
    }
    if (code === 404) return { error: `Bucket ${bucketName} not found or not accessible` };
    if (code === 403) return { error: `Access denied to bucket ${bucketName}` };
    return { error: `Unable to validate bucket ${bucketName}` };
  }
}
