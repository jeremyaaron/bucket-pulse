import { HttpEvent, HttpResult, errorResponse, getQueryParam, jsonResponse, parseIntParam } from "./http";
import { explorerRepo } from "../core/bootstrap";

export const handler = async (event: HttpEvent): Promise<HttpResult> => {
  try {
    const bucketName = getQueryParam(event, "bucketName");
    if (!bucketName) {
      return errorResponse(400, "ValidationError", "bucketName is required", event.requestContext.requestId);
    }

    const prefix = getQueryParam(event, "prefix") || undefined;
    const minSizeBytes = parseIntParam(event, "minSizeBytes");
    const maxSizeBytes = parseIntParam(event, "maxSizeBytes");
    const minAgeDays = parseIntParam(event, "minAgeDays");
    const maxAgeDays = parseIntParam(event, "maxAgeDays");
    const storageClass = getQueryParam(event, "storageClass") || undefined;
    const tagKey = getQueryParam(event, "tagKey") || undefined;
    const tagValue = getQueryParam(event, "tagValue") || undefined;
    const nextToken = getQueryParam(event, "nextToken") || undefined;

    let limit = parseIntParam(event, "limit") ?? 100;
    if (limit < 1) limit = 1;
    if (limit > 500) limit = 500;

    const resp = await explorerRepo.queryInventory({
      bucketName,
      prefix,
      minSizeBytes,
      maxSizeBytes,
      minAgeDays,
      maxAgeDays,
      storageClass,
      tagKey,
      tagValue,
      limit,
      nextToken,
    });

    return jsonResponse(200, resp);
  } catch (err) {
    console.error("Error in explorer handler", err);
    return errorResponse(500, "InternalError", "Unexpected error", event.requestContext.requestId);
  }
};
