import { decryptAscii, decryptUtf16 } from "./crypto";

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
    async i8(): Promise<number> {
        const view = await this.view(this.position, ++this.position);
        return view.getInt8(0);
    }
    async u16(): Promise<number> {
        const view = await this.view(this.position, this.position += 2);
        return view.getUint16(0, true);
    }
    async i16(): Promise<number> {
        const view = await this.view(this.position, this.position += 2);
        return view.getInt16(0, true);
    }
    async u32(): Promise<number> {
        const view = await this.view(this.position, this.position += 4);
        return view.getUint32(0, true);
    }
    async i32(): Promise<number> {
        const view = await this.view(this.position, this.position += 4);
        return view.getInt32(0, true);
    }
    async read(): Promise<number> {
        const view = await this.view(this.position, ++this.position + 4);
        const result = view.getUint8(0);
        if (result == 0x80) {
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
            if (length == 0x80) {
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
            if (length == 0x7F) {
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
    async serializeString(offset: boolean): Promise<string> {
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

function rotl(i: number, n: number): number {
    return (i << n) | (i >>> (32 - n));
}

interface WzPackageItem {
    position: number;
    directory: boolean;
}

export class WzPackage {
    archive: WzArchive;
    items: Map<string, WzPackageItem>;
    key: number;

    constructor(archive: WzArchive) {
        this.archive = archive;
        this.items = new Map<string, WzPackageItem>();
        this.key = 0;
    }
    async init(key: string): Promise<void> {
        const header = await this.archive.view(0, 16);
        if (header.getUint32(0, true) != 0x31474B50) {
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
        if (versionHeader != computedHeader && versionHeader != (computedHeader ^ 0xFF)) {
            throw new Error("Version mismatch");
        }
        await this.archive.serializeString(versionHeader == computedHeader);
        await this.loadDirectory();
    }
    async loadPosition(): Promise<number> {
        const begin = this.archive.begin;
        let result = this.archive.position;
        result = ~(result - begin);
        result = result * this.key;
        result = result - 0x581C3F6D;
        result = rotl(result, result & 0x1F);
        const position = await this.archive.u32();
        return (result ^ position) + (begin * 2);
    }
    async loadDirectory(): Promise<void> {
        this.items.clear();
        const size = await this.archive.read();
        for (let i = 0; i < size; i++) {
            const id = await this.archive.u8();
            const name = await this.archive.serializeString(id <= 2);
            await this.archive.read(); // size
            await this.archive.read(); // checksum
            this.items.set(name, {
                position: await this.loadPosition(),
                directory: (id & 1) != 0
            });
        }
    }
    static from(file: File): WzPackage {
        return new WzPackage(new WzArchive(file, 0, 0));
    }
}