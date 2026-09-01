export class ObjectExtension {
  static isObjectEmpty(obj: Record<string, unknown>): boolean {
    Object.keys(obj).forEach((key) => {
      if (obj[key] === undefined) {
        delete obj[key];
      }
    });
    return !Object.keys(obj).length;
  }
}
