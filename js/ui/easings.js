'use strict';

var util = require('../util/util.js');

util.extend(exports, {
    stop: function () {
        // redefined when animation starts
        return this;
    },

    panBy: function(x, y, duration) {
        var map = this;
        this.stop();
        this.stop = util.timed(function(t) {
            map.transform.panBy(
                Math.round(x * (1 - t)),
                Math.round(y * (1 - t)));
            map._updateStyle();
            map.update();
        }, duration || 500) || this.stop;
    },

    panTo: function(lat, lon, duration) {
        this.stop();

        if (typeof duration === 'undefined' || duration == 'default') {
            duration = 500;
        }

        var map = this,
            tr = this.transform,
            fromY = tr.latY(tr.lat),
            fromX = tr.lonX(tr.lon),
            toY = tr.latY(lat),
            toX = tr.lonX(lon);

        this.stop = util.timed(function(t) {
            map.transform.lon = tr.xLon(util.interp(fromX, toX, util.ease(t)));
            map.transform.lat = tr.yLat(util.interp(fromY, toY, util.ease(t)));
            map.fire('pan');
            map.update();

            if (t === 1) {
                map.fire('move');
            }
        }, duration) || this.stop;
    },

    // Zooms to a certain zoom level with easing.
    zoomTo: function(zoom, duration, center) {
        this.stop();

        if (typeof duration === 'undefined' || duration == 'default') {
            duration = 500;
        }

        if (typeof center === 'undefined') {
            var rect = this.container.getBoundingClientRect();
            center = { x: rect.width / 2, y: rect.height / 2 };
        }

        var easing = this._updateEasing(duration, zoom);

        var map = this,
            from = this.transform.scale,
            to = Math.pow(2, zoom);

        this.stop = util.timed(function(t) {
            var scale = util.interp(from, to, easing(t));
            map.transform.zoomAroundTo(scale, center);
            map.fire('zoom', [{ scale: scale }]);
            map.style.animationLoop.set(300); // text fading
            map._updateStyle();
            map.update();

            if (t === 1) {
                map.fire('move');
                delete map.ease;
            }
        }, duration) || this.stop;
    },

    scaleTo: function(scale, duration, center) {
        this.zoomTo(Math.log(scale) / Math.LN2, duration, center);
    },

    resetNorth: function() {
        var map = this;
        var center = map.transform.centerPoint;
        var start = map.transform.angle;
        map.rotating = true;
        util.timed(function(t) {
            map.setAngle(center, util.interp(start, 0, util.ease(t)));
            if (t === 1) {
                map.rotating = false;
            }
        }, 1000);
        map.setAngle(center, 0);
    },

    _updateEasing: function(duration, zoom) {
        var easing;

        if (this.ease) {
            var ease = this.ease,
                t = (Date.now() - ease.start) / ease.duration,
                speed = ease.easing(t + 0.01) - ease.easing(t),

                // Quick hack to make new bezier that is continuous with last
                x = 0.27 / Math.sqrt(speed * speed + 0.0001) * 0.01,
                y = Math.sqrt(0.27 * 0.27 - x * x);

            easing = util.bezier(x, y, 0.25, 1);
        } else {
            easing = util.ease;
        }

        // store information on current easing
        this.ease = {
            start: (new Date()).getTime(),
            to: Math.pow(2, zoom),
            duration: duration,
            easing: easing
        };

        return easing;
    }
});
