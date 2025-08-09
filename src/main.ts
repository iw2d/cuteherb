import { WzCanvas, WzPackage } from "./wz";

async function convertARGB4444(blob: Blob): Promise<Uint8Array<ArrayBuffer>> {
    const pixels = new Uint16Array(await blob.arrayBuffer()); // 2 bytes per pixel
    const result = new Uint8Array(pixels.length * 4);
    for (let i = 0; i < result.length; i += 4) {
        const pixel = pixels[i / 4];

        const a4 = (pixel >> 12) & 0xF;
        const r4 = (pixel >> 8) & 0xF;
        const g4 = (pixel >> 4) & 0xF;
        const b4 = pixel & 0xF;

        result[i] = r4 * 17;
        result[i + 1] = g4 * 17;
        result[i + 2] = b4 * 17;
        result[i + 3] = a4 * 17;
    }
    return result;
}

(async () => {
    const adapter = await navigator.gpu?.requestAdapter();
    const device = await adapter?.requestDevice();
    if (!device) {
        throw new Error("WebGPU is not supported in this browser");
    }

    const canvas = document.querySelector<HTMLCanvasElement>("#canvas")!;
    const context = canvas.getContext("webgpu");
    if (!context) {
        throw new Error("Could not resolve WebGPU context");
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
        device: device,
        format: format,
        alphaMode: "premultiplied",
    });

    const module = device.createShaderModule({
        label: 'our hardcoded textured quad shaders',
        code: `
struct OurVertexShaderOutput {
    @builtin(position) position: vec4f,
    @location(0) texcoord: vec2f,
};

@vertex fn vs(
    @builtin(vertex_index) vertexIndex : u32
) -> OurVertexShaderOutput {
    let pos = array(
    // 1st triangle
    vec2f( 0.0,  0.0),  // center
    vec2f( 1.0,  0.0),  // right, center
    vec2f( 0.0,  1.0),  // center, top

    // 2st triangle
    vec2f( 0.0,  1.0),  // center, top
    vec2f( 1.0,  0.0),  // right, center
    vec2f( 1.0,  1.0),  // right, top
    );

    var vsOutput: OurVertexShaderOutput;
    let xy = pos[vertexIndex];

    // Convert from [0,1] to clip space [-1,1]
    let clipPos = xy * 2.0 - vec2f(1.0, 1.0);
    vsOutput.position = vec4f(clipPos, 0.0, 1.0);

    // Flip Y texture coordinate to fix orientation
    vsOutput.texcoord = vec2f(xy.x, 1.0 - xy.y);
    return vsOutput;
}

@group(0) @binding(0) var ourSampler: sampler;
@group(0) @binding(1) var ourTexture: texture_2d<f32>;

@fragment fn fs(fsInput: OurVertexShaderOutput) -> @location(0) vec4f {
    return textureSample(ourTexture, ourSampler, fsInput.texcoord);
}
`,
    });

    const pipeline = device.createRenderPipeline({
        label: 'hardcoded textured quad pipeline',
        layout: 'auto',
        vertex: {
            module,
        },
        fragment: {
            module,
            targets: [{ format }],
        },
    });


    const input = document.querySelector<HTMLInputElement>("#input")!;
    input.addEventListener("change", async (event) => {
        const file = (event.target as HTMLInputElement).files?.[0];
        if (!file) {
            throw new Error("No file selected");
        }
        const p = await WzPackage.from(file, "95");
        const source = await p.get("Obj/houseBC.img/house00/base/0/0") as WzCanvas;
        // const source = await p.get("0100100.img/stand/0") as WzCanvas;

        canvas.width = source.width;
        canvas.height = source.height;
        const size = {
            width: source.width,
            height: source.height,
            depthOrArrayLayers: 1,
        };
        const pixels = await convertARGB4444(source.data);
        const texture = device.createTexture({
            format: "rgba8unorm",
            size: size,
            usage: GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.writeTexture(
            { texture },
            pixels,
            {
                bytesPerRow: source.width * 4,
                rowsPerImage: source.height,
            },
            size,
        );

        const sampler = device.createSampler();
        const bindGroup = device.createBindGroup({
            layout: pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sampler },
                { binding: 1, resource: texture.createView() }
            ]
        });

        const encoder = device.createCommandEncoder();
        const renderPassDescriptor: GPURenderPassDescriptor = {
            colorAttachments: [
                {
                    loadOp: "clear",
                    storeOp: "store",
                    view: context.getCurrentTexture().createView(),
                }
            ]
        };

        const pass = encoder.beginRenderPass(renderPassDescriptor);
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.draw(6);
        pass.end();

        device.queue.submit([encoder.finish()]);
    });
})();