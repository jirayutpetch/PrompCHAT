import { isIP } from 'node:net';

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const octets = address.split('.').map(Number);
    const ip = (((octets[0] * 256 + octets[1]) * 256 + octets[2]) * 256 + octets[3]) >>> 0;
    const inRange = (network: number[], bits: number) => {
      const base = network.reduce((value, part) => value * 256 + part, 0) >>> 0;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      return (ip & mask) === (base & mask);
    };
    return ![
      [[0, 0, 0, 0], 8], [[10, 0, 0, 0], 8], [[100, 64, 0, 0], 10], [[127, 0, 0, 0], 8],
      [[169, 254, 0, 0], 16], [[172, 16, 0, 0], 12], [[192, 0, 0, 0], 24], [[192, 0, 2, 0], 24],
      [[192, 88, 99, 0], 24], [[192, 168, 0, 0], 16], [[198, 18, 0, 0], 15], [[198, 51, 100, 0], 24],
      [[203, 0, 113, 0], 24], [[224, 0, 0, 0], 4], [[240, 0, 0, 0], 4],
    ].some(([network, bits]) => inRange(network as number[], bits as number));
  }
  if (family !== 6) return false;
  const normalized = address.toLowerCase().split('%')[0];
  const mappedIpv4 = normalized.match(/^(?:::ffff:)(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedIpv4) return isPublicAddress(mappedIpv4[1]);
  const [left, right = ''] = normalized.split('::');
  const leftWords = left ? left.split(':') : [];
  const rightWords = right ? right.split(':') : [];
  const words = [...leftWords, ...Array(Math.max(0, 8 - leftWords.length - rightWords.length)).fill('0'), ...rightWords].map((word) => Number.parseInt(word || '0', 16));
  if (words.length !== 8 || words.some((word) => !Number.isFinite(word))) return false;
  const first = words[0];
  const second = words[1];
  return first >= 0x2000 && first <= 0x3fff && !(first === 0x2001 && (second === 0 || second === 0x0db8)) && first !== 0x2002;
}
