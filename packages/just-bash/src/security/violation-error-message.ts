import type { SecurityViolationType } from "./types.js";

const DEFENSE_IN_DEPTH_NOTICE =
  "\n\nThis is a defense-in-depth measure and indicates a bug in just-bash. " +
  "Please report this at security@vercel.com";

export function formatViolationErrorMessage(
  message: string,
  violationType: SecurityViolationType,
  canExclude: boolean,
): string {
  const exclusionHint = canExclude
    ? `\n\nIf this access is required by trusted host-runtime code, add "${violationType}" to defenseInDepth.excludeViolationTypes.`
    : "";
  return message + DEFENSE_IN_DEPTH_NOTICE + exclusionHint;
}
