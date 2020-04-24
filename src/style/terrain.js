// @flow

import styleSpec from '../style-spec/reference/latest';

import {endsWith, extend} from '../util/util';
import {Evented} from '../util/evented';
import {
    validateStyle,
    validateTerrain,
    emitValidationErrors
} from './validate_style';

import type EvaluationParameters from './evaluation_parameters';
import {Properties, Transitionable, Transitioning, PossiblyEvaluated, DataConstantProperty} from './properties';

import type {
    TransitionParameters
} from './properties';

import type {TerrainSpecification} from '../style-spec/types';

type Props = {|
    "source": DataConstantProperty<string>,
    "exaggeration": DataConstantProperty<number>,
|};

const properties: Properties<Props> = new Properties({
    "source": new DataConstantProperty(styleSpec.terrain.source),
    "exaggeration": new DataConstantProperty(styleSpec.terrain.exaggeration),
});

const TRANSITION_SUFFIX = '-transition';

class Terrain extends Evented {
    _transitionable: Transitionable<Props>;
    _transitioning: Transitioning<Props>;
    properties: PossiblyEvaluated<Props>;

    constructor(terrainOptions?: TerrainSpecification) {
        super();
        this._transitionable = new Transitionable(properties);
        this.set(terrainOptions);
        this._transitioning = this._transitionable.untransitioned();
    }

    get() {
        return this._transitionable.serialize();
    }

    set(terrain?: TerrainSpecification) {
        if (!terrain) {
            return this._transitionable.setValue('source', null);
        }
        if (this._validate(validateTerrain, terrain)) {
            return;
        }

        for (const name in terrain) {
            const value = terrain[name];
            if (endsWith(name, TRANSITION_SUFFIX)) {
                this._transitionable.setTransition(name.slice(0, -TRANSITION_SUFFIX.length), value);
            } else {
                this._transitionable.setValue(name, value);
            }
        }
    }

    updateTransitions(parameters: TransitionParameters) {
        this._transitioning = this._transitionable.transitioned(parameters, this._transitioning);
    }

    hasTransition() {
        return this._transitioning.hasTransition();
    }

    recalculate(parameters: EvaluationParameters) {
        this.properties = this._transitioning.possiblyEvaluate(parameters);
    }

    _validate(validate: Function, value: mixed, options?: {validate?: boolean}) {
        if (options && options.validate === false) {
            return false;
        }

        return emitValidationErrors(this, validate.call(validateStyle, extend({
            value,
            style: {glyphs: true, sprite: true},
            styleSpec
        })));
    }
}

export default Terrain;
