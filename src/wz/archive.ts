import { decryptAscii, decryptUtf16 } from "./crypto";

export class WzArchive {
    file: Blob;
    begin: number;
    position: number;
    window: Uint8Array;
    windowPosition: number;

    constructor(file: Blob, begin: number, position: number) {
        this.file = file;
        this.begin = begin;
        this.position = position;
        this.window = new Uint8Array();
        this.windowPosition = 0;
    }
    clone(begin: number, position: number): WzArchive {
        const archive = new WzArchive(this.file, begin, position);
        archive.window = this.window;
        archive.windowPosition = this.windowPosition;
        return archive;
    }
    blob(start: number, end: number): Blob {
        return this.file.slice(start, end);
    }
    async array(start: number, end: number): Promise<Uint8Array> {
        if (this.windowPosition > start || this.windowPosition + this.window.length < end) {
            this.windowPosition = start;
            const windowEnd = Math.max(this.windowPosition + 0x1000, end);
            const windowBuffer = await this.blob(this.windowPosition, windowEnd).arrayBuffer();
            this.window = new Uint8Array(windowBuffer);
        }
        return this.window.subarray(start - this.windowPosition, end - this.windowPosition);
    }
    async view(start: number, end: number): Promise<DataView> {
        const array = await this.array(start, end);
        return new DataView(array.buffer, array.byteOffset, array.byteLength);
    }
    async u8(): Promise<number> {
        const view = await this.view(this.position, ++this.position);
        return view.getUint8(0);
    }
    async u16(): Promise<number> {
        const view = await this.view(this.position, this.position += 2);
        return view.getUint16(0, true);
    }
    async u32(): Promise<number> {
        const view = await this.view(this.position, this.position += 4);
        return view.getUint32(0, true);
    }
    async u64(): Promise<bigint> {
        const view = await this.view(this.position, this.position += 8);
        return view.getBigUint64(0, true);
    }
    async i8(): Promise<number> {
        const view = await this.view(this.position, ++this.position);
        return view.getInt8(0);
    }
    async i16(): Promise<number> {
        const view = await this.view(this.position, this.position += 2);
        return view.getInt16(0, true);
    }
    async i32(): Promise<number> {
        const view = await this.view(this.position, this.position += 4);
        return view.getInt32(0, true);
    }
    async i64(): Promise<bigint> {
        const view = await this.view(this.position, this.position += 8);
        return view.getBigInt64(0, true);
    }
    async f32(): Promise<number> {
        const view = await this.view(this.position, this.position += 4);
        return view.getFloat32(0, true);
    }
    async f64(): Promise<number> {
        const view = await this.view(this.position, this.position += 8);
        return view.getFloat64(0, true);
    }
    async read(): Promise<number> {
        const view = await this.view(this.position, ++this.position + 4);
        const result = view.getInt8(0);
        if (result === -0x80) {
            this.position += 4;
            return view.getInt32(1, true);
        } else {
            return result;
        }
    }
    async decodeString(): Promise<string> {
        const view = await this.view(this.position, ++this.position + 4);
        let length = view.getInt8(0);
        if (length < 0) {
            if (length === -0x80) {
                this.position += 4;
                length = view.getUint32(1, true);
            } else {
                length = -length;
            }
            if (length > 0x2000) {
                throw new Error("Unsupported string length");
            }
            if (length > 0) {
                const data = await this.array(this.position, this.position += length);
                return decryptAscii(data);
            }
        } else if (length > 0) {
            if (length === 0x7F) {
                this.position += 4;
                length = view.getUint32(1, true);
            }
            if (length > 0x2000) {
                throw new Error("Unsupported string length");
            }
            if (length > 0) {
                const data = await this.array(this.position, this.position += length * 2);
                return decryptUtf16(data);
            }
        }
        return "";
    }
    async deserializeString(): Promise<string> {
        const id = await this.u8();
        if (id === 0x00 || id === 0x73) {
            return this.deserializeStringInternal(false);
        } else if (id === 0x01 || id === 0x1B) {
            return this.deserializeStringInternal(true);
        } else {
            throw new Error(`Unknown string id ${id}`);
        }
    }
    async deserializeStringInternal(offset: boolean): Promise<string> {
        if (offset) {
            const stringPosition = await this.u32();
            const originalPosition = this.position;
            this.position = this.begin + stringPosition;
            const result = await this.decodeString();
            this.position = originalPosition;
            return result;
        } else {
            return await this.decodeString();
        }
    }
}