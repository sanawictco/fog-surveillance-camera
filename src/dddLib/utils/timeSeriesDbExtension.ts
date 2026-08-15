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
    superTableName = this.toValidSuperOrSubTableName(superTableName);

    let tableDefinitionStr = '(';
    for (let i = 0; i < columnNames.length; i++) {
      let columnName = columnNames[i]!;
      columnName = columnName.replaceAll('-', '_');
      tableDefinitionStr += `${columnName} ${columnDataTypes[i]},`;
    }
    tableDefinitionStr = tableDefinitionStr.slice(0, -1);
    tableDefinitionStr += ')';

    const createSuperTableSqlCommand = `CREATE STABLE IF NOT EXISTS ${superTableName} ${tableDefinitionStr} TAGS (groupId VARCHAR(${tagSize}));`;
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
      if (typeof data[i] === 'string') valuesInsertFormat += ` '${data[i]}',`;
      else valuesInsertFormat += ` ${data[i]},`;
    }
    valuesInsertFormat = valuesInsertFormat.slice(0, -1);
    return valuesInsertFormat;
  }

  private static toValidSuperOrSubTableName(superTableName: string): string {
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
      let { start, end } = timeRangeInUnix;
      const UTC_DIFF_IN_MILI_SECONDS = 3.5 * 60 * 60 * 1000;
      start = start + UTC_DIFF_IN_MILI_SECONDS;
      end = end + UTC_DIFF_IN_MILI_SECONDS;
      const fromDateTime = new Date(start)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
      const toDateTime = new Date(end)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
      sqlQuery += `WHERE (createdAt BETWEEN "${fromDateTime}" AND "${toDateTime}") `;
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
      let { start, end } = timeRangeInUnix;
      const UTC_DIFF_IN_MILI_SECONDS = 3.5 * 60 * 60 * 1000;
      start = start + UTC_DIFF_IN_MILI_SECONDS;
      end = end + UTC_DIFF_IN_MILI_SECONDS;
      const fromDateTime = new Date(start)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
      const toDateTime = new Date(end)
        .toISOString()
        .replace('T', ' ')
        .replace('Z', '');
      queryCommand += ` WHERE createdAt BETWEEN "${fromDateTime}" AND "${toDateTime}"`;
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
