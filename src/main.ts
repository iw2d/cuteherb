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
    clone(position: number): WzArchive {
        return new WzArchive(this.file, position, position);
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
    async get(): Promise<number> {
        const view = await this.view(this.position, ++this.position);
        return view.getUint8(0);
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
            const view = await this.view(this.position, (this.position += 4));
            const stringPosition = view.getUint32(0, true);
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

class WzImage {
    archive: WzArchive;

    constructor(archive: WzArchive) {
        this.archive = archive;
    }
}

type WzDirectory = Map<string, WzDirectory | WzImage>;

function rotl(i: number, n: number): number {
    return (i << n) | (i >>> (32 - n));
}

class WzPackage {
    archive: WzArchive;
    items: WzDirectory;
    begin: number;
    size: number;
    key: number;

    constructor(file: File) {
        this.archive = new WzArchive(file, 0, 0);
        this.items = new Map();
        this.begin = 0;
        this.size = 0;
        this.key = 0;
    }

    async init(key: string) {
        const header = await this.archive.view(0, 16);
        if (header.getUint32(0, true) != 0x31474B50) {
            throw new Error("PKG1 header missing");
        }
        this.size = header.getUint32(0x4, true); // header.getBigUint64(0x4, true);
        this.begin = header.getUint32(0xC, true);
        this.archive.begin = this.begin;
        this.archive.position = this.begin;

        let hash = 0;
        for (let i = 0; i < key.length; i++) {
            hash = 32 * hash + key.charCodeAt(i) + 1;
        }
        this.key = hash;
        const computedHeader = (hash & 0xFF) ^ ((hash >> 8) & 0xFF) ^ ((hash >> 16) & 0xFF) ^ ((hash >> 24) & 0xFF);
        const versionHeader = await this.archive.get();
        if (versionHeader == computedHeader || versionHeader == (computedHeader ^ 0xFF)) {
            await this.archive.serializeString(versionHeader == computedHeader);
            this.items = await this.loadDirectory();
        } else {
            throw new Error("Version mismatch");
        }
    }
    async loadPosition(): Promise<number> {
        const begin = this.archive.begin;
        let result = this.archive.position;
        result = ~(result - begin);
        result = result * this.key;
        result = result - 0x581C3F6D;
        result = rotl(result, result & 0x1F);
        const view = await this.archive.view(this.archive.position, this.archive.position += 4);
        return (result ^ view.getInt32(0, true)) + (begin * 2);
    }
    async loadDirectory(): Promise<WzDirectory> {
        const directory = new Map();
        const size = await this.archive.read();
        for (let i = 0; i < size; i++) {
            const id = await this.archive.get();
            const name = await this.archive.serializeString(id <= 2);
            await this.archive.read(); // size
            await this.archive.read(); // checksum
            const position = await this.loadPosition();
            if (id == 3) {
                const originalPosition = this.archive.position;
                this.archive.position = position;
                directory.set(name, await this.loadDirectory());
                this.archive.position = originalPosition;
            } else if (id == 4) {
                directory.set(name, new WzImage(this.archive.clone(position)));
            }
        }
        return directory;
    }
}

const input = document.querySelector<HTMLInputElement>("#input")!;
const output = document.querySelector<HTMLPreElement>("#output")!;

input.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        output.textContent = "No file selected";
        return;
    }

    try {
        const start = performance.now();
        const p = new WzPackage(file);
        await p.init("95");
        const end = performance.now();
        console.log(`Async execution took ${(end - start).toFixed(3)} ms`);
        console.log(p);
    } catch (error) {
        output.textContent = `Error reading file: ${error}`;
    }
});
