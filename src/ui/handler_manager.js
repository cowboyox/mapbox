// @flow

import {MapMouseEvent, MapTouchEvent, MapWheelEvent} from '../ui/events';
import {Event} from '../util/evented';
import DOM from '../util/dom';
import browser from '../util/browser';
import type Map from './map';
import Handler from './handler/handler';
import { TouchPanHandler, TouchZoomHandler, TouchRotateHandler, TouchPitchHandler } from './handler/touch';
import KeyboardHandler from './handler/keyboard';
import {bezier, extend} from '../util/util';

const defaultInertiaOptions = {
    linearity: 0.15,
    easing: bezier(0, 0, 0.15, 1),
    deceleration: 3,
    maxSpeed: 1.5
};
export type InertiaOptions = typeof defaultInertiaOptions;

export type InputEvent = MouseEvent | TouchEvent | KeyboardEvent | WheelEvent;

class HandlerManager {
  _map: Map;
  _el: HTMLElement;
  _handlers: Array<[string, Handler]>;
  _disableDuring: Object;
  _inertiaOptions: InertiaOptions;
  _inertiaBuffer: Array<[number, Object]>;
  _eventsInProgress: Object;
  touchPan: TouchPanHandler;
  touchZoom: TouchZoomHandler;
  touchRotate: TouchRotateHandler;
  touchPitch: TouchPitchHandler;

  /**
   * @private
   * options.inertiaOptions - linearity, easing, duration, maxSpeed
   */
  constructor(map: Map, options?: Object) {
    this._map = map;
    this._el = this._map.getCanvasContainer();
    this._handlers = [];
    this._disableDuring = {};
    this._inertiaOptions = options.inertiaOptions || defaultInertiaOptions;
    this._inertiaBuffer = [];

    // Track whether map is currently moving, to compute start/move/end events
    this._eventsInProgress = {
      zoom: false,
      rotate: false,
      pitch: false,
      drag: false
    };


    this._addDefaultHandlers();

    // Bind touchstart and touchmove with passive: false because, even though
    // they only fire a map events and therefore could theoretically be
    // passive, binding with passive: true causes iOS not to respect
    // e.preventDefault() in _other_ handlers, even if they are non-passive
    // (see https://bugs.webkit.org/show_bug.cgi?id=184251)
    this.addTouchListener('touchstart', {passive: false});
    this.addTouchListener('touchmove', {passive: false});
    this.addTouchListener('touchend');
    this.addTouchListener('touchcancel');

    this.addMouseListener('mousedown');
    this.addMouseListener('mousemove');
    this.addMouseListener('mouseup');
    this.addMouseListener('mouseover');
    this.addMouseListener('mouseout');

    this.addKeyboardListener('keydown');
    this.addKeyboardListener('keyup');
  }

  _addDefaultHandlers() {
    this.add('touchRotate', new TouchRotateHandler(this._map), ['touchPitch']);
    this.add('touchPitch', new TouchPitchHandler(this._map), ['touchRotate', 'touchPan']);
    this.add('touchZoom', new TouchZoomHandler(this._map), ['touchPitch']);
    this.add('touchPan', new TouchPanHandler(this._map), ['touchPitch']);
    this.add('keyboard', new KeyboardHandler(this._map), ['touchPan', 'touchPitch', 'touchRotate', 'touchZoom']);
  }

  list() {
    return this._handlers.map(([name, handler]) => name);
  }

  get length() {
    return this._handlers.length;
  }

  add(handlerName: string, handler: Handler, disableDuring: Array<string>) {
    if (!handlerName || !(/^[a-z]+[a-zA-Z]*$/.test(handlerName))) throw new Error('Must provide a valid handlerName string');
    if (!handler || !(handler instanceof Handler)) throw new Error('Must provide a valid Handler instance');

    if (this[handlerName]) throw new Error(`Cannot add ${handlerName}: a handler with that name already exists`);
    for (const [existingName, existingHandler] of this._handlers) {
      if (existingHandler === handler) throw new Error(`Cannot add ${handler} as ${handlerName}: handler already exists as ${existingName}`);
    }
    this._handlers.push([handlerName, handler]);
    this[handlerName] = handler;

    if (disableDuring) {
      this._disableDuring[handlerName] = disableDuring;
    }
  }

  remove(handlerName: string) {
    if (!handlerName || typeof handlerName !== 'string') throw new Error('Must provide a valid handlerName string');
    if (!this[handlerName]) throw new Error(`Handler ${handlerName} not found`);
    const newHandlers = this._handlers.filter(([existingName, existingHandler]) => {
      if (existingName === handlerName) {
        delete this[handlerName];
        return false;
      }
      return true;
    });
    this._handlers = newHandlers;
  }

  removeAll() {
    for (const [handlerName, _] of this._handlers) this.remove(handlerName);
  }

  disableAll() {
    for (const [_, handler] of this._handlers) handler.disable();
  }

  enableAll() {
    for (const [_, handler] of this._handlers) handler.enable();
  }

  addListener(eventType: string, mapEventClass?: Class<MapMouseEvent | MapTouchEvent | MapWheelEvent>, options?: Object) {
    const listener = (e: *) => {
      if (mapEventClass) this._map.fire(new mapEventClass(eventType, this._map, e));
      this.processInputEvent(e);
    };
    DOM.addEventListener(this._el, eventType, listener, options);
  }

  addTouchListener(eventType: string, options?: Object) {
    this.addListener(eventType, MapTouchEvent, options);
  }

  addMouseListener(eventType: string, options?: Object) {
    this.addListener(eventType, MapMouseEvent, options);
  }

  addKeyboardListener(eventType: string, options?: Object) {
    this.addListener(eventType, null, extend({capture: false}, options)); // No such thing as MapKeyboardEvent to fire
  }


  processInputEvent(e: InputEvent) {
    if (e.cancelable && (e instanceof MouseEvent ? e.type === 'mousemove' : true)) e.preventDefault();
    let transformSettings;
    let activeHandlers = [];
    let preUpdateEvents = [];
    let postUpdateEvents = [];

    for (const [name, handler] of this._handlers) {
      if (!handler.isEnabled()) continue;
      let data = handler.processInputEvent(e);
      if (!data) continue;

      if (this._disableDuring[name]) {
        const conflicts = this._disableDuring[name].filter(otherHandler => activeHandlers.indexOf(otherHandler) > -1);
        if (conflicts.length > 0) {
          // A handler that was active but is now overridden should still be able to return end events to fire
          if (data.events) {
            data.events.filter(e => e.endsWith('end') && postUpdateEvents.indexOf(e) < 0).map(e => postUpdateEvents.push(e));
          }
          handler.reset(e);
          continue;
        }
      }

      // "Discrete" handlers (e.g. keyboard) should return easeTo options
      if (data.easeTo) {
        // Discrete handlers cannot compete; the first handler to match wins
        return this._map.easeTo(data.easeTo, { originalEvent: e });
      }

      // "Continuous" handlers (e.g. touchPan) should return transform settings and/or events to fire
      if (data.transform) {
        const merged = data.transform
        if (!!transformSettings) extend(merged, transformSettings)
        transformSettings = merged;
      }

      if (data.events) {
        for (const event of data.events) {
          if (event.endsWith('start')) {
            if (preUpdateEvents.indexOf(event) < 0) preUpdateEvents.push(event);
          } else if (postUpdateEvents.indexOf(event) < 0) {
            postUpdateEvents.push(event);
          }
        }
      }
      activeHandlers.push(name);
    }

    if (preUpdateEvents.length > 0) this.fireMapEvents(preUpdateEvents, e); // movestart events
    if (transformSettings) this.updateMapTransform(transformSettings);
    if (postUpdateEvents.length > 0) this.fireMapEvents(postUpdateEvents, e); // move and moveend events
  }

  updateMapTransform(settings: Object) {
    this._map.stop();
    const tr = this._map.transform;
    this._drainInertiaBuffer();
    this._inertiaBuffer.push([browser.now(), settings]);

    let { zoomDelta, bearingDelta, pitchDelta, setLocationAtPoint } = settings;
    if (zoomDelta) tr.zoom += zoomDelta;
    if (bearingDelta) tr.bearing += bearingDelta;
    if (pitchDelta) tr.pitch += pitchDelta;
    if (setLocationAtPoint && setLocationAtPoint.length === 2) {
      let [loc, pt] = setLocationAtPoint;
      tr.setLocationAtPoint(loc, pt);
    }
    this._map._update();
  }

  _drainInertiaBuffer() {
      const inertia = this._inertiaBuffer,
          now = browser.now(),
          cutoff = 160;   //msec

      while (inertia.length > 0 && now - inertia[0][0] > cutoff)
          inertia.shift();
  }

  get _moving() {
    for (const e of ['zoom', 'rotate', 'pitch', 'drag']) { if (this._eventsInProgress[e]) return true; }
    return false;
  }

  _clampSpeed(speed: number) {
    const { maxSpeed } = this._inertiaOptions;
    if (Math.abs(speed) > maxSpeed) {
        if (speed > 0) {
            return maxSpeed;
        } else {
            return -maxSpeed;
        }
    } else {
      return speed;
    }
  }

  _onMoveEnd(originalEvent: *) {
    this._drainInertiaBuffer();
    if (this._inertiaBuffer.length < 2) {
      this._map.fire(new Event('moveend', { originalEvent }));
      return;
    }

    const {linearity, easing, maxSpeed, deceleration} = this._inertiaOptions;

    let deltas = {
      zoom: 0,
      bearing: 0,
      pitch: 0
    };
    let firstPoint, lastPoint;
    for (const [time, settings] of this._inertiaBuffer) {
      deltas.zoom += settings.zoomDelta || 0;
      deltas.bearing += settings.bearingDelta || 0;
      deltas.pitch += settings.pitchDelta || 0;
      if (settings.setLocationAtPoint) {
        if (!firstPoint) firstPoint = settings.setLocationAtPoint[1];
        lastPoint = settings.setLocationAtPoint[1];
      }
    };

    const lastEntry = this._inertiaBuffer[this._inertiaBuffer.length - 1];
    const duration = (lastEntry[0] - this._inertiaBuffer[0][0]) / 1000;

    const easeOptions = {};

    // calculate speeds and adjust for increased initial animation speed when easing

    if (firstPoint && lastPoint) {

      let panOffset = lastPoint.sub(firstPoint);
      const velocity = panOffset.mult(linearity / duration);
      let panSpeed = velocity.mag(); // px/s

      if (panSpeed > (maxSpeed * 1000)) {
        panSpeed = maxSpeed * 1000;
        velocity._unit()._mult(panSpeed);
      }

      const panEaseDuration = (panSpeed / (deceleration * 1000 * linearity));
      easeOptions.easeDuration = Math.max(easeOptions.easeDuration || 0, panEaseDuration);
      easeOptions.offset = velocity.mult(panEaseDuration / 2);
      easeOptions.center = this._map.transform.center;
    }

    if (deltas.zoom) {
      let zoomSpeed = this._clampSpeed((deltas.zoom * linearity) / duration);
      const zoomEaseDuration = Math.abs(zoomSpeed / (deceleration * linearity)) * 1000;
      const targetZoom = (this._map.transform.zoom) + zoomSpeed * zoomEaseDuration / 2000;
      easeOptions.easeDuration = Math.max(easeOptions.easeDuration || 0, zoomEaseDuration);
      easeOptions.zoom = targetZoom;
    }

    if (deltas.bearing) {
      let bearingSpeed = this._clampSpeed((deltas.bearing * linearity) / duration);
      const bearingEaseDuration = Math.abs(bearingSpeed / (deceleration * linearity)) * 1000;
      const targetBearing = (this._map.transform.bearing) + bearingSpeed * bearingEaseDuration / 2000;
      easeOptions.easeDuration = Math.max(easeOptions.easeDuration || 0, bearingEaseDuration);
      easeOptions.bearing = targetBearing;
    }

    if (deltas.pitch) {
      let pitchSpeed = this._clampSpeed((deltas.pitch * linearity) / duration);
      const pitchEaseDuration = Math.abs(pitchSpeed / (deceleration * linearity)) * 1000;
      const targetPitch = (this._map.transform.pitch) + pitchSpeed * pitchEaseDuration / 2000;
      easeOptions.easeDuration = Math.max(easeOptions.easeDuration || 0, pitchEaseDuration);
      easeOptions.pitch = targetPitch;
    }

    if (easeOptions.zoom || easeOptions.bearing) {
      easeOptions.around = lastPoint ? this._map.unproject(lastPoint) : this._map.getCenter();
    }

    this._map.easeTo(extend(easeOptions, {
        easing,
        noMoveStart: true
    }), { originalEvent });

  }

  fireMapEvents(events: Array<string>, originalEvent: *) {
    let alreadyMoving = this._moving;
    const moveEvents = [];

    for (const event of events) {
      const eventType = event.replace('start', '').replace('end', '');
      if (event.endsWith('start')) {
        if (this._eventsInProgress[eventType]) { continue; } // spurious start event, don't fire
        else { this._eventsInProgress[eventType] = true; }
        if (!alreadyMoving && moveEvents.indexOf('movestart') < 0) { moveEvents.push('movestart'); }

      } else if (event.endsWith('end')) {
        if (!this._eventsInProgress[eventType]) { continue; } // spurious end event, don't fire
        else { this._eventsInProgress[eventType] = false; }
        if (!this._moving && moveEvents.indexOf('moveend') < 0) { moveEvents.push('moveend'); }
      } else {
        if (!this._eventsInProgress[eventType]) {
          // We never got a corresponding start event for some reason; fire it now & update event progress state
          this._map.fire(new Event(eventType + 'start', { originalEvent }));
          if (!alreadyMoving) {
            this._map.fire(new Event('movestart', { originalEvent }));
            alreadyMoving = true;
          }
          this._eventsInProgress[eventType] = true;
        }
        if (moveEvents.indexOf('move') < 0) { moveEvents.push('move'); }
      }

      this._map.fire(new Event(event, { originalEvent }));
    }
    for (const moveEvent of moveEvents) {
      if (moveEvent === 'moveend') {
        const activeHandlers = this._handlers.filter(([name, handler]) => handler._state === 'active');
        if (activeHandlers.length === 0) this._onMoveEnd(originalEvent);
      } else {
        this._map.fire(new Event(moveEvent, { originalEvent }))
      }
    }
  }
}


export default HandlerManager;
