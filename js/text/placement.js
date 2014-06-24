'use strict';

var interpolate = require('../geometry/interpolate.js'),
    Anchor = require('../geometry/anchor.js'),
    Point = require('../geometry/point.js'),
    Collision = require('./collision.js');

module.exports = Placement;

function Placement(zoom, tileSize) {
    this.zoom = zoom;
    this.collision = new Collision();
    this.tileSize = tileSize;
    this.zOffset = Math.log(256/this.tileSize) / Math.LN2;
    this.tileExtent = 4096;
    this.glyphSize = 24; // size in pixels of this glyphs in the tile

    // Calculate the maximum scale we can go down in our fake-3d rtree so that
    // placement still makes sense. This is calculated so that the minimum
    // placement zoom can be at most 25.5 (we use an unsigned integer x10 to
    // store the minimum zoom).
    //
    // We don't want to place labels all the way to 25.5. This lets too many
    // glyphs be placed, slowing down collision checking. Only place labels if
    // they will show up within the intended zoom range of the tile.
    // TODO make this not hardcoded to 3
    this.maxPlacementScale = Math.exp(Math.LN2 * Math.min((25.5 - this.zoom), 3));
}

var minScale = 0.5; // underscale by 1 zoom level

function byScale(a, b) {
    return a.scale - b.scale;
}

Placement.prototype.addFeature = function(line, info, faces, shaping, bucket) {

    var horizontal = info['text-path'] === 'horizontal',
        padding = info['text-padding'] || 2,
        maxAngleDelta = info['text-max-angle'] || Math.PI,
        textMinDistance = info['text-min-distance'] || 250,
        rotate = info['text-rotate'] || 0,
        slant = info['text-slant'],
        fontScale = (this.tileExtent / this.tileSize) / (this.glyphSize / info['text-max-size']),

        anchors;

    // TODO: figure out correct ascender height.
    var origin = new Point(0, -17);

    // Point labels
    if (line.length === 1) {
        anchors = [new Anchor(line[0].x, line[0].y, 0, minScale)];

    // Line labels
    } else {
        anchors = interpolate(line, textMinDistance, minScale);

        // Sort anchors by segment so that we can start placement with the
        // anchors that can be shown at the lowest zoom levels.
        anchors.sort(byScale);
    }

    for (var j = 0, len = anchors.length; j < len; j++) {
        var anchor = anchors[j];
        var glyphs = getGlyphs(anchor, origin, shaping, faces, fontScale, horizontal, line, maxAngleDelta, rotate, slant);
        var place = this.collision.place(
                glyphs.boxes, anchor, anchor.scale, this.maxPlacementScale, padding,
                horizontal, info['text-allow-overlap'], info['text-ignore-placement']);

        if (place) {
            bucket.addGlyphs(glyphs.glyphs, place.zoom, place.rotationRange, this.zoom - this.zOffset);
        }
    }
};

function getGlyphs(anchor, origin, shaping, faces, fontScale, horizontal, line, maxAngleDelta, rotate, slant) {
    // The total text advance is the width of this label.


    // TODO: allow setting an alignment
    // var alignment = 'center';
    // if (alignment == 'center') {
    //     origin.x -= advance / 2;
    // } else if (alignment == 'right') {
    //     origin.x -= advance;
    // }

    var glyphs = [],
        boxes = [];

    var buffer = 3;

    for (var k = 0; k < shaping.length; k++) {
        var shape = shaping[k];
        var fontstack = faces[shape.fontstack];
        var glyph = fontstack.glyphs[shape.glyph];
        var rect = fontstack.rects[shape.glyph];

        if (!glyph) continue;

        if (!(rect && rect.w > 0 && rect.h > 0)) continue;

        var x = (origin.x + shape.x + glyph.left - buffer + rect.w / 2) * fontScale;

        var glyphInstances;
        if (anchor.segment !== undefined) {
            glyphInstances = [];
            getSegmentGlyphs(glyphInstances, anchor, x, line, anchor.segment, 1, maxAngleDelta);
            getSegmentGlyphs(glyphInstances, anchor, x, line, anchor.segment, -1, maxAngleDelta);

        } else {
            glyphInstances = [{
                anchor: anchor,
                offset: 0,
                angle: 0,
                maxScale: Infinity,
                minScale: minScale
            }];
        }

        var x1 = origin.x + shape.x + glyph.left - buffer,
            y1 = origin.y + shape.y - glyph.top - buffer,
            x2 = x1 + rect.w,
            y2 = y1 + rect.h,

            otl = new Point(x1, y1),
            otr = new Point(x2, y1),
            obl = new Point(x1, y2),
            obr = new Point(x2, y2);

        if (slant) {
            otl.x -= otl.y * slant;
            otr.x -= otr.y * slant;
            obl.x -= obl.y * slant;
            obr.x -= obr.y * slant;
        }

        var obox = {
                x1: fontScale * x1,
                y1: fontScale * y1,
                x2: fontScale * x2,
                y2: fontScale * y2
            };

        for (var i = 0; i < glyphInstances.length; i++) {

            var instance = glyphInstances[i],

                tl = otl,
                tr = otr,
                bl = obl,
                br = obr,
                box = obox,

                // Clamp to -90/+90 degrees
                angle = instance.angle + rotate;

            if (angle) {
                // Compute the transformation matrix.
                var sin = Math.sin(angle),
                    cos = Math.cos(angle),
                    matrix = [cos, -sin, sin, cos];

                tl = tl.matMult(matrix);
                tr = tr.matMult(matrix);
                bl = bl.matMult(matrix);
                br = br.matMult(matrix);
            }

            // Prevent label from extending past the end of the line
            var glyphMinScale = Math.max(instance.minScale, anchor.scale);

            // Remember the glyph for later insertion.
            glyphs.push({
                tl: tl,
                tr: tr,
                bl: bl,
                br: br,
                tex: rect,
                angle: (anchor.angle + rotate + instance.offset + 2 * Math.PI) % (2 * Math.PI),
                anchor: instance.anchor,
                minScale: glyphMinScale,
                maxScale: instance.maxScale
            });

            if (!instance.offset) { // not a flipped glyph
                if (angle) {
                    // Calculate the rotated glyph's bounding box offsets from the anchor point.
                    box = {
                        x1: fontScale * Math.min(tl.x, tr.x, bl.x, br.x),
                        y1: fontScale * Math.min(tl.y, tr.y, bl.y, br.y),
                        x2: fontScale * Math.max(tl.x, tr.x, bl.x, br.x),
                        y2: fontScale * Math.max(tl.y, tr.y, bl.y, br.y)
                    };
                }
                boxes.push({
                    box: box,
                    anchor: instance.anchor,
                    minScale: glyphMinScale,
                    maxScale: instance.maxScale
                });
            }
        }
    }

    return {
        glyphs: glyphs,
        boxes: boxes
    };
}

function getSegmentGlyphs(glyphs, anchor, offset, line, segment, direction, maxAngleDelta) {
    var upsideDown = direction < 0;

    if (offset < 0)  direction *= -1;

    if (direction > 0) segment++;

    var newAnchor = anchor;
    var end = line[segment];
    var prevscale = Infinity;
    var prevAngle;

    offset = Math.abs(offset);

    var placementScale = anchor.scale;

    segment_loop:
    while (true) {
        var dist = newAnchor.dist(end);
        var scale = offset/dist;
        var angle = -Math.atan2(end.x - newAnchor.x, end.y - newAnchor.y) + direction * Math.PI / 2;
        if (upsideDown) angle += Math.PI;

        // Don't place around sharp corners
        var angleDiff = (angle - prevAngle) % (2 * Math.PI);
        if (prevAngle && Math.abs(angleDiff) > maxAngleDelta) {
            anchor.scale = prevscale;
            break;
        }

        glyphs.push({
            anchor: newAnchor,
            offset: upsideDown ? Math.PI : 0,
            minScale: scale,
            maxScale: prevscale,
            angle: (angle + 2 * Math.PI) % (2 * Math.PI)
        });

        if (scale <= placementScale) break;

        newAnchor = end;

        // skip duplicate nodes
        while (newAnchor.equals(end)) {
            segment += direction;
            end = line[segment];

            if (!end) {
                anchor.scale = scale;
                break segment_loop;
            }
        }

        var unit = end.sub(newAnchor)._unit();
        newAnchor = newAnchor.sub(unit._mult(dist));

        prevscale = scale;
        prevAngle = angle;
    }
}
