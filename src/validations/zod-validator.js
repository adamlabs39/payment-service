export default class ZodValidator {
  static validate(schema, objectValidate) {
    return schema.parse(objectValidate);
  }
}
