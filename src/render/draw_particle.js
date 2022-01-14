// @flow

import StencilMode from '../gl/stencil_mode.js';
import DepthMode from '../gl/depth_mode.js';
import CullFaceMode from '../gl/cull_face_mode.js';
import Program from './program.js';
import {particleUniformValues, particleDefinesValues} from './program/particle_program.js';
import SegmentVector from '../data/segment.js';
import {OverscaledTileID} from '../source/tile_id.js';
import ColorMode from '../gl/color_mode.js';
import ImageSource, { globalTexture } from '../source/image_source.js';
import { globalSystem } from '../data/particle_system.js';

import type Painter from './painter.js';
import type SourceCache from '../source/source_cache.js';
import type CircleStyleLayer from '../style/style_layer/circle_style_layer.js';
import type ParticleBucket from '../data/bucket/particle_bucket.js';
import type ProgramConfiguration from '../data/program_configuration.js';
import type VertexBuffer from '../gl/vertex_buffer.js';
import type IndexBuffer from '../gl/index_buffer.js';
import type {UniformValues} from './uniform_binding.js';
import type {ParticleUniformsType} from './program/particle_program.js';
import type Tile from '../source/tile.js';
import type {DynamicDefinesType} from './program/program_uniforms.js';

export default drawParticles;

type TileRenderState = {
    programConfiguration: ProgramConfiguration,
    program: Program<*>,
    layoutVertexBuffer: VertexBuffer,
    indexBuffer: IndexBuffer,
    uniformValues: UniformValues<ParticleUniformsType>,
    tile: Tile
};

type SegmentsTileRenderState = {
    segments: SegmentVector,
    sortKey: number,
    state: TileRenderState
};

function drawParticles(painter: Painter, sourceCache: SourceCache, layer: CircleStyleLayer, coords: Array<OverscaledTileID>) {
    if (painter.renderPass !== 'translucent') return;

    const opacity = layer.paint.get('particle-opacity');
    const strokeWidth = layer.paint.get('particle-stroke-width');
    const strokeOpacity = layer.paint.get('particle-stroke-opacity');
    const sortFeaturesByKey = layer.layout.get('particle-sort-key').constantOr(1) !== undefined;

    if (opacity.constantOr(1) === 0 && (strokeWidth.constantOr(1) === 0 || strokeOpacity.constantOr(1) === 0)) {
        return;
    }

    const context = painter.context;
    const gl = context.gl;

    const depthMode = painter.depthModeForSublayer(0, DepthMode.ReadOnly);
    // Turn off stencil testing to allow circles to be drawn across boundaries,
    // so that large circles are not clipped to tiles
    const gradientMode = true;
    const stencilMode = StencilMode.disabled;
    const colorMode = gradientMode ? ColorMode.additiveBlended : painter.colorModeForRenderPass();

    //const segmentsRenderStates: Array<SegmentsTileRenderState> = [];

    for (let i = 0; i < coords.length; i++) {
        const coord = coords[i];

        const tile = sourceCache.getTile(coord);
        const bucket: ?ParticleBucket<*> = (tile.getBucket(layer): any);
        if (!bucket) continue;
        
        for (const feature of bucket.features) {
            globalSystem.addEmitter(undefined, feature.point, feature.tileId, feature.mercatorPoint);
        }

        globalSystem.update();

        const programConfiguration = bucket.programConfigurations.get(layer.id);
        const definesValues = particleDefinesValues(layer);
        if (gradientMode) {
            definesValues.push("PARTICLE_GRADIENT");
        }
        const program = painter.useProgram('particle', programConfiguration, ((definesValues: any): DynamicDefinesType[]));
        const layoutVertexBuffer = bucket.layoutVertexBuffer;
        const indexBuffer = bucket.indexBuffer;


        /*
        if (sortFeaturesByKey) {
            const oldSegments = bucket.segments.get();
            for (const segment of oldSegments) {
                segmentsRenderStates.push({
                    segments: new SegmentVector([segment]),
                    sortKey: ((segment.sortKey: any): number),
                    state
                });
            }
        } else {
            segmentsRenderStates.push({
                segments: bucket.segments,
                sortKey: 0,
                state
            });
        }
        */

        for (var emitter of globalSystem.emitters) {
            if (!emitter.tileId.equals(bucket.tileId)) {
                continue;
            }
            for (var particle of emitter.particles) {
                
                const uniformValues = particleUniformValues(painter, coord, tile, layer, 
                    emitter.location.x + emitter.zoom * particle.locationOffset.x, 
                    emitter.location.y + emitter.zoom * particle.locationOffset.y, 
                    emitter.elevation,
                    particle.opacity,
                    particle.scale,
                    particle.color);
                const segments = bucket.segments;
        
                const isGlobeProjection = painter.transform.projection.name === 'globe';
                const terrainOptions = {useDepthForOcclusion: !isGlobeProjection};

                if (painter.terrain) painter.terrain.setupElevationDraw(tile, program, terrainOptions);
        
                painter.prepareDrawProgram(context, program, tile.tileID.toUnwrapped());

                if (globalTexture) {
                    context.activeTexture.set(gl.TEXTURE0);
                    globalTexture.bind(gl.LINEAR, gl.CLAMP_TO_EDGE);
                }
        
                program.draw(context, gl.TRIANGLES, depthMode, stencilMode, colorMode, CullFaceMode.disabled,
                    uniformValues, layer.id,
                    layoutVertexBuffer, indexBuffer, segments,
                    layer.paint, painter.transform.zoom, programConfiguration);

            }
        }

    }

    /*
    if (sortFeaturesByKey) {
        segmentsRenderStates.sort((a, b) => a.sortKey - b.sortKey);
    }
    */

    //const isGlobeProjection = painter.transform.projection.name === 'globe';
    //const terrainOptions = {useDepthForOcclusion: !isGlobeProjection};

    //console.log(segmentsRenderStates);

    //const isGlobeProjection = painter.transform.projection.name === 'globe';
    //const terrainOptions = {useDepthForOcclusion: !isGlobeProjection};


    /*
    for (const segmentsState of segmentsRenderStates) {
        const {programConfiguration, program, layoutVertexBuffer, indexBuffer, uniformValues, tile} = segmentsState.state;
        const segments = segmentsState.segments;

        if (painter.terrain) painter.terrain.setupElevationDraw(tile, program, terrainOptions);

        painter.prepareDrawProgram(context, program, tile.tileID.toUnwrapped());

        program.draw(context, gl.TRIANGLES, depthMode, stencilMode, ColorMode.alphaBlended, CullFaceMode.disabled,
            uniformValues, layer.id,
            layoutVertexBuffer, indexBuffer, segments,
            layer.paint, painter.transform.zoom, programConfiguration);
    }
    */
}
