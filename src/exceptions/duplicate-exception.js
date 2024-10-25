export default class DuplicateException extends Error{
  constructor(message) {
    super(message);
    this.message = message;
    this.code = 409;
    this.errors = [
      {
        type: "conflict",
        message: message,
      }
    ];
  }
}
