import { decryptAscii, decryptUtf16, rotateLeft } from "./crypto";

class WzArchive {
    file: File;
    begin: number;
    position: number;
    window: ArrayBuffer;
    windowStart: number;
    windowEnd: number;

    constructor(file: File, begin: number, position: number) {
        this.file = file;
        this.begin = begin;
        this.position = position;
        this.window = new ArrayBuffer();
        this.windowStart = 0;
        this.windowEnd = 0;
    }
    clone(begin: number, position: number): WzArchive {
        const archive = new WzArchive(this.file, begin, position);
        archive.window = this.window;
        archive.windowStart = this.windowStart;
        archive.windowEnd = this.windowEnd;
        return archive;
    }
    async slice(start: number, end: number): Promise<ArrayBuffer> {
        if (this.windowStart > start || this.windowEnd < end) {
            this.windowStart = start;
            this.windowEnd = Math.max(end, start + 0x1000);
            this.window = await this.file.slice(this.windowStart, this.windowEnd).arrayBuffer();
        }
        return this.window.slice(start - this.windowStart, end - this.windowStart);
    }
    async array(start: number, end: number): Promise<Uint8Array> {
        const slice = await this.slice(start, end);
        return new Uint8Array(slice);
    }
    async view(start: number, end: number): Promise<DataView> {
        const slice = await this.slice(start, end);
        return new DataView(slice);
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
        const result = view.getUint8(0);
        if (result === 0x80) {
            this.position += 4;
            return view.getUint32(1, true);
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
                const data = await this.array(
                    this.position,
                    (this.position += length)
                );
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
                const data = await this.array(
                    this.position,
                    (this.position += length * 2)
                );
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
            return await this.decodeString(); // TODO caching
        }
    }
}

export abstract class WzCollection {
    archive: WzArchive;

    constructor(archive: WzArchive) {
        this.archive = archive;
    }
    async get(path: string): Promise<unknown> {
        const i = path.indexOf("/");
        const key = i >= 0 ? path.slice(0, i) : path;
        if (!key) {
            return this;
        }
        const rest = i >= 0 ? path.slice(i + 1) : "";
        return this.getInternal(key, rest);
    }
    abstract getInternal(key: string, rest: string): Promise<unknown>;
}

export abstract class WzProperty extends WzCollection {
    static async from(subArchive: WzArchive): Promise<WzProperty> {
        const uol = await subArchive.deserializeString();
        if (uol === "Property") {
            const result = new WzList(subArchive);
            await result.init();
            return result;
        } else {
            throw new Error(`Unknown property UOL : ${uol}`);
        }
    }
}

interface WzListItem {
    position: number;
}

export class WzList extends WzProperty {
    items: Map<string, unknown>;

    constructor(archive: WzArchive) {
        super(archive);
        this.items = new Map<string, unknown>();
    }
    async init(): Promise<void> {
        this.archive.position += 2; // reserved
        const size = await this.archive.read();
        for (let i = 0; i < size; i++) {
            const name = await this.archive.deserializeString();
            this.items.set(name, await this.deserialize());
        }
    }
    async deserialize(): Promise<unknown> {
        const vt = await this.archive.u8();
        if (vt === 0) {
            return null;
        } else if (vt === 2 || vt === 16) {
            return await this.archive.i16();
        } else if (vt === 3) {
            const val = await this.archive.i8();
            return val === -0x80 ? await this.archive.i32() : val;
        } else if (vt === 4) {
            const val = await this.archive.i8();
            return val === -0x80 ? await this.archive.f32() : val;
        } else if (vt === 5) {
            return await this.archive.f64();
        } else if (vt === 8) {
            return await this.archive.deserializeString();
        } else if (vt === 9 || vt === 13) {
            const size = await this.archive.u32();
            const position = this.archive.position;
            this.archive.position += size;
            return { position: position } as WzListItem;
        } else if (vt === 11) {
            const val = await this.archive.u16();
            return val ? true : false;
        } else if (vt === 17 || vt === 18) {
            return await this.archive.u16();
        } else if (vt === 19) {
            const val = await this.archive.u8();
            return val === 0x80 ? await this.archive.u32() : val;
        } else if (vt === 20) {
            const val = await this.archive.i8();
            return val === -0x80 ? await this.archive.i64() : BigInt(val);
        } else if (vt === 21) {
            const val = await this.archive.u8();
            return val === 0x80 ? await this.archive.u64() : BigInt(val);
        } else {
            throw new Error(`Unknown variant type ${vt}`);
        }
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
        return await WzProperty.from(this.archive);
    }
}

interface WzPackageItem {
    position: number;
    directory: boolean;
}

export class WzPackage extends WzCollection {
    items: Map<string, WzPackageItem>;
    key: number;

    constructor(archive: WzArchive) {
        super(archive);
        this.items = new Map<string, WzPackageItem>();
        this.key = 0;
    }
    async init(key: string): Promise<void> {
        const header = await this.archive.view(0, 16);
        if (header.getUint32(0, true) !== 0x31474B50) {
            throw new Error("PKG1 header missing");
        }
        const begin = header.getUint32(0xC, true);;
        this.archive.begin = begin;
        this.archive.position = begin;
        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = 32 * hash + key.charCodeAt(i) + 1;
        }
        this.key = hash;
        const computedHeader = (hash & 0xFF) ^ ((hash >> 8) & 0xFF) ^ ((hash >> 16) & 0xFF) ^ ((hash >> 24) & 0xFF);
        const versionHeader = await this.archive.u8();
        if (versionHeader !== computedHeader && versionHeader !== (computedHeader ^ 0xFF)) {
            throw new Error("Version mismatch");
        }
        await this.archive.deserializeStringInternal(versionHeader === computedHeader);
        await this.loadDirectory();
    }
    async loadPosition(): Promise<number> {
        const begin = this.archive.begin;
        let result = this.archive.position;
        result = ~(result - begin);
        result = result * this.key;
        result = result - 0x581C3F6D;
        result = rotateLeft(result, result & 0x1F);
        const position = await this.archive.u32();
        return (result ^ position) + (begin * 2);
    }
    async loadDirectory(): Promise<void> {
        const size = await this.archive.read();
        for (let i = 0; i < size; i++) {
            const id = await this.archive.u8();
            const name = await this.archive.deserializeStringInternal(id <= 2);
            await this.archive.read(); // size
            await this.archive.read(); // checksum
            this.items.set(name, {
                position: await this.loadPosition(),
                directory: (id & 1) !== 0
            });
        }
    }
    override async getInternal(key: string, rest: string): Promise<unknown> {
        const item = this.items.get(key);
        if (item === undefined) {
            throw new Error(`No item with key : ${key}`);
        }
        if (item.directory) {
            const subArchive = this.archive.clone(this.archive.begin, item.position);
            const subPackage = new WzPackage(subArchive);
            subPackage.key = this.key;
            await subPackage.loadDirectory();
            if (rest) {
                return await subPackage.get(rest);
            } else {
                return subPackage;
            }
        } else {
            const subArchive = this.archive.clone(item.position, item.position);
            const subProperty = await WzProperty.from(subArchive);
            if (rest) {
                return await subProperty.get(rest);
            } else {
                return subProperty;
            }
        }
    }
    static async from(file: File, key: string): Promise<WzPackage> {
        const result = new WzPackage(new WzArchive(file, 0, 0));
        await result.init(key);
        return result;
    }
}