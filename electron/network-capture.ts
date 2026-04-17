import type { Session } from "electron";
import type { CapturedRequestRecord } from "../src/shared/ipc-types";
import { appendCapture } from "./request-store";

export function wireNetworkCapture(sess: Session): void {
  // Lightweight baseline capture: method/url/status/timing context.
  sess.webRequest.onCompleted((details) => {
    const rec: CapturedRequestRecord = {
      id: `${details.id}_${Date.now()}`,
      timestamp: Date.now(),
      method: details.method,
      url: details.url,
      statusCode: details.statusCode,
      resourceType: details.resourceType,
      referrer: details.referrer ?? "",
    };
    void appendCapture(rec);
  });
}
