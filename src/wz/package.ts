import { WzArchive } from "./archive";
import { type WzCollectionEntry, WzCollection } from "./collection";
import { type WzProperty } from "./serialize";

function rotateLeft(i: number, n: number): number {
    return (i << n) | (i >>> (32 - n));
}

interface WzPackageItem {
    position: number;
    directory: boolean;
}

export class WzPackage extends WzCollection {
    archive: WzArchive;
    items: Map<string, WzPackageItem>;
    key: number;

    constructor(archive: WzArchive) {
        super();
        this.archive = archive;
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
            let type = await this.archive.u8();
            let name;
            if (type === 2) {
                const stringPosition = await this.archive.u32();
                const originalPosition = this.archive.position;
                this.archive.position = this.archive.begin + stringPosition;
                type = await this.archive.u8();
                name = await this.archive.decodeString();
                this.archive.position = originalPosition;
            } else if (type === 3 || type === 4) {
                name = await this.archive.decodeString();
            } else {
                throw new Error(`Unknown directory item type : ${type}`);
            }
            await this.archive.read(); // size
            await this.archive.read(); // checksum
            this.items.set(name, {
                position: await this.loadPosition(),
                directory: (type & 1) !== 0
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
            const subProperty = await subArchive.deserializeObject() as WzProperty;
            if (rest) {
                return await subProperty.get(rest);
            } else {
                return subProperty;
            }
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
    static async from(file: File, key: string): Promise<WzPackage> {
        const result = new WzPackage(new WzArchive(file, 0, 0));
        await result.init(key);
        return result;
    }
}