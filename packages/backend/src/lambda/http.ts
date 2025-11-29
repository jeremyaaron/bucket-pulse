import { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { ApiErrorResponse } from "@bucket-pulse/shared/dist/bucket-pulse-api";

export type HttpEvent = APIGatewayProxyEventV2;
export type HttpResult = APIGatewayProxyResultV2;

export function jsonResponse(statusCode: number, body: unknown): HttpResult {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  };
}

export function errorResponse(statusCode: number, error: string, message?: string, requestId?: string): HttpResult {
  const body: ApiErrorResponse = {
    error,
    message,
    requestId,
  };
  return jsonResponse(statusCode, body);
}

export function getQueryParam(event: HttpEvent, name: string): string | undefined {
  return event.queryStringParameters?.[name];
}

export function parseIntParam(event: HttpEvent, name: string): number | undefined {
  const raw = getQueryParam(event, name);
  if (raw == null) return undefined;
  const val = Number.parseInt(raw, 10);
  return Number.isNaN(val) ? undefined : val;
}
