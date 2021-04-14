// @flow

import StencilMode from '../gl/stencil_mode';
import DepthMode from '../gl/depth_mode';
import CullFaceMode from '../gl/cull_face_mode';
import Tile from '../source/tile';
import {
    backgroundUniformValues,
    backgroundPatternUniformValues
} from './program/background_program';
import {OverscaledTileID} from '../source/tile_id';

import type Painter from './painter';
import type SourceCache from '../source/source_cache';
import type BackgroundStyleLayer from '../style/style_layer/background_style_layer';

export default drawBackground;

function drawBackground(painter: Painter, sourceCache: SourceCache, layer: BackgroundStyleLayer, coords: Array<OverscaledTileID>) {
    const color = layer.paint.get('background-color');
    const opacity = layer.paint.get('background-opacity');

    if (opacity === 0) return;

    const context = painter.context;
    const gl = context.gl;
    const transform = painter.transform;
    const tileSize = transform.tileSize;
    const image = layer.paint.get('background-pattern');
    if (painter.isPatternMissing(image)) return;

    const pass = (!image && color.a === 1 && opacity === 1 && painter.opaquePassEnabledForLayer()) ? 'opaque' : 'translucent';
    if (painter.renderPass !== pass) return;

    const stencilMode = StencilMode.disabled;
    const depthMode = painter.depthModeForSublayer(0, pass === 'opaque' ? DepthMode.ReadWrite : DepthMode.ReadOnly);
    const colorMode = painter.colorModeForRenderPass();

    const program = painter.useProgram(image ? 'backgroundPattern' : 'background');

    const tileIDs = coords ? coords : transform.coveringTiles({tileSize});

    if (image) {
        context.activeTexture.set(gl.TEXTURE0);
        painter.imageManager.bind(painter.context);
    }

    const crossfade = layer.getCrossfadeParameters();
    for (const tileID of tileIDs) {
        const matrix = coords ? tileID.posMatrix : painter.transform.calculatePosMatrix(tileID.toUnwrapped());
        painter.prepareDrawTile(tileID);

        const tile = new Tile(tileID);
        tile.makeRasterBoundsArray(context, painter.transform);

        const uniformValues = image ?
            backgroundPatternUniformValues(matrix, opacity, painter, image, {tileID, tileSize}, crossfade) :
            backgroundUniformValues(matrix, opacity, color);

        program.draw(context, gl.TRIANGLES, depthMode, stencilMode, colorMode, CullFaceMode.disabled,
            uniformValues, layer.id, tile.rasterBoundsBuffer,
                tile.rasterBoundsIndexBuffer, tile.rasterBoundsSegments);
    }
}
