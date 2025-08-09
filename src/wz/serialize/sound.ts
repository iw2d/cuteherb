import { WzArchive } from "../archive";

const SOUND_HEADER = [
    0x02,
    0x83, 0xEB, 0x36, 0xE4, 0x4F, 0x52, 0xCE, 0x11, 0x9F, 0x53, 0x00, 0x20, 0xAF, 0x0B, 0xA7, 0x70,
    0x8B, 0xEB, 0x36, 0xE4, 0x4F, 0x52, 0xCE, 0x11, 0x9F, 0x53, 0x00, 0x20, 0xAF, 0x0B, 0xA7, 0x70,
    0x00,
    0x01,
    0x81, 0x9F, 0x58, 0x05, 0x56, 0xC3, 0xCE, 0x11, 0xBF, 0x01, 0x00, 0xAA, 0x00, 0x55, 0x59, 0x5A
] as const;

export class WzSound {
    length: number;
    header: Blob;
    data: Blob;

    constructor(length: number, header: Blob, data: Blob) {
        this.length = length;
        this.header = header;
        this.data = data;
    }
    static async deserialize(archive: WzArchive): Promise<WzSound> {
        archive.position += 1;
        const dataSize = await archive.read();
        const length = await archive.read();
        // sound header
        const headerPosition = archive.position;
        archive.position += SOUND_HEADER.length;
        const formatSize = await archive.u8();
        archive.position += formatSize;
        // sound data
        const header = archive.blob(headerPosition, archive.position);
        const data = archive.blob(archive.position, archive.position += dataSize);
        return new WzSound(length, header, data);
    }
}