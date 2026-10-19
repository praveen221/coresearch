export class ConflictError extends Error {
  constructor(subject: string) { super(`The ${subject} changed after it was loaded.`); }
}

export class NotFoundError extends Error {}
