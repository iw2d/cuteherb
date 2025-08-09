import { WzArchive } from "../archive";
import { type WzCollectionEntry, WzCollection } from "../collection";
import { deserializeObject } from ".";

interface WzPropertyItem {
    position: number;
}

export class WzProperty extends WzCollection {
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
        if (item === null || typeof item !== "object") {
            if (rest) {
                throw new Error(`Cannot index list item with type : ${typeof item}`);
            }
            return item;
        }
        this.archive.position = (item as WzPropertyItem).position;
        const result = await deserializeObject(this.archive) as WzCollection;
        if (rest) {
            return await result.get(rest);
        } else {
            return result;
        }
    }
    override async collect(): Promise<WzCollectionEntry[]> {
        const result: WzCollectionEntry[] = [];
        for (const [key] of this.items) {
            const value = await this.getInternal(key, "");
            result.push({
                name: key,
                value: value,
                collection: value instanceof WzCollection
            });
        }
        return result;
    }
    static async deserializeVariant(archive: WzArchive): Promise<unknown> {
        const type = await archive.u8();
        if (type === 0) {
            return null;
        } else if (type === 2 || type === 16) {
            return await archive.i16();
        } else if (type === 3) {
            const value = await archive.i8();
            return value === -0x80 ? await archive.i32() : value;
        } else if (type === 4) {
            const value = await archive.i8();
            return value === -0x80 ? await archive.f32() : value;
        } else if (type === 5) {
            return await archive.f64();
        } else if (type === 8) {
            return await archive.deserializeString();
        } else if (type === 9 || type === 13) {
            const size = await archive.u32();
            const position = archive.position;
            archive.position += size;
            return { position: position } as WzPropertyItem;
        } else if (type === 11) {
            const value = await archive.u16();
            return value ? true : false;
        } else if (type === 17 || type === 18) {
            return await archive.u16();
        } else if (type === 19) {
            const value = await archive.u8();
            return value === 0x80 ? await archive.u32() : value;
        } else if (type === 20) {
            const value = await archive.i8();
            return value === -0x80 ? await archive.i64() : BigInt(value);
        } else if (type === 21) {
            const value = await archive.u8();
            return value === 0x80 ? await archive.u64() : BigInt(value);
        } else {
            throw new Error(`Unknown variant type ${type}`);
        }
    }
    static async deserialize(archive: WzArchive): Promise<WzProperty> {
        const result = new WzProperty(archive.clone(archive.begin, archive.position));
        archive.position = archive.position + 2; // reserved
        const size = await archive.read();
        for (let i = 0; i < size; i++) {
            const key = await archive.deserializeString();
            const value = await WzProperty.deserializeVariant(archive);
            result.items.set(key, value);
        }
        return result;
    }
}