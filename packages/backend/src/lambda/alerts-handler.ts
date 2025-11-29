import { HttpEvent, HttpResult, errorResponse, getQueryParam, jsonResponse, parseIntParam } from "./http";
import { AlertSeverity, AlertType } from "@bucket-pulse/shared";
import { alertRepo } from "../core/bootstrap";

export const handler = async (event: HttpEvent): Promise<HttpResult> => {
  try {
    const bucketName = getQueryParam(event, "bucketName") || undefined;
    const prefix = getQueryParam(event, "prefix") || undefined;
    const severity = getQueryParam(event, "severity") as AlertSeverity | undefined;
    const type = getQueryParam(event, "type") as AlertType | undefined;
    const since = getQueryParam(event, "since") || undefined;
    const until = getQueryParam(event, "until") || undefined;
    let limit = parseIntParam(event, "limit") ?? 50;
    if (limit < 1) limit = 1;
    if (limit > 200) limit = 200;
    const nextToken = getQueryParam(event, "nextToken") || undefined;

    const resp = await alertRepo.listAlerts({ bucketName, prefix, severity, type, since, until, limit, nextToken });
    return jsonResponse(200, resp);
  } catch (err) {
    console.error("Error in alerts handler", err);
    return errorResponse(500, "InternalError", "Unexpected error", event.requestContext.requestId);
  }
};
