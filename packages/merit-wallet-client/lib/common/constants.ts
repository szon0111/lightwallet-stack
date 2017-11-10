export const Constants = {

  SCRIPT_TYPES: {
    P2SH: 'P2SH',
    P2PKH: 'P2PKH',
  },
  
  DERIVATION_STRATEGIES: {
    BIP44: 'BIP44',
    BIP45: 'BIP45',
    BIP48: 'BIP48',
  },

  PATHS: {
    REQUEST_KEY: "m/1'/0",
    TXPROPOSAL_KEY: "m/1'/1",
    REQUEST_KEY_AUTH: "m/2", // relative to BASE
  },

  BIP45_SHARED_INDEX: 0x80000000 - 1,

  UNITS: {
    mrt: {
      toMicros: 100000000,
      full: {
        maxDecimals: 8,
        minDecimals: 8,
      },
      short: {
        maxDecimals: 6,
        minDecimals: 2,
      }
    },
    bit: {
      toMicros: 100,
      full: {
        maxDecimals: 2,
        minDecimals: 2,
      },
      short: {
        maxDecimals: 0,
        minDecimals: 0,
      }
    },
  },
};
