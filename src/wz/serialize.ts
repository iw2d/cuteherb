import { WzArchive } from "./archive";
import { WzCollection } from "./collection";

export abstract class WzSerialize extends WzCollection {
    static async deserialize(archive: WzArchive): Promise<WzSerialize> {
        const type = await archive.deserializeString();
        if (type === "Property") {
            return await WzProperty.deserialize(archive);
        } else if (type === "Canvas") {
            return await WzCanvas.deserialize(archive);
        } else if (type === "Shape2D#Vector2D") {
            return await WzVector.deserialize(archive);
        } else if (type === "Shape2D#Convex2D") {
            return await WzConvex.deserialize(archive);
        } else if (type === "Sound_DX8") {
            return await WzSound.deserialize(archive);
        } else if (type === "UOL") {
            return await WzUol.deserialize(archive);
        } else {
            throw new Error(`Unknown property type : ${type}`);
        }
    }
}

interface WzPropertyItem {
    position: number;
}

export class WzProperty extends WzSerialize {
    archive: WzArchive;
    items: Map<string, unknown>;

    constructor(archive: WzArchive) {
        super();
        this.archive = archive;
        this.items = new Map<string, unknown>();
    }
    override async getInternal(key: string, rest: string): Promise<unknown> {
        const item = this.items.get(key);
        if (item === undefined) {
            throw new Error(`No item with key : ${key}`);
        }
        if (typeof item !== "object") {
            if (rest) {
                throw new Error(`Cannot index list item with type : ${typeof item}`);
            }
            return item;
        }
        this.archive.position = (item as WzPropertyItem).position;
        const result = await WzSerialize.deserialize(this.archive);
        if (rest) {
            return await result.get(rest);
        } else {
            return result;
        }
    }
    static async deserializeVariant(archive: WzArchive): Promise<unknown> {
        const vt = await archive.u8();
        if (vt === 0) {
            return null;
        } else if (vt === 2 || vt === 16) {
            return await archive.i16();
        } else if (vt === 3) {
            const val = await archive.i8();
            return val === -0x80 ? await archive.i32() : val;
        } else if (vt === 4) {
            const val = await archive.i8();
            return val === -0x80 ? await archive.f32() : val;
        } else if (vt === 5) {
            return await archive.f64();
        } else if (vt === 8) {
            return await archive.deserializeString();
        } else if (vt === 9 || vt === 13) {
            const size = await archive.u32();
            const position = archive.position;
            archive.position += size;
            return { position: position } as WzPropertyItem;
        } else if (vt === 11) {
            const val = await archive.u16();
            return val ? true : false;
        } else if (vt === 17 || vt === 18) {
            return await archive.u16();
        } else if (vt === 19) {
            const val = await archive.u8();
            return val === 0x80 ? await archive.u32() : val;
        } else if (vt === 20) {
            const val = await archive.i8();
            return val === -0x80 ? await archive.i64() : BigInt(val);
        } else if (vt === 21) {
            const val = await archive.u8();
            return val === 0x80 ? await archive.u64() : BigInt(val);
        } else {
            throw new Error(`Unknown variant type ${vt}`);
        }
    }
    static override async deserialize(archive: WzArchive): Promise<WzProperty> {
        const result = new WzProperty(archive);
        archive.position += 2; // reserved
        const size = await archive.read();
        for (let i = 0; i < size; i++) {
            const name = await archive.deserializeString();
            result.items.set(name, await WzProperty.deserializeVariant(archive));
        }
        return result;
    }
}

export class WzCanvas extends WzSerialize {
    property: WzSerialize;
    width: number;
    height: number;
    pixFormat: number;
    magLevel: number;
    data: Blob;

    constructor(property: WzSerialize, width: number, height: number, pixFormat: number, magLevel: number, data: Blob) {
        super();
        this.property = property;
        this.width = width;
        this.height = height;
        this.pixFormat = pixFormat;
        this.magLevel = magLevel;
        this.data = data;
    }
    override async getInternal(key: string, rest: string): Promise<unknown> {
        return await this.property.getInternal(key, rest);
    }
    static override async deserialize(archive: WzArchive): Promise<WzCanvas> {
        archive.position += 1;
        const hasProperty = await archive.u8() !== 0;
        const property = hasProperty ? await WzProperty.deserialize(archive) : new WzProperty(archive);
        // canvas meta
        const width = await archive.read();
        const height = await archive.read();
        const pixFormat = await archive.read();
        const magLevel = await archive.read();
        for (let i = 0; i < 4; i++) {
            await archive.read();
        }
        // canvas data
        const dataSize = await archive.u32() - 1;
        archive.position += 1;
        const data = archive.blob(archive.position, archive.position += dataSize);
        return new WzCanvas(property, width, height, pixFormat, magLevel, data);
    }
}

export class WzVector extends WzSerialize {
    x: number;
    y: number;

    constructor(x: number, y: number) {
        super();
        this.x = x;
        this.y = y;
    }
    override async getInternal(key: string, rest: string): Promise<number> {
        if (rest) {
            throw new Error("Cannot index item inside vector");
        }
        if (key === "x") {
            return this.x;
        } else if (key === "y") {
            return this.y;
        } else {
            throw new Error(`No item with key : ${key}`);
        }
    }
    static override async deserialize(archive: WzArchive): Promise<WzVector> {
        const x = await archive.read();
        const y = await archive.read();
        return new WzVector(x, y);
    }
}

export class WzConvex extends WzSerialize {
    items: Map<string, WzSerialize>;

    constructor() {
        super();
        this.items = new Map<string, WzSerialize>();
    }
    override async getInternal(key: string, rest: string): Promise<unknown> {
        const item = this.items.get(key);
        if (item === undefined) {
            throw new Error(`No item with key : ${key}`);
        }
        if (rest) {
            return await item.get(rest);
        } else {
            return item;
        }
    }
    static override async deserialize(archive: WzArchive): Promise<WzConvex> {
        const result = new WzConvex();
        const size = await archive.read();
        for (let i = 0; i < size; i++) {
            result.items.set(i.toString(), await WzSerialize.deserialize(archive));
        }
        return result;
    }
}

export class WzSound extends WzSerialize {
    static SOUND_HEADER = [
        0x02,
        0x83, 0xEB, 0x36, 0xE4, 0x4F, 0x52, 0xCE, 0x11, 0x9F, 0x53, 0x00, 0x20, 0xAF, 0x0B, 0xA7, 0x70,
        0x8B, 0xEB, 0x36, 0xE4, 0x4F, 0x52, 0xCE, 0x11, 0x9F, 0x53, 0x00, 0x20, 0xAF, 0x0B, 0xA7, 0x70,
        0x00,
        0x01,
        0x81, 0x9F, 0x58, 0x05, 0x56, 0xC3, 0xCE, 0x11, 0xBF, 0x01, 0x00, 0xAA, 0x00, 0x55, 0x59, 0x5A
    ] as const;

    length: number;
    header: Blob;
    data: Blob;

    constructor(length: number, header: Blob, data: Blob) {
        super();
        this.length = length;
        this.header = header;
        this.data = data;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override getInternal(key: string, rest: string): Promise<unknown> {
        throw new Error("Cannot index item inside sound");
    }
    static override async deserialize(archive: WzArchive): Promise<WzSound> {
        archive.position += 1;
        const dataSize = await archive.read();
        const length = await archive.read();
        // sound header
        const headerPosition = archive.position;
        archive.position += WzSound.SOUND_HEADER.length;
        const formatSize = await archive.u8();
        archive.position += formatSize;
        // sound data
        const header = archive.blob(headerPosition, archive.position);
        const data = archive.blob(archive.position, archive.position += dataSize);
        return new WzSound(length, header, data);
    }
}

export class WzUol extends WzSerialize {
    uol: string;

    constructor(uol: string) {
        super();
        this.uol = uol;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override async getInternal(key: string, rest: string): Promise<unknown> {
        throw new Error("Cannot index item inside uol");
    }
    static override async deserialize(archive: WzArchive): Promise<WzUol> {
        archive.position += 1;
        return new WzUol(await archive.deserializeString());
    }
}