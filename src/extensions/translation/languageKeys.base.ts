export type LanguageKeysBase = OtherLanguageKeys;

export const LanguageKeys: LanguageKeysBase = {
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: 'others.erroResponse.badRequest.wrongPassword',
        accessDenied: 'others.erroResponse.badRequest.accessDenied',
        invalidInput: 'others.erroResponse.badRequest.invalidInput',
        invalidRequest: 'others.erroResponse.badRequest.invalidRequest',
        invalidCmdStructures:
          'others.erroResponse.badRequest.invalidCmdStructures',
      },
    },
    geo: {
      lat: 'others.geo.lat',
      lng: 'others.geo.lng',
      alt: 'others.geo.alt',
    },
    time: 'others.time',
    true: 'others.true',
    false: 'others.false',
    internalServerError: 'others.internalServerError',
  },
};

type OtherLanguageKeys = {
  others: {
    erroResponse: {
      badRequest: {
        wrongPassword: string;
        accessDenied: string;
        invalidInput: string;
        invalidRequest: string;
        invalidCmdStructures: string;
      };
    };
    geo: {
      lat: string;
      lng: string;
      alt: string;
    };
    time: string;
    true: string;
    false: string;
    internalServerError: string;
  };
};
