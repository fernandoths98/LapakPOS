export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, "not_found", `${what} not found`);
export const badRequest = (message: string) => new AppError(400, "bad_request", message);
export const unauthorized = (message = "Unauthorized") => new AppError(401, "unauthorized", message);
export const forbidden = (message = "Forbidden") => new AppError(403, "forbidden", message);
