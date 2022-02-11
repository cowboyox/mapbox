// @flow
import LngLat from '../lng_lat.js';
import {clamp, degToRad, radToDeg} from '../../util/util.js';
import {MAX_MERCATOR_LATITUDE} from '../mercator_coordinate.js';
import Projection from './projection.js';

import type {ProjectionSpecification} from '../../style-spec/types.js';
import type {ProjectedPoint} from './projection.js';

const halfPi = Math.PI / 2;

function tany(y) {
    return Math.tan((halfPi + y) / 2);
}

// based on https://github.com/d3/d3-geo, MIT-licensed
export default class LambertConformalConic extends Projection {
    n: number;
    f: number;

    constructor(options: ProjectionSpecification) {
        super(options);
        this.center = options.center || [0, 30];
        const [lat0, lat1] = this.parallels = options.parallels || [30, 30];

        const y0 = degToRad(lat0);
        const y1 = degToRad(lat1);
        const cy0 = Math.cos(y0);
        this.n = y0 === y1 ? Math.sin(y0) : Math.log(cy0 / Math.cos(y1)) / Math.log(tany(y1) / tany(y0));
        this.f = cy0 * Math.pow(tany(y0), this.n) / this.n;
    }

    project(lng: number, lat: number): ProjectedPoint {
        lat = degToRad(lat);
        lng = degToRad(lng - this.center[0]);

        const epsilon = 1e-6;
        const {n, f} = this;

        if (f > 0) {
            if (lat < -halfPi + epsilon) lat = -halfPi + epsilon;
        } else {
            if (lat > halfPi - epsilon) lat = halfPi - epsilon;
        }

        const r = f / Math.pow(tany(lat), n);
        const x = r * Math.sin(n * lng);
        const y = f - r * Math.cos(n * lng);

        return {
            x: (x / Math.PI + 0.5) * 0.5,
            y: 1 - (y / Math.PI + 0.5) * 0.5,
            z: 0
        };
    }

    unproject(x: number, y: number): LngLat {
        x = (2 * x - 0.5) * Math.PI;
        y = (2 * (1 - y) - 0.5) * Math.PI;
        const {n, f} = this;
        const fy = f - y;
        const signFy = Math.sign(fy);
        const r = Math.sign(n) * Math.sqrt(x * x + fy * fy);
        let l = Math.atan2(x, Math.abs(fy)) * signFy;

        if (fy * n < 0) l -= Math.PI * Math.sign(x) * signFy;

        const lng = clamp(radToDeg(l / n) + this.center[0], -180, 180);
        const phi = 2 * Math.atan(Math.pow(f / r, 1 / n)) - halfPi;
        const lat = clamp(radToDeg(phi), -MAX_MERCATOR_LATITUDE, MAX_MERCATOR_LATITUDE);

        return new LngLat(lng, lat);
    }
}
