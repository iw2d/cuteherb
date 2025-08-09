import { WzArchive } from "../archive";
import { type WzCollectionEntry, WzCollection } from "../collection";
import { decryptData } from "../crypto";
import { WzProperty } from "./property";

export const CANVAS_PIXFORMAT = {
    UNKNOWN: 0,
    ARGB4444: 1,
    ARGB8888: 2,
    RGB565: 0x201,
    DXT3: 0x402,
    DXT5: 0x802,
} as const;

export class WzCanvas extends WzCollection {
    property: WzProperty;
    width: number;
    height: number;
    pixFormat: number;
    magLevel: number;
    bitmap: Uint8Array;

    constructor(property: WzProperty, width: number, height: number, pixFormat: number, magLevel: number, bitmap: Uint8Array) {
        super();
        this.property = property;
        this.width = width;
        this.height = height;
        this.pixFormat = pixFormat;
        this.magLevel = magLevel;
        this.bitmap = bitmap;
    }
    override async getInternal(key: string, rest: string): Promise<unknown> {
        return await this.property.getInternal(key, rest);
    }
    override async collect(): Promise<WzCollectionEntry[]> {
        return await this.property.collect();
    }
    static async deserialize(archive: WzArchive): Promise<WzCanvas> {
        archive.position += 1;
        const hasProperty = await archive.u8() !== 0;
        const property = hasProperty ? await WzProperty.deserialize(archive) : new WzProperty(archive);
        // canvas meta
        const width = await archive.read();
        const height = await archive.read();
        if (width >= 0x10000 || height >= 0x10000) {
            throw new Error(`Unsupported canvas dimensions : ${width} x ${height}`);
        }
        const pixFormat = await archive.read();
        if (pixFormat !== CANVAS_PIXFORMAT.ARGB4444 && pixFormat !== CANVAS_PIXFORMAT.ARGB8888 && pixFormat !== CANVAS_PIXFORMAT.RGB565) {
            throw new Error(`Unsupported canvas pixFormat : ${pixFormat}`);
        }
        const magLevel = await archive.read();
        if (magLevel < 0) {
            throw new Error(`Unsupported canvas magLevel : ${magLevel}`);
        }
        for (let i = 0; i < 4; i++) {
            await archive.read();
        }
        // canvas data
        const size = await archive.u32() - 1;
        archive.position += 1; // 0
        const header = await archive.u16();
        archive.position -= 2; // peek zlib header
        const bitmap = new Uint8Array(width * height * 4);
        const converter = getBitmapConverter(bitmap, pixFormat);
        try {
            if (header === 0x9C78) {
                await archive.blob(archive.position, archive.position += size).stream()
                    .pipeThrough(new DecompressionStream("deflate"))
                    .pipeTo(converter);

            } else {
                const decrypted = [];
                const endPosition = archive.position + size;
                while (archive.position < endPosition) {
                    const chunkSize = await archive.u32();
                    const chunkData = await archive.array(archive.position, archive.position += chunkSize);
                    decrypted.push(await decryptData(chunkData));
                }
                await new Blob(decrypted as BlobPart[]).stream()
                    .pipeThrough(new DecompressionStream("deflate"))
                    .pipeTo(converter);
            }
        } catch (error) {
            if (!(error instanceof TypeError)) {
                throw error;
            }
        }
        return new WzCanvas(property, width, height, pixFormat, magLevel, bitmap);
    }
}

const EMPTY = new Uint8Array(0);

function getBitmapConverter(destination: Uint8Array, pixFormat: number): WritableStream<Uint8Array> {
    if (pixFormat !== CANVAS_PIXFORMAT.ARGB4444) {
        throw new Error("Unsupported PIXFORMAT");
    }
    let offset = 0;
    let carry: Uint8Array = EMPTY;
    const stream = new WritableStream<Uint8Array>({
        write(chunk: Uint8Array) {
            let i = 0;
            let j = 0;

            const count = (carry.length + chunk.length) >> 1;
            for (let k = 0; k < count; k++) {
                const lo = i < carry.length ? carry[i++] : chunk[j++];
                const hi = i < carry.length ? carry[i++] : chunk[j++];

                const pixel = (lo | (hi << 8)) & 0xFFFF;
                const a4 = (pixel >> 12) & 0xF;
                const r4 = (pixel >> 8) & 0xF;
                const g4 = (pixel >> 4) & 0xF;
                const b4 = pixel & 0xF;

                destination[offset++] = b4 * 17;
                destination[offset++] = g4 * 17;
                destination[offset++] = r4 * 17;
                destination[offset++] = a4 * 17;
            }

            if (i < carry.length) {
                const remain = carry.subarray(i);
                carry = new Uint8Array(remain.length + chunk.length);
                carry.set(remain, 0);
                carry.set(chunk, remain.length);
            } else if (j < chunk.length) {
                carry = chunk.subarray(j);
            } else {
                carry = EMPTY;
            }
        }
    });
    return stream;
}