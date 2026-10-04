const { uploadBase64ToDrive } = require('./drive');

async function test() {
    // 1 pixel transparent png
    const base64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    const res = await uploadBase64ToDrive(base64, 'test_pixel.png', 'image/png', 'TestFolder');
    console.log(res);
}
test();
