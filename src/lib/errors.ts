// Raised when an update was based on data another writer (chat, CLI, or another tab) has since changed.
export class ConflictError extends Error {
  constructor(subject: string) { super(`The ${subject} changed after it was loaded.`); }
}

export class NotFoundError extends Error {}
