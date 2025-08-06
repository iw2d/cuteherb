import { WzPackage } from "./wz";

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
        const p = WzPackage.from(file);
        await p.init("95");
        const end = performance.now();
        console.log(`Async execution took ${(end - start).toFixed(3)} ms`);
        console.log(p);
    } catch (error) {
        output.textContent = `Error reading file: ${error}`;
    }
});
