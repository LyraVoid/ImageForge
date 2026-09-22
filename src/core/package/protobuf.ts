/**
 * A wire-format reader for the small protobuf messages the OTA payload format carries.
 *
 * The schema is upstream's (`update_metadata.proto`, taken from magiskboot's own generated copy, and
 * the field numbers below are the ones it declares). Only reading is implemented: the payload
 * manifest is the one protobuf this project needs, and a hand written reader keeps the browser
 * bundle free of a protobuf runtime.
 */
export const WIRE_VARINT = 0;
export const WIRE_FIXED64 = 1;
export const WIRE_LENGTH_DELIMITED = 2;
export const WIRE_FIXED32 = 5;

export interface ProtoTag {
  field: number;
  wire: number;
}

export class ProtoReader {
  private readonly bytes: Uint8Array;
  private offset: number;

  constructor(bytes: Uint8Array, offset = 0) {
    this.bytes = bytes;
    this.offset = offset;
  }

  get position(): number {
    return this.offset;
  }

  get done(): boolean {
    return this.offset >= this.bytes.length;
  }

  /** A 64 bit varint, as a bigint: the payload format counts bytes, not int32s. */
  readVarint(): bigint {
    let result = 0n;
    let shift = 0n;
    for (let index = 0; index < 10; index += 1) {
      if (this.offset >= this.bytes.length) throw new Error("Truncated protobuf varint.");
      const byte = this.bytes[this.offset];
      this.offset += 1;
      result |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) return result;
      shift += 7n;
    }
    throw new Error("Protobuf varint is longer than 10 bytes.");
  }

  readTag(): ProtoTag {
    const tag = Number(this.readVarint());
    return { field: tag >>> 3, wire: tag & 0x07 };
  }

  readLengthDelimited(): Uint8Array {
    const length = Number(this.readVarint());
    if (length < 0 || this.offset + length > this.bytes.length) {
      throw new Error("Truncated protobuf field.");
    }
    const value = this.bytes.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }

  readBytes(): Uint8Array {
    return this.readLengthDelimited();
  }

  readString(): string {
    return new TextDecoder().decode(this.readLengthDelimited());
  }

  readFixed64(): bigint {
    if (this.offset + 8 > this.bytes.length) throw new Error("Truncated protobuf fixed64.");
    let value = 0n;
    for (let index = 7; index >= 0; index -= 1) {
      value = (value << 8n) | BigInt(this.bytes[this.offset + index]);
    }
    this.offset += 8;
    return value;
  }

  readFixed32(): number {
    if (this.offset + 4 > this.bytes.length) throw new Error("Truncated protobuf fixed32.");
    const value =
      this.bytes[this.offset] |
      (this.bytes[this.offset + 1] << 8) |
      (this.bytes[this.offset + 2] << 16) |
      (this.bytes[this.offset + 3] << 24);
    this.offset += 4;
    return value >>> 0;
  }

  /** Moves past a field this reader does not care about. */
  skip(wire: number): void {
    if (wire === WIRE_VARINT) {
      this.readVarint();
      return;
    }
    if (wire === WIRE_FIXED64) {
      this.readFixed64();
      return;
    }
    if (wire === WIRE_LENGTH_DELIMITED) {
      this.readLengthDelimited();
      return;
    }
    if (wire === WIRE_FIXED32) {
      this.readFixed32();
      return;
    }
    throw new Error("Unsupported protobuf wire type " + wire + ".");
  }
}
