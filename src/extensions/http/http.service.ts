import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosError, AxiosInstance, AxiosResponse } from 'axios';
import axiosRetry from 'axios-retry';
import { HttpRequestConfig } from './dtos/httpRequestConfig.interface';
import { HttpResponse } from './dtos/httpResponse.interface';

@Injectable()
export class HttpService {
  private readonly axios: AxiosInstance;
  private readonly logger = new Logger(HttpService.name);
  private readonly NETWORK_ERROR_CODES = [
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNABORTED',
    'ETIMEDOUT',
  ];

  constructor() {
    this.axios = axios.create();
    this._setupRetry();
    this._setupInterceptors();
  }

  private _setupRetry(): void {
    axiosRetry(this.axios, {
      retries: 3,
      retryDelay: (retryCount) => retryCount * 3000,
      retryCondition: (error: AxiosError) => {
        // Skip retry if explicitly disabled
        const config = error.config as HttpRequestConfig;
        if (config?.skipRetry) {
          return false;
        }

        // Retry on network errors and 5xx server errors
        return (
          axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          (error.response !== undefined &&
            error.response.status >= 500 &&
            error.response.status < 600)
        );
      },
      onRetry: (retryCount, _error, requestConfig) => {
        this.logger.warn(
          `Retry attempt ${retryCount} for ${requestConfig.method?.toUpperCase()} ${requestConfig.url}`,
        );
      },
    });
  }

  private _setupInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        const requestConfig = config as HttpRequestConfig;
        this.logger.debug(
          `Outgoing request: ${config.method?.toUpperCase()} ${requestConfig.sensitive ? requestConfig.safeLogUrl : config.url}`,
        );
        return config;
      },
      (error: unknown) => {
        const err = error instanceof Error ? error : new Error(String(error));
        this.logger.error('Request error:', err.message);
        return Promise.reject(err);
      },
    );

    // Response interceptor
    this.axios.interceptors.response.use(
      (response) => {
        const requestConfig = response.config as HttpRequestConfig;
        this.logger.debug(
          `Response received: ${response.status} from ${requestConfig.sensitive ? requestConfig.safeLogUrl : response.config.url}`,
        );
        return response;
      },
      (error: unknown) => {
        const handledError = this._handleError(error);
        const requestConfig = (error as AxiosError).config as
          HttpRequestConfig | undefined;
        this.logger.error('Response error:', {
          message: handledError.message,
          url: requestConfig?.sensitive
            ? requestConfig.safeLogUrl
            : requestConfig?.url,
        });
        return Promise.reject(handledError);
      },
    );
  }

  private _handleError(error: unknown): Error {
    // Ensure error is an AxiosError
    if (!this._isAxiosError(error)) {
      return error instanceof Error ? error : new Error(String(error));
    }

    if (error.response) {
      // Server responded with error status
      const message = `HTTP ${error.response.status}: ${error.response.statusText}`;
      const err = new Error(message, { cause: error });
      // Attach additional context. `response`/`code` are preserved (superset of
      // the raw AxiosError) so callers that read err.response?.status/.data
      // (e.g. getFogConfigFromCloud) or err.code keep working unchanged.
      Object.assign(err, {
        statusCode: error.response.status,
        url: error.config?.url,
        data: error.response.data,
        code: error.code,
        response: error.response,
      });
      return err;
    }

    if (error.request) {
      // Request made but no response received (network error / timeout).
      const err = new Error(`No response received: ${error.message}`, {
        cause: error,
      });
      // Preserve `code` (ECONNREFUSED/ETIMEDOUT/…) so network-code detection
      // (e.g. isUrlAccessible) still classifies unreachable hosts correctly.
      Object.assign(err, {
        url: error.config?.url,
        code: error.code,
        request: error.request,
      });
      return err;
    }

    // Error in request configuration
    const err = new Error(`Request setup error: ${error.message}`, {
      cause: error,
    });
    Object.assign(err, { code: error.code });
    return err;
  }
  private _isAxiosError(error: unknown): error is AxiosError {
    // Use axios's own type guard. The previous hand-rolled check read
    // `_isAxiosError` (which axios never sets — the flag is `isAxiosError`),
    // so it always returned false and the enrichment above was dead code.
    return axios.isAxiosError(error);
  }

  async get<T = any>(
    url: string,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse<T>> {
    const response = await this.axios.get<T>(url, config);
    return this.formatResponse(response);
  }

  async post<T = any, D = any>(
    url: string,
    data?: D,
    config?: HttpRequestConfig<D>,
  ): Promise<HttpResponse<T>> {
    const response = await this.axios.post<T>(url, data, config);
    return this.formatResponse(response);
  }

  async put<T = any, D = any>(
    url: string,
    data?: D,
    config?: HttpRequestConfig<D>,
  ): Promise<HttpResponse<T>> {
    const response = await this.axios.put<T>(url, data, config);
    return this.formatResponse(response);
  }

  async patch<T = any, D = any>(
    url: string,
    data?: D,
    config?: HttpRequestConfig<D>,
  ): Promise<HttpResponse<T>> {
    const response = await this.axios.patch<T>(url, data, config);
    return this.formatResponse(response);
  }

  async delete<T = any>(
    url: string,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse<T>> {
    const response = await this.axios.delete<T>(url, config);
    return this.formatResponse(response);
  }

  async request<T = any>(config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const response = await this.axios.request<T>(config);
    return this.formatResponse(response);
  }

  private formatResponse<T>(response: AxiosResponse<T>): HttpResponse<T> {
    return {
      data: response.data,
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    };
  }

  getAxiosInstance(): AxiosInstance {
    return this.axios;
  }

  async head<T = any>(
    url: string,
    config?: HttpRequestConfig,
  ): Promise<HttpResponse<T>> {
    const response = await this.axios.head<T>(url, config);
    return this.formatResponse(response);
  }

  async isUrlAccessible(url: string, timeoutMs = 5000): Promise<boolean> {
    try {
      new URL(url);
    } catch {
      this.logger.warn(`Malformed URL: ${url}`);
      return false;
    }

    try {
      await this.head(url, {
        timeout: timeoutMs,
        skipRetry: true,
      });
      return true;
    } catch (error: any) {
      const code = error?.cause?.code ?? error?.code;

      if (this.NETWORK_ERROR_CODES.includes(code)) {
        this.logger.warn(`URL is not reachable [${code}]: ${url}`);
        return false;
      }

      // 4xx/5xx → host is up, just rejected the HEAD — still accessible
      return true;
    }
  }
}
