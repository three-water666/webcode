import * as fs from 'fs/promises';

export async function readFilePrefix(filePath: string, maxBytes: number, readChunkBytes = maxBytes): Promise<string> {
    const handle = await fs.open(filePath, 'r');
    try {
        const buffer = Buffer.alloc(maxBytes);
        let totalBytesRead = 0;

        while (totalBytesRead < maxBytes) {
            const bytesToRead = Math.min(readChunkBytes, maxBytes - totalBytesRead);
            const { bytesRead } = await handle.read(buffer, totalBytesRead, bytesToRead, totalBytesRead);
            if (bytesRead === 0) {
                break;
            }
            totalBytesRead += bytesRead;
        }

        const boundary = totalBytesRead === maxBytes
            ? getUtf8PrefixBoundary(buffer, totalBytesRead)
            : totalBytesRead;
        return buffer.subarray(0, boundary).toString('utf8');
    } finally {
        await handle.close();
    }
}

function getUtf8PrefixBoundary(buffer: Buffer, length: number): number {
    if (length <= 0) {
        return 0;
    }

    const minLeadIndex = Math.max(0, length - 4);
    let leadIndex = length - 1;
    while (leadIndex >= minLeadIndex && isUtf8ContinuationByte(buffer[leadIndex])) {
        leadIndex--;
    }
    if (leadIndex < minLeadIndex) {
        return length;
    }

    const sequenceLength = getUtf8SequenceLength(buffer[leadIndex]);
    if (sequenceLength === 0) {
        return length;
    }

    const availableBytes = length - leadIndex;
    if (availableBytes >= sequenceLength) {
        return length;
    }

    return isPotentialUtf8Prefix(buffer, leadIndex, availableBytes, sequenceLength) ? leadIndex : length;
}

function isUtf8ContinuationByte(byte: number): boolean {
    return (byte & 0b11000000) === 0b10000000;
}

function getUtf8SequenceLength(byte: number): number {
    if ((byte & 0b10000000) === 0) {
        return 1;
    }
    if (byte >= 0xC2 && byte <= 0xDF) {
        return 2;
    }
    if (byte >= 0xE0 && byte <= 0xEF) {
        return 3;
    }
    if (byte >= 0xF0 && byte <= 0xF4) {
        return 4;
    }
    return 0;
}

function isPotentialUtf8Prefix(
    buffer: Buffer,
    leadIndex: number,
    availableBytes: number,
    sequenceLength: number
): boolean {
    if (availableBytes <= 0 || availableBytes >= sequenceLength) {
        return false;
    }

    if (sequenceLength === 2 || availableBytes === 1) {
        return true;
    }

    const leadByte = buffer[leadIndex];
    const secondByte = buffer[leadIndex + 1];
    if (!isValidUtf8SecondByte(leadByte, secondByte)) {
        return false;
    }

    return sequenceLength === 3 || availableBytes === 2 || isUtf8ContinuationByte(buffer[leadIndex + 2]);
}

function isValidUtf8SecondByte(leadByte: number, secondByte: number): boolean {
    if (!isUtf8ContinuationByte(secondByte)) {
        return false;
    }

    if (leadByte === 0xE0) {
        return secondByte >= 0xA0 && secondByte <= 0xBF;
    }
    if (leadByte === 0xED) {
        return secondByte >= 0x80 && secondByte <= 0x9F;
    }
    if (leadByte === 0xF0) {
        return secondByte >= 0x90 && secondByte <= 0xBF;
    }
    if (leadByte === 0xF4) {
        return secondByte >= 0x80 && secondByte <= 0x8F;
    }

    return true;
}
