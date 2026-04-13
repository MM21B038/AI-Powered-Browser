import { useEffect, type ReactElement } from "react";
import { registerA2aInboundHandler } from "../../services/a2a-inbound-handler";

/** Registers the renderer handler for inbound A2A (main-process server forwards tasks here). */
export function A2aInboundBridge(): ReactElement | null {
  useEffect(() => registerA2aInboundHandler(), []);
  return null;
}
