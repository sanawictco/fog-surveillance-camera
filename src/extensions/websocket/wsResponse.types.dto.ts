export type Exact<MAIN_TYPE, GENERIC_TYPE> = MAIN_TYPE extends GENERIC_TYPE
  ? GENERIC_TYPE extends MAIN_TYPE
    ? MAIN_TYPE
    : never
  : never;

export type WsRespnoseTypes = {};
