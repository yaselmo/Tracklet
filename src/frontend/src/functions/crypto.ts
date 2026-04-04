function fallbackRandomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(
    ''
  );
}

export function safeRandomUUID(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  const randomHex = fallbackRandomHex(16).split('');

  randomHex[12] = '4';
  randomHex[16] = ((parseInt(randomHex[16], 16) & 0x3) | 0x8).toString(16);

  return [
    randomHex.slice(0, 8).join(''),
    randomHex.slice(8, 12).join(''),
    randomHex.slice(12, 16).join(''),
    randomHex.slice(16, 20).join(''),
    randomHex.slice(20, 32).join('')
  ].join('-');
}
