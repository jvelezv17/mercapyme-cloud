import { json, INSTANCE_ID, STARTED_AT } from "../../src/http.mjs";

let served = 0;

export default async () => {
  served += 1;
  return json(200, {
    status: "ok",
    instance: INSTANCE_ID,
    region: process.env.AWS_REGION || "local",
    coldStart: served === 1,
    uptimeMs: Date.now() - STARTED_AT,
    requestsServedByThisInstance: served,
    time: new Date().toISOString()
  });
};

export const config = { path: "/api/health" };
