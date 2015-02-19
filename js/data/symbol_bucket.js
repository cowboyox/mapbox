'use strict';

var ElementGroups = require('./element_groups');
var Anchor = require('../symbol/anchor');
var interpolate = require('../symbol/interpolate');
var Point = require('point-geometry');
var resolveTokens = require('../util/token');
var Placement = require('../symbol/placement');
var Shaping = require('../symbol/shaping');
var resolveText = require('../symbol/resolve_text');
var resolveIcons = require('../symbol/resolve_icons');
var mergeLines = require('../symbol/mergelines');

var PlacementFeature = require('../placement/placement_feature');
var PlacementLayer = require('../placement/placement_layer');

module.exports = SymbolBucket;

var fullRange = [2 * Math.PI, 0];

function SymbolBucket(buffers, layoutProperties, collision) {
    this.buffers = buffers;
    this.layoutProperties = layoutProperties;
    this.collision = collision;

    this.placementLayer = new PlacementLayer();
    this.placementFeatures = [];

}

SymbolBucket.prototype.addFeatures = function() {
    var layoutProperties = this.layoutProperties;
    var features = this.features;
    var textFeatures = this.textFeatures;

    var horizontalAlign = 0.5,
        verticalAlign = 0.5;

    switch (layoutProperties['text-anchor']) {
        case 'right':
        case 'top-right':
        case 'bottom-right':
            horizontalAlign = 1;
            break;
        case 'left':
        case 'top-left':
        case 'bottom-left':
            horizontalAlign = 0;
            break;
    }

    switch (layoutProperties['text-anchor']) {
        case 'bottom':
        case 'bottom-right':
        case 'bottom-left':
            verticalAlign = 1;
            break;
        case 'top':
        case 'top-right':
        case 'top-left':
            verticalAlign = 0;
            break;
    }

    var justify = 0.5;
    if (layoutProperties['text-justify'] === 'right') justify = 1;
    else if (layoutProperties['text-justify'] === 'left') justify = 0;

    var oneEm = 24;
    var lineHeight = layoutProperties['text-line-height'] * oneEm;
    var maxWidth = layoutProperties['symbol-placement'] !== 'line' && layoutProperties['text-max-width'] * oneEm;
    var spacing = layoutProperties['text-letter-spacing'] * oneEm;
    var fontstack = layoutProperties['text-font'];
    var textOffset = [layoutProperties['text-offset'][0] * oneEm, layoutProperties['text-offset'][1] * oneEm];

    var geometries = [],
        k;

    for (k = 0; k < features.length; k++) {
        geometries.push(features[k].loadGeometry());
    }

    if (layoutProperties['symbol-placement'] === 'line') {
        var merged = mergeLines(features, textFeatures, geometries);

        geometries = merged.geometries;
        features = merged.features;
        textFeatures = merged.textFeatures;
    }

    for (k = 0; k < features.length; k++) {
        if (!geometries[k]) continue;

        var shaping = false;
        if (textFeatures[k]) {
            shaping = Shaping.shape(textFeatures[k], fontstack, this.stacks, maxWidth,
                    lineHeight, horizontalAlign, verticalAlign, justify, spacing, textOffset);
        }

        var image = false;
        if (this.icons && layoutProperties['icon-image']) {
            image = this.icons[resolveTokens(features[k].properties, layoutProperties['icon-image'])];

            if (image) {
                if (typeof this.sdfIcons === 'undefined') {
                    this.sdfIcons = image.sdf;
                } else if (this.sdfIcons !== image.sdf) {
                    console.warn('Style sheet warning: Cannot mix SDF and non-SDF icons in one bucket');
                }
            }
        }

        if (!shaping && !image) continue;
        this.addFeature(geometries[k], this.stacks, shaping, image);
    }

    this.placeFeatures(this.buffers);
};

SymbolBucket.prototype.addToDebugBuffers = function() {

    this.elementGroups.placementBox = new ElementGroups(this.buffers.placementBoxVertex);
    this.elementGroups.placementBox.makeRoomFor(0);

    var cos = Math.cos(-this.collision.placement.angle);
    var sin = Math.sin(-this.collision.placement.angle);

    for (var j = 0; j < this.placementLayer.features.length; j++) {
        var feature = this.placementLayer.features[j];
        var boxes = feature.boxes;

        for (var b = 0; b < boxes.length; b++) {
            var box = boxes[b];
            var tl = { x: box.x1 * cos - box.y1 * sin, y: box.x1 * sin + box.y1 * cos };
            var tr = { x: box.x2 * cos - box.y1 * sin, y: box.x2 * sin + box.y1 * cos };
            var br = { x: box.x2 * cos - box.y2 * sin, y: box.x2 * sin + box.y2 * cos };
            var bl = { x: box.x1 * cos - box.y2 * sin, y: box.x1 * sin + box.y2 * cos };

            var maxZoom = this.collision.zoom + Math.log(box.maxScale) / Math.LN2;
            var placementZoom = this.collision.zoom + Math.log(box.placementScale) / Math.LN2;
            maxZoom = Math.max(0, Math.min(24, maxZoom));
            placementZoom = Math.max(0, Math.min(24, placementZoom));

            this.buffers.placementBoxVertex.add(box, tl, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, tr, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, tr, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, br, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, br, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, bl, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, bl, maxZoom, placementZoom);
            this.buffers.placementBoxVertex.add(box, tl, maxZoom, placementZoom);

            this.elementGroups.placementBox.current.vertexLength += 8;
        }
    }
};

function byScale(a, b) {
    return a.scale - b.scale;
}

SymbolBucket.prototype.addFeature = function(lines, faces, shaping, image) {
    var layoutProperties = this.layoutProperties;
    var collision = this.collision;

    var minScale = 0.5;
    var glyphSize = 24;

    var horizontalText = layoutProperties['text-rotation-alignment'] === 'viewport',
        //horizontalIcon = layoutProperties['icon-rotation-alignment'] === 'viewport',
        fontScale = layoutProperties['text-max-size'] / glyphSize,
        textBoxScale = collision.tilePixelRatio * fontScale,
        iconBoxScale = collision.tilePixelRatio * layoutProperties['icon-max-size'],
        avoidEdges = layoutProperties['symbol-avoid-edges'];

    for (var i = 0; i < lines.length; i++) {

        var line = lines[i];

        var iconInterpolationOffset = 0;
        var textInterpolationOffset = 0;
        var labelLength = 0;
        if (shaping) {
            var minX = Infinity;
            var maxX = -Infinity;
            for (var g = 0; g < shaping.length; g++) {
                minX = Math.min(minX, shaping[g].x);
                maxX = Math.max(maxX, shaping[g].x);
            }
            labelLength = maxX - minX;
            textInterpolationOffset = (labelLength / 2 + glyphSize * 2) * fontScale;
        }

        var anchors;

        if (layoutProperties['symbol-placement'] === 'line') {


            // Line labels
            anchors = interpolate(line, layoutProperties['symbol-min-distance'],
                    minScale, collision.maxPlacementScale, collision.tilePixelRatio,
                    Math.max(textInterpolationOffset, iconInterpolationOffset));

            // Sort anchors by segment so that we can start placement with the
            // anchors that can be shown at the lowest zoom levels.
            anchors.sort(byScale);

        } else {
            // Point labels
            anchors = [new Anchor(line[0].x, line[0].y, 0, minScale)];
        }


        // TODO: figure out correct ascender height.
        var origin = new Point(0, -17);

        for (var j = 0, len = anchors.length; j < len; j++) {
            var anchor = anchors[j];
            var inside = !(anchor.x < 0 || anchor.x > 4096 || anchor.y < 0 || anchor.y > 4096);

            if (avoidEdges && !inside) continue;

            // Calculate the scales at which the text and icons can be first shown without overlap
            var iconPlacementFeature;
            var textPlacementFeature;

            var pair = [];
            if (shaping) {
                var top = shaping.top * textBoxScale;
                var bottom = shaping.bottom * textBoxScale;
                var right = shaping.right * textBoxScale;
                var left = shaping.left * textBoxScale;

                textPlacementFeature = new PlacementFeature(line, anchor, left, right, top, bottom, layoutProperties['symbol-placement'] === 'line');
                textPlacementFeature.glyph = Placement.getGlyphs(anchor, origin, shaping, faces, textBoxScale, horizontalText, line, layoutProperties);
                this.placementLayer.addFeature(textPlacementFeature);
                pair[0] = textPlacementFeature;
            }

            if (image) {
                var icon = Placement.getIcon(anchor, image, iconBoxScale, line, layoutProperties);
                var box = icon.boxes[0].box;
                iconPlacementFeature = new PlacementFeature(line, anchor, box.x1, box.x2, box.y1, box.y2, layoutProperties['symbol-placement'] === 'line');
                iconPlacementFeature.icon = icon;
                this.placementLayer.addFeature(iconPlacementFeature);
                pair[1] = iconPlacementFeature;
            }

            pair[2] = inside;

            this.placementFeatures.push(pair);
        }
    }
};

SymbolBucket.prototype.placeFeatures = function(buffers) {

    this.buffers = buffers;

    this.elementGroups = {
        text: new ElementGroups(buffers.glyphVertex),
        icon: new ElementGroups(buffers.iconVertex),
        sdfIcons: this.sdfIcons
    };

    var layoutProperties = this.layoutProperties;
    var collision = this.collision;

    for (var p = 0; p < this.placementFeatures.length; p++) {
        var pair = this.placementFeatures[p];
        var text = pair[0];
        var icon = pair[1];
        var inside = pair[2];

        var iconWithoutText = layoutProperties['text-optional'] || !text,
            textWithoutIcon = layoutProperties['icon-optional'] || !icon;

        var glyphScale = null;
        var iconScale = null;

        if (text) {

            if (layoutProperties['text-allow-overlap']) {
                glyphScale = 0.25;
            } else {
                glyphScale = collision.placement.placeFeature(text);
            }

            if (!glyphScale && !iconWithoutText) continue;
        }

        if (icon) {
            if (layoutProperties['icon-allow-overlap']) {
                iconScale = 0.25;
            } else {
                iconScale = collision.placement.placeFeature(icon);
            }
            if (!iconScale && !textWithoutIcon) continue;
        }

        if (!iconWithoutText && !textWithoutIcon) {
            iconScale = glyphScale = Math.max(iconScale, glyphScale);
        } else if (!textWithoutIcon && glyphScale) {
            glyphScale = Math.max(iconScale, glyphScale);
        } else if (!iconWithoutText && iconScale) {
            iconScale = Math.max(iconScale, glyphScale);
        }

        var glyphRange = fullRange;
        var iconRange = fullRange;

        // Insert final placement into collision tree and add glyphs/icons to buffers
        if (glyphScale) {
            if (!layoutProperties['text-ignore-placement']) {
                collision.placement.insertFeature(text, glyphScale);
            }
            var glyph = text.glyph;
            if (inside) this.addSymbols(this.buffers.glyphVertex, this.elementGroups.text, glyph.shapes, glyphScale, glyphRange);
        }

        if (iconScale) {
            if (!layoutProperties['icon-ignore-placement']) {
                collision.placement.insertFeature(icon, iconScale);
            }
            if (inside) this.addSymbols(this.buffers.iconVertex, this.elementGroups.icon, icon.icon.shapes, iconScale, iconRange);
        }

    }

    this.addToDebugBuffers();
};

SymbolBucket.prototype.addSymbols = function(buffer, elementGroups, symbols, scale, placementRange) {

    var zoom = this.collision.zoom;

    elementGroups.makeRoomFor(0);
    var elementGroup = elementGroups.current;

    var placementZoom = Math.log(scale) / Math.LN2 + zoom;

    for (var k = 0; k < symbols.length; k++) {

        var symbol = symbols[k],
            tl = symbol.tl,
            tr = symbol.tr,
            bl = symbol.bl,
            br = symbol.br,
            tex = symbol.tex,
            angle = symbol.angle,
            anchor = symbol.anchor,


            minZoom = Math.max(zoom + Math.log(symbol.minScale) / Math.LN2, placementZoom),
            maxZoom = Math.min(zoom + Math.log(symbol.maxScale) / Math.LN2, 25);

        if (maxZoom <= minZoom) continue;

        // Lower min zoom so that while fading out the label it can be shown outside of collision-free zoom levels
        if (minZoom === placementZoom) minZoom = 0;

        // first triangle
        buffer.add(anchor.x, anchor.y, tl.x, tl.y, tex.x, tex.y, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, tr.x, tr.y, tex.x + tex.w, tex.y, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, bl.x, bl.y, tex.x, tex.y + tex.h, angle, minZoom, placementRange, maxZoom, placementZoom);

        // second triangle
        buffer.add(anchor.x, anchor.y, tr.x, tr.y, tex.x + tex.w, tex.y, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, bl.x, bl.y, tex.x, tex.y + tex.h, angle, minZoom, placementRange, maxZoom, placementZoom);
        buffer.add(anchor.x, anchor.y, br.x, br.y, tex.x + tex.w, tex.y + tex.h, angle, minZoom, placementRange, maxZoom, placementZoom);

        elementGroup.vertexLength += 6;
    }

};

SymbolBucket.prototype.getDependencies = function(tile, actor, callback) {
    var firstdone = false;
    this.getTextDependencies(tile, actor, done);
    this.getIconDependencies(tile, actor, done);
    function done(err) {
        if (err || firstdone) callback(err);
        firstdone = true;
    }
};

SymbolBucket.prototype.getIconDependencies = function(tile, actor, callback) {
    if (this.layoutProperties['icon-image']) {
        var features = this.features;
        var layoutProperties = this.layoutProperties;
        var icons = resolveIcons(features, layoutProperties);

        if (icons.length) {
            actor.send('get icons', {
                id: tile.id,
                icons: icons
            }, function(err, newicons) {
                if (err) return callback(err);
                this.icons = newicons;
                callback();
            }.bind(this));
        } else {
            callback();
        }
    } else {
        callback();
    }
};

SymbolBucket.prototype.getTextDependencies = function(tile, actor, callback) {
    var features = this.features;
    var layoutProperties = this.layoutProperties;

    if (tile.stacks === undefined) tile.stacks = {};
    var stacks = this.stacks = tile.stacks;
    var fontstack = layoutProperties['text-font'];
    if (stacks[fontstack] === undefined) {
        stacks[fontstack] = { glyphs: {}, rects: {} };
    }
    var stack = stacks[fontstack];

    var data = resolveText(features, layoutProperties, stack.glyphs);
    this.textFeatures = data.textFeatures;

    actor.send('get glyphs', {
        id: tile.id,
        fontstack: fontstack,
        codepoints: data.codepoints
    }, function(err, newstack) {
        if (err) return callback(err);

        var newglyphs = newstack.glyphs;
        var newrects = newstack.rects;
        var glyphs = stack.glyphs;
        var rects = stack.rects;

        for (var codepoint in newglyphs) {
            glyphs[codepoint] = newglyphs[codepoint];
            rects[codepoint] = newrects[codepoint];
        }

        callback();
    });
};
