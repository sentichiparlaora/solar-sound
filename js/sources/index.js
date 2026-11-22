// Registry of available data sources.
// To add a source, create a module following the contract described in
// ./solarWind.js and add it to this list.

import solarWind from './solarWind.js';
import iss from './iss.js';

export const sources = [solarWind, iss];
