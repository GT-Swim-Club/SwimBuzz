export async function compressJson(data: any): Promise<Uint8Array> {
  const jsonString = JSON.stringify(data);
  const stream = new Blob([jsonString]).stream();
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));
  
  const response = new Response(compressedStream);
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  return new Uint8Array(buffer);
}
