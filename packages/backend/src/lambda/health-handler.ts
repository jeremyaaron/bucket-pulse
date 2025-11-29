import { HttpEvent, HttpResult, errorResponse, jsonResponse } from "./http";
import { DefaultPrefixHealthService } from "../core/prefix-health-service";
import { bucketRepo, prefixConfigRepo, prefixStatusRepo, prefixEvalRepo } from "../core/bootstrap";
import { parseIntParam } from "./http";

const healthService = new DefaultPrefixHealthService(bucketRepo, prefixConfigRepo, prefixStatusRepo, prefixEvalRepo);

export const handler = async (event: HttpEvent): Promise<HttpResult> => {
  try {
    const bucketName = event.pathParameters?.bucket;
    const prefixEncoded = event.pathParameters?.prefix;

    const rawPath = event.rawPath;
    const isEvaluationsRoute = rawPath.endsWith("/evaluations");

    if (!bucketName || !prefixEncoded) {
      return errorResponse(400, "ValidationError", "bucket and prefix are required", event.requestContext.requestId);
    }

    const prefix = decodeURIComponent(prefixEncoded);
    if (isEvaluationsRoute) {
      const limit = parseIntParam(event, "limit") ?? 20;
      const nextToken = event.queryStringParameters?.["nextToken"];
      const since = event.queryStringParameters?.["since"];
      const config = await prefixConfigRepo.get(bucketName, prefix);
      if (!config) {
        return errorResponse(404, "NotFound", `Prefix ${prefix} not found`, event.requestContext.requestId);
      }
      const history = await prefixEvalRepo.listByPrefix(bucketName, prefix, { limit, nextToken, since });
      return jsonResponse(200, history);
    }

    const limit = parseIntParam(event, "limit") ?? 20;
    const nextToken = event.queryStringParameters?.["nextToken"];
    const health = await healthService.getPrefixHealth({ bucketName, prefix, evaluationsLimit: limit, nextToken });

    if (!health) {
      return errorResponse(
        404,
        "NotFound",
        `No health data for bucket=${bucketName}, prefix=${prefix}`,
        event.requestContext.requestId,
      );
    }

    return jsonResponse(200, health);
  } catch (err) {
    console.error("Error in health handler", err);
    return errorResponse(500, "InternalError", "Unexpected error", event.requestContext.requestId);
  }
};
