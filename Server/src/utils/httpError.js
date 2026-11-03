// Throw one of these from a route and the error handler turns it into { error } with that status.
// `code` (optional) is a short word the pages can act on, such as 'unverified'.
export class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
