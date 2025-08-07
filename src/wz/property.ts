import { WzArchive } from "./archive";
import { WzCollection } from "./collection";

export abstract class WzProperty extends WzCollection {
    static async deserialize(archive: WzArchive): Promise<WzProperty> {
        const type = await archive.deserializeString();
        if (type === "Property") {
            return await WzList.deserialize(archive);
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

interface WzListItem {
    position: number;
}

export class WzList extends WzProperty {
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
        this.archive.position = (item as WzListItem).position;
        const result = await WzProperty.deserialize(this.archive);
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
            return { position: position } as WzListItem;
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
    static override async deserialize(archive: WzArchive): Promise<WzList> {
        const result = new WzList(archive);
        archive.position += 2; // reserved
        const size = await archive.read();
        for (let i = 0; i < size; i++) {
            const name = await archive.deserializeString();
            result.items.set(name, await WzList.deserializeVariant(archive));
        }
        return result;
    }
}

export class WzCanvas extends WzProperty {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override getInternal(key: string, rest: string): Promise<unknown> {
        throw new Error("Method not implemented.");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static override async deserialize(archive: WzArchive): Promise<WzSound> {
        throw new Error("Method not implemented.");
    }
}

export class WzVector extends WzProperty {
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

export class WzConvex extends WzProperty {
    items: Map<string, WzProperty>;

    constructor() {
        super();
        this.items = new Map<string, WzProperty>();
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
            result.items.set(i.toString(), await WzProperty.deserialize(archive));
        }
        return result;
    }
}

export class WzSound extends WzProperty {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    override getInternal(key: string, rest: string): Promise<unknown> {
        throw new Error("Method not implemented.");
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    static override async deserialize(archive: WzArchive): Promise<WzSound> {
        throw new Error("Method not implemented.");
    }
}

export class WzUol extends WzProperty {
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