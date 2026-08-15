export class ObjectExtension {
  static isObjectEmpty(obj: object): boolean {
    const record = obj as Record<string, unknown>;
    Object.keys(record).forEach((key) => {
      if (record[key] === undefined) {
        delete record[key];
      }
    });
    return !Object.keys(record).length;
  }
}
