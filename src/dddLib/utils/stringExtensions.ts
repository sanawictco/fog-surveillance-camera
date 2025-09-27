export class StringExtensions {
  static formatWithParams(pattern: string, params: unknown[]) {
    let formattedString = pattern;
    params.forEach((param, index) => {
      formattedString = formattedString.replace(`{${index}}`, String(param));
    });
    return formattedString;
  }

  static joinNumbersWithSign(numbers: number[], sign: string): string {
    return numbers.join(sign);
  }
}
