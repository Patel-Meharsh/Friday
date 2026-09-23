import { permissionRequestStatus } from "./authorization.js";

export function formatAuthorizationRequests() {
  const requests = permissionRequestStatus();
  if (!requests.length) return "No pending permission requests.";
  return requests.map((request) => `${request.id} | ${request.capability} | ${request.reason}`).join("\n");
}
