export default class BadRequestException extends Error {
  constructor(message) {
    super(message);
    this.message = message;
    this.status = 400;
    this.errors = [
      {
        type: "Bad Request",
        message: message,
      }
    ];
  }
}
