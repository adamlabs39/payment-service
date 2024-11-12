export default class CantProcessDataException extends Error {
    constructor(message) {
        super(message);
        this.name = "CantProcessDataException";
        this.message = message;
    }
}