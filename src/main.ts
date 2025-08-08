import { WzCanvas, WzPackage } from "./wz";

const input = document.querySelector<HTMLInputElement>("#input")!;
const output = document.querySelector<HTMLPreElement>("#output")!;
const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;


async function drawA4R4G4B4ToCanvas(blob: Blob, width: number, height: number, element: HTMLCanvasElement) {
    const arrayBuffer = await blob.arrayBuffer();
    const pixels = new Uint16Array(arrayBuffer); // 2 bytes per pixel

    const ctx = element.getContext("2d")!;
    element.width = width;
    element.height = height;

    const imageData = ctx.createImageData(width, height);
    const data = imageData.data; // Uint8ClampedArray, length = width*height*4

    for (let i = 0; i < pixels.length; i++) {
        const pixel = pixels[i];

        // Extract 4-bit components
        const a4 = (pixel >> 12) & 0xF;
        const r4 = (pixel >> 8) & 0xF;
        const g4 = (pixel >> 4) & 0xF;
        const b4 = pixel & 0xF;

        // Convert 4-bit to 8-bit (0-255)
        const a8 = a4 * 17;
        const r8 = r4 * 17;
        const g8 = g4 * 17;
        const b8 = b4 * 17;

        // Canvas expects premultiplied alpha, but you can skip that for now
        const baseIndex = i * 4;
        data[baseIndex] = r8;
        data[baseIndex + 1] = g8;
        data[baseIndex + 2] = b8;
        data[baseIndex + 3] = a8;
    }

    ctx.putImageData(imageData, 0, 0);
}

input.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        output.textContent = "No file selected";
        return;
    }

    try {
        const p = await WzPackage.from(file, "95");
        // const c = await p.get("Obj/houseBC.img/house00/base/0/0") as WzCanvas;
        const c = await p.get("0100100.img/stand/0") as WzCanvas;
        console.log(c);
        drawA4R4G4B4ToCanvas(c.data, c.width, c.height, canvas);
    } catch (error) {
        console.log(error);
        output.textContent = `Error reading file: ${error}`;
    }
});
