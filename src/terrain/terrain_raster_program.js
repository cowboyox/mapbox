// @flow

import {
    Uniform1i,
    Uniform1f,
    UniformMatrix4f
} from '../render/uniform_binding';

import type Context from '../gl/context';
import type {UniformValues, UniformLocations} from '../render/uniform_binding';

export type TerrainRasterUniformsType = {|
    'u_matrix': UniformMatrix4f,
    'u_image0': Uniform1i,
    'u_skirt_height': Uniform1f
|};

export type TerrainHeightUniformsType = {|
    'u_matrix': UniformMatrix4f
|};

const terrainRasterUniforms = (context: Context, locations: UniformLocations): TerrainRasterUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix),
    'u_image0': new Uniform1i(context, locations.u_image0),
    'u_skirt_height': new Uniform1f(context, locations.u_skirt_height)
});

const terrainHeightUniforms = (context: Context, locations: UniformLocations): TerrainHeightUniformsType => ({
    'u_matrix': new UniformMatrix4f(context, locations.u_matrix)
});

const terrainRasterUniformValues = (
    matrix: Float32Array,
    skirtHeight: number
): UniformValues<TerrainRasterUniformsType> => ({
    'u_matrix': matrix,
    'u_image0': 0,
    'u_skirt_height': skirtHeight
});

const terrainHeightUniformValues = (
    matrix: Float32Array
): UniformValues<TerrainHeightUniformsType> => ({
    'u_matrix': matrix
});

export {terrainRasterUniforms, terrainRasterUniformValues, terrainHeightUniforms, terrainHeightUniformValues};
