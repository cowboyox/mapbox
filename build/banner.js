import fs from 'fs';

const version = JSON.parse(fs.readFileSync('package.json')).version;
export default `/* Mapbox GL JS is Copyright © 2020 Mapbox and subject to the Mapbox service terms.*/`;
