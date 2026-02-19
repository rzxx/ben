const defaultDomainErrorMessage = "Something went wrong.";
const cancelledDomainErrorMessage = "Request was cancelled.";

export type DomainErrorCode = "cancelled" | "unknown";

export class DomainError extends Error {
  readonly code: DomainErrorCode;
  readonly cause: unknown;

  constructor(code: DomainErrorCode, message: string, cause: unknown) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.cause = cause;
  }
}

export function normalizeDomainError(
  error: unknown,
  fallbackMessage: string = defaultDomainErrorMessage,
): DomainError {
  if (error instanceof DomainError) {
    return error;
  }

  if (isCancellationLikeError(error)) {
    return new DomainError(
      "cancelled",
      extractErrorMessage(error) ?? cancelledDomainErrorMessage,
      error,
    );
  }

  return new DomainError("unknown", extractErrorMessage(error) ?? fallbackMessage, error);
}

export function toDomainErrorMessage(
  error: unknown,
  fallbackMessage: string = defaultDomainErrorMessage,
): string {
  return normalizeDomainError(error, fallbackMessage).message;
}

export function isDomainCancelledError(error: unknown): boolean {
  return normalizeDomainError(error).code === "cancelled";
}

function extractErrorMessage(error: unknown): string | null {
  if (typeof error === "string") {
    const trimmedError = error.trim();
    return trimmedError ? trimmedError : null;
  }

  if (!(error && typeof error === "object")) {
    return null;
  }

  const withMessage = error as { message?: unknown; error?: unknown };
  if (typeof withMessage.message === "string" && withMessage.message.trim()) {
    return withMessage.message.trim();
  }

  if (typeof withMessage.error === "string" && withMessage.error.trim()) {
    return withMessage.error.trim();
  }

  return null;
}

function isCancellationLikeError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  const withName = error as { name?: unknown; message?: unknown };
  const errorName =
    typeof withName.name === "string" ? withName.name.toLowerCase() : "";
  if (errorName.includes("abort") || errorName.includes("cancel")) {
    return true;
  }

  const message =
    typeof withName.message === "string" ? withName.message.toLowerCase() : "";
  return (
    message.includes("cancel") ||
    message.includes("canceled") ||
    message.includes("cancelled") ||
    message.includes("aborted")
  );
}
