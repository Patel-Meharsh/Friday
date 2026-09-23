const SECRET_KEYS = /(?:api[_-]?key|token|secret|password|authorization|cookie|private[_-]?key)/i;
const SECRET_VALUE = /^(?:sk-|gsk_|ghp_|github_pat_|xox[baprs]-|Bearer\s+)/i;

export function redactSecrets(value) {
  if (typeof value === "string") {
    if (SECRET_VALUE.test(value.trim())) return "[REDACTED]";
    return value.replace(/(sk-|gsk_|ghp_|github_pat_)[A-Za-z0-9._-]+/g, "$1[REDACTED]");
  }

  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEYS.test(key) ? "[REDACTED]" : redactSecrets(item),
    ]));
  }

  return value;
}
