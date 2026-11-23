export function normalizeUploadFile(file, policy) {
  if (policy?.types.includes('image/svg+xml') && /\.svg$/i.test(file.name) && (!file.type || ['text/xml','application/xml','image/svg'].includes(file.type))) {
    return new File([file], file.name, { type:'image/svg+xml', lastModified:file.lastModified })
  }
  return file
}
