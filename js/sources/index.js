// Registry of available data sources.
// To add a source (e.g. the ISS), create ./iss.js following the contract
// described in ./solarWind.js and add it to this list.

import solarWind from './solarWind.js';

export const sources = [solarWind];
