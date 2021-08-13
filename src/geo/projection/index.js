// @flow
import LngLat from '../lng_lat.js';
import globe from './globe.js';
import mercator from './mercator.js';
import { OverscaledTileID, CanonicalTileID } from '../../source/tile_id.js';
import { Aabb } from '../../util/primitives.js';
import Transform from '../transform.js';
import { FreeCamera } from '../../ui/free_camera.js';



// 2D: tileMatrix = projMatrix * posMatrix
// Globe: tileMatrix = projMatrix * globeMatrix * decode

// tileMatrix: calculatePosMatrix
// tileRenderMatrix: calulcatePosMatrix with possible decode

export type TileTransform = {

    createTileMatrix: (id: UnwrappedTileID) => Float64Array,

    createRenderTileMatrix: (id: UnwrappedTileID) => Float64Array,

    createLabelPlaneMatrix: (id: UnwrappedTileID) => Float64Array,

    tileAabb: (id: UnwrappedTileID, z: number, min: number, max: number) => Aabb,
};

export type Projection = {
    name: string,
    project: (lng: number, lat: number) => {x: number, y: number, z: number},
    //unproject: (x: number, y: number) => LngLat

    requiresDraping: boolean,
    supportsWorldCopies: boolean,
    supportsWorldCopies: boolean,
    zAxisUnit: "meters" | "pixels",

    pixelsPerMeter: (lat: number, worldSize: number) => Number,

    createTileTransform: (tr: Transform, worldSize: number) => TileTransform,

    cullTile: (aabb: Aabb, id: CanonicalTileID, camera: FreeCamera) => boolean,
};

const projections = {
    globe,
    mercator
};

export default function getProjection(name: string) {
    return projections[name];
}