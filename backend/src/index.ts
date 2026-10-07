// Lambda entry point.
//
// API Gateway (HTTP API, payload format 2.0) hands the event here; the router in u44.handler.ts
// does the rest. Keeping the translation in one place means the routing code stays plain
// request/response and can be exercised in tests without an AWS event.

import { APIGatewayEventRequestContextV2WithAuthorizer, APIGatewayProxyEventV2WithRequestContext, APIGatewayProxyResultV2, Context } from "aws-lambda";
import { apiGatewayRequestEventToRouterRequest, responseDataToApiGatewayResult } from "./utils/reqres/reqres.js";
import { handleRequest } from "./u44be/u44.handler.js";

export async function handler(
    event: APIGatewayProxyEventV2WithRequestContext<APIGatewayEventRequestContextV2WithAuthorizer<unknown>>,
    context: Context,
): Promise<APIGatewayProxyResultV2> {
    try {
        const request = apiGatewayRequestEventToRouterRequest(event, context);
        return responseDataToApiGatewayResult(await handleRequest(request));
    } catch (err) {
        // Anything that escapes the router is a bug; log it with the request id so it can be
        // found in CloudWatch, and never leak the stack trace to the caller.
        console.error(`An unhandled error occurred while processing the request (${context.awsRequestId}) : ${err}`);
        return responseDataToApiGatewayResult({ status: 500, body: "An unexpected error occurred" });
    }
}
