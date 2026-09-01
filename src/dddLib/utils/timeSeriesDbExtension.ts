import AppConfig from 'configs/app.config';
import {
  CountDataParams,
  CreateSubTableParams,
  CreateSuperTableParams,
  FindDataParams,
} from '../infra/timeseriesRepository.base';
// eslint-disable-next-line @typescript-eslint/no-require-imports
export class TimeSeriesDbExtension {
  static createSuperTableQuery(
    params: CreateSuperTableParams,
    tagSize = 36,
  ): string {
    let { superTableName } = params;
    const { columnDataTypes, columnNames } = params;
    if (columnNames.length !== columnDataTypes.length) {
      throw new Error('column names and data types must have the same length');
    }
    superTableName = this.toValidSuperOrSubTableName(superTableName);

    let tableDefinitionStr = '(';
    for (let i = 0; i < columnNames.length; i++) {
      let columnName = columnNames[i]!;

      columnName = columnName.replaceAll('-', '_');
      tableDefinitionStr += `${columnName} ${columnDataTypes[i]},`;
    }
    tableDefinitionStr = tableDefinitionStr.slice(0, -1);
    tableDefinitionStr += ')';

    const tags = params.tags ?? [
      { name: 'groupId', dataType: `VARCHAR(${tagSize})` },
    ];
    const tagDefinition = tags
      .map(
        (tag) => `${this.toValidSuperOrSubTableName(tag.name)} ${tag.dataType}`,
      )
      .join(',');
    const createSuperTableSqlCommand = `CREATE STABLE IF NOT EXISTS ${superTableName} ${tableDefinitionStr} TAGS (${tagDefinition});`;
    return createSuperTableSqlCommand;
  }

  static createSubTableQuery(params: CreateSubTableParams): string {
    let { superTableName } = params;
    const { subTableName } = params;
    superTableName = this.toValidSuperOrSubTableName(superTableName);
    const sqlCommand =
      'CREATE TABLE IF NOT EXISTS `' +
      `${subTableName}` +
      '`' +
      ` USING ${superTableName} TAGS ("${subTableName}");`;
    return sqlCommand;
  }

  static getSuperTableAndSubTableInsertFormat(
    superTableName: string,
    subTableName?: string,
  ): { superTableInsertFormat: string; subTableInsertFormat: string } {
    superTableName = this.toValidSuperOrSubTableName(superTableName);
    return {
      superTableInsertFormat: `${AppConfig().timeseriesDb.dbName}.${superTableName}`,
      subTableInsertFormat: subTableName
        ? `${AppConfig().timeseriesDb.dbName}.` + '`' + `${subTableName}` + '`'
        : `${AppConfig().timeseriesDb.dbName}`,
    };
  }

  static getValuesInsertFormat(data: (number | string)[]): string {
    let valuesInsertFormat: string = '';
    for (let i = 0; i < data.length; i++) {
      if (typeof data[i] === 'string') {
        valuesInsertFormat += ` ${this.quoteStringLiteral(data[i] as string)},`;
      } else valuesInsertFormat += ` ${data[i]},`;
    }
    valuesInsertFormat = valuesInsertFormat.slice(0, -1);
    return valuesInsertFormat;
  }

  /**
   * Escapes a value into a safe TDengine SQL string literal. The only central
   * place allowed to turn caller data into a quoted SQL fragment; every filter
   * and value must pass through it instead of raw template interpolation.
   */
  static quoteStringLiteral(value: string): string {
    const escaped = value.replaceAll('\\', '\\\\').replaceAll("'", "''");
    return `'${escaped}'`;
  }

  /**
   * Formats a unix-millisecond time range as UTC epoch bounds. Timestamps are
   * stored and compared as numeric UTC epoch milliseconds; no local-timezone
   * adjustment is applied anywhere in the time-series layer.
   */
  private static toUtcTimeRangeBounds(timeRangeInUnix: {
    start: number;
    end: number;
  }): { start: number; end: number } {
    const { start, end } = timeRangeInUnix;
    if (
      !Number.isFinite(start) ||
      !Number.isFinite(end) ||
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end)
    ) {
      throw new Error(
        'time range bounds must be finite unix millisecond integers',
      );
    }
    if (start > end) throw new Error('time range start must not exceed end');
    return { start, end };
  }

  private static toValidSuperOrSubTableName(superTableName: string): string {
    superTableName = superTableName;
    superTableName = superTableName.replaceAll('-', '_');
    return superTableName;
  }

  private static formatizedSelectedColumns(
    selectedColumns: string[] | string = '*',
  ): string {
    let selectedColumnsSqlFormat = '';
    if (Array.isArray(selectedColumns) && selectedColumns.length !== 0) {
      let strCols = '';
      for (const column of selectedColumns) {
        strCols += ` ${this.toValidSuperOrSubTableName(column)},`;
      }
      selectedColumnsSqlFormat += strCols.slice(0, -1);
    } else selectedColumnsSqlFormat += '*';
    return selectedColumnsSqlFormat;
  }

  static createFindAllQuery(
    params: FindDataParams & { page?: number; limit?: number },
  ): string {
    const {
      subTableName,
      selectedColumns,
      orderBy,
      timeRangeInUnix,
      page,
      limit,
      filter,
    } = params;
    let { superTableName } = params;
    const formatizedSelectedColumns =
      TimeSeriesDbExtension.formatizedSelectedColumns(selectedColumns);
    const { dbName } = AppConfig().timeseriesDb;

    let sqlQuery;
    if (superTableName !== undefined) {
      superTableName = this.toValidSuperOrSubTableName(superTableName);
      sqlQuery =
        `SELECT ${formatizedSelectedColumns} FROM ` +
        `${dbName}.${superTableName} `;
    } else {
      sqlQuery =
        `SELECT ${formatizedSelectedColumns} FROM ` +
        '`' +
        `${subTableName}` +
        '` ';
    }
    if (timeRangeInUnix) {
      const { start, end } =
        TimeSeriesDbExtension.toUtcTimeRangeBounds(timeRangeInUnix);
      sqlQuery += `WHERE (createdAt BETWEEN ${start} AND ${end}) `;
    }

    if (filter) {
      if (timeRangeInUnix) {
        sqlQuery += ` AND (${filter})`;
      } else {
        sqlQuery += ' WHERE ' + filter;
      }
    }

    if (orderBy) {
      sqlQuery += ` ORDER BY ${orderBy.column} ${orderBy.status} `;
    }

    if (limit) {
      sqlQuery += ` LIMIT ${limit}`;
    }

    if (page && limit) sqlQuery += ` OFFSET ${(page - 1) * limit}`;

    return `${sqlQuery};`;
  }

  static createCountQuery(params: CountDataParams): string {
    const { filter } = params;
    let { superTableName } = params;
    const { dbName } = AppConfig().timeseriesDb;
    const { subTableName, timeRangeInUnix } = params;
    let queryCommand;
    if (superTableName) {
      superTableName = this.toValidSuperOrSubTableName(superTableName);
      queryCommand = `SELECT COUNT(*) FROM ` + `${dbName}.${superTableName}`;
    } else if (subTableName) {
      queryCommand = `SELECT COUNT(*) FROM ` + '`' + `${subTableName}` + '`';
    }
    if (timeRangeInUnix) {
      const { start, end } =
        TimeSeriesDbExtension.toUtcTimeRangeBounds(timeRangeInUnix);
      queryCommand += ` WHERE createdAt BETWEEN ${start} AND ${end}`;
    }
    if (filter) {
      if (timeRangeInUnix) {
        queryCommand += ` AND (${filter})`;
      } else {
        queryCommand += ' WHERE ' + filter;
      }
    }
    return queryCommand + ';';
  }
}
