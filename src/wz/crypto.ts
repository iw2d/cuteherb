const AES_USER_KEY = new Uint8Array([
    0x13, 0x00, 0x00, 0x00, 0x52, 0x00, 0x00, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x5B, 0x00, 0x00, 0x00,
    0x08, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x60, 0x00, 0x00, 0x00,
    0x06, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x43, 0x00, 0x00, 0x00, 0x0F, 0x00, 0x00, 0x00,
    0xB4, 0x00, 0x00, 0x00, 0x4B, 0x00, 0x00, 0x00, 0x35, 0x00, 0x00, 0x00, 0x05, 0x00, 0x00, 0x00,
    0x1B, 0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x00, 0x5F, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
    0x0F, 0x00, 0x00, 0x00, 0x50, 0x00, 0x00, 0x00, 0x0C, 0x00, 0x00, 0x00, 0x1B, 0x00, 0x00, 0x00,
    0x33, 0x00, 0x00, 0x00, 0x55, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x09, 0x00, 0x00, 0x00,
    0x52, 0x00, 0x00, 0x00, 0xDE, 0x00, 0x00, 0x00, 0xC7, 0x00, 0x00, 0x00, 0x1E, 0x00, 0x00, 0x00,
]);
const WZ_GMS_IV = new Uint8Array([0x4D, 0x23, 0xC7, 0x2B]);

async function createCipher(userKey: Uint8Array, userIv: Uint8Array, size: number): Promise<Uint8Array> {
    const data = new Uint8Array(32);
    for (let i = 0; i < 128; i += 16) {
        data[i / 4] = userKey[i];
    }
    const key = await crypto.subtle.importKey("raw", data, { name: "AES-CBC" }, false, ["encrypt"]);
    const iv = new Uint8Array(16);
    for (let i = 0; i < 16; i += 4) {
        iv.set(userIv, i);
    }
    const input = new Uint8Array(size);
    const cipher = await crypto.subtle.encrypt({ name: "AES-CBC", iv: iv }, key, input);
    return new Uint8Array(cipher);
}

let cipher = await createCipher(AES_USER_KEY, WZ_GMS_IV, 0x2000);
const decoderAscii = new TextDecoder("ascii");
const decoderUtf16 = new TextDecoder("utf-16le");

export async function decryptData(data: Uint8Array): Promise<Uint8Array> {
    const result = new Uint8Array(data.length);
    if (data.length > cipher.length) {
        let newSize = cipher.length;
        while (newSize < data.length) {
            newSize = newSize * 2;
        }
        cipher = await createCipher(AES_USER_KEY, WZ_GMS_IV, newSize);
    }
    for (let i = 0; i < data.length; i++) {
        result[i] = (data[i] ^ cipher[i]) & 0xFF;
    }
    return result;
}

export function decryptAscii(data: Uint8Array): string {
    const result = new Uint8Array(data.length);
    let mask = 0xAA;
    for (let i = 0; i < data.length; i++) {
        result[i] = (data[i] ^ cipher[i] ^ mask) & 0xFF;
        mask = (mask + 1) & 0xFF;
    }
    return decoderAscii.decode(result);
}

export function decryptUtf16(data: Uint8Array): string {
    const result = new Uint8Array(data.length);
    let mask = 0xAAAA;
    for (let i = 0; i < data.length; i += 2) {
        result[i] = (data[i] ^ cipher[i] ^ (mask & 0xFF)) & 0xFF;
        result[i + 1] = (data[i + 1] ^ cipher[i + 1] ^ (mask >> 8)) & 0xFF;
        mask = (mask + 1) & 0xFFFF;
    }
    return decoderUtf16.decode(result);
}