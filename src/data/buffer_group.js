// @flow

const Buffer = require('./buffer');
const {ProgramConfigurationSet} = require('./program_configuration');
const createVertexArrayType = require('./vertex_array_type');
const {SegmentVector} = require('./segment');

import type StyleLayer from '../style/style_layer';
import type {ProgramInterface} from './program_configuration';
import type {SerializedArrayGroup} from './array_group';
import type {StructArray} from '../util/struct_array';

/**
 * A class containing vertex and element arrays for a bucket, ready for use in
 * a WebGL program.  See {@link ArrayGroup} for details.
 *
 * @private
 */
class BufferGroup {
    layoutVertexBuffer: Buffer;
    dynamicLayoutVertexArray: StructArray;
    dynamicLayoutVertexBuffer: Buffer;
    elementBuffer: Buffer;
    elementBuffer2: Buffer;
    programConfigurations: ProgramConfigurationSet;
    segments: SegmentVector;
    segments2: SegmentVector;

    constructor(programInterface: ProgramInterface, layers: Array<StyleLayer>, zoom: number, arrays: SerializedArrayGroup) {
        const LayoutVertexArrayType = createVertexArrayType(programInterface.layoutAttributes);
        this.layoutVertexBuffer = new Buffer(arrays.layoutVertexArray,
            LayoutVertexArrayType.serialize(), Buffer.BufferType.VERTEX);

        if (arrays.dynamicLayoutVertexArray && programInterface.dynamicLayoutAttributes) {
            const DynamicLayoutVertexArrayType = createVertexArrayType(programInterface.dynamicLayoutAttributes);
            this.dynamicLayoutVertexArray = new DynamicLayoutVertexArrayType(arrays.dynamicLayoutVertexArray);
            this.dynamicLayoutVertexBuffer = new Buffer(arrays.dynamicLayoutVertexArray,
                DynamicLayoutVertexArrayType.serialize(), Buffer.BufferType.VERTEX, true);
        }

        if (arrays.elementArray && programInterface.elementArrayType) {
            this.elementBuffer = new Buffer(arrays.elementArray,
                programInterface.elementArrayType.serialize(), Buffer.BufferType.ELEMENT);
        }

        if (arrays.elementArray2 && programInterface.elementArrayType2) {
            this.elementBuffer2 = new Buffer(arrays.elementArray2,
                programInterface.elementArrayType2.serialize(), Buffer.BufferType.ELEMENT);
        }

        this.programConfigurations = ProgramConfigurationSet.deserialize(programInterface, layers, zoom, arrays.paintVertexArrays);

        this.segments = new SegmentVector(arrays.segments);
        this.segments.createVAOs(layers);

        this.segments2 = new SegmentVector(arrays.segments2);
        this.segments2.createVAOs(layers);
    }

    destroy() {
        this.layoutVertexBuffer.destroy();

        if (this.dynamicLayoutVertexBuffer) {
            this.dynamicLayoutVertexBuffer.destroy();
        }
        if (this.elementBuffer) {
            this.elementBuffer.destroy();
        }
        if (this.elementBuffer2) {
            this.elementBuffer2.destroy();
        }
        this.programConfigurations.destroy();
        this.segments.destroy();
        this.segments2.destroy();
    }
}

module.exports = BufferGroup;
