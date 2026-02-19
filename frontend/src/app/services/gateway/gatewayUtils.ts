import { normalizeDomainError } from "../domainError";

export type GatewayRequestOptions = {
  signal?: AbortSignal;
};

export type GatewayRequest<T> = Promise<T> & {
  cancel: () => void;
};

type MaybeCancellablePromise<T> = Promise<T> & {
  cancel?: () => void;
};

export function executeGatewayRequest<T>(
  requestFactory: () => Promise<T>,
  options: GatewayRequestOptions = {},
): GatewayRequest<T> {
  const request = requestFactory() as MaybeCancellablePromise<T>;
  const cancelRequest = () => {
    request.cancel?.();
  };

  const abortSignal = options.signal;
  if (abortSignal?.aborted) {
    cancelRequest();
  }

  const abortHandler = () => {
    cancelRequest();
  };

  abortSignal?.addEventListener("abort", abortHandler, { once: true });

  const wrappedRequest = request.catch((error) => {
    throw normalizeDomainError(error);
  }) as GatewayRequest<T>;

  wrappedRequest.cancel = cancelRequest;

  void wrappedRequest.finally(() => {
    abortSignal?.removeEventListener("abort", abortHandler);
  });

  return wrappedRequest;
}
