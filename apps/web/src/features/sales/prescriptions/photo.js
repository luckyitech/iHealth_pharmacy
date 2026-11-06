/** Longest side of a prescription photo after it is made smaller; still easy to read. */
const MAX_SIDE_PX = 1600;
/** JPEG qualities tried in turn until the photo fits. */
const QUALITIES = Object.freeze([0.8, 0.65, 0.5, 0.35]);
const JPEG = 'image/jpeg';
/** Base64 is a third longer than the bytes it carries. */
const BASE64_RATIO = 4 / 3;
const BYTES_PER_KB = 1024;

/**
 * Makes a phone photo of a prescription small enough to keep with the bill: at most
 * `MAX_SIDE_PX` on its longest side, as a JPEG under the server's limit.
 *
 * @param {Blob} file
 * @param {number} maxKb The server's limit.
 * @returns {Promise<string>} A `data:image/jpeg;base64,...` URL.
 */
export async function shrinkPhoto(file, maxKb) {
  const image = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE_PX / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('This browser cannot read photos');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  const limit = maxKb * BYTES_PER_KB * BASE64_RATIO;
  for (const quality of QUALITIES) {
    const url = canvas.toDataURL(JPEG, quality);
    if (url.length <= limit) return url;
  }
  throw new Error(`The photo is too large, even made smaller. Take it again closer up.`);
}
