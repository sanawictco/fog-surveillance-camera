import moment from 'jalali-moment';

export class Guard {
  /**
   * Checks if value is empty. Accepts strings, numbers, booleans, objects and arrays.
   */
  static isEmpty(value: unknown): boolean {
    if (typeof value === 'number' || typeof value === 'boolean') {
      return false;
    }
    if (typeof value === 'undefined' || value === null) {
      return true;
    }
    if (value instanceof Date) {
      return false;
    }
    if (value instanceof Object && !Object.keys(value).length) {
      return true;
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return true;
      }
      if (value.every((item) => Guard.isEmpty(item))) {
        return true;
      }
    }
    if (value === '') {
      return true;
    }

    return false;
  }

  static isUUIDv4(value: string): boolean {
    const regex =
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

    return regex.test(value);
  }

  static isUTC(value: Date): boolean {
    return moment(value).isValid();
  }

  static isUnix(value: number): boolean {
    return moment(value).isValid();
  }

  /**
   * Checks length range of a provided number/string/array
   */
  static isBetween(
    value: number | string | Array<unknown>,
    min: number,
    max: number,
  ): boolean {
    if (typeof value !== 'string' && Guard.isEmpty(value)) {
      return false;
    }
    const valueLength = typeof value === 'number' ? value : value.length;
    if (valueLength >= min && valueLength <= max) {
      return true;
    }
    return false;
  }

  static isUpperCase(value: string) {
    return value === value.toUpperCase();
  }
  static isNumber(value: number): boolean {
    return typeof value === 'number';
  }
  static isInt(value: number) {
    return (
      this.isBetween(value, -2_147_483_648, 2_147_483_647) && value % 1 === 0
    );
  }

  static isUrl(value: string) {
    return !!value.match(
      /(http(s)?:\/\/.)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{2,256}\.[a-z]{2,6}\b([-a-zA-Z0-9@:%_\+.~#?&//=]*)/g,
    );
  }

  static isUInt(value: number) {
    return this.isBetween(value, 0, 4_294_967_295) && value % 1 === 0;
  }

  static isNaN(value: number) {
    return Number.isNaN(value);
  }

  static isUShortInt(value: number) {
    return this.isBetween(value, 0, 65535) && value % 1 === 0;
  }

  static isColorCode(colorCode: string) {
    const hexColorPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/;
    return hexColorPattern.test(colorCode);
  }

  static isMacAddress(macAddress: string) {
    if (!macAddress || typeof macAddress !== 'string') {
      return false;
    }
    const cleanMac = macAddress.trim().toUpperCase();
    const patterns = [
      // Colon-separated: 00:1B:44:11:3A:B7
      /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/,
      // Hyphen-separated: 00-1B-44-11-3A-B7
      /^([0-9A-F]{2}-){5}[0-9A-F]{2}$/,
      // Dot-separated (Cisco format): 001B.4411.3AB7
      /^[0-9A-F]{4}\.[0-9A-F]{4}\.[0-9A-F]{4}$/,
      // No separators: 001B44113AB7
      /^[0-9A-F]{12}$/,
    ];
    return patterns.some((pattern) => pattern.test(cleanMac));
  }

  static isPort(value: number) {
    return this.isBetween(value, 100, 655354) && value % 1 === 0;
  }
}
