export default class CantProcessDataException extends Error {
  constructor(message) {
    super(message);
    this.message = message;
    this.code = 422;
    this.errors = [
      {
        type: 'Unprocessable Entity',
        message,
      },
    ];
  }
}
