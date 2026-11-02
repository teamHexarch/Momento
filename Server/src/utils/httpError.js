// Throw one of these from a route and the error handler turns it into { error } with that status
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
