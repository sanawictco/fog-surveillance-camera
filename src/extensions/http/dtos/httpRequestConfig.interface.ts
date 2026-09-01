import { AxiosRequestConfig } from 'axios';

export interface HttpRequestConfig<D = any> extends AxiosRequestConfig<D> {
  // Extends all Axios options + custom ones
  skipRetry?: boolean; // Custom option to skip retry for specific requests
  sensitive?: boolean;
  safeLogUrl?: string;
}
